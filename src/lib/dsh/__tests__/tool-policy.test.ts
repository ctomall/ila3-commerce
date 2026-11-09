import { describe, expect, it } from '@jest/globals'
import { classifyTool, mayRunTool, summarize, type ToolDescriptor } from '../tool-policy'

const read: ToolDescriptor = {
  name: 'customers.list_people',
  requiredFeatures: ['customers.people.view'],
  isMutation: false,
}
const write: ToolDescriptor = {
  name: 'crm.find_companies',
  requiredFeatures: ['customers.companies.view'],
  isMutation: true,
}
const bulk: ToolDescriptor = {
  name: 'catalog.bulk_update_products',
  requiredFeatures: ['catalog.products.manage'],
  isBulk: true,
}
const destructive: ToolDescriptor = {
  name: 'x.delete_all',
  requiredFeatures: ['x.manage'],
  isDestructive: true,
}
const unscoped: ToolDescriptor = { name: 'context_whoami' }
const settings: ToolDescriptor = { name: 'settings.update_provider', requiredFeatures: ['settings.manage'] }

describe('classifyTool', () => {
  it('treats a user-scoped read and write as per_user', () => {
    expect(classifyTool({ tool: read })).toBe('per_user')
    expect(classifyTool({ tool: write })).toBe('per_user')
  })

  it('treats bulk, destructive and unscoped tools as high_privilege', () => {
    expect(classifyTool({ tool: bulk })).toBe('high_privilege')
    expect(classifyTool({ tool: destructive })).toBe('high_privilege')
    expect(classifyTool({ tool: unscoped })).toBe('high_privilege')
  })

  it('only promotes to instance_global when the declaration names it', () => {
    expect(classifyTool({ tool: settings })).toBe('per_user')
    expect(classifyTool({ tool: settings, instanceGlobal: [settings.name] })).toBe('instance_global')
  })

  it('lets the computed high_privilege class win over a declaration', () => {
    // A declaration cannot demote a tool that can touch many records.
    expect(classifyTool({ tool: bulk, instanceGlobal: [bulk.name] })).toBe('high_privilege')
  })
})

describe('mayRunTool', () => {
  it('allows a per_user tool the caller is entitled to', () => {
    expect(
      mayRunTool({ tool: read, instanceMode: 'shared', callerFeatures: ['customers.people.view'] }),
    ).toEqual({ allowed: true, risk: 'per_user' })
  })

  it('refuses a tool whose feature the caller lacks', () => {
    expect(mayRunTool({ tool: read, instanceMode: 'shared', callerFeatures: [] })).toEqual({
      allowed: false,
      risk: 'per_user',
      reason: 'features_denied',
    })
  })

  it('refuses a high_privilege tool on a shared instance even when the caller is entitled', () => {
    expect(
      mayRunTool({ tool: bulk, instanceMode: 'shared', callerFeatures: ['catalog.products.manage'] }),
    ).toEqual({ allowed: false, risk: 'high_privilege', reason: 'high_privilege_requires_isolation' })
  })

  it('allows the same high_privilege tool on an isolated instance', () => {
    expect(
      mayRunTool({ tool: bulk, instanceMode: 'isolated', callerFeatures: ['catalog.products.manage'] }),
    ).toEqual({ allowed: true, risk: 'high_privilege' })
  })

  it('refuses an instance_global tool regardless of instance mode', () => {
    for (const instanceMode of ['shared', 'isolated'] as const) {
      expect(
        mayRunTool({
          tool: settings,
          instanceMode,
          callerFeatures: ['settings.manage'],
          instanceGlobal: [settings.name],
        }),
      ).toEqual({ allowed: false, risk: 'instance_global', reason: 'instance_global_not_shared' })
    }
  })

  it('refuses an unknown tool instead of assuming it is harmless', () => {
    expect(mayRunTool({ tool: null, instanceMode: 'shared', callerFeatures: [] })).toEqual({
      allowed: false,
      risk: 'per_user',
      reason: 'unknown_tool',
    })
  })

  it('checks features before the instance rule, so the reason names the first blocking fact', () => {
    expect(mayRunTool({ tool: bulk, instanceMode: 'shared', callerFeatures: [] })).toEqual({
      allowed: false,
      risk: 'high_privilege',
      reason: 'features_denied',
    })
  })
})

describe('summarize', () => {
  it('counts every class and sorts the names', () => {
    const result = summarize([read, write, bulk, destructive, settings], [settings.name])
    expect(result.counts).toEqual({ per_user: 2, instance_global: 1, high_privilege: 2 })
    expect(result.classes.high_privilege).toEqual(['catalog.bulk_update_products', 'x.delete_all'])
    expect(result.total).toBe(5)
  })
})
