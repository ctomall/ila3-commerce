#!/usr/bin/env node
/**
 * P4D: real DSH runtime + scripted model + the CRM MCP tool bridge contract.
 *
 * The app-side drill (`dsh-closed-loop-drill`) keeps the route/store/bridge
 * real with a scripted engine. This drill keeps the other half real: it boots
 * the production DSH launcher profile (`sdk-minimal` + the CRM patch) against
 * the DSH mock Messages server (fake model) and mounts the real CRM MCP server,
 * so a scripted tool card becomes a real bridge HTTP call.
 *
 * The bridge endpoint here is a local stub returning a canned read-only result:
 * this proves the runtime/MCP half, while run tokens, binding, ACL and the ORM
 * bridge stay proven by the hermetic app-side drill. No model credential, no
 * real token, no database or CRM row is touched.
 *
 * Usage: node scripts/dsh-real-runtime-drill.mjs [--out <file>]
 */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 || !process.argv[index + 1] ? fallback : process.argv[index + 1]
}
const STAMP = new Date().toISOString().replace(/[:.]/g, '')
const OUT = path.resolve(argOf('--out', path.join(repo, 'docs/crm-platform/dsh-integration/evidence', `dsh-real-runtime-${STAMP}.json`)))
const DSH_SRC = process.env.DSH_SRC ?? '/home/pro/dsh-src'
const CLI = path.join(DSH_SRC, 'apps/cli/lib/bin.js')
const MOCK_LIB = pathToFileURL(path.join(DSH_SRC, 'packages/test-support/llm-mock-server/lib/index.js')).href
const PATCH = path.join(repo, 'vendor/dsh/crm-profile.patch.yml')
const MCP_SCRIPT = path.join(repo, 'scripts/dsh-crm-mcp.mjs')
const TOOL = 'mcp__crm__crm_find_companies'
const FINAL = 'REAL-TOOL-LOOP-OK'
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const evidence = {
    drill: 'dsh-real-runtime-mock-model',
    startedAt: new Date().toISOString(),
    runtime: { cli: CLI, profile: 'sdk-minimal', patch: PATCH, mockModel: MOCK_LIB },
    checks: {},
  }
  let child = null
  let mock = null
  let bridge = null
  let root = null
  try {
    if (!fs.existsSync(CLI)) throw new Error(`DSH CLI not found at ${CLI}`)
    const bridgeHits = []
    bridge = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => { body += chunk })
      req.on('end', () => {
        bridgeHits.push({
          path: req.url,
          authorizationPrefix: String(req.headers.authorization ?? '').slice(0, 12),
          body: body.slice(0, 200),
        })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          ok: true,
          tool: 'crm.find_companies',
          result: { companies: [{ id: 'drill-company', name: 'Harborview Analytics' }], scanned: 1, scope: { mode: 'organization' } },
        }))
      })
    })
    await new Promise((resolve) => bridge.listen(0, '127.0.0.1', resolve))
    const bridgePort = bridge.address().port

    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-real-'))
    const dshHome = path.join(root, 'dsh-home')
    fs.mkdirSync(dshHome, { recursive: true })

    const { startMockLlmServer } = await import(MOCK_LIB)
    mock = await startMockLlmServer({
      port: 0,
      apiKey: 'mock-key',
      sequence: ['tool_call_success', 'success'],
      toolName: TOOL,
      toolArguments: '{"limit":2}',
      successText: FINAL,
      chunkSize: 64,
      chunkDelayMs: 1,
    })

    const messages = []
    let stderr = ''
    child = spawn(process.execPath, [CLI, '--profile', 'crm-drill', '--from-default-profile', 'sdk-minimal', '--patch', PATCH], {
      env: {
        ...process.env,
        HOME: root,
        DSH_HOME: dshHome,
        NODE_ENV: 'production',
        DEEPSEEK_API_KEY: 'mock-key',
        DEEPSEEK_BASE_URL: `http://127.0.0.1:${mock.port}/v1`,
        OM_DSH_MCP_SCRIPT: MCP_SCRIPT,
        OM_DSH_BRIDGE_URL: `http://127.0.0.1:${bridgePort}/api/internal/dsh-tools`,
        OM_DSH_TOOL_TOKEN: 'fake-token-for-drill',
        OM_DSH_WRITES: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    let buffer = ''
    const send = (message) => {
      try { child.stdin.write(`${JSON.stringify(message)}\n`) } catch { /* child exited */ }
    }
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      for (;;) {
        const index = buffer.indexOf('\n')
        if (index < 0) break
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (line === '') continue
        let message = null
        try { message = JSON.parse(line) } catch { continue }
        messages.push(message)
        if (message.id === 1) {
          send({
            jsonrpc: '2.0',
            id: 2,
            method: 'session/query',
            params: { sessionId: 'real-runtime-drill', contentBlocks: [{ type: 'text', text: 'Find companies and report the first name.' }] },
          })
        }
      }
    })
    send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { cwd: root, provider: 'deepseek-official', model: 'deepseek-v4-flash', capabilities: {} } })

    const started = Date.now()
    for (;;) {
      const turnEnded = messages.some((message) => message.method === 'session.event' && message.params?.event?.type === 'turn/end')
      if (turnEnded) break
      if (Date.now() - started > 120_000) break
      await sleep(250)
    }
    await sleep(1_500)

    const toolEvents = messages
      .filter((message) => message.method === 'session.event' && /tool/i.test(message.params?.event?.type ?? ''))
      .map((message) => message.params.event.type)
    const assistantTexts = messages
      .filter((message) => message.method === 'session.event' && message.params?.event?.type === 'assistant/message')
      .map((message) => (message.params.event.data?.message?.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join(''))
    const secondRequest = JSON.stringify(mock.requests[1]?.body?.messages ?? [])
    evidence.checks = {
      modelRequests: mock.requests.length,
      secondRequestContainsToolResult: secondRequest.includes('tool_result'),
      bridgeHits,
      toolEvents,
      assistantTexts: assistantTexts.filter((text) => text.length > 0),
      finalText: assistantTexts.find((text) => text.includes(FINAL)) ?? null,
      stderrTail: stderr.slice(-600),
    }
    const failures = []
    if (mock.requests.length !== 2) failures.push(`expected 2 model requests, got ${mock.requests.length}`)
    if (!evidence.checks.secondRequestContainsToolResult) failures.push('second model request did not carry the tool result')
    if (!bridgeHits.some((hit) => hit.path === '/api/internal/dsh-tools/crm.find_companies')) failures.push('MCP server did not call the bridge endpoint')
    if (!bridgeHits.some((hit) => hit.authorizationPrefix === 'Bearer fake-')) failures.push('bridge call did not carry the run token')
    if (!toolEvents.includes('tool/call') || !toolEvents.includes('tool/result')) failures.push('tool call/result events missing')
    if (!evidence.checks.finalText) failures.push('final assistant text missing')
    evidence.failures = failures
  } catch (error) {
    evidence.failures = [String(error?.message ?? error)]
  } finally {
    try { child?.kill('SIGKILL') } catch { /* ignore */ }
    try { await mock?.close() } catch { /* ignore */ }
    try { bridge?.close() } catch { /* ignore */ }
    if (root) {
      try { fs.rmSync(root, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    evidence.finishedAt = new Date().toISOString()
    evidence.result = (evidence.failures ?? []).length === 0 ? 'passed' : 'failed'
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`)
    console.log(JSON.stringify({ result: evidence.result, failures: evidence.failures ?? [], evidence: OUT }))
  }
  if ((evidence.failures ?? []).length > 0) process.exitCode = 1
}

await main()
