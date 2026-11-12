/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals'
import { NextRequest } from 'next/server'

jest.mock('@open-mercato/ai-assistant/modules/ai_assistant/lib/agent-registry', () => ({
  loadAgentRegistry: jest.fn(async () => undefined),
  getAgent: jest.fn((id: string) => (id === 'catalog.known_assistant' ? { id } : undefined)),
}))

import { rejectUnknownAgent } from '../agent-guard'

function request(url: string): NextRequest {
  return new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' } })
}

describe('DSH agentic bridge agent guard', () => {
  it('allows a request without an agent parameter', async () => {
    await expect(rejectUnknownAgent(request('http://localhost/api/ai_assistant/ai/chat'))).resolves.toBeNull()
  })

  it('allows a registered agent id', async () => {
    await expect(
      rejectUnknownAgent(request('http://localhost/api/ai_assistant/ai/chat?agent=catalog.known_assistant')),
    ).resolves.toBeNull()
  })

  it('answers 404 for an id the crate registry does not know', async () => {
    const response = await rejectUnknownAgent(
      request('http://localhost/api/ai_assistant/ai/chat?agent=probe.does_not_exist'),
    )
    expect(response?.status).toBe(404)
    await expect(response?.json()).resolves.toMatchObject({ code: 'agent_not_found' })
  })

  it('fails closed when the registry cannot be loaded', async () => {
    const registry = await import('@open-mercato/ai-assistant/modules/ai_assistant/lib/agent-registry')
    const load = registry.loadAgentRegistry as unknown as {
      mockRejectedValueOnce: (error: Error) => void
    }
    load.mockRejectedValueOnce(new Error('registry down'))
    const response = await rejectUnknownAgent(
      request('http://localhost/api/ai_assistant/ai/chat?agent=catalog.known_assistant'),
    )
    expect(response?.status).toBe(503)
    await expect(response?.json()).resolves.toMatchObject({ code: 'agent_catalog_unavailable' })
  })
})
