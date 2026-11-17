import { describe, it, expect, jest } from '@jest/globals'
import { NextRequest } from 'next/server'
jest.mock('ai', () => ({
  createUIMessageStream: () => { throw Error('must not stream') },
  createUIMessageStreamResponse: () => { throw Error('must not stream') },
}))
const mockAccess = jest.fn(async () => 'denied')
jest.mock('@open-mercato/shared/lib/auth/server', () => ({
  getAuthFromRequest: async () => ({ sub: 'u', tenantId: 't', orgId: 'o' }),
}))
jest.mock('@/modules/dsh_runs/lib/ai-access', () => ({ checkAiAccess: mockAccess }))
jest.mock('../agent-guard', () => ({ rejectUnknownAgent: async () => null }))
jest.mock('@/lib/dsh/access-log', () => ({
  aiAccessId: () => null,
  beginAiAccess: () => {},
  noteAiUserId: () => {},
  logAiAccess: () => {},
  wrapAiAccess: (_req: unknown, response: Response) => response,
}))
import { POST } from '../route'
describe('agentic static route access parity', () => {
  it('rejects a missing feature before parsing the body or forwarding', async () => {
    const response = await POST(new NextRequest('http://localhost/api/internal/dsh-agentic-chat', { method: 'POST', body: 'not-json' }))
    expect(response.status).toBe(403)
  })
  it('returns service-unavailable on a failed permission check', async () => {
    mockAccess.mockResolvedValueOnce('unavailable')
    const response = await POST(new NextRequest('http://localhost/api/internal/dsh-agentic-chat', { method: 'POST', body: 'not-json' }))
    expect(response.status).toBe(503)
  })
})
