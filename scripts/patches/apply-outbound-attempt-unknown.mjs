#!/usr/bin/env node
/**
 * Managed patch: a provider send with an UNKNOWN outcome must not be retried
 * blindly.
 *
 * The installed command commits the attempt, calls the provider, then commits
 * the result. If the process dies in between — or the provider accepted the
 * request but the connection dropped before a response — the link is still
 * `pending` and the worker's retry re-invokes `adapter.sendMessage`, so the
 * customer can receive the same message twice. The managed dedupe patch only
 * helps when the provider returns an external id we already stored; it cannot
 * help when nothing was stored.
 *
 * This patch:
 *   1. writes `channel_metadata.attempting = true` + `lastAttemptAt` in its own
 *      flush immediately before `adapter.sendMessage`;
 *   2. classifies a network-level send failure (timeout / reset / socket hang
 *      up, no HTTP status) as `unknown`: the link becomes `delivery_status =
 *      "unknown"`, the attempt marker is cleared, and a `.delivery_failed`
 *      event with `unknownResult: true` + `reason` is emitted. No retry;
 *   3. classifies a failure AFTER the provider accepted (the local success
 *      commit failed) the same way, storing the provider id when available;
 *   4. on entry, a link still marked `attempting` is never sent again: it is
 *      marked `unknown` (`attempt_lease_expired` when older than the 2 minute
 *      lease, `attempt_marker_present` otherwise) and stops;
 *   5. clears `attempting` on definitive success and definitive failure;
 *   6. teaches the worker that an `unknown` outcome is terminal (no re-enqueue).
 *
 * Schema: no migration. `message_channel_links.delivery_status` is open text;
 * `unknown` joins the existing lifecycle and is surfaced for reconciliation.
 *
 * Proof hook: set `OM_PATCH_REPO_ROOT` to a directory containing a mirror of the
 * two target paths to dry-run the transform without touching the shared
 * install. Default is the current working directory (the repo root).
 *
 * Idempotent; asserted by scripts/verify-patches.mjs (while applied).
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:outbound-attempt-unknown] */'
const CLAIM_MARKER = '/* [patched:outbound-concurrent-claim] */'
const COMMAND_TARGET =
  'node_modules/@open-mercato/core/dist/modules/communication_channels/commands/deliver-outbound-message.js'
const WORKER_TARGET =
  'node_modules/@open-mercato/core/dist/modules/communication_channels/workers/outbound-delivery.js'
const ROOT = process.env.OM_PATCH_REPO_ROOT || process.cwd()

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8')
}

function writeIfChanged(relative, next) {
  const file = path.join(ROOT, relative)
  const current = fs.readFileSync(file, 'utf8')
  if (next !== current) fs.writeFileSync(file, next)
}

function replaceOnce(source, from, to, label) {
  const hits = source.split(from).length - 1
  if (hits !== 1) {
    throw new Error(`[patches] outbound-attempt-unknown: ${label}: expected exactly one anchor, found ${hits}`)
  }
  return source.replace(from, () => to)
}

const HELPERS = `const NO_THREAD_MAPPING_RESULT = { status: "no_channel_link" };
${MARKER}
const OUTBOUND_ATTEMPT_LEASE_MS = 2 * 60 * 1000;
function isUnknownSendOutcome(error) {
  if (!error || typeof error !== "object") return false;
  // An HTTP status means the provider answered: the outcome is definitive even
  // when it is a 5xx/429. Only transport-level failures are unknown.
  if (typeof error.status === "number") return false;
  const cause = error.cause && typeof error.cause === "object" ? error.cause : null;
  const code = typeof error.code === "string" ? error.code : cause && typeof cause.code === "string" ? cause.code : "";
  if ([
    "ETIMEDOUT",
    "ECONNRESET",
    "EPIPE",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "UND_ERR_SOCKET"
  ].includes(code)) return true;
  const haystack = String(error.name ?? "") + " " + String(error.message ?? "") + " " + String(cause?.message ?? "");
  return /timed?\\s*out|socket hang up|other side closed|connection reset|connection terminated|network timeout|fetch failed/i.test(haystack);
}
async function markOutboundAttemptUnknown(args) {
  const {
    em,
    link,
    message,
    channel,
    mapping,
    scope,
    reason,
    error,
    providerExternalMessageId
  } = args;
  link.deliveryStatus = "unknown";
  link.channelMetadata = {
    ...link.channelMetadata ?? {},
    attempting: false,
    unknownResult: true,
    unknownReason: reason,
    unknownAt: (new Date()).toISOString(),
    lastError: error,
    ...providerExternalMessageId ? { providerExternalMessageId } : {}
  };
  await em.flush();
  await emitCommunicationChannelsEvent("communication_channels.message.delivery_failed", {
    messageId: message.id,
    channelLinkId: link.id,
    conversationId: mapping.externalConversationId,
    channelId: channel.id,
    providerKey: channel.providerKey,
    channelType: channel.channelType,
    transient: false,
    unknownResult: true,
    reason,
    error,
    status: null,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null
  }, { persistent: true });
}`

const ENTRY_GUARD = `    if (link && link.deliveryStatus === "unknown") {
      return {
        status: "unknown",
        messageId: message.id,
        channelLinkId: link.id,
        providerKey: channel.providerKey,
        error: String(link.channelMetadata?.unknownReason ?? "unknown_result")
      };
    }
    if (link && link.channelMetadata?.attempting === true && link.deliveryStatus !== "queued" && link.deliveryStatus !== "sent" && link.deliveryStatus !== "delivered" && link.deliveryStatus !== "read") {
      const attemptedAt = typeof link.channelMetadata.lastAttemptAt === "string" ? Date.parse(link.channelMetadata.lastAttemptAt) : NaN;
      const ageMs = Number.isFinite(attemptedAt) ? Date.now() - attemptedAt : Number.POSITIVE_INFINITY;
      const reason = ageMs >= OUTBOUND_ATTEMPT_LEASE_MS ? "attempt_lease_expired" : "attempt_marker_present";
      await markOutboundAttemptUnknown({
        em,
        link,
        message,
        channel,
        mapping,
        scope: input.scope,
        reason,
        error: reason === "attempt_lease_expired" ? "Previous provider attempt did not settle within the 2 minute lease; outcome is unknown." : "A previous provider attempt is still marked in flight; refusing to resend."
      });
      return {
        status: "unknown",
        messageId: message.id,
        channelLinkId: link.id,
        providerKey: channel.providerKey,
        error: reason
      };
    }
    if (link && (link.deliveryStatus === "queued" || link.deliveryStatus === "sent" || link.deliveryStatus === "delivered" || link.deliveryStatus === "read")) {`

const ATTEMPT_FLUSH_V1 = `      attemptStartedAt = (new Date()).toISOString();
      link.channelMetadata = {
        ...link.channelMetadata ?? {},
        attempting: true,
        lastAttemptAt: attemptStartedAt
      };
      await em.flush();
      try {
        sendResult = await adapter.sendMessage({
          conversationId: mapping.externalThreadRef,
          content: converted.content,
          credentials,
          scope: {
            tenantId: input.scope.tenantId,
            organizationId: channel.organizationId ?? input.scope.tenantId
          },
          metadata: converted.metadata
        });
      } catch (sendCallError) {
        sendCallThrew = true;
        throw sendCallError;
      }`

const ATTEMPT_FLUSH = `      attemptStartedAt = (new Date()).toISOString();
      /* [patched:outbound-concurrent-claim] */
      // Two concurrent redeliveries of this link (a BullMQ stalled job) both pass
      // the "attempting" check above before either writes a marker, so both would
      // call the provider and the customer receives the message twice. Claim the
      // attempt atomically: exactly one execution gets a row back. A row lock
      // would have to be held across the provider call instead.
      const claimRows = await em.getConnection().execute(
        \`update message_channel_links
            set channel_metadata = jsonb_set(coalesce(channel_metadata, '{}'::jsonb), '{attempting}', 'true'::jsonb)
                                   || jsonb_build_object('lastAttemptAt', ?::text)
          where id = ?
            and coalesce(channel_metadata->>'attempting', 'false') <> 'true'
            and delivery_status not in ('sent', 'delivered', 'read')
          returning id\`,
        [attemptStartedAt, link.id]
      );
      if (!Array.isArray(claimRows) || claimRows.length === 0) {
        return {
          status: "already_delivered",
          messageId: message.id,
          channelLinkId: link.id
        };
      }
      link.channelMetadata = {
        ...link.channelMetadata ?? {},
        attempting: true,
        lastAttemptAt: attemptStartedAt
      };
      try {
        sendResult = await adapter.sendMessage({
          conversationId: mapping.externalThreadRef,
          content: converted.content,
          credentials,
          scope: {
            tenantId: input.scope.tenantId,
            organizationId: channel.organizationId ?? input.scope.tenantId
          },
          metadata: converted.metadata
        });
      } catch (sendCallError) {
        sendCallThrew = true;
        throw sendCallError;
      }`

const UNKNOWN_CATCH = `    } catch (sendErr) {
      const classification = classifyOutboundError(sendErr);
      const requiresReauth = isReauthError(classification);
      if (providerAccepted && localCommitDone) {
        // The send and the link commit already succeeded; only a post-commit
        // effect (event emit) failed. Rethrow so the worker retries and the
        // terminal sent link short-circuits it — never downgrade a
        // committed send.
        throw sendErr;
      }
      if (providerAccepted) {
        await markOutboundAttemptUnknown({
          em,
          link,
          message,
          channel,
          mapping,
          scope: input.scope,
          reason: "local_commit_failed",
          error: classification.message,
          providerExternalMessageId: sendResult?.externalMessageId ?? null
        });
        return {
          status: "unknown",
          messageId: message.id,
          channelLinkId: link.id,
          providerKey: channel.providerKey,
          error: classification.message,
          reason: "local_commit_failed"
        };
      }
      if (sendCallThrew && isUnknownSendOutcome(sendErr)) {
        await markOutboundAttemptUnknown({
          em,
          link,
          message,
          channel,
          mapping,
          scope: input.scope,
          reason: "unknown_result",
          error: classification.message
        });
        return {
          status: "unknown",
          messageId: message.id,
          channelLinkId: link.id,
          providerKey: channel.providerKey,
          error: classification.message,
          reason: "unknown_result"
        };
      }
      link.deliveryStatus = "failed";`

function patchCommand(source) {
  if (source.includes(CLAIM_MARKER)) return source
  if (source.includes(MARKER)) {
    // v1 was already applied (a local install or an older release): splice in the
    // atomic claim without re-running the whole transform.
    return replaceOnce(source, ATTEMPT_FLUSH_V1, ATTEMPT_FLUSH, 'claim upgrade')
  }

  source = replaceOnce(
    source,
    'const NO_THREAD_MAPPING_RESULT = { status: "no_channel_link" };',
    HELPERS,
    'command helpers'
  )

  source = replaceOnce(
    source,
    '    if (link && (link.deliveryStatus === "queued" || link.deliveryStatus === "sent" || link.deliveryStatus === "delivered" || link.deliveryStatus === "read")) {',
    ENTRY_GUARD,
    'command entry guard'
  )

  source = replaceOnce(
    source,
    `    try {
      const outboundPayload = link.channelPayload ?? {};`,
    `    let attemptStartedAt = null;
    let sendCallThrew = false;
    let providerAccepted = false;
    let localCommitDone = false;
    let sendResult;
    try {
      const outboundPayload = link.channelPayload ?? {};`,
    'command attempt state'
  )

  source = replaceOnce(
    source,
    `      const sendResult = await adapter.sendMessage({
        conversationId: mapping.externalThreadRef,
        content: converted.content,
        credentials,
        scope: {
          tenantId: input.scope.tenantId,
          organizationId: channel.organizationId ?? input.scope.tenantId
        },
        metadata: converted.metadata
      });`,
    ATTEMPT_FLUSH,
    'command pre-send attempt marker'
  )

  source = replaceOnce(
    source,
    `      if (sendResult.status === "failed") {
        throw new Error(sendResult.error ?? \`Adapter '\${adapter.providerKey}' reported send failure\`);
      }`,
    `      if (sendResult.status === "failed") {
        throw new Error(sendResult.error ?? \`Adapter '\${adapter.providerKey}' reported send failure\`);
      }
      providerAccepted = true;`,
    'command provider accepted flag'
  )

  source = replaceOnce(
    source,
    `      link.channelMetadata = {
        ...link.channelMetadata ?? {},
        ...converted.metadata ?? {},
        externalMessageId: sendResult.externalMessageId,`,
    `      link.channelMetadata = {
        ...link.channelMetadata ?? {},
        ...converted.metadata ?? {},
        attempting: false,
        lastAttemptAt: attemptStartedAt,
        providerAccepted: true,
        externalMessageId: sendResult.externalMessageId,`,
    'command success clears attempt'
  )

  source = replaceOnce(
    source,
    `      await em.flush();
      await emitCommunicationChannelsEvent(
        "communication_channels.message.sent",`,
    `      await em.flush();
      localCommitDone = true;
      await emitCommunicationChannelsEvent(
        "communication_channels.message.sent",`,
    'command marks the local commit done'
  )

  source = replaceOnce(
    source,
    `    } catch (sendErr) {
      const classification = classifyOutboundError(sendErr);
      const requiresReauth = isReauthError(classification);
      link.deliveryStatus = "failed";`,
    UNKNOWN_CATCH,
    'command unknown outcome'
  )

  source = replaceOnce(
    source,
    `      link.channelMetadata = {
        ...link.channelMetadata ?? {},
        lastError: classification.message,`,
    `      link.channelMetadata = {
        ...link.channelMetadata ?? {},
        attempting: false,
        lastError: classification.message,`,
    'command failure clears attempt'
  )

  return source
}

function patchWorker(source) {
  if (source.includes(MARKER)) return source

  return replaceOnce(
    source,
    `    case "delivered":
    case "already_delivered":
    case "no_channel_link":
      return;`,
    `    case "delivered":
    case "already_delivered":
    case "no_channel_link":
      return;
    ${MARKER}
    case "unknown":
      logger.warn("delivery outcome unknown; leaving the link for reconciliation", {
        messageId,
        providerKey: outcome.providerKey,
        reason: outcome.error,
        scope
      });
      return;`,
    'worker unknown outcome'
  )
}

const command = patchCommand(read(COMMAND_TARGET))
writeIfChanged(COMMAND_TARGET, command)

const worker = patchWorker(read(WORKER_TARGET))
writeIfChanged(WORKER_TARGET, worker)

console.log('unknown outbound outcomes are marked instead of blindly retried')
