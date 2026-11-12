#!/usr/bin/env node
/**
 * K5 acceptance preflight for the communications hub.
 *
 * Safety contract:
 *  - default mode is dry-run: it only logs in and reads channels/threads;
 *  - `--mode send` is refused unless K5_ALLOWED_RECIPIENTS lists the exact
 *    recipient, so a typo can never message a real customer;
 *  - every send carries a clientRequestId, matching the BFF idempotency contract.
 *
 * Credentials are read from the environment; nothing is logged or persisted.
 */
import { randomUUID } from 'node:crypto'
import { isMainEntry } from './lib/is-main-entry.mjs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requireEnv(env, keys) {
  const missing = keys.filter((key) => !env[key])
  if (missing.length) throw new Error(`missing env: ${missing.join(', ')}`)
}

function parseList(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function cookiesFrom(response) {
  const getSetCookie = response.headers?.getSetCookie
  const list = typeof getSetCookie === 'function'
    ? getSetCookie.call(response.headers)
    : [response.headers?.get?.('set-cookie')].filter(Boolean)
  return list.map((value) => String(value).split(';')[0]).filter(Boolean).join('; ')
}

async function readJson(response) {
  const text = await response.text().catch(() => '')
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text.slice(0, 200) }
  }
}

export function resolvePreflightConfig(env = process.env) {
  requireEnv(env, ['K5_BASE_URL', 'K5_EMAIL', 'K5_PASSWORD'])
  const mode = env.K5_MODE || 'dry-run'
  if (!['dry-run', 'send'].includes(mode)) throw new Error('K5_MODE must be dry-run or send')
  return {
    baseUrl: env.K5_BASE_URL.replace(/\/+$/, ''),
    email: env.K5_EMAIL,
    password: env.K5_PASSWORD,
    mode,
    recipient: env.K5_RECIPIENT || '',
    recipients: parseList(env.K5_ALLOWED_RECIPIENTS),
    channelId: env.K5_CHANNEL_ID || '',
    subject: env.K5_SUBJECT || 'K5 preflight',
    text: env.K5_TEXT || 'K5 preflight message',
    allowSend: env.K5_ALLOW_SEND === '1',
    threadId: env.K5_THREAD_ID || '',
    parentMessageId: env.K5_PARENT_MESSAGE_ID || '',
  }
}

/**
 * @param {{env?: Record<string,string|undefined>, fetchImpl?: typeof fetch, log?: (line: string)=>void}} options
 */
export async function runPreflight({ env = process.env, fetchImpl = fetch, log = () => {} } = {}) {
  const config = resolvePreflightConfig(env)
  const result = {
    mode: config.mode,
    login: null,
    channels: null,
    threads: null,
    sent: null,
    recipient: config.recipient || null,
  }

  const login = await fetchImpl(`${config.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: config.email, password: config.password }).toString(),
    redirect: 'manual',
  })
  result.login = login.status
  if (login.status !== 200) throw new Error(`login failed: HTTP ${login.status}`)
  const cookie = cookiesFrom(login)
  const headers = cookie ? { cookie, accept: 'application/json' } : { accept: 'application/json' }

  const channelsResponse = await fetchImpl(`${config.baseUrl}/api/communication_channels/me/channels`, { headers })
  const channelsBody = await readJson(channelsResponse)
  result.channels = Array.isArray(channelsBody.items) ? channelsBody.items.length : null
  if (!channelsResponse.ok) throw new Error(`channels failed: HTTP ${channelsResponse.status}`)

  const threadsResponse = await fetchImpl(`${config.baseUrl}/api/communications/me/threads?limit=5`, { headers })
  const threadsBody = await readJson(threadsResponse)
  const threadItems = Array.isArray(threadsBody.items) ? threadsBody.items : []
  result.threads = Array.isArray(threadsBody.items) ? threadItems.length : null
  if (!threadsResponse.ok) throw new Error(`threads failed: HTTP ${threadsResponse.status}`)
  const threadChannels = [...new Set(threadItems.map((item) => item?.channelId).filter(Boolean))]
  result.threadChannels = threadChannels
  result.channelVisible = config.channelId ? threadChannels.includes(config.channelId) : null

  log(`preflight: login=${result.login} channels=${result.channels} threads=${result.threads} mode=${result.mode}`)

  if (config.mode !== 'send') return result

  if (!config.allowSend) throw new Error('send mode requires K5_ALLOW_SEND=1 (explicit approval)')
  if (!config.recipients.length) throw new Error('send mode requires K5_ALLOWED_RECIPIENTS')
  if (!config.recipient || !config.recipients.includes(config.recipient)) {
    throw new Error('K5_RECIPIENT must appear exactly in K5_ALLOWED_RECIPIENTS')
  }
  if (!UUID_RE.test(config.channelId)) throw new Error('K5_CHANNEL_ID must be a uuid')
  if (result.channelVisible === false) {
    throw new Error('K5_CHANNEL_ID is not visible in /me/threads (wrong channel or no access)')
  }
  if (Boolean(config.threadId) !== Boolean(config.parentMessageId)) {
    throw new Error('K5_THREAD_ID and K5_PARENT_MESSAGE_ID must be provided together')
  }

  const clientRequestId = randomUUID()
  const sendResponse = await fetchImpl(`${config.baseUrl}/api/communications/me/send`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      channelId: config.channelId,
      to: [config.recipient],
      subject: config.subject,
      body: { plain: config.text },
      clientRequestId,
      ...(config.threadId ? { threadId: config.threadId, parentMessageId: config.parentMessageId } : {}),
    }),
  })
  result.sent = sendResponse.status
  result.clientRequestId = clientRequestId
  if (![200, 202].includes(sendResponse.status)) {
    const body = await readJson(sendResponse)
    throw new Error(`send failed: HTTP ${sendResponse.status} ${JSON.stringify(body).slice(0, 200)}`)
  }
  log(`preflight: sent=${result.sent} clientRequestId=${clientRequestId}`)
  return result
}

if (isMainEntry(import.meta.url)) {
  runPreflight({ log: (line) => console.log(line) }).then(
    (result) => {
      console.log(JSON.stringify(result, null, 2))
    },
    (error) => {
      console.error(`k5-preflight: ${error instanceof Error ? error.message : String(error)}`)
      process.exitCode = 1
    },
  )
}
