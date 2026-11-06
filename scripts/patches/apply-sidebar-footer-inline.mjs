#!/usr/bin/env node
/**
 * Managed patch: put the sidebar footer in the layout instead of floating it.
 *
 * The previous footer was `position: fixed`, so while it never overlapped the
 * last row once scrolled to the end, it visually covered whichever rows happened
 * to sit at the bottom of the viewport mid-scroll (reported with a screenshot of
 * the 文档 entry hidden behind it).
 *
 * The footer now lives inside the aside: the aside becomes a column flex, the
 * navigation takes the remaining height and scrolls, and the footer occupies its
 * own row. Nothing can overlap at any scroll position.
 *
 * Runs after apply-sidebar-footer; keeps both earlier markers so those patches
 * still verify.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:sidebar-footer-inline] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/AppShell.js'

const OLD_FOOTER = `          /* @__PURE__ */ jsx(
            "div",
            {
              /* [patched:sidebar-footer] */
              /* [patched:expand-affordance] */
              className: "hidden lg:flex fixed bottom-4 z-dropdown items-center gap-1 rounded-lg border bg-background p-1 shadow-sm",
              style: effectiveCollapsed ? { left: "8px", width: "68px", zIndex: 60 } : { left: "8px", width: \`calc(\${asideWidth} - 16px)\`, zIndex: 60 },
              children: [
                /* @__PURE__ */ jsx(
                  Link,
                  {
                    href: "/backend/profile",
                    "aria-label": t("appShell.openUserCenter", "用户中心"),
                    title: email || t("appShell.openUserCenter", "用户中心"),
                    className: "flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground transition-colors hover:bg-muted/80",
                    children: (email || "?").trim().charAt(0).toUpperCase()
                  }
                ),
                !effectiveCollapsed ? /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground", children: email }) : null,
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => setCollapsed((c) => !c),
                    "aria-label": t("appShell.toggleSidebar"),
                    className: "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:shadow-focus",
                    children: effectiveCollapsed ? /* @__PURE__ */ jsx(PanelLeftOpen, { className: "size-4" }) : /* @__PURE__ */ jsx(PanelLeftClose, { className: "size-4" })
                  }
                )
              ]
            }
          ),
`

const FOOTER_JSX = `            /* @__PURE__ */ jsxs("div", {
              ${MARKER}
              /* [patched:sidebar-footer] */
              /* [patched:expand-affordance] */
              className: "flex shrink-0 items-center gap-1 border-t px-2 py-2",
              children: [
                /* @__PURE__ */ jsx(
                  Link,
                  {
                    href: "/backend/profile",
                    "aria-label": t("appShell.openUserCenter", "用户中心"),
                    title: email || t("appShell.openUserCenter", "用户中心"),
                    className: "flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground transition-colors hover:bg-muted/80",
                    children: (email || "?").trim().charAt(0).toUpperCase()
                  }
                ),
                !effectiveCollapsed ? /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1 truncate px-1 text-xs text-muted-foreground", children: email }) : null,
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => setCollapsed((c) => !c),
                    "aria-label": t("appShell.toggleSidebar"),
                    className: "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:shadow-focus",
                    children: effectiveCollapsed ? /* @__PURE__ */ jsx(PanelLeftOpen, { className: "size-4" }) : /* @__PURE__ */ jsx(PanelLeftClose, { className: "size-4" })
                  }
                )
              ]
            }),
`

const OLD_ASIDE = `className: \`\${asideClassesBase} px-0 hidden lg:block lg:sticky lg:top-0 lg:h-svh lg:self-start lg:overflow-hidden lg:relative transition-[width] duration-200 ease-out\`, style: { width: asideWidth }, children: [
            renderSidebar(effectiveCollapsed, false, isSectionView),`
const NEW_ASIDE = `className: \`\${asideClassesBase} px-0 hidden lg:flex lg:flex-col lg:sticky lg:top-0 lg:h-svh lg:self-start lg:overflow-hidden lg:relative transition-[width] duration-200 ease-out\`, style: { width: asideWidth }, children: [
            /* @__PURE__ */ jsx("div", { className: "flex min-h-0 flex-1 flex-col", children: renderSidebar(effectiveCollapsed, false, isSectionView) }),
${FOOTER_JSX}`

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:sidebar-footer-inline] target not found: ${TARGET}`)
  process.exit(1)
}
let source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:sidebar-footer-inline] already applied')
  process.exit(0)
}
for (const [from, to] of [[OLD_FOOTER, ''], [OLD_ASIDE, NEW_ASIDE]]) {
  if (!source.includes(from)) {
    console.error(`[patch:sidebar-footer-inline] anchor not found: ${from.slice(0, 80)}`)
    process.exit(1)
  }
  source = source.replace(from, to)
}
fs.writeFileSync(file, source)
console.log('[patch:sidebar-footer-inline] footer is part of the sidebar layout now')
