/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { ToolExecutionError } from '../errors'
import {
  updateCompany,
  updateCompanyInputSchema,
  type UpdateCompanyContext,
} from '../crm-update-company'
import type { RunTokenClaims } from '../run-token'

const claims: RunTokenClaims = {
  runId: 'run-1',
  bindingId: 'binding-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  exp: 2_000_000_000,
  tools: ['crm.update_company'],
}

function harness(options: {
  entity?: Record<string, unknown> | null
  commandError?: unknown
  mode?: 'organization' | 'own'
  ownerUserIds?: string[]
  grantedEntityIds?: string[]
  editableEntityIds?: string[]
}) {
  const execute = jest.fn(async () => ({ entityId: 'c-1' }))
  const findOne = jest.fn(async () => options.entity ?? null)
  const fork = jest.fn(() => ({ findOne }))
  const container = {
    resolve: jest.fn(() => ({ execute })),
  } as unknown as AwilixContainer
  const context: UpdateCompanyContext = {
    em: { fork } as unknown as EntityManager,
    claims,
    scope: {
      mode: options.mode ?? 'organization',
      ownerUserIds: options.ownerUserIds ?? [],
      grantedEntityIds: options.grantedEntityIds ?? [],
      editableEntityIds: options.editableEntityIds ?? [],
    },
    container,
  }
  return { context, execute, findOne }
}

const input = { id: '11111111-1111-4111-8111-111111111111', fields: { industry: 'Software' } }

describe('updateCompany', () => {
  it('runs the existing customers.companies.update command with the token identity', async () => {
    const h = harness({ entity: { id: input.id, ownerUserId: 'user-1' } })
    await expect(updateCompany(input, h.context)).resolves.toMatchObject({
      ok: true,
      companyId: input.id,
      updatedFields: ['industry'],
    })
    expect(h.execute).toHaveBeenCalledTimes(1)
    const [name, payload] = h.execute.mock.calls[0] as unknown as [
      string,
      { input: Record<string, unknown>; ctx: { auth: { sub: string; tenantId: string; orgId: string } } },
    ]
    expect(name).toBe('customers.companies.update')
    expect(payload.input).toEqual({ id: input.id, industry: 'Software' })
    expect(payload.ctx.auth).toMatchObject({ sub: 'user-1', tenantId: 'tenant-1', orgId: 'org-1' })
  })

  it('answers 404 for a company outside the caller tenant/organization', async () => {
    const h = harness({ entity: null })
    await expect(updateCompany(input, h.context)).rejects.toBeInstanceOf(ToolExecutionError)
    await expect(updateCompany(input, h.context)).rejects.toMatchObject({ code: 'not_found', status: 404 })
    expect(h.execute).not.toHaveBeenCalled()
  })

  it('answers 404 in own scope when the company belongs to someone else', async () => {
    const h = harness({
      entity: { id: input.id, ownerUserId: 'user-2' },
      mode: 'own',
      ownerUserIds: ['user-1'],
    })
    await expect(updateCompany(input, h.context)).rejects.toMatchObject({ code: 'not_found' })
    expect(h.execute).not.toHaveBeenCalled()
  })

  it('allows an owned company in own scope', async () => {
    const h = harness({
      entity: { id: input.id, ownerUserId: 'user-1' },
      mode: 'own',
      ownerUserIds: ['user-1'],
    })
    await expect(updateCompany(input, h.context)).resolves.toMatchObject({ ok: true })
  })

  it('maps a command scope rejection to a typed refusal instead of 503', async () => {
    const error = Object.assign(new Error('forbidden'), { status: 403 })
    const h = harness({ entity: { id: input.id, ownerUserId: 'user-1' }, commandError: error })
    const failing = {
      ...h.context,
      container: {
        resolve: jest.fn(() => ({
          execute: jest.fn(async () => {
            throw error
          }),
        })),
      } as unknown as AwilixContainer,
    }
    await expect(updateCompany(input, failing)).rejects.toMatchObject({
      code: 'command_rejected',
      status: 403,
    })
  })

  it('refuses fields outside the whitelist before touching the database', () => {
    expect(() =>
      updateCompanyInputSchema.parse({
        id: input.id,
        fields: { ownerUserId: 'user-2' },
      }),
    ).toThrow()
    expect(() =>
      updateCompanyInputSchema.parse({ id: input.id, fields: {} }),
    ).toThrow()
  })
})
