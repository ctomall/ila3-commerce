#!/usr/bin/env node
/**
 * Managed patch: tenant-wide channels keep the acting organization.
 *
 * `connect-credential-channel` deliberately stores tenant channels with
 * `organization_id = NULL`, but every later lookup is org-scoped:
 * sendAsUser filters `{id, tenantId, organizationId}`, inbox/window reads filter
 * the conversation org, and delivery resolves credentials with
 * `channel.organizationId ?? tenantId`. The result is a connected channel that
 * no one can send from (404 Channel not found / 422 WINDOW_CLOSED) until rows are
 * repaired by hand.
 *
 * For this single-company CRM we store the acting org instead:
 *   - channel row -> input.scope.organizationId ?? null;
 *   - credentials scope -> input.scope.organizationId ?? tenantId.
 * Both stay NULL-free only when the caller actually has an org; a caller without
 * one keeps the previous tenant-scoped behaviour.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs (while applied).
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:tenant-channel-org-scope] */'
const TARGET =
  'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/connect-credential-channel.js'
const ROOT = process.env.OM_PATCH_REPO_ROOT || process.cwd()

function replaceOnce(source, from, to, label) {
  const hits = source.split(from).length - 1
  if (hits !== 1) {
    throw new Error(`[patches] tenant-channel-org-scope: ${label}: expected exactly one anchor, found ${hits}`)
  }
  return source.replace(from, () => to)
}

const source = fs.readFileSync(path.join(ROOT, TARGET), 'utf8')
if (!source.includes(MARKER)) {
  let next = replaceOnce(
    source,
    `    const credentialsScope = {
      tenantId: input.scope.tenantId,
      organizationId: tenantScoped ? input.scope.tenantId : input.scope.organizationId ?? input.scope.tenantId,`,
    `    ${MARKER}
    // Keep the acting org on both the credentials and the channel row; every
    // later read (sendAsUser, window, delivery credential resolution) is
    // org-scoped, so a NULL org makes the channel unusable.
    const credentialsScope = {
      tenantId: input.scope.tenantId,
      organizationId: input.scope.organizationId ?? input.scope.tenantId,`,
    'credentials scope',
  )
  next = replaceOnce(
    next,
    `        scope: {
          tenantId: input.scope.tenantId,
          organizationId: tenantScoped ? null : input.scope.organizationId ?? null
        },`,
    `        scope: {
          tenantId: input.scope.tenantId,
          organizationId: input.scope.organizationId ?? null
        },`,
    'channel org',
  )
  fs.writeFileSync(path.join(ROOT, TARGET), next)
}
