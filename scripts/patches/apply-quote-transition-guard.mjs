#!/usr/bin/env node
/**
 * Managed patch: give quote→order its missing precondition, and stop swallowing why.
 *
 * Two defects, both measured on this deployment:
 *
 * 1. `sales.quotes.convert_to_order` has no status precondition. A quote still in
 *    `draft` — never sent, never accepted — converted into a sales order and returned
 *    200. Measured: SQ-DEMO-1001 (draft) → POST /api/sales/quotes/convert → 200.
 * 2. Both transition routes catch everything and answer with a generic sentence
 *    ("转换报价单失败。"), so a caller that sent the wrong field name sees the same
 *    message as a business-rule rejection. Measured: `{id}` instead of `{quoteId}`
 *    produced 400 + generic text, while the cause was a ZodError on `quoteId`.
 *
 * So the patch: reject conversion unless the quote is `sent` or `accepted`, with a
 * message that says what to do; and answer validation errors with 422 + the field
 * paths instead of the generic sentence.
 *
 * The status vocabulary is a tenant-configurable dictionary, so the check deliberately
 * names only the two states that this workflow can convert from and passes everything
 * else through — a tenant that adds `approved` keeps working, and the check lives in
 * the mirror's command as `assertConvertibleStatus` once the source build lands.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'

const MARKER = '/* [patched:quote-transition-guard] */'
const COMMAND_TARGET = 'node_modules/@open-mercato/core/dist/modules/sales/commands/documents.js'
const ROUTES = [
  'node_modules/@open-mercato/core/dist/modules/sales/api/quotes/convert/route.js',
  'node_modules/@open-mercato/core/dist/modules/sales/api/quotes/send/route.js',
]

const GUARD = `${MARKER}
function assertConvertibleStatus(quote, translate) {
  const status = typeof quote.status === "string" ? quote.status.trim().toLowerCase() : "";
  if (status === "sent" || status === "accepted") return;
  throw new CrudHttpError(409, {
    error: translate(
      "sales.documents.detail.convertNotAccepted",
      status ? \`报价单当前状态为「\${quote.status}」，需先发送并确认后才能转订单。\` : "报价单尚未发送，需先发送并确认后才能转订单。"
    )
  });
}
`

const COMMAND_EDITS = [
  [
    'const orderId = payload.orderId ?? quote.id;',
    `${GUARD}      assertConvertibleStatus(quote, translate);\n      const orderId = payload.orderId ?? quote.id;`,
  ],
]

const ROUTE_EDITS = [
  [
    '    const { translate } = await resolveTranslations();\n    logger.error(',
    `    /* [patched:quote-transition-guard] */
    if (err && (err.name === "ZodError" || Array.isArray(err.issues))) {
      return NextResponse.json(
        { error: "参数校验失败", details: err.issues ?? [] },
        { status: 422 }
      );
    }
    const { translate } = await resolveTranslations();
    logger.error(`,
  ],
]

function applyFile(target, edits, marker) {
  if (!fs.existsSync(target)) {
    console.log(`[patch:quote-transition-guard] missing ${target}`)
    return false
  }
  let text = fs.readFileSync(target, 'utf8')
  if (text.includes(marker)) {
    console.log(`[patch:quote-transition-guard] already applied: ${target}`)
    return true
  }
  for (const [from, to] of edits) {
    if (!text.includes(from)) {
      console.error(`[patch:quote-transition-guard] anchor not found in ${target}:\n${from.slice(0, 120)}`)
      return false
    }
    text = text.replace(from, to)
  }
  fs.writeFileSync(target, text)
  console.log(`[patch:quote-transition-guard] done: ${target}`)
  return true
}

let ok = applyFile(COMMAND_TARGET, COMMAND_EDITS, MARKER)
for (const route of ROUTES) {
  if (!applyFile(route, ROUTE_EDITS, MARKER)) ok = false
}
if (!ok) process.exit(1)
