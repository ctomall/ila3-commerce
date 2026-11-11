/**
 * Production wiring for the DSH tool bridge (C1).
 *
 * The bridge itself (authorize.ts, crm-find-companies.ts) takes every
 * authoritative dependency as an argument, so its tests do not need a database,
 * an ORM or a request container. This module is the one place that binds those
 * arguments to the running app:
 *
 *   bindings            -> the B1 `dsh_assistant_bindings` row, read through the
 *                          ORM; a missing row or an unavailable table is `null`
 *                          (fail closed), never "allow".
 *   checkFeatures       -> the app's live RbacService; the tool supplies real
 *                          feature ids such as `customers.companies.view`.
 *   resolveCustomerScope-> the organization-wide resolver from scope.ts until
 *                          `customer_access` ships.
 *
 * Tests replace this module with `jest.mock('@/lib/dsh/tool-bridge/deps', ...)`.
 */
import type { AwilixContainer } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { DshAssistantBinding, DshRun } from '@/modules/dsh_runs/data/entities'
import type { BindingLookup, CustomerScopeResolver, FeatureCheck } from './authorize'
import { resolveConfiguredCustomerScope } from './scope'
import { canWriteToCrm as decideWrite } from '@/lib/dsh/run'

export type ToolBridgeDeps = {
  em: EntityManager
  /** Request container: the write tool resolves the command bus through it. */
  container: AwilixContainer
  bindings: BindingLookup
  checkFeatures: FeatureCheck
  resolveCustomerScope: CustomerScopeResolver
  canWriteToCrm?: (input: { runId: string; bindingId: string }) => Promise<boolean>
}

export async function buildToolBridgeDeps(): Promise<ToolBridgeDeps> {
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em')
  const rbac = container.resolve<RbacService>('rbacService')

  const bindings: BindingLookup = async (bindingId) => {
    try {
      const binding = await em.findOne(DshAssistantBinding, { id: bindingId })
      if (!binding) return null
      return {
        id: binding.id,
        userId: binding.userId,
        tenantId: binding.tenantId,
        organizationId: binding.organizationId,
        state: binding.status,
      }
    } catch {
      // The B1 migration is a reviewed draft; while the table is absent (or the
      // entity is not in the generated registry yet) every call must be refused.
      return null
    }
  }

  const checkFeatures: FeatureCheck = ({ userId, tenantId, organizationId, features }) =>
    rbac.userHasAllFeatures(userId, [...features], { tenantId, organizationId })

  const canWriteToCrm: ToolBridgeDeps['canWriteToCrm'] = async ({ runId, bindingId }) => {
    try {
      const run = await em.findOne(DshRun, { id: runId })
      const binding = await em.findOne(DshAssistantBinding, { id: bindingId })
      const decision = decideWrite({
        run: run
          ? {
              id: run.id,
              bindingId: run.bindingId,
              employeeUserId: run.userId,
              status: run.status as never,
              startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : null,
            }
          : null,
        bindingId,
        bindingState: (binding?.status ?? 'revoked') as 'active' | 'suspended' | 'revoked',
        now: new Date().toISOString(),
      })
      return decision.allowed
    } catch {
      return false
    }
  }

  return {
    em,
    container,
    bindings,
    checkFeatures,
    resolveCustomerScope: resolveConfiguredCustomerScope,
    canWriteToCrm,
  }
}
