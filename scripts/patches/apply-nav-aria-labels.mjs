#!/usr/bin/env node
/**
 * Managed patch: give the collapsed sidebar rail an accessible name.
 *
 * In compact mode the nav link renders only an icon: the label is written to
 * `title` (a mouse tooltip) and the text node is omitted, so the link has no
 * accessible name in the a11y tree — a screen reader announces "link" and
 * nothing else, and the same is true for keyboard/screen-reader users.
 *
 * Fix: mirror the label into `aria-label` on all three nav link shapes
 * (top-level item, section item, section child). The value is guarded so a
 * non-string label can never be handed to `aria-label`.
 *
 * Idempotent. Run before `yarn build`; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:nav-aria] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/AppShell.js'

const REPLACEMENTS = [
  {
    from: 'title: compact ? label : void 0,',
    to: 'title: compact ? label : void 0,\n                "aria-label": typeof label === "string" ? label : void 0,',
  },
  {
    from: 'title: compact ? i.title : void 0,',
    to: 'title: compact ? i.title : void 0,\n                          "aria-label": typeof i.title === "string" ? i.title : void 0,',
  },
  {
    from: 'title: compact ? c.title : void 0,',
    to: 'title: compact ? c.title : void 0,\n                              "aria-label": typeof c.title === "string" ? c.title : void 0,',
  },
]

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:nav-aria] target not found: ${TARGET}`)
  process.exit(1)
}

let source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:nav-aria] already applied')
  process.exit(0)
}

let applied = 0
for (const { from, to } of REPLACEMENTS) {
  if (!source.includes(from)) {
    console.error(`[patch:nav-aria] anchor not found: ${from}`)
    process.exit(1)
  }
  source = source.replace(from, `${to} ${MARKER}`)
  applied++
}

fs.writeFileSync(file, source)
console.log(`[patch:nav-aria] applied ${applied} aria-label(s) to ${TARGET}`)
