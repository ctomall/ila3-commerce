#!/usr/bin/env node
/**
 * CRM bridge MCP server for the DSH runtime (C1/C2).
 *
 * Transport: MCP stdio, newline-delimited JSON-RPC 2.0 on stdin/stdout. stdout
 * carries protocol frames only; every diagnostic goes to stderr so a stray log
 * line can never corrupt the MCP stream.
 *
 * Tool: `crm_find_companies` → `POST ${OM_DSH_BRIDGE_URL}/crm.find_companies`
 * with `Authorization: Bearer ${OM_DSH_TOOL_TOKEN}`. The bridge route owns the
 * authorization decision (binding + ACL feature + customer scope) and the
 * actual ORM query; this server never sees CRM credentials, a database, or a
 * CRM session.
 *
 * Fail-closed contract:
 *   - missing/blank `OM_DSH_BRIDGE_URL` or `OM_DSH_TOOL_TOKEN` → exit(1) with a
 *     message naming the variables (never their values);
 *   - non-2xx bridge responses → MCP tool result `{isError:true}` carrying the
 *     bridge's stable `code` (`unauthorized`, `feature_denied`, ...), so the
 *     model sees a failed tool call instead of a fabricated success;
 *   - transport failures → `isError:true` with `bridge_unreachable`/`bridge_timeout`.
 *
 * The token is never logged, returned in an error message, or included in a
 * tool result. Tool arguments are forwarded as-is; the bridge's strict schema
 * rejects unknown fields.
 */
import readline from 'node:readline'

const SERVER_NAME = 'crm-dsh-mcp'
const SERVER_VERSION = '0.1.0'
const PROTOCOL_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const DEFAULT_HTTP_TIMEOUT_MS = 30_000

const FIND_COMPANIES_SCHEMA = {
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

const UPDATE_COMPANY_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid', description: 'Company (customer entity) id.' },
    fields: {
      type: 'object',
      description:
        'Fields to change. Only these are accepted; ownership, activation and custom fields are refused.',
      properties: {
        displayName: { type: 'string', maxLength: 200 },
        industry: { type: 'string', maxLength: 120 },
        websiteUrl: { type: 'string', maxLength: 300 },
        domain: { type: 'string', maxLength: 200 },
        status: { type: 'string', maxLength: 60 },
        lifecycleStage: { type: 'string', maxLength: 60 },
      },
      additionalProperties: false,
      minProperties: 1,
    },
  },
  required: ['id', 'fields'],
  additionalProperties: false,
}

/** Bridge tool id -> MCP tool declaration. Write tools are gated by env. */
const TOOL_CATALOG = [
  {
    name: 'crm_find_companies',
    bridgeId: 'crm.find_companies',
    writes: false,
    description:
      'Find CRM companies visible to the authenticated employee (read-only). ' +
      'Results are already scoped to the caller tenant/organization; do not ask for tenant or owner filters.',
    inputSchema: FIND_COMPANIES_SCHEMA,
  },
  {
    name: 'crm_update_company',
    bridgeId: 'crm.update_company',
    writes: true,
    description:
      'Propose an update to one CRM company. This tool NEVER writes directly: the call is recorded as a ' +
      'write request and the employee must approve it in the CRM write-approval page. A successful approval ' +
      'returns approval_required/approval_consumed style codes; tell the employee to review and approve, then ' +
      'retry the identical call. Only displayName/industry/websiteUrl/domain/status/lifecycleStage are editable.',
    inputSchema: UPDATE_COMPANY_SCHEMA,
  },
]

const writesEnabled = (process.env.OM_DSH_WRITES ?? '').trim() === '1'
const TOOLS = TOOL_CATALOG.filter((tool) => !tool.writes || writesEnabled).map((tool) => ({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
}))

class RpcError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function failStartup(message) {
  process.stderr.write(`dsh-crm-mcp: ${message}\n`)
  process.exit(1)
}

function readRequiredEnv(name) {
  const value = (process.env[name] ?? '').trim()
  return value === '' ? null : value
}

const bridgeBaseUrl = readRequiredEnv('OM_DSH_BRIDGE_URL')
const toolToken = readRequiredEnv('OM_DSH_TOOL_TOKEN')
const missing = [
  ...(bridgeBaseUrl === null ? ['OM_DSH_BRIDGE_URL'] : []),
  ...(toolToken === null ? ['OM_DSH_TOOL_TOKEN'] : []),
]
if (missing.length > 0) {
  failStartup(`missing required environment: ${missing.join(', ')} — refusing to serve tools`)
}

let bridgeBase
try {
  const parsed = new URL(bridgeBaseUrl)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('unsupported protocol')
  // Keep any configured path prefix; only trim trailing slashes.
  bridgeBase = parsed.toString().replace(/\/+$/, '')
} catch {
  failStartup('OM_DSH_BRIDGE_URL is not a valid http(s) URL')
}

function bridgeEndpoint(bridgeId) {
  return `${bridgeBase}/${bridgeId}`
}

const httpTimeoutRaw = Number.parseInt(process.env.OM_DSH_MCP_HTTP_TIMEOUT_MS ?? '', 10)
const httpTimeoutMs =
  Number.isFinite(httpTimeoutRaw) && httpTimeoutRaw > 0 ? httpTimeoutRaw : DEFAULT_HTTP_TIMEOUT_MS

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function toolError(code, error, status) {
  const body = { error, code, ...(status === undefined ? {} : { status }) }
  return {
    content: [{ type: 'text', text: JSON.stringify(body) }],
    isError: true,
  }
}

async function callBridge(bridgeId, args) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), httpTimeoutMs)
  let response
  try {
    response = await fetch(bridgeEndpoint(bridgeId), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${toolToken}`,
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    return toolError(
      timedOut ? 'bridge_timeout' : 'bridge_unreachable',
      timedOut ? 'CRM tool bridge timed out' : 'CRM tool bridge is unreachable',
    )
  } finally {
    clearTimeout(timer)
  }

  const raw = await response.text()
  let payload = null
  try {
    payload = raw.trim() === '' ? null : JSON.parse(raw)
  } catch {
    payload = null
  }

  if (!response.ok) {
    const code = isRecord(payload) && typeof payload.code === 'string' ? payload.code : `http_${response.status}`
    const message =
      isRecord(payload) && typeof payload.error === 'string'
        ? payload.error
        : `CRM tool bridge rejected the call (HTTP ${response.status})`
    return toolError(code, message, response.status)
  }

  if (payload === null) {
    return toolError('invalid_bridge_response', 'CRM tool bridge returned a non-JSON response')
  }
  const value = isRecord(payload) && Object.prototype.hasOwnProperty.call(payload, 'result') ? payload.result : payload
  return { content: [{ type: 'text', text: JSON.stringify(value) }] }
}

async function handleInitialize(params) {
  const requested = isRecord(params) && typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
  const protocolVersion = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0]
  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
  }
}

async function dispatch(method, params) {
  switch (method) {
    case 'initialize':
      return handleInitialize(params)
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: TOOLS }
    case 'tools/call': {
      const name = isRecord(params) ? params.name : undefined
      const tool = TOOLS.find((entry) => entry.name === name)
      if (!tool) {
        throw new RpcError(-32602, `Unknown tool: ${typeof name === 'string' ? name : '<missing>'}`)
      }
      const catalogEntry = TOOL_CATALOG.find((entry) => entry.name === name)
      if (!catalogEntry) throw new RpcError(-32602, `Unknown tool: ${name}`)
      const args = isRecord(params) && params.arguments !== undefined ? params.arguments : {}
      if (!isRecord(args)) throw new RpcError(-32602, 'tools/call arguments must be an object')
      return callBridge(catalogEntry.bridgeId, args)
    }
    default:
      throw new RpcError(-32601, `Method not found: ${method}`)
  }
}

async function handleLine(line) {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    writeMessage({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }
  if (!isRecord(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    writeMessage({
      jsonrpc: '2.0',
      id: isRecord(message) && 'id' in message ? message.id : null,
      error: { code: -32600, message: 'Invalid Request' },
    })
    return
  }

  // Notifications (initialized, cancelled, ...) carry no id and get no response.
  if (!Object.prototype.hasOwnProperty.call(message, 'id')) return

  try {
    const result = await dispatch(message.method, message.params)
    writeMessage({ jsonrpc: '2.0', id: message.id, result })
  } catch (error) {
    if (error instanceof RpcError) {
      writeMessage({ jsonrpc: '2.0', id: message.id, error: { code: error.code, message: error.message } })
      return
    }
    writeMessage({
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32603, message: 'Internal error' },
    })
  }
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
input.on('line', (line) => {
  if (line.trim() === '') return
  void handleLine(line)
})
input.on('close', () => {
  process.exitCode = 0
})

process.on('uncaughtException', (error) => {
  // Diagnostics only; the token and tool arguments never enter this message.
  process.stderr.write(`dsh-crm-mcp: fatal: ${error instanceof Error ? error.message : 'unknown error'}\n`)
  process.exit(1)
})
