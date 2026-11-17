import { describe, it, expect, jest } from '@jest/globals'
const mockFeatures = jest.fn(async (_user: unknown, _features: unknown, _scope: unknown) => true)
jest.mock('@open-mercato/shared/lib/di/container', () => ({
  createRequestContainer: async () => ({ resolve: () => ({ userHasAllFeatures: mockFeatures }) }),
}))
import { checkAiAccess } from '../ai-access'
describe('AI explicit access policy', () => {
  it('checks the existing feature with trusted context', async () => {
    mockFeatures.mockResolvedValueOnce(true)
    expect(await checkAiAccess({ sub: 'u', tenantId: 't', orgId: 'o' } as never)).toBe('allowed')
    expect(mockFeatures).toHaveBeenCalledWith('u', ['ai_assistant.view'], { tenantId: 't', organizationId: 'o' })
  })
  it('denies false and fails closed on errors', async () => {
    mockFeatures.mockResolvedValueOnce(false)
    expect(await checkAiAccess({ sub: 'u' } as never)).toBe('denied')
    mockFeatures.mockRejectedValueOnce(Error('service down'))
    expect(await checkAiAccess({ sub: 'u' } as never)).toBe('unavailable')
  })
})
