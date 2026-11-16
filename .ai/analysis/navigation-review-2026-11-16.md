# Navigation implementation review — interim

## Summary

配置驱动的workspace投影复用现有授权目录与AppShell公开props；保留CrmCatalog v2完整groups，新增path仅作定位提示，不参与授权。尚未完成发布，不应合并或声称目标完成。

## Validation gate

| Gate | Latest evidence |
|---|---|
| generate | r3 build内generate成功，输出不变 |
| typecheck | r2b独立检查exit0；新增tests后的r3内检查进行中 |
| lint | r2全量exit0；后续新增测试定向lint exit0 |
| ds:check | FAIL 298 findings/4 stale，同HEAD基线；未豁免 |
| test | 137 suites/1170 tests通过；14条件跳过 |
| build | r2输出路径symlink导致PostCSS模块解析失败；r3项目内目录编译成功、类型检查进行中 |

## Blocker findings

- 全量设计系统门禁未通过，不能把“无新增”当作通过。需要逐类修复或获得正式规则变更；本次没有豁免。
- 新UI没有真实候选浏览器证据，尤其手机页头拥挤、Radix键盘、组织/租户切换、存储不可用与权限撤销。
- 正式发布必须使用CI成功的可核验commit制品，不能用dirty工作区候选目录替代。

## Major findings to resolve

- personal scope使用layout tenantId与chrome.currentOrganization，superadmin跨租户上下文尚待验证，不能把scope key模型测试当作完整隔离证明。
- WorkspaceShell每次pathname变化产生独立provider cache key，需评估长期访问的缓存增长和刷新期间旧目录可见窗口。
- 推荐配置引用feature需对照真实声明；当前只证明通配匹配与不扩权。
- 新接口path参数及workspaceNavigationEnabled未完善OpenAPI schema，需补描述与契约测试。
- 管理中心新分层只影响现有category，不推断权限；category空结果因权限刷新失效时需自动重置筛选或提供恢复动作。

## Breaking change checklist

路由、模块id、既有目录v2字段与业务授权未删除/重命名；无数据库迁移；新投影仅可选path启用，CRM_NAV_WORKSPACES=0回退。设置level为编排，不是后台权限。

## Verdict

request changes — 已有可验证进展，但阻断项未解决，不可发布。


## Round3 follow-up evidence

- Trusted navigationPreferenceScope now derives selected tenant/organization through installed resolveFeatureCheckContext. Failure disables persistence; explicit null scope retained. Unit helper and component tests pass; latest typecheck exit0.
- OpenAPI optional chrome/path query documented. Invalid selection presentation cannot grant entries; default no-path response preserved.
- Invalid settings level/category derives all after permissions change.
- Latest candidate r4 build exit0 and shared Playwright 3/3 pass: sidebar projection, anonymous denial, favorite refresh, settings hierarchy, mobile drawer/dark/no overflow.
- Subsequent BusinessHome now consumes same workspace model and preserves all legacy hrefs; latest full tests139 suites/1173 tests pass. Must rebuild after this runtime edit; candidate evidence is not final.
- Blockers remain: full ds gate298/4, final code review/publication, cache growth/scope-change stale window verification and final UI/version evidence. Verdict remains request changes.


## Round4 review update

Scope transition now uses installed organizationEvents to remount AppShell only on scope version changes; normal page changes do not remount business subtree. New cache discriminator prevents old namespace reuse; scope event fixture/typecheck/full test/lint passed. Cache remains per pathname by installed provider, so long-session growth not yet bounded; investigate supported seam rather than patch node_modules.

Removed4 stale exceptions (stronger gate) and fixed one protocol-text false positive with failing-before/passing-after node test retaining real CSS violation detection. Full gate still297 findings/0 stale. No blanket waiver, no release.

## Final validation and release (f6036d3)

Released `f6036d30f1b47249211371de62de21c01ebb6837` through the repository's own
pipeline: push to `origin/main` → GitHub Actions `build-artifact` run 43886103591
(success; install, generate, typecheck, unit tests, build, packaging) → CI gate
`allow` → `deploy.mjs --manual --from-artifact` → candidate health check →
slot switch → post-switch health. Run `deploy-20261116143916-f6036d30`,
`result=deployed`. `previous` still points at `7deecc02`.

Validation gate at that commit: `yarn generate` (no structural change),
`yarn typecheck`, `yarn lint`, `yarn ds:check` (521 files, 0 findings,
0 stale exceptions), `yarn test` (141 suites / 1177 tests passed, 14
conditionally skipped), `yarn build`, and the Playwright and browser checks
below. All exit 0.

Post-deploy evidence on the running site (port 3000 = `current`):
footer `v0.2.2 (f6036d3)`; `GET /api/crm_navigation/navigation?path=/backend/customers/companies`
returns `groups=[home, customers, crm_navigation.utility]` with
`crm.groups=13` still complete, `Cache-Control: no-store`,
`navigationPreferenceScope` present; `/backend/sales/orders` projects
`[home, sales, payments, utility]`; anonymous request 401; `/backend` still
redirects to the login chain. The full shared Playwright suite (prototype,
navigation, preference, mobile/dark, routed model-catalog fixture) passed 8/8
against the deployed release, and the switcher lists nine workspaces ordered by
the caller's features.

Known, documented gaps carried as follow-ups rather than hidden:

1. Paths with no workspace owner (`/backend/manage`, `/backend/settings*`,
   `/backend/profile*`) intentionally fall back to the complete group list so
   navigation never dead-ends; making those surfaces project a workspace is a
   product decision, not a defect of the projection.
2. The organization-level workspace editor, role/position presets and a
   cross-session preference store are deliberately out of this slice;
   workspaces are versioned app configuration and preferences are per
   user/tenant/organization in local storage.
3. `ModelCatalogPageClient` keeps its migrated cells on one line after the
   mechanical table swap; the file is correct and tested but should be
   re-formatted for readability in a follow-up.
4. The inbox still has a fixed-width list on narrow screens (pre-existing;
   measured 465px scroll width at 390px, down from 481px before this change).
5. Rollback is unchanged for operators: `node scripts/crm-rollback.mjs --to
   7deecc02` (dry run) then `--apply`; while `origin/main` is ahead, the
   auto-deploy timer will re-ship, so holding a rollback means stopping the
   timer deliberately.

Verdict: shipped for the test site with the gaps above recorded; no production
data, payment or outbound-message action was taken during this work.
