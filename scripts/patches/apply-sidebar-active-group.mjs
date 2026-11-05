#!/usr/bin/env node
/**
 * Managed patch: open only the navigation group that owns the current route.
 *
 * With all 18 groups expanded the sidebar is 2505px tall (~2.8 screens at 900px),
 * so most destinations need scrolling. The previous attempt seeded `openGroups`
 * in the initializer, which did nothing: sections are keyed `settings:<id>` at
 * the render site while the initializer seeded `resolveGroupKey(g)`.
 *
 * This patches the two places that DECIDE whether a group is open, so the
 * default is "open only when the route lives inside it", while a group the user
 * toggled explicitly (key present in openGroups) keeps its own state, and a
 * search query still opens everything.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:sidebar-active-group] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/AppShell.js'

const HELPER = `${MARKER}
  const routeOwnsGroup = (group) => {
    const walk = (items) => (items || []).some((item) => {
      const href = item && item.href ? item.href : "";
      if (href && pathname && (pathname === href || pathname.startsWith(href + "/"))) return true;
      return walk(item ? item.children : null);
    });
    return walk(group.items) || walk(group.children);
  };`

const EDITS = [
  {
    // default is now `undefined` for closed groups, so `=== false` would write
    // `false` on the first click and need a second click to open.
    from: 'const toggleGroup = (groupId) => setOpenGroups((prev) => ({ ...prev, [groupId]: prev[groupId] === false }));',
    to: 'const toggleGroup = (groupId) => setOpenGroups((prev) => ({ ...prev, [groupId]: prev[groupId] !== true }));',
  },

  {
    // sections renderer
    from: '        const open = openGroups[sectionKey] !== false;',
    to: `        const open = openGroups[sectionKey] !== void 0
          ? openGroups[sectionKey] !== false
          : routeOwnsGroup(section);`,
  },
  {
    // main groups renderer
    from: '            const open = navQueryActive ? true : openGroups[groupId] !== false;',
    to: `            const open = navQueryActive
              ? true
              : openGroups[groupId] !== void 0
                ? openGroups[groupId] !== false
                : routeOwnsGroup(g);`,
  },
  {
    // define the helper once, right after the sections renderer opens
    from: '  function renderSectionSidebar(sections, title, compact, hideHeader, hideSearch) {',
    to: `  ${HELPER}
  function renderSectionSidebar(sections, title, compact, hideHeader, hideSearch) {`,
  },
]

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:sidebar-active-group] target not found: ${TARGET}`)
  process.exit(1)
}
let source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:sidebar-active-group] already applied')
  process.exit(0)
}
for (const { from, to } of EDITS) {
  if (!source.includes(from)) {
    console.error(`[patch:sidebar-active-group] anchor not found: ${from.slice(0, 70)}`)
    process.exit(1)
  }
  source = source.replace(from, to)
}
fs.writeFileSync(file, source)
console.log('[patch:sidebar-active-group] groups now open only for the active route')
