/**
 * Post-switch AI warm-up.
 *
 * The first AI request after a release pays a cold start: the assistant module
 * bootstraps, registers ~90 tools and ~700 API route manifests. A user whose
 * first turn lands on that cold path waits for it — or, as happened on
 * 2026-11-16, loses the connection while it runs. Warm it inside the deploy,
 * where the time is expected, and record the numbers in the run record.
 *
 * Never throws: a failed warm-up is reported in the record, but it must not
 * roll back a release that already passed every health check.
 */
import fs from 'node:fs'

export const DEFAULT_CREDENTIALS_PATH = '/home/pro/.ila3-admin-credentials'
const DEFAULT_TIMEOUT_MS = 20_000

/** Same file format the operator scripts use: `role email password` per line. */
export function readCredentials(path = DEFAULT_CREDENTIALS_PATH) {
  const map = new Map()
  if (!fs.existsSync(path)) return map
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [role, email, password] = line.trim().split(/\s+/)
    if (role && email && password) map.set(role, { email, password })
  }
  return map
}

function withTimeout(timeoutMs) {
  return AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined
}

/**
 * Log in once and hit the assistant catalogue + health endpoints. Both are what
 * the UI calls before it offers chat, so warming them covers the modules the
 * first real turn would otherwise load.
 */
export async function warmAiModule({
  base,
  credentialsPath = DEFAULT_CREDENTIALS_PATH,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const checks = []
  const startedAt = Date.now()
  try {
    if (!base) {
      return {ok: false, elapsedMs: 0, checks: [{name: 'warmup-config', ok: false, detail: 'no base url'}]}
    }
    const credentials = readCredentials(credentialsPath)
    const cred = credentials.get('superadmin') ?? credentials.get('admin') ?? [...credentials.values()][0]
    if (!cred) {
      return {ok: false, elapsedMs: 0, checks: [{name: 'warmup-credentials', ok: false, detail: `none readable at ${credentialsPath}`}]}
    }

    const loginStarted = Date.now()
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams(cred).toString(),
      redirect: 'manual',
      signal: withTimeout(timeoutMs),
    })
    checks.push({name: 'warmup-login', ok: login.ok, detail: `HTTP ${login.status} in ${Date.now() - loginStarted}ms`})
    if (!login.ok) return {ok: false, elapsedMs: Date.now() - startedAt, checks}

    const cookie = (login.headers.getSetCookie?.() ?? []).map((value) => value.split(';')[0]).join('; ')
    if (!cookie) {
      checks.push({name: 'warmup-cookie', ok: false, detail: 'login returned no cookie'})
      return {ok: false, elapsedMs: Date.now() - startedAt, checks}
    }

    for (const [name, path] of [
      ['warmup-agents', '/api/ai_assistant/ai/agents'],
      ['warmup-health', '/api/ai_assistant/health'],
    ]) {
      const requestStarted = Date.now()
      try {
        const response = await fetch(`${base}${path}`, {headers: {cookie}, signal: withTimeout(timeoutMs)})
        checks.push({
          name,
          ok: response.ok,
          detail: `HTTP ${response.status} in ${Date.now() - requestStarted}ms`,
        })
      } catch (error) {
        checks.push({name, ok: false, detail: error?.message || String(error)})
      }
    }

    return {ok: checks.every((check) => check.ok), elapsedMs: Date.now() - startedAt, checks}
  } catch (error) {
    return {
      ok: false,
      elapsedMs: Date.now() - startedAt,
      checks: [...checks, {name: 'warmup-error', ok: false, detail: error?.message || String(error)}],
    }
  }
}
