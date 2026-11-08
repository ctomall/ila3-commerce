/**
 * Shared login helper for the guard scripts.
 *
 * The API allows five logins per minute per IP. Running several guard scripts back to
 * back (as `crm-verify-all.mjs` does) trips that limit, and a 429 would look like a
 * failed gate rather than a rate limit. This retries with a wait instead.
 *
 * Credentials come from ~/.ila3-admin-credentials (mode 600) and are never printed.
 */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'

export const CREDENTIALS_PATH = '/home/pro/.ila3-admin-credentials'

export function credentials() {
  const map = new Map()
  if (!fs.existsSync(CREDENTIALS_PATH)) throw new Error(`missing ${CREDENTIALS_PATH}`)
  for (const line of fs.readFileSync(CREDENTIALS_PATH, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    const [role, email, password] = line.trim().split(/\s+/)
    if (role && email && password) map.set(role, { email, password })
  }
  return map
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const CACHE_TTL_MS = 240_000

function cachePath(base, role) {
  const key = createHash('sha1').update(`${base}|${role}`).digest('hex').slice(0, 16)
  return `${os.tmpdir()}/crm-session-${key}.json`
}

/**
 * Cookies are cached per (base, role) for four minutes. The limit is five logins per
 * minute per IP, so reusing a session is what keeps a multi-script run under it — the
 * retry only covers the case where the cache is cold in several processes at once.
 */
function readCache(base, role) {
  try {
    const file = cachePath(base, role)
    if (!fs.existsSync(file)) return null
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!data?.cookie || Date.now() - Number(data.at) > CACHE_TTL_MS) return null
    return data.cookie
  } catch {
    return null
  }
}

function writeCache(base, role, cookie) {
  try {
    fs.writeFileSync(cachePath(base, role), JSON.stringify({ cookie, at: Date.now() }), { mode: 0o600 })
  } catch {
    /* caching is an optimisation, never a requirement */
  }
}

/**
 * Returns the cookie header. Retries only on 429 (rate limit) — a 401 stays a 401, because
 * retrying an auth failure would hide a broken credential.
 */
export async function loginWithRetry(base, cred, { attempts = 3, waitMs = 25000, role = 'unknown' } = {}) {
  const cached = readCache(base, role)
  if (cached) return cached
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(cred).toString(),
      redirect: 'manual',
    })
    if (res.ok) {
      const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
      if (!cookie) throw new Error('login returned no cookie')
      writeCache(base, role, cookie)
      return cookie
    }
    if (res.status === 429 && attempt < attempts) {
      console.warn(`[login] rate limited, waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${attempts})`)
      await sleep(waitMs)
      continue
    }
    throw new Error(`login failed: ${res.status}`)
  }
  throw new Error('login failed: rate limited')
}
