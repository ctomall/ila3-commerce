/**
 * `crm.update_company` over the DSH tool bridge (C phase).
 *
 * This is the first write tool. It exists to prove the *controlled* path, not
 * to give the model a general mutation API:
 *
 *   - the field set is a whitelist (`displayName`, `industry`, `websiteUrl`,
 *     `domain`, `status`, `lifecycleStage`). Ownership (`ownerUserId`),
 *     activation (`isActive`), revenue and custom fields are deliberately out:
 *     reassigning or deactivating a company through a chat tool is a privilege
 *     change, not an edit.
 *   - tenant/organization come from the run token; the model cannot pass them.
 *   - the target must be visible in the caller's customer scope. In `own` mode
 *     a company the employee does not own answers 404 (existence is not leaked).
 *   - the write runs through the existing command bus command
 *     `customers.companies.update`, so audit, events, undo snapshots, cache and
 *     query-index invalidation behave exactly like an edit from the CRM UI.
 */
import { z } from 'zod'
import type { AwilixContainer } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import { canWriteCustomer } from '@/modules/customer_access/services/grants'
import type { CustomerScope } from './authorize'
import { ToolExecutionError } from './errors'
import type { RunTokenClaims } from './run-token'

export const UPDATE_COMPANY_TOOL = 'crm.update_company'

/** Fields a chat-initiated edit may touch. Keep this list boring and short. */
export const UPDATE_COMPANY_FIELDS = [
  'displayName',
  'industry',
  'websiteUrl',
  'domain',
  'status',
  'lifecycleStage',
] as const

const optionalText = (max: number) => z.string().max(max).optional()

export const updateCompanyInputSchema = z
  .object({
    id: z.string().uuid(),
    fields: z
      .object({
        displayName: optionalText(200),
        industry: optionalText(120),
        websiteUrl: optionalText(300),
        domain: optionalText(200),
        status: optionalText(60),
        lifecycleStage: optionalText(60),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, {
        message: 'At least one field to update is required',
      }),
  })
  .strict()

export type UpdateCompanyInput = z.infer<typeof updateCompanyInputSchema>

export type UpdateCompanyContext = {
  em: EntityManager
  claims: RunTokenClaims
  scope: CustomerScope
  container: AwilixContainer
}

export type UpdateCompanyResult = {
  ok: true
  companyId: string
  updatedFields: string[]
  note: string
}

/**
 * Command runtime context for one employee.
 *
 * Mirrors the CRM's own internal command callers: the auth identity and the
 * single-organization scope both come from the run token, so the command's
 * `ensureTenantScope` / `ensureOrganizationScope` checks cannot be widened by
 * anything the model sends.
 */
export function buildCompanyCommandContext(claims: RunTokenClaims, container: AwilixContainer) {
  const organizationId = claims.organizationId
  return {
    container,
    auth: {
      sub: claims.userId,
      tenantId: claims.tenantId,
      orgId: organizationId,
    },
    organizationScope: {
      selectedId: organizationId,
      filterIds: [organizationId],
      allowedIds: [organizationId],
      tenantId: claims.tenantId,
    },
    selectedOrganizationId: organizationId,
    organizationIds: [organizationId],
  }
}

/** Human summary stored with the approval; no secrets, no ciphertext. */
export function describeUpdate(input: UpdateCompanyInput, companyName: string | null): Record<string, unknown> {
  return {
    companyId: input.id,
    companyName,
    fields: input.fields,
  }
}

/**
 * Preview for the approval card: the company's display name plus the exact
 * field changes. A missing/out-of-scope company still produces a request (the
 * execution will answer 404); it just shows no name.
 */
export async function describeUpdateForApproval(
  rawInput: unknown,
  context: UpdateCompanyContext,
): Promise<Record<string, unknown>> {
  const parsed = updateCompanyInputSchema.parse(rawInput ?? {})
  const em = context.em.fork()
  const entity = await em.findOne(CustomerEntity, {
    id: parsed.id,
    tenantId: context.claims.tenantId,
    organizationId: context.claims.organizationId,
    deletedAt: null,
  })
  const owner = entity?.ownerUserId ?? null
  const inScope =
    entity !== null &&
    (context.scope.mode !== 'own' ||
      canWriteCustomer({
        ownerUserIds: context.scope.ownerUserIds,
        callerUserId: context.claims.userId,
        customerOwnerUserId: owner,
        editableEntityIds: context.scope.editableEntityIds ?? [],
        customerEntityId: entity.id,
      }))
  return describeUpdate(parsed, inScope ? (entity?.displayName ?? null) : null)
}

export async function updateCompany(
  rawInput: unknown,
  context: UpdateCompanyContext,
): Promise<UpdateCompanyResult> {
  const parsed = updateCompanyInputSchema.parse(rawInput ?? {})
  const em = context.em.fork()
  const entity = await em.findOne(CustomerEntity, {
    id: parsed.id,
    tenantId: context.claims.tenantId,
    organizationId: context.claims.organizationId,
    deletedAt: null,
  })
  if (!entity) throw new ToolExecutionError('not_found', 404, 'Company not found')
  const owner = entity.ownerUserId ?? null
  if (
    context.scope.mode === 'own' &&
    !canWriteCustomer({
      ownerUserIds: context.scope.ownerUserIds,
      callerUserId: context.claims.userId,
      customerOwnerUserId: owner,
      editableEntityIds: context.scope.editableEntityIds ?? [],
      customerEntityId: entity.id,
    })
  ) {
    // 404 on purpose: an out-of-scope id and a nonexistent id must look alike.
    throw new ToolExecutionError('not_found', 404, 'Company not found')
  }

  const commandBus = context.container.resolve('commandBus') as {
    execute: (
      name: string,
      payload: { input: Record<string, unknown>; ctx: unknown },
    ) => Promise<unknown>
  }

  try {
    await commandBus.execute('customers.companies.update', {
      input: { id: parsed.id, ...parsed.fields },
      ctx: buildCompanyCommandContext(context.claims, context.container),
    })
  } catch (error) {
    // The command throws CrudHttpError(403/404/409) for scope and version
    // problems. Only the stable code crosses the bridge.
    const status = errorStatus(error)
    const code = errorCode(error)
    if (status === 404) throw new ToolExecutionError('not_found', 404, 'Company not found')
    if (status === 403) throw new ToolExecutionError('command_rejected', 403, 'CRM rejected the update')
    if (status === 409) throw new ToolExecutionError('command_rejected', 400, 'CRM rejected the update: stale record')
    throw new ToolExecutionError('command_rejected', 400, code ?? 'update failed')
  }

  return {
    ok: true,
    companyId: parsed.id,
    updatedFields: Object.keys(parsed.fields),
    note:
      context.scope.mode === 'own'
        ? '写入已执行；目标公司属于调用者本人'
        : '写入已执行；目标公司在调用者组织内（组织隔离≠员工客户隔离）',
  }
}

function errorStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null
  const record = error as { status?: unknown; statusCode?: unknown; httpStatus?: unknown }
  for (const value of [record.status, record.statusCode, record.httpStatus]) {
    if (typeof value === 'number') return value
  }
  return null
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const record = error as { code?: unknown; errorCode?: unknown }
  for (const value of [record.code, record.errorCode]) {
    if (typeof value === 'string') return value
  }
  return null
}
