/**
 * Failure-aware self-fetch + error wording for the inbox reads.
 *
 * Extracted from `InboxView` so the two K1 invariants can be tested directly:
 *  1. a failed read KEEPS its status — an expired session (401), a missing grant
 *     (403), a transport error (0) or a 5xx must never collapse into "no
 *     conversations";
 *  2. the wording keeps list failures and detail failures visibly distinct, and
 *     a detail 404 (the API deliberately masks unknown threads) says so.
 */

export type SelfFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number }

/**
 * The app's own base URL for server-side self-fetches.
 *
 * Using the public Host header sent the request out through the edge (or failed
 * DNS/loopback in production: the drill hitting 127.0.0.1 worked while prod
 * rendered "收件箱暂时无法连接服务"). Loopback + the port the server actually
 * listens on keeps the call in-process, and INTERNAL_API_BASE_URL stays
 * available for deployments where that is not true.
 */
export function internalApiBase(env: Record<string, string | undefined> = process.env): string {
  const explicit = env.INTERNAL_API_BASE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')
  return `http://127.0.0.1:${env.PORT ?? '3000'}`
}

export async function selfFetch<T>(
  path: string,
  cookie: string,
  options: { base?: string; fetchImpl?: typeof fetch } = {},
): Promise<SelfFetchResult<T>> {
  const base = options.base ?? internalApiBase()
  const doFetch = options.fetchImpl ?? fetch
  try {
    const response = await doFetch(`${base}${path}`, { headers: { cookie }, cache: 'no-store' })
    if (!response.ok) return { ok: false, status: response.status }
    return { ok: true, data: (await response.json()) as T }
  } catch {
    return { ok: false, status: 0 }
  }
}

export type LoadErrorScope = 'list' | 'detail'

/**
 * One wording table for both reads, so a failed detail fetch can never look
 * like "you have not selected a conversation". `status === 0` is transport
 * (selfFetch maps a thrown fetch to it), 401/403 are auth/permission, a detail
 * 404 is the API's masked unknown-thread answer, and anything else is an HTTP
 * failure that must stay visibly distinct from an empty list/thread.
 */
export function loadErrorMessage(status: number, scope: LoadErrorScope): string {
  if (status === 401) return '会话已过期，请重新登录后刷新。'
  if (status === 403) {
    return scope === 'list'
      ? '当前账号没有全渠道收件箱权限：需要 communication_channels.view，请联系管理员开通。'
      : '当前账号没有查看该会话的权限：需要 communication_channels.view，请联系管理员开通。'
  }
  if (status === 0) {
    return scope === 'list' ? '收件箱暂时无法连接服务，请稍后重试。' : '会话暂时无法连接服务，请稍后重试。'
  }
  if (scope === 'detail' && status === 404) {
    return '会话不存在或无权访问（可能已被删除，或你没有访问权限）。'
  }
  return scope === 'list'
    ? `收件箱加载失败（HTTP ${status}），这不是"没有会话"。`
    : `会话加载失败（HTTP ${status}），这不是"空会话"。`
}
