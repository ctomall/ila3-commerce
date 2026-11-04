#!/usr/bin/env node
/**
 * Managed patch: give list empty states a brand illustration (T11).
 *
 * Every list renders `ListEmptyState`, which forwards title/description/action to
 * the shared `EmptyState` primitive. That primitive already supports an
 * `illustration` slot, but ListEmptyState never passes one, so an empty list is
 * plain text. Adding the art in this one place covers every list at once instead
 * of patching each page.
 *
 * The illustration is only used when the caller supplies no custom icon, so
 * entity-specific empty states keep their own look.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:empty-state-art] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/filters/ListEmptyState.js'

const OLD = `      variant: "subtle",
      size: "lg",
      icon: icon ?? /* @__PURE__ */ jsx(Inbox, { className: "size-7", "aria-hidden": true }),`
const NEW = `      variant: "subtle",
      size: "lg",
      ${MARKER}
      illustration: icon ? void 0 : /* @__PURE__ */ jsx("img", {
        src: "/brand/state-empty.svg",
        alt: "",
        "aria-hidden": "true",
        width: 160,
        height: 120,
        className: "opacity-70 text-muted-foreground"
      }),
      icon: icon ?? /* @__PURE__ */ jsx(Inbox, { className: "size-7", "aria-hidden": true }),`

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:empty-state-art] target not found: ${TARGET}`)
  process.exit(1)
}
let source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:empty-state-art] already applied')
  process.exit(0)
}
if (!source.includes(OLD)) {
  console.error('[patch:empty-state-art] anchor not found — package changed, update the patch')
  process.exit(1)
}
fs.writeFileSync(file, source.replace(OLD, NEW))
console.log('[patch:empty-state-art] list empty states now render the brand illustration')
