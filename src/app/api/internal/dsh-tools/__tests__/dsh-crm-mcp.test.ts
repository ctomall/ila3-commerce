/** @jest-environment node */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'

const SCRIPT_PATH = path.resolve(process.cwd(), 'scripts/dsh-crm-mcp.mjs')
const TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      maxLength: 120,
      description: 'Case-insensitive substring matched against company name, domain, website or industry.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 20,
      description: 'Maximum companies to return (default 5, hard cap 20).',
    },
  },
  additionalProperties: false,
}

type BridgeScenario = { status: number; body: unknown }
type CapturedRequest = { path: string; authorization: string | null; body: unknown }

let bridgeServer: http.Server
let bridgeBaseUrl = ''
let scenario: BridgeScenario = { status: 200, body: {} }
let lastRequest: CapturedRequest | null = null

type RpcResponse = {
  jsonrpc: string
  id: number | null
  result?: Record<string, unknown> & {
    content?: Array<{ type: string; text: string }>
    isError?: boolean
    tools?: Array<Record<string, unknown>>
    protocolVersion?: string
    capabilities?: unknown
    serverInfo?: unknown
  }
  error?: { code: number; message: string }
}

class McpClient {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<
    number,
    { resolve: (value: RpcResponse) => void; reject: (error: Error) => void }
  >()
  private nextId = 1
  private buffer = ''
  readonly rawLines: string[] = []
  readonly invalidLines: string[] = []
  stderr = ''

  constructor(env: NodeJS.ProcessEnv) {
    this.child = spawn(process.execPath, [SCRIPT_PATH], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams

    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => this.onStdout(chunk))
    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (chunk: string) => {
      this.stderr += chunk
    })
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line !== '') this.onLine(line)
      newline = this.buffer.indexOf('\n')
    }
  }

  private onLine(line: string): void {
    this.rawLines.push(line)
    let message: RpcResponse
    try {
      message = JSON.parse(line) as RpcResponse
    } catch {
      this.invalidLines.push(line)
      return
    }
    if (typeof message.id !== 'number') return
    const waiter = this.pending.get(message.id)
    if (waiter) {
      this.pending.delete(message.id)
      waiter.resolve(message)
    }
  }

  request(method: string, params?: unknown, timeoutMs = 8_000): Promise<RpcResponse> {
    const id = this.nextId++
    const promise = new Promise<RpcResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)

    return Promise.race([
      promise,
      new Promise<RpcResponse>((_, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id)
          reject(new Error(`RPC ${method} timed out; stderr: ${this.stderr}`))
        }, timeoutMs)
        timer.unref()
      }),
    ])
  }

  notify(method: string, params?: unknown): void {
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
  }

  async close(): Promise<void> {
    if (this.child.exitCode !== null) return
    this.child.stdin.end()
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill('SIGKILL')
        resolve()
      }, 2_000)
      timer.unref()
      this.child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}

function childEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.OM_DSH_BRIDGE_URL
  delete env.OM_DSH_TOOL_TOKEN
  delete env.OM_DSH_MCP_HTTP_TIMEOUT_MS
  return { ...env, ...overrides }
}

async function withClient<T>(run: (client: McpClient) => Promise<T>): Promise<T> {
  const client = new McpClient(
    childEnv({
      OM_DSH_BRIDGE_URL: bridgeBaseUrl,
      OM_DSH_TOOL_TOKEN: 'test-token-not-real',
    }),
  )
  try {
    return await run(client)
  } finally {
    await client.close()
  }
}

async function initialize(client: McpClient, protocolVersion = '2025-06-18'): Promise<RpcResponse> {
  const response = await client.request('initialize', {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: 'jest-mcp-client', version: '0.0.0' },
  })
  client.notify('notifications/initialized')
  return response
}

function textPayload(response: RpcResponse): Record<string, unknown> {
  const content = response.result?.content
  expect(Array.isArray(content)).toBe(true)
  expect(content?.[0]?.type).toBe('text')
  return JSON.parse(content?.[0]?.text ?? '{}') as Record<string, unknown>
}

beforeAll(async () => {
  bridgeServer = http.createServer((req, res) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      raw += chunk
    })
    req.on('end', () => {
      let body: unknown = null
      try {
        body = raw === '' ? null : JSON.parse(raw)
      } catch {
        body = raw
      }
      lastRequest = {
        path: req.url ?? '',
        authorization: req.headers.authorization ?? null,
        body,
      }
      res.writeHead(scenario.status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(scenario.body))
    })
  })

  await new Promise<void>((resolve) => bridgeServer.listen(0, '127.0.0.1', () => resolve()))
  const address = bridgeServer.address() as AddressInfo
  bridgeBaseUrl = `http://127.0.0.1:${address.port}/api/internal/dsh-tools`
})

afterAll(async () => {
  await new Promise<void>((resolve) => bridgeServer.close(() => resolve()))
})

beforeEach(() => {
  scenario = { status: 200, body: {} }
  lastRequest = null
})

describe('scripts/dsh-crm-mcp.mjs', () => {
  it('negotiates initialize and exposes the CRM tool schema on tools/list', async () => {
    await withClient(async (client) => {
      const initialized = await initialize(client, '2025-06-18')
      expect(initialized.result?.protocolVersion).toBe('2025-06-18')
      expect(initialized.result?.capabilities).toEqual({ tools: { listChanged: false } })
      expect(initialized.result?.serverInfo).toEqual({
        name: 'crm-dsh-mcp',
        version: '0.1.0',
      })

      const listed = await client.request('tools/list', {})
      const tools = listed.result?.tools ?? []
      expect(tools).toHaveLength(1)
      expect(tools[0]).toMatchObject({
        name: 'crm_find_companies',
        inputSchema: TOOL_INPUT_SCHEMA,
      })
      expect(typeof tools[0].description).toBe('string')

      const ping = await client.request('ping')
      expect(ping.result).toEqual({})
    })
  })

  it('falls back to its newest supported protocol revision for an unknown client version', async () => {
    await withClient(async (client) => {
      const initialized = await initialize(client, '1999-01-01')
      expect(initialized.result?.protocolVersion).toBe('2026-07-28')
    })
  })

  it('calls the bridge with the run token and forwards the result as MCP text', async () => {
    scenario = {
      status: 200,
      body: {
        ok: true,
        tool: 'crm.find_companies',
        result: {
          companies: [{ id: 'c-1', name: 'Acme GmbH' }],
          scanned: 1,
          scope: { mode: 'organization', tenantId: 'tenant-1', organizationId: 'org-1' },
          note: 'read-only',
        },
      },
    }

    await withClient(async (client) => {
      await initialize(client)
      const called = await client.request('tools/call', {
        name: 'crm_find_companies',
        arguments: { query: 'Acme', limit: 5 },
      })

      expect(called.result?.isError).toBeUndefined()
      expect(textPayload(called)).toMatchObject({
        companies: [{ id: 'c-1', name: 'Acme GmbH' }],
        note: 'read-only',
      })

      expect(lastRequest).not.toBeNull()
      expect(lastRequest?.path).toBe('/api/internal/dsh-tools/crm.find_companies')
      expect(lastRequest?.authorization).toBe('Bearer test-token-not-real')
      expect(lastRequest?.body).toEqual({ query: 'Acme', limit: 5 })
    })
  })

  it.each([
    [400, 'invalid_input'],
    [401, 'unauthorized'],
    [403, 'feature_denied'],
  ])('maps bridge HTTP %s (%s) to an isError tool result', async (status, code) => {
    scenario = { status, body: { error: 'bridge refused', code } }

    await withClient(async (client) => {
      await initialize(client)
      const called = await client.request('tools/call', {
        name: 'crm_find_companies',
        arguments: { query: 'Acme' },
      })

      expect(called.result?.isError).toBe(true)
      expect(textPayload(called)).toEqual({ error: 'bridge refused', code, status })
    })
  })

  it('maps an unreachable bridge to isError without inventing a success', async () => {
    const client = new McpClient(
      childEnv({
        OM_DSH_BRIDGE_URL: 'http://127.0.0.1:1/api/internal/dsh-tools',
        OM_DSH_TOOL_TOKEN: 'test-token-not-real',
      }),
    )
    try {
      await initialize(client)
      const called = await client.request('tools/call', {
        name: 'crm_find_companies',
        arguments: {},
      })
      expect(called.result?.isError).toBe(true)
      expect(textPayload(called)).toMatchObject({ code: 'bridge_unreachable' })
    } finally {
      await client.close()
    }
  })

  it('rejects an unknown tool name as a JSON-RPC error', async () => {
    await withClient(async (client) => {
      await initialize(client)
      const called = await client.request('tools/call', { name: 'crm.delete_everything', arguments: {} })
      expect(called.error?.code).toBe(-32602)
      expect(called.result).toBeUndefined()
    })
  })

  it('writes protocol frames only to stdout (no log pollution)', async () => {
    scenario = { status: 200, body: { ok: true, tool: 'crm.find_companies', result: { companies: [] } } }

    await withClient(async (client) => {
      await initialize(client)
      await client.request('tools/list', {})
      await client.request('tools/call', { name: 'crm_find_companies', arguments: {} })
      await client.request('ping')

      expect(client.invalidLines).toEqual([])
      expect(client.rawLines.length).toBeGreaterThan(0)
      for (const line of client.rawLines) {
        const message = JSON.parse(line) as RpcResponse
        expect(message.jsonrpc).toBe('2.0')
        expect(typeof message.id).toBe('number')
      }
    })
  })

  it('exits non-zero at startup when the bridge environment is missing', async () => {
    const env = childEnv()
    delete env.OM_DSH_BRIDGE_URL
    delete env.OM_DSH_TOOL_TOKEN

    const child = spawn(process.execPath, [SCRIPT_PATH], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })

    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error('server did not exit on missing env'))
      }, 8_000)
      timer.unref()
      child.once('exit', (code) => {
        clearTimeout(timer)
        resolve(code)
      })
    })

    expect(exitCode).not.toBe(0)
    expect(stderr).toContain('OM_DSH_BRIDGE_URL')
    expect(stderr).toContain('OM_DSH_TOOL_TOKEN')
    expect(stdout).toBe('')
  })
})
