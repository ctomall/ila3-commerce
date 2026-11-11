import { describe, expect, it } from '@jest/globals'
import { resolveModelEnv } from '../model-env'

function deps(overrides: Partial<Parameters<typeof resolveModelEnv>[0]> = {}) {
  return {
    loadConfig: async () => ({
      defaultModel: { providerId: 'deepseek-flash', modelId: 'deepseek-flash' },
      customProviders: [{ id: 'deepseek-flash', enabled: true, baseURL: 'https://api.deepseek.com', apiKeyEnc: 'enc:v1:x' }],
      credentials: {},
    }),
    decrypt: () => 'sk-test',
    ...overrides,
  } as Parameters<typeof resolveModelEnv>[0]
}

describe('resolveModelEnv', () => {
  it('maps the configured provider into DSH env without exposing it elsewhere', async () => {
    const out = await resolveModelEnv(deps())
    expect(out.env).toEqual({ DEEPSEEK_API_KEY: 'sk-test', DEEPSEEK_BASE_URL: 'https://api.deepseek.com' })
    expect(out.provider).toBe('deepseek-official')
    expect(out.model).toBe('deepseek-flash')
  })

  it('fails closed when no default provider, key, or decryptable secret exists', async () => {
    expect(await resolveModelEnv(deps({ loadConfig: async () => ({ customProviders: [], credentials: {} }) }))).toEqual({ env: {} })
    expect(await resolveModelEnv(deps({ decrypt: () => null }))).toEqual({ env: {} })
    expect(await resolveModelEnv(deps({ loadConfig: async () => { throw new Error('db down') } }))).toEqual({ env: {} })
  })

  it('uses credential baseURL when the provider is a builtin entry', async () => {
    const out = await resolveModelEnv(deps({
      loadConfig: async () => ({
        defaultModel: { providerId: 'openai', modelId: 'gpt-5-mini' },
        customProviders: [],
        credentials: { openai: { apiKeyEnc: 'enc:v1:y', baseURL: 'https://proxy.example/v1' } },
      }),
    }))
    expect(out.env.DEEPSEEK_BASE_URL).toBe('https://proxy.example/v1')
    expect(out.model).toBe('gpt-5-mini')
  })
})
