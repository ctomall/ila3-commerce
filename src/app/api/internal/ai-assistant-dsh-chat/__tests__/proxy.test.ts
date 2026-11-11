/** @jest-environment node */

import { afterEach, describe, expect, it, jest } from '@jest/globals'

import { NextRequest } from 'next/server'
import { config, proxy } from '@/proxy'

function request(method = 'POST', path = '/api/ai_assistant/chat'): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method })
}

afterEach(() => {
  delete process.env.OM_AI_ENGINE
})

describe('proxy chat engine switch', () => {
  it('does not rewrite when OM_AI_ENGINE is unset', () => {
    const response = proxy(request())

    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
    // Passthrough still forwards the resolved pathname to server layouts.
    expect(response.headers.get('x-middleware-request-x-next-url')).toBe('/api/ai_assistant/chat')
  })

  it('does not rewrite when OM_AI_ENGINE=opencode', () => {
    process.env.OM_AI_ENGINE = 'opencode'

    const response = proxy(request())

    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('rewrites POST /api/ai_assistant/chat to the internal DSH route when OM_AI_ENGINE=dsh', () => {
    process.env.OM_AI_ENGINE = 'dsh'

    const response = proxy(request('POST', '/api/ai_assistant/chat?trace=1'))

    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/api/internal/ai-assistant-dsh-chat?trace=1',
    )
  })

  it('rewrites GET /api/ai_assistant/health to the DSH health handler', () => {
    process.env.OM_AI_ENGINE = 'dsh'

    const response = proxy(request('GET', '/api/ai_assistant/health'))

    expect(response.headers.get('x-middleware-rewrite')).toBe('http://localhost/api/internal/dsh-health')
  })

  it('rewrites GET /api/ai_assistant/ai/agents to the DSH catalogue wrapper', () => {
    process.env.OM_AI_ENGINE = 'dsh'

    const response = proxy(request('GET', '/api/ai_assistant/ai/agents'))

    expect(response.headers.get('x-middleware-rewrite')).toBe('http://localhost/api/internal/dsh-agents')
  })

  it('rewrites the UI agentic chat only when OM_DSH_AGENTIC=1', () => {
    process.env.OM_AI_ENGINE = 'dsh'
    delete process.env.OM_DSH_AGENTIC
    expect(proxy(request('POST', '/api/ai_assistant/ai/chat?agent=a.b')).headers.get('x-middleware-rewrite')).toBeNull()

    process.env.OM_DSH_AGENTIC = '1'
    const response = proxy(request('POST', '/api/ai_assistant/ai/chat?agent=a.b'))
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/api/internal/dsh-agentic-chat?agent=a.b',
    )
    delete process.env.OM_DSH_AGENTIC
  })

  it('rewrites the conversation list to the owner-filtered handler', () => {
    process.env.OM_AI_ENGINE = 'dsh'

    const response = proxy(request('GET', '/api/ai_assistant/ai/conversations?limit=5'))

    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/api/internal/dsh-conversations?limit=5',
    )
  })

  it('normalises the engine value before switching', () => {
    process.env.OM_AI_ENGINE = '  DSH  '

    const response = proxy(request())

    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'http://localhost/api/internal/ai-assistant-dsh-chat',
    )
  })

  it('never rewrites non-POST chat requests, even with OM_AI_ENGINE=dsh', () => {
    process.env.OM_AI_ENGINE = 'dsh'

    const response = proxy(request('GET'))

    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('leaves other API routes alone', () => {
    process.env.OM_AI_ENGINE = 'dsh'

    const response = proxy(request('POST', '/api/customers/companies'))

    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
    expect(response.headers.get('x-middleware-next')).toBe('1')
  })

  it('adds exactly the chat and health paths to the matcher instead of opening all of /api', () => {
    expect(config.matcher).toContain('/api/ai_assistant/chat')
    expect(config.matcher).toContain('/api/ai_assistant/health')
    expect(config.matcher).toContain('/api/ai_assistant/ai/agents')
    expect(config.matcher).toContain('/api/ai_assistant/ai/chat')
    expect(config.matcher).toContain('/api/ai_assistant/ai/conversations')
    expect(config.matcher).toHaveLength(6)
    expect(config.matcher).not.toContain('/api/:path*')
    expect(config.matcher).not.toContain('/api/(.*)')
  })
})
