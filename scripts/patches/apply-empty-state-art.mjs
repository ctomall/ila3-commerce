#!/usr/bin/env node
/**
 * Managed patch: give empty lists a brand illustration (T11).
 *
 * Three separate renderers can produce an empty list, and only the first one
 * (ListEmptyState) goes through the shared EmptyState primitive:
 *   1. filters/ListEmptyState.js    — pages that pass an entity-aware empty state
 *   2. filters/SearchEmptyResults.js — "no results for <query>"
 *   3. (moved to source) backend/DataTable.tsx — the generic "No results." fallback
 *      now ships the illustration via the package build instead of a dist patch
 * All three are patched here so the empty state looks the same everywhere.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:empty-state-art] */'
const IMG = (indent) =>
  `${indent}/* @__PURE__ */ jsx("img", {\n${indent}  src: "/brand/state-empty.svg",\n${indent}  alt: "",\n${indent}  "aria-hidden": "true",\n${indent}  width: 160,\n${indent}  height: 120,\n${indent}  className: "opacity-70 text-muted-foreground"\n${indent}}),`

const PATCHES = [
  {
    target: 'node_modules/@open-mercato/ui/dist/backend/filters/ListEmptyState.js',
    from: `      variant: "subtle",
      size: "lg",
      icon: icon ?? /* @__PURE__ */ jsx(Inbox, { className: "size-7", "aria-hidden": true }),`,
    to: `      variant: "subtle",
      size: "lg",
      ${MARKER}
      illustration: icon ? void 0 : ` + IMG('      ').trimStart() + `
      icon: icon ?? /* @__PURE__ */ jsx(Inbox, { className: "size-7", "aria-hidden": true }),`,
  },
  {
    target: 'node_modules/@open-mercato/ui/dist/backend/filters/SearchEmptyResults.js',
    from: `/* @__PURE__ */ jsx("div", { className: "flex size-16 items-center justify-center rounded-full bg-muted", children: /* @__PURE__ */ jsx(SearchX, { className: "size-7 text-muted-foreground", "aria-hidden": true }) }),`,
    to: `${MARKER}\n    ${IMG('    ').trimStart()}`,
  },
]

let applied = 0
for (const { target, from, to } of PATCHES) {
  const file = path.resolve(process.cwd(), target)
  if (!fs.existsSync(file)) {
    console.log(`[patch:empty-state-art] missing ${target}, skipped`)
    continue
  }
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes(MARKER)) {
    console.log(`[patch:empty-state-art] ${path.basename(target)} already applied`)
    continue
  }
  if (!source.includes(from)) {
    console.error(`[patch:empty-state-art] anchor not found in ${target} — package changed`)
    process.exit(1)
  }
  fs.writeFileSync(file, source.replace(from, to))
  applied++
  console.log(`[patch:empty-state-art] patched ${path.basename(target)}`)
}
console.log(`[patch:empty-state-art] done: ${applied} file(s)`)
