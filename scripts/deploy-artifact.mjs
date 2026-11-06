#!/usr/bin/env node
/**
 * Deploy a build produced by the `build-artifact` workflow, so the server only pulls and
 * restarts instead of compiling.
 *
 * Opt-in and dry-run by default: it needs a token with `actions:read` on the repository
 * and writes into the same staging/rollback directories the one-click upgrade uses, so it
 * is not wired to anything automatically.
 *
 * Usage:
 *   GITHUB_TOKEN=... node scripts/deploy-artifact.mjs --dry-run      # inspect only
 *   GITHUB_TOKEN=... node scripts/deploy-artifact.mjs                # stage + swap
 *
 * Env: GITHUB_REPOSITORY (owner/repo), ILA3_APP_DIR (defaults to cwd),
 *      DEPLOY_ARTIFACT_NAME (defaults to the newest next-build-* artifact).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const APP_DIR = process.env.ILA3_APP_DIR?.trim() || process.cwd()
const DIST_ROOT = path.join(APP_DIR, '.mercato')
const ACTIVE = path.join(DIST_ROOT, 'next')
const STAGING = path.join(DIST_ROOT, 'next-staging')
const PREV = path.join(DIST_ROOT, 'next-prev')
const REPO = process.env.GITHUB_REPOSITORY?.trim() || 'ctomall/ila3-commerce'
const TOKEN_FILE = process.env.ILA3_DEPLOY_TOKEN_FILE?.trim() || `${process.env.HOME || ''}/.config/ila3/github-token`
function readToken() {
  const fromEnv = process.env.GITHUB_TOKEN?.trim()
  if (fromEnv) return fromEnv
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim() || undefined
  } catch {
    return undefined
  }
}
const TOKEN = readToken()
const DRY_RUN = process.argv.includes('--dry-run')

const SERVICE = process.env.ILA3_SERVICE?.trim() || 'mercato'
const HEALTH_URL = process.env.ILA3_HEALTH_URL?.trim() || 'http://127.0.0.1:3000/login'
const HEALTH_TIMEOUT_MS = Number(process.env.ILA3_HEALTH_TIMEOUT_MS ?? 180_000)

async function waitForHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(HEALTH_URL)
      if (res.ok) return true
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  return false
}

function log(message) {
  console.log(`[deploy-artifact] ${message}`)
}

function apiHeaders() {
  if (!TOKEN) throw new Error(`GITHUB_TOKEN is required (needs actions:read); also checked ${TOKEN_FILE}`)
  return { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' }
}

async function newestArtifact(name) {
  const headers = apiHeaders()
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/artifacts?per_page=50`, { headers })
  if (!res.ok) throw new Error(`artifact listing failed: ${res.status}`)
  const body = await res.json()
  const candidates = (body.artifacts ?? [])
    .filter((item) => (name ? item.name === name : String(item.name).startsWith('next-build-')))
    .filter((item) => !item.expired)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  if (candidates.length === 0) throw new Error('no matching artifact found')
  return candidates[0]
}

async function download(artifact) {
  const headers = apiHeaders()
  const res = await fetch(artifact.archive_download_url, { headers, redirect: 'follow' })
  if (!res.ok) throw new Error(`artifact download failed: ${res.status}`)
  const zip = path.join(os.tmpdir(), `${artifact.name}.zip`)
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
  return zip
}

async function main() {
  const artifact = await newestArtifact(process.env.DEPLOY_ARTIFACT_NAME?.trim())
  log(`artifact ${artifact.name} (${artifact.size_in_bytes} bytes, ${artifact.created_at})`)
  if (DRY_RUN) {
    log('dry run: would download, unpack into .mercato/next-staging, stop service, swap, start, health check')
    return
  }
  const zip = await download(artifact)
  fs.rmSync(STAGING, { recursive: true, force: true })
  fs.mkdirSync(STAGING, { recursive: true })
  await execFileAsync('unzip', ['-q', zip, '-d', STAGING])
  if (!fs.existsSync(path.join(STAGING, 'BUILD_ID'))) {
    throw new Error('artifact does not look like a Next build (no BUILD_ID)')
  }
  fs.rmSync(PREV, { recursive: true, force: true })
  if (fs.existsSync(ACTIVE)) fs.renameSync(ACTIVE, PREV)
  fs.renameSync(STAGING, ACTIVE)
  await execFileAsync('sudo', ['-n', 'systemctl', 'stop', SERVICE])
  await execFileAsync('sudo', ['-n', 'systemctl', 'start', SERVICE])
  if (await waitForHealth()) {
    log('swapped; health check passed')
    return
  }
  log('health check failed — rolling back')
  fs.rmSync(STAGING, { recursive: true, force: true })
  if (fs.existsSync(ACTIVE)) fs.renameSync(ACTIVE, STAGING)
  if (fs.existsSync(PREV)) fs.renameSync(PREV, ACTIVE)
  await execFileAsync('sudo', ['-n', 'systemctl', 'start', SERVICE])
  const recovered = await waitForHealth()
  throw new Error(`health check failed; rollback ${recovered ? 'restored traffic' : 'also failed'}`)
}

main().catch((error) => {
  console.error(`[deploy-artifact] ${error.message}`)
  process.exit(1)
})
