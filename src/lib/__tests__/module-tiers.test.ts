import { describe, expect, it } from '@jest/globals'
import { applyModuleTier, moduleTierOf, normalizeTier, tierIncludes } from '../module-tiers'

const modules = [
  { id: 'customers' },
  { id: 'sales' },
  { id: 'warranty_claims' },
  { id: 'ai_assistant' },
  { id: 'channel_resend' },
  { id: 'example' },
]

describe('module tiers', () => {
  it('classifies the backbone, business and extension modules', () => {
    expect(moduleTierOf('customers')).toBe('core')
    expect(moduleTierOf('warranty_claims')).toBe('business')
    expect(moduleTierOf('ai_assistant')).toBe('extension')
    expect(moduleTierOf('channel_resend')).toBe('extension')
    expect(moduleTierOf('example')).toBe('extension')
  })

  it('treats tiers as inclusive sets', () => {
    expect(tierIncludes('core', 'customers')).toBe(true)
    expect(tierIncludes('core', 'warranty_claims')).toBe(false)
    expect(tierIncludes('business', 'warranty_claims')).toBe(true)
    expect(tierIncludes('business', 'ai_assistant')).toBe(false)
    expect(tierIncludes('extension', 'ai_assistant')).toBe(true)
    expect(tierIncludes('all', 'ai_assistant')).toBe(true)
  })

  it('keeps the full list for all and extension', () => {
    expect(applyModuleTier(modules, 'all')).toHaveLength(modules.length)
    expect(applyModuleTier(modules, 'extension')).toHaveLength(modules.length)
  })

  it('drops extension modules for core and business', () => {
    expect(applyModuleTier(modules, 'core').map((m) => m.id)).toEqual(['customers', 'sales'])
    expect(applyModuleTier(modules, 'business').map((m) => m.id)).toEqual([
      'customers',
      'sales',
      'warranty_claims',
    ])
  })

  it('falls back to all for unknown values', () => {
    expect(normalizeTier(undefined)).toBe('all')
    expect(normalizeTier('')).toBe('all')
    expect(normalizeTier('nonsense')).toBe('all')
    expect(normalizeTier('CORE')).toBe('core')
  })
})
