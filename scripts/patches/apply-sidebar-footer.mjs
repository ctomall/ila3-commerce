#!/usr/bin/env node
/**
 * Managed patch: a pinned sidebar footer with the user centre and the collapse
 * control.
 *
 * The account entry only existed in the top bar, and the collapse control was a
 * floating icon that moved depending on state. Both now live in one bar pinned
 * to the bottom of the sidebar: avatar (link to the user centre), the account
 * email when expanded, and the collapse/expand button. Because it is `fixed` it
 * stays reachable while the navigation scrolls.
 *
 * Runs after apply-sidebar-expand-affordance, whose block it replaces; the older
 * marker is kept so that patch still verifies.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:sidebar-footer] */'
const TARGET = 'node_modules/@open-mercato/ui/dist/backend/AppShell.js'

const OLD = `          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => setCollapsed((c) => !c),
              "aria-label": t("appShell.toggleSidebar"),
              /* [patched:expand-affordance] */
              className: effectiveCollapsed
                ? "hidden lg:flex fixed top-4 z-dropdown h-7 w-auto items-center justify-center gap-1 rounded-md border bg-background px-2 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:shadow-focus"
                : "hidden lg:flex fixed top-4 z-dropdown size-7 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground hover:bg-muted focus:outline-none focus-visible:shadow-focus",
              style: effectiveCollapsed ? { left: "8px", bottom: "52px", top: "auto", zIndex: 60 } : { left: \`calc(\${asideWidth} - 14px)\` },
              children: effectiveCollapsed ? /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(PanelLeftOpen, { className: "size-4" }),
                /* @__PURE__ */ jsx("span", { children: "展开" })
              ] }) : /* @__PURE__ */ jsx(PanelLeftClose, { className: "size-4" })
            }
          ),`

const NEW = `          /* @__PURE__ */ jsx(
            "div",
            {
              ${MARKER}
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
          ),`

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:sidebar-footer] target not found: ${TARGET}`)
  process.exit(1)
}
let source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:sidebar-footer] already applied')
  process.exit(0)
}
if (!source.includes(OLD)) {
  console.error('[patch:sidebar-footer] anchor not found — run apply-sidebar-expand-affordance first')
  process.exit(1)
}
source = source.replace(OLD, NEW)
fs.writeFileSync(file, source)
console.log('[patch:sidebar-footer] pinned footer with user centre and collapse control')
