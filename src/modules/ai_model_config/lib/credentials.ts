import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

/**
 * At-rest encryption for provider API keys stored in `module_configs`.
 *
 * The application secret never leaves the process: AES-256-GCM with a key
 * derived (scrypt) from AUTH_SECRET (or an explicit MODEL_CONFIG_SECRET).
 * Ciphertext format: `enc:v1:<iv b64>:<tag b64>:<ciphertext b64>`.
 */

const PREFIX = 'enc:v1:'
const SALT = 'open-mercato:model-provider-credentials:v1'

function resolveSecret(): string | null {
  const secret = process.env.MODEL_CONFIG_SECRET
    ?? process.env.AUTH_SECRET
    ?? process.env.NEXTAUTH_SECRET
    ?? process.env.JWT_SECRET
  const trimmed = secret?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

let cachedKey: Buffer | null = null
let cachedSecret: string | null = null

function deriveKey(): Buffer {
  const secret = resolveSecret()
  if (!secret) {
    throw new Error('No application secret is configured (AUTH_SECRET or MODEL_CONFIG_SECRET).')
  }
  if (cachedKey && cachedSecret === secret) return cachedKey
  cachedKey = scryptSync(secret, SALT, 32)
  cachedSecret = secret
  return cachedKey
}

export function isEncryptedSecret(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export function encryptSecret(plaintext: string): string {
  const value = plaintext.trim()
  if (!value) return ''
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`
}

export function decryptSecret(payload: string | null | undefined): string | null {
  if (!isEncryptedSecret(payload)) return null
  try {
    const [ivB64, tagB64, dataB64] = payload.slice(PREFIX.length).split(':')
    if (!ivB64 || !tagB64 || !dataB64) return null
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ])
    const value = plaintext.toString('utf8').trim()
    return value.length > 0 ? value : null
  } catch {
    return null
  }
}

export function maskSecret(plaintext: string | null): string | null {
  if (!plaintext) return null
  if (plaintext.length <= 4) return '••••'
  return `${'•'.repeat(Math.min(8, plaintext.length - 4))}${plaintext.slice(-4)}`
}
