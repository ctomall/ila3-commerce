#!/usr/bin/env node
/**
 * Managed patch: a tenant-scoped channel is created as `shared`, not `private`.
 *
 * `createConnectedChannelRow` never writes `visibility`, so the column default
 * (`private`) applies to tenant-wide channels too. WhatsApp/Messenger declare
 * `channelScope: 'tenant'` and store `user_id = NULL`; `sendAsUser` then allows
 * a non-owner only when `visibility !== 'private'`, so every employee send on a
 * freshly connected tenant channel is rejected (403/404 in practice).
 *
 * This patch sets `visibility = 'shared'` for adapters that declare
 * `channelScope === 'tenant'` on BOTH paths:
 *   - the create object (new channel row);
 *   - `applyConnectionState` (reconnect/heal/adopt path).
 * Per-user channels are left untouched: a personal mailbox keeps its existing
 * visibility (private by default), including an owner who deliberately shared it.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs (while applied).
 * Proof hook: `OM_PATCH_REPO_ROOT` mirrors the repo root; default cwd.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:tenant-channel-shared] */'
const TARGET =
  'node_modules/@open-mercato/core/dist/modules/communication_channels/lib/connect-channel.js'
const ROOT = process.env.OM_PATCH_REPO_ROOT || process.cwd()

function read() {
  return fs.readFileSync(path.join(ROOT, TARGET), 'utf8')
}

function replaceOnce(source, from, to, label) {
  const hits = source.split(from).length - 1
  if (hits !== 1) {
    throw new Error(`[patches] tenant-channel-shared: ${label}: expected exactly one anchor, found ${hits}`)
  }
  return source.replace(from, () => to)
}

function patch(source) {
  if (source.includes(MARKER)) return source

  source = replaceOnce(
    source,
    '  const applyConnectionState = (target) => {',
    `  ${MARKER}
  // Tenant-scoped providers (WhatsApp/Messenger/push) are shared infrastructure.
  // sendAsUser permits non-owners only on non-private channels, so a tenant
  // channel must be shared on create and on reconnect/heal.
  const tenantScoped = adapter.channelScope === "tenant";
  const applyConnectionState = (target) => {`,
    'tenantScoped flag',
  )

  source = replaceOnce(
    source,
    `    target.lastError = credentialsAvailable ? null : "credentials_persist_failed";
  };`,
    `    target.lastError = credentialsAvailable ? null : "credentials_persist_failed";
    if (tenantScoped) target.visibility = "shared";
  };`,
    'reconnect visibility',
  )

  source = replaceOnce(
    source,
    `    isPrimary: false,
    pollIntervalSeconds,`,
    `    isPrimary: false,
    visibility: tenantScoped ? "shared" : "private",
    pollIntervalSeconds,`,
    'create visibility',
  )

  return source
}

const source = read()
const next = patch(source)
if (next !== source) fs.writeFileSync(path.join(ROOT, TARGET), next)

console.log('tenant-scoped channels are shared on create and reconnect')
