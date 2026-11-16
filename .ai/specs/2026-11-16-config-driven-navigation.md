# 配置驱动导航渐进式重构

**Date**: 2026-11-16
**Status**: Ready for implementation — Phase 1 only

## TLDR

复用现有模块 page.meta 声明、已授权 core navigation payload、CRM Navigation 目录和已安装 AppShell。保留业务路由与授权契约，将业务工作空间编排与各导航消费端解耦，不按角色名称硬编码。组织级编排编辑器、岗位推荐管理和个人偏好持久化可独立交付，实施边界需确认。

## Resolved assumptions (autonomous defaults)

2026-11-16 用户明确授权全权设计、构建、发布和上线验证，不等待人工验收。本规格按自主设计执行，保留自动化质量门禁。

- Q1：交付同一导航能力的依赖阶段，不混入组织配置编辑器这一独立产品。模块声明、应用编排、基于feature的岗位推荐策略及个人偏好分层都在本目标内；组织编排使用可版本管理的部署配置，暂不新增管理CRUD和数据库表。若确需可视化编辑器，后续独立规格，不影响本目标。
- Q2：采用工作空间选择器，侧栏显示当前工作空间，固定工作台/管理中心；全目录保留用于跨空间搜索与旧入口。通过开关恢复原导航。

## Autonomous delivery authorization

用户授权涵盖所有依赖阶段的设计和实施选择与测试站点上线，无需再次征求逐阶段确认。不能据此绕过权限、兼容、测试与恢复门禁。

## Problem Statement

用户反馈功能多但菜单入口混乱。现有 nav-groups.json 声明13组业务入口；buildShellChrome 展开所有目录组，并主动清空 settings/profile sections，导致设置页不使用外壳二级面板。现有机制已数据驱动，不能用另建硬编码菜单代替。

## Overview and Success Measures

基线待测。核心验收：新增合规模块不改侧栏/搜索/工作台组件即可被发现；未授权入口不出现；原路由有效。记录代表任务找入口时间和误入次数，不虚构目标数字。

## Goals

REQ-001 复用授权目录并统一消费；REQ-002 工作空间与分层设置；REQ-003 新模块可发现及权限不扩张；REQ-004 兼容旧链接和回滚。

## Non-goals

不更换业务模块，不改既有路由/API/数据库字段，不收放业务权限，不直接编辑 node_modules。组织管理编辑器、推荐管理、偏好持久化使用可版本化配置和有身份范围的轻量偏好，不新增CRUD。

## Proposed Solution

待关键选择确认后填充。现有事实：src/nav/crm-navigation.ts 构建目录，src/nav/shell-chrome.ts 适配外壳，src/nav/nav-groups.json 和 src/nav/logic.js 编排模块组；优先复用而非平行系统。

### Design Decisions and Alternatives

自主决策见上表。所有建议菜单名称属于编排配置，不是页面组件内固定路由数组。

## Domain Vocabulary and Business Rules

模块声明拥有入口身份/标题/权限；导航编排只组织已授权入口；岗位推荐与个人偏好不得扩权。未知模块组可发现且明确诊断，不得静默丢弃。

## Users, Permissions, and Scope

可信身份来自现有认证与 core nav 过滤；本重构不引入按 employee/admin 角色名判断，不改变资源授权。

## Reuse and Ownership Map

复用 crm_navigation、src/nav、已安装AppShell及 /api/auth/admin/nav。现有API /api/crm_navigation/navigation 保持兼容；精确扩展机制待规格后续核验。

## Architecture and Data Flow

page.meta/discovery → core授权导航 → 既有编排 → CRM目录 → 外壳/管理中心/搜索等消费者。工作空间、上下文与旧消费者适配在批准后细化。

## User Journeys

J-001 用户选择业务空间并进入有权页面；J-002 搜索跨空间入口；J-003 从旧链接进入页面并正确定位；J-004 无权限/加载失败不出现全量默认菜单。

## UI and Interaction Contracts

已读 .ai/guides/backend-ui.md；最近参考 src/modules/crm_navigation/backend/manage/page.tsx 使用 Page/PageBody。现有AppShell保留。待确认Q2后补文本结构、共享API helper、loading/empty/error/keyboard/narrow/light/dark验收。不在规格阶段修改UI代码。

## Data Models

新增表及迁移尚未批准。优先复用配置和偏好机制，不自创平行存储；持久化边界受Q1控制。

## API, Command, and Error Contracts

保持 /api/auth/admin/nav 与 /api/crm_navigation/navigation 及现有CrmCatalog version 2消费者兼容；不移除/重命名既有字段。扩展字段需兼容评审。无新接口获批准。

## Events, Jobs, Notifications, and Cross-Module Flows

N/A — 第一规格候选为只读导航重构，无外部发送或后台业务作业；若增加持久化配置，另补失效与并发契约。

## Security, Privacy, and Compliance

未授权入口不能通过搜索、收藏或工作空间泄露；组织切换后不得复用旧范围缓存。导航不是后端授权。禁止暴露凭据。

## Integration Coverage

待细化：同一授权目录多消费者一致性；新增模块fixture；禁止入口及通配feature；未知组；空/失败/超时；旧链接；工作空间切换键盘、窄屏和light/dark。

## Implementation Phases

候选：1授权目录和编排兼容测试；2工作空间/设置的完整UI切片及状态验证；3既有流程灰度与回滚。后续独立能力按Q1拆规格。仅当前未阻塞阶段可进入实施。

## Requirement Traceability

REQ-001→J-001/J-002→一致性测试；REQ-002→J-001/J-003→切换与定位测试；REQ-003→J-004→权限与新模块fixture；REQ-004→J-003→旧链接与回滚。详细扩展面逐项表待规格设计阶段完成。

## Rollout, Migration, and Rollback

不改当前发布目录；经现有制品部署流程。先保留旧导航模式为回退，旧URL持续可用。不执行数据库迁移或权限变更。具体发布命令尚未核验，不臆造。

## Risks and Tradeoffs

上下文选择可能隐藏用户习惯入口，需搜索和明确切换；旧消费者可能依赖扁平groups，需兼容；新模块不得要求维护每条路由映射；现有管理补丁机制需调查支持的扩展替代，禁止直接编辑安装包。

## Acceptance Criteria

- [ ] AC-001 新增模块无需改各导航消费组件即可发现和正确授权。
- [ ] AC-002 工作空间/设置布局符合确认方案，完整状态与无障碍验证。
- [ ] AC-003 旧链接及契约保持有效，回退不丢用户配置。
- [ ] AC-004 各受影响入口具有独立集成验证和版本证据。

## Final Compliance Report

当前为骨架，不具备实施就绪条件。关键选择、精确宿主扩展、UI契约与完整追踪矩阵待完成。

Verdict: Ready for implementation

就绪范围仅Phase 1纯模型。Phase 2在补齐独立扩展测试映射及复核后进入；不代表全目标完成。

## Changelog

| Date | Change |
|---|---|
| 2026-11-16 | 初始骨架；记录已核验机制和范围问题；未改业务代码。 |


## Detailed Design — 自主设计基线

### 导航来源与编排

源站实测：core nav返回home/customers/sales等13个业务组及设置组；CRM接口把它们适配为14个侧栏分组。设置和profile sections被清空。已有模块声明及权限过滤必须保留，不能新建按URL分配所有权的表。

建议增加应用级工作空间配置，以现有组id为members而非复制href：客户与获客(customers)、沟通协作(messages/documents)、销售与收款(sales/payments)、商品与库存(catalog/warehouse)、售后(aftercare)、团队与资源(people/scheduling)、运营(automation)、专业合规(compliance)。home为固定空间。配置的空间不含有权条目时不显示，未知新组生成独立可发现空间并诊断。不改变既有group id和 /backend/business/[category]。

目录version 2保留完整groups/manage/personal/authorized，新增可选workspace投影，不删旧字段；旧消费者看到完整目录。仅shell groups选当前空间及固定入口；组织设置仍以既有授权分类呈现。根据最长已授权href定位当前空间，详情页沿父路径定位，工作台与设置不被任意业务前缀吞掉。直接旧链接优先于上次选择。

### 宿主与最小扩展

AppShell 0.9.0原生负责侧栏、折叠、手机抽屉、设置/个人二级面板。沿用BackendHeaderChrome已有插槽添加工作空间选择器，不替换AppShell，不直接改安装包。已核实AppShell无工作空间prop，BackendChromeProvider支持adminNavApi变化及refresh。工作空间状态通过app包装层/现有API可选查询参数表达，精确选型完成后写入规格并测试缓存边界；禁止DOM隐藏菜单或CSS伪切换。

扩展决策：extension-mechanism=现有授权导航API及AppShell公开props/已有header插槽；additive-before-replacement=增加投影与选择器；extension-entity=不需要；eject-last=不采用eject。现有backend:sidebar:nav错误卡保留，移动端另验证失败反馈，不能假设该注入在手机渲染。

### 安全、岗位推荐、个人偏好

工作空间选择是呈现偏好，不是授权。推荐按授权feature匹配配置，不使用employee/admin等角色名，推荐不移除其它已授权空间。个人最近空间/收藏只保留入口稳定引用，消费前始终与最新授权目录求交。偏好按可信用户/租户/组织范围隔离；任何浏览器存储失败都降级不影响访问；不得将PII或token写入偏好。不新增业务写入或授权feature。组织配置先作为版本化应用配置；所有配置需验证重复成员、非法值，错误时保持旧模式或显示明确失败，不能回退全权限目录。

### 分层设置

复用manage.categories与personal.items；个人设置保留profile，组织/业务配置和平台维护以声明分类区分，不由角色名推断。类别如system/diagnostics为平台维护分组建议，最终可见性仍仅来自core授权。未知设置分类保留且诊断，不丢入口。不把业务待办/流程定义混为同一个入口；本次只调整已存在目的地，不开发新的聚合审批业务。

### UI合同

影响全backend shell、/backend/manage、/backend/business与其category路由。复用AppShell、Page/PageBody、Select/Popover/Input/Button等共享控件；导航非实体CRUD，无需DataTable/CrudForm，原因是入口目录没有业务记录编辑。数据来自BackendChromeProvider，读请求复用apiCall，不新增raw fetch。业务目录作为完整导航索引，选择空间显示当前入口；搜索跨已授权目录，结果含空间标签；详情breadcrumb保留模块声明，并提供当前空间标识而不覆盖业务标题。

文本结构：页头[工作空间选择][导航搜索][原有动作]；侧栏[工作台][当前空间条目][管理中心]；管理中心[个人/组织业务/平台维护分类][现有授权入口]。窄屏选择器仍可操作，抽屉显示相同投影。loading不显示静态全量目录；error有重试；empty明确无授权；选择失效回当前路径/首个有权空间；只读偏好不存在业务409，存储冲突用最后选择且不影响授权。键盘选择、Escape、焦点可见、屏幕阅读器标签、light/dark和320/390宽布局必须验证。i18n使用crmNav键，保留旧键和回退。

## Implementation Plan

Phase 1：纯编排模型+兼容测试，应用不启用新模式。定义工作空间配置/校验、目录投影、当前路由选择、推荐策略、偏好清理；先失败测试再实现。AC-001/003：新增未配置组fixture仍可见，禁止项不加入投影，旧目录保持。验证yarn test相关路径、typecheck、generate。

Phase 2（依赖Phase 1 verified）：经现有导航API、header和AppShell接入工作空间，完整目录仍提供跨空间检索；分层设置与个人偏好。每个变更面具独立API/UI测试，真正运行源站浏览器探索后编写测试，不猜selector。AC-002/003/004；light/dark/窄屏、刷新恢复、直接链接定位、组织切换及存储不可用测试。

Phase 3（依赖Phase 2 verified）：全部配置验证命令、代码审查、既有发布制品链，检查CI/迁移预检/健康与回滚条件，登录三个测试角色核验。不新增生产外部动作。AC-004。全量门禁不通过不声称完成。

组织配置编辑器不属于本次实施；版本化编排配置与岗位推荐、个人偏好为导航分层的完整实现，不以TODO交付。

## Migration & Backward Compatibility

无数据库迁移。现有href、模块/组id、version 2目录字段保留，工作空间仅新增投影。旧业务分区链接保留。新开关关闭后沿原buildShellChrome输出；偏好在旧模式可忽略，不删除。新发布失败通过现有executor恢复已验证制品，不down迁移。不得修改node_modules或生成产物。

## Requirement Traceability — 补充

| Requirement | Acceptance | Phase | Test oracle |
|---|---|---|---|
| REQ-001 | AC-001 | 1/2 | 同一授权fixture的目录/搜索/投影结果；禁止项在所有消费端均不存在 |
| REQ-002 | AC-002 | 2 | 实际header选择和手机抽屉只显示当前空间；设置层次、键盘与主题 |
| REQ-003 | AC-001/004 | 1/2 | 新增未知模块组fixture无需改消费者；角色/组织改变后清除旧选择 |
| REQ-004 | AC-003/004 | 1/3 | 旧目录schema、旧URL、关闭开关及制品回滚路径 |

## Implementation Status

Source doc: .ai/specs/2026-11-16-config-driven-navigation.md

| Phase | State | Dependencies | Acceptance IDs | Focused validation | Exit gate |
|---|---|---|---|---|---|
| Phase 1 | verified | none | AC-001/003 | 导航单元测试/typecheck/generate | 模型与兼容fixture通过 |
| Phase 2 | in_progress | Phase 1 | AC-002/003/004 | API/UI/权限/主题/窄屏 | 各真实消费路径通过 |
| Phase 3 | pending | Phase 2 | AC-004 | 全量门禁/发布/源站及公网 | 当前站点版本与行为证据 |

- [ ] IN FLIGHT: 规格完善 — 文件: 本规格；已读实际模块/宿主与配置；剩余：确定workspace状态传递、复用偏好契约、参考机制映射及完整评审，然后再开Phase 1。


### 状态传递决策（已解决）

采用app-owned WorkspaceShell薄包装，通过公开AppShell props传递adminNavApi，其中可选path查询参数取usePathname。服务端只把该参数作为已授权目录内的定位提示，不据此鉴权、不请求参数中的URL。选择器从完整目录派生workspace，选择后router.push到其有权landing；因此刷新/旧链接/新标签都用实际路径恢复。个人最近workspace以现有versionedPreference helper保存，在工作台展示“继续上次工作空间”，不强制跳转。不用全局cookie绕过组织范围；偏好key包含可信用户/租户/组织，由服务端layout传入。收藏同样仅记录href，渲染时求交。storage不可用不阻塞。

服务端workspace投影只改变chrome groups，crm.groups保持完整；header消息/集成按钮不能再依赖投影groups，改读同一完整目录。原面包屑依旧来自模块声明，新增空间选择标识。新模式用CRM_NAV_WORKSPACES开关，unset默认启用可测试，值0回旧行为；旧API无path时仍返回旧投影兼容旧消费者。服务端API响应no-store。非法path视为无匹配，不增加href。

Phase 1限定为纯模型：配置、派生空间、最长路径选择及授权目录搜索，不更改运行入口。Phase 2才接入AppShell/API与偏好。配置schema仅允许组引用，不允许任意href/HTML/权限。重复成员验证失败而非双归属；未知组原样空间可发现。

Phase 1 traceability：现有helper变化无新module contribution，分类framework-only，参考src/modules/example/backend/todos/page.meta.ts的声明消费原则；fixture集成oracle为workspace模型针对真实core payload形状输入。Phase 2独立API route现有导航注册、header插槽与page消费者各列单独测试，精确贡献映射在该阶段进入前补齐。

自主审查：Phase 1无schema/API/UI行为变化，不依赖未确定宿主。阶段2/3的详细门禁保持，不能在阶段1完成后直接跳到发布。


### Phase 1 progress

- [x] 纯编排模型：src/nav/workspaces.ts、workspaces.json，含组引用合并、新模块自动空间、最长路径匹配与全目录检索 — `yarn test --runInBand --runTestsByPath src/nav/__tests__/workspaces.test.ts src/nav/__tests__/shell-chrome.test.ts src/nav/__tests__/crm-navigation.test.ts` passed，3 suites/30 tests。
- [x] 类型与发现：`yarn typecheck && yarn generate` passed；生成输出未变化。首次类型检查发现测试未显式导入jest globals，补齐后重跑通过。
- [ ] IN FLIGHT: Phase 1评审与扩充安全fixture — files: src/nav/workspaces.ts及测试；last command: 上述测试passed；remaining: 重复href/成员错误/新组兼容更严格覆盖及代码审查，然后进入Phase 2。

- [x] 安全及兼容fixture扩充：重复id/保留前缀/重复href/旧对象不变/未授权路径 — `yarn test --runInBand --runTestsByPath src/nav/__tests__/workspaces.test.ts src/nav/__tests__/shell-chrome.test.ts src/nav/__tests__/crm-navigation.test.ts && yarn typecheck` passed，34 tests。全量审查和发布仍未执行，不能声称完成。

- [x] feature推荐纯函数：复用@open-mercato/shared/security/features的hasFeature匹配通配feature，只对已授权空间排序、不增加或隐藏空间 — `yarn test --runInBand --runTestsByPath src/nav/__tests__/workspaces.test.ts src/nav/__tests__/shell-chrome.test.ts src/nav/__tests__/crm-navigation.test.ts && yarn typecheck && yarn eslint src/nav/workspaces.ts src/nav/__tests__/workspaces.test.ts` passed，35 tests。
- [ ] IN FLIGHT: Phase 1最终评审与Phase 2契约明细 — 未改API/UI/线上目录；下一步补真实core payload fixture与偏好范围契约、复核现有shell测试门禁后接入。全量generate/type/lint/ds/test/build及发布验证尚未全部运行。

- [x] Phase 1退出：授权CoreNavPayload fixture经过既有buildCrmNavigation再派生workspace，新模块可发现、设置不混入业务检索、旧URL与目录对象保持不变 — `yarn test --runInBand --runTestsByPath src/nav/__tests__/workspaces.test.ts src/nav/__tests__/shell-chrome.test.ts src/nav/__tests__/crm-navigation.test.ts && yarn typecheck && yarn eslint src/nav/workspaces.ts src/nav/__tests__/workspaces.test.ts` passed，36 tests。Phase 1无UI/API接入、无schema迁移，故没有改变线上行为。生成先前已确认无结构变化。


### Phase 2 implementation contract and review

现有导航API增加可选path参数和workspace投影字段；默认无path保持旧行为，CRM_NAV_WORKSPACES=0强制旧行为。path只用于定位已授权空间，必须是/backend或/backend/开头、长度<=2048、不含查询fragment；非法值不扩权，降级旧chrome。响应no-store。保持crm.version=2及完整groups字段。projection通过buildWorkspaceChrome复用buildShellChrome；固定home与utility，当前空间来自最长已授权路径，无匹配返回旧模式保证未知路由仍可导航。不将不存在的workspace默认为全新资源。

应用layout使用app-owned薄客户端WorkspaceShell传AppShell props；api URL包含编码的usePathname。header工作空间选择器和导航检索使用完整crm.groups派生，同一模型，不直接操作provider内部状态。选择空间跳其授权landing，浏览器路由变化触发provider新api key。header已存在的消息与集成入口读完整目录避免投影造成误隐藏。manage/settings/profile暂保留既有宿主二级模式机制，按实际兼容测试启用，不能直接猜类型。

扩展面独立测试：导航API→api/navigation route单元fixture，401/超时/无path兼容/path选择；WorkspaceShell→公开props调用测试；header选择器→实际浏览器keyboard/narrow/light/dark测试；完整目录搜索/偏好→授权求交fixture。机制均为framework-only的既有app-owned编排/公开组件调用，不新增module contribution。已授权源码测试站点全流程实施，变更无需另等人工确认。

Phase 2只读UI不需新的实体命令。若发现跨范围缓存问题，应fail closed而不是保留旧目录。缓存隔离边界由现有provider及组织事件核验，必要的应用层防护需回归。

| Phase 2 surface | Requirement | Phase | Self-contained oracle | Mechanism |
|---|---|---|---|---|
| existing navigation API projection | REQ-001/004 | 2 | route mock core payload, old vs projected response, no widening | framework-only |
| AppShell props adapter | REQ-002 | 2 | pathname API selection, fallback flag | framework-only |
| header selector/search | REQ-001/002 | 2 | authorized fixture and live keyboard/mobile | framework-only |
| personal recent/favorite preference | REQ-003 | 2 | identity keys, removed permission, storage denied | framework-only |

Phase 2静态设计评审：新增API为可选参数和投影，旧schema保留；未替换AppShell；无新权限、存储表和外部动作。部署门禁、真实浏览器证据未完成，不允许宣称上线。


### Phase 2 progress

- [x] 侧栏投影及API兼容：workspace-chrome.ts、navigation/route.ts；旧无path响应及version2目录保留、仅选中空间进入shell，CRM_NAV_WORKSPACES=0回退 — `yarn test --runInBand --runTestsByPath src/nav/__tests__/workspaces.test.ts src/nav/__tests__/shell-chrome.test.ts src/nav/__tests__/crm-navigation.test.ts src/modules/crm_navigation/api/navigation/__tests__/route.test.ts && yarn typecheck` passed，4 suites/45 tests。
- [x] 公开AppShell包装与header空间选择：WorkspaceShell.tsx、WorkspaceSwitcher.tsx、BackendHeaderChrome.tsx、backend/layout.tsx；消息/集成按钮改读完整目录避免被投影隐藏 — `yarn typecheck`及定向`yarn eslint` passed；仅编译证据，尚未浏览器验收。
- [ ] IN FLIGHT: Phase 2余项 — 需实现跨空间入口检索、偏好范围/最近访问与收藏、feature推荐配置消费、设置分层、i18n、真实浏览器/权限/手机/主题测试；未构建发布，线上仍为原版本。

- [x] 跨空间入口搜索原型：NavigationSearch.tsx使用完整授权目录及共享Popover/Input，保留独立语义业务搜索；中文/英文键已新增 — `yarn typecheck && yarn test --runInBand --runTestsByPath src/nav/__tests__/workspaces.test.ts src/modules/crm_navigation/api/navigation/__tests__/route.test.ts` passed。导航全套前一轮46 tests通过。未完成浏览器验证，Phase 2保持in_progress。
- [x] 首页重定向定位回归：先验证/backend不能匹配workbench声明的失败fixture，再复用既有shellHref并同时兼容原href，回归通过；未复制新路由别名表。

- [x] 个人偏好模型及UI接线：workspace-preferences.ts、NavigationPreferences.tsx、search收藏和最近空间；复用versionedPreference，按用户/租户/有效组织隔离，消费时与当前授权目录求交；feature推荐使用独立JSON配置和通配感知hasFeature — `yarn typecheck`、定向eslint及`yarn test --runInBand --runTestsByPath src/nav/__tests__/workspace-preferences.test.ts src/nav/__tests__/workspaces.test.ts src/nav/__tests__/shell-chrome.test.ts src/nav/__tests__/crm-navigation.test.ts src/modules/crm_navigation/api/navigation/__tests__/route.test.ts` passed，5 suites/49 tests（随后组织key修正需重跑）。
- [ ] IN FLIGHT: 设置分层与真实浏览器验证 — 最新修改NavigationPreferences从payload.currentOrganization取得切换后的有效组织，需重跑；尚无构建产物、发布或上线证据。下一步核验跨租户topbar上下文与provider缓存清理、完善偏好组件测试和设置层级，然后完整门禁。

- [x] 设置分层模型及管理中心筛选：settings-levels.json/ts和ManageCenter；既有category仍保持身份和入口，新增组织/平台/扩展层级，未知分类可发现，不用角色推断，原按钮迁移共享Button — `yarn test --runInBand --runTestsByPath src/nav/__tests__/settings-levels.test.ts src/nav/__tests__/workspace-preferences.test.ts src/nav/__tests__/workspaces.test.ts src/nav/__tests__/shell-chrome.test.ts src/nav/__tests__/crm-navigation.test.ts src/modules/crm_navigation/api/navigation/__tests__/route.test.ts && yarn typecheck && git diff --check` passed，6 suites/51 tests。尚需个人设置显式入口、实际浏览器交互、全量门禁及发布。

- [x] 当前全量测试和lint：`yarn test --runInBand > /tmp/mercato-nav-tests.log 2>&1` exit0；`yarn lint > /tmp/mercato-nav-lint.log 2>&1` exit0。
- [ ] IN FLIGHT: 全量设计系统门禁未通过 — `yarn ds:check > /tmp/mercato-nav-ds.log 2>&1` exit1；日志46723字节，列出StartPageContent、AgentDirectoryClient、ModelCatalogPageClient等已有页面的任意Tailwind和raw-backend-table问题。尚未做干净基线对比，不能说全是历史问题；不能绕过门禁或因此宣称可发布。需定位检查器范围及基线再制定最小修复，不擅扩展业务重写。

- [x] 干净HEAD基线复核：git archive HEAD展开至/tmp/mercato-nav-baseline-swf9I2，在该目录运行node scripts/ds-check.mjs --json；与当前扫描相比均298 findings/4 staleIgnores，无新增/减少。基线检查exit1，仍为全量门禁失败，未豁免。
- [ ] IN FLIGHT: 首次构建 — `yarn build > /tmp/mercato-nav-build.log 2>&1` SSH等待120秒超时，但进程仍在运行，构建父PID3901394、yarn PID3901402、cross-env PID3902292。不可重复启动；下一轮先检查进程/读取日志确认最终结果。线上未切换。


### Build tracking / continuation handoff

2026-11-16 19:50左右：构建进程仍存活，切勿重复启动：PID3901394→3901402→3902292；日志/tmp/mercato-nav-build.log。该构建使用已有项目build流程（会验证/重放已有managed patches；没有新增安装包补丁）。当前线上服务仍指向原release。

当前最重要未验收项：1) no-store及API请求path契约的真实HTTP；2)header在窄屏是否溢出；3)NavigationPreferences在org/tenant切换时的缓存和身份边界；4)最近空间和收藏UI测试；5)管理中心个人设置入口；6)feature推荐条目是否与实际feature声明吻合；7)workspace模式关闭后选择器是否同步关闭（现仅server投影开关，需补）；8)全量ds门禁298历史违规/4 stale，不能直接豁免；9)构建/制品发布/源站及公网认证全链路。必须保持Phase 2 in_progress。


### Shared host incident during validation

19:56-20:00源站/login和/api/healthz超时，next-server PID3841849为D状态，wchan folio_wait_bit_common；系统vmstat有swap-in约2.7MB/s、8 blocked及14% IO wait。已有release目录未改，应用服务active/NRestarts0，scheduler/worker继续运行。数据库使用应用连接能5秒内完成pg_stat_activity聚合，23 idle/1 active；不支持归因到DB锁。先前缺省psql角色pro不存在，已改用应用连接只读核验。

为保护共享主机，已TERM本次构建PID3901394/3901402/3902292/3902299，确认均退出；未获成功构建结果，日志/tmp/mercato-nav-build.log止于optimized production build。一次基线浏览器探测同样超时，其PID3903961已TERM，无残留本次browser进程。未重启其他用户服务、不停其他构建、不清缓存、不切换release。

后续先确认源站从I/O等待恢复，再做受控构建；不要把源站故障当作导航测试失败，也不能声称已恢复。目标保持active。

- [ ] IN FLIGHT: 回退开关UI联动 — navigation route新增workspaceNavigationEnabled可选字段；WorkspaceSwitcher/NavigationSearch据此隐藏，防止服务器回退但仍显示新控件。修改后`yarn typecheck && yarn test --runInBand --runTestsByPath ...`在SSH120秒超时，尚未验证结果；PID3905510(shell)、3905512(yarn)、3905528(cross-env)、3905535(tsc)，不可重复启动。需先检查最终状态并重跑受影响测试，尚未有输出日志。该修改发生在被取消构建之后，所有构建证据均无效。

源站恢复证据：20:00后 `curl --noproxy '*' --max-time 5 http://127.0.0.1:3000/login`返回200，time_total=0.059555s，无重启服务和切版本。最新typecheck PID3905535仍在CPU运行，RSS约6GB，需完成后采集结果；不要同时发起构建。目标仍进行中，无需用户验收。

最新执行收尾：PID3905510/3905512/3905528/3905535已TERM，typecheck在被取消构建后扫描.next类型导致耗时/RSS增长，未得完成结果，不重复构建。独立运行受影响6套测试写/tmp/mercato-nav-focused-final.log，exit0。回退开关UI联动已覆盖API测试；最新类型检查仍需完成。当前无本次遗留构建/浏览器/typecheck进程。下一轮需检查生成.next类型范围，受控验证后继续，不能将取消视作通过。


### Round 2 progress

- [x] 实际旧站浏览器基线：Playwright Chromium成功登录employee，/backend sidebar可见，4个当前渲染menu entries，workspace switcher=0，说明原发布未混入本次代码；不是新UI验收。
- [x] AppShell公开props组件测试与偏好组织切换组件测试：`yarn test --runInBand --runTestsByPath src/modules/crm_navigation/components/__tests__/WorkspaceShell.test.tsx src/modules/crm_navigation/components/__tests__/NavigationPreferences.test.tsx src/nav/__tests__/workspaces.test.ts src/modules/crm_navigation/api/navigation/__tests__/route.test.ts` passed，4 suites/24 tests。
- [x] 管理中心补本人设置入口，仅用catalog.personal.items，不增加权限；仍需浏览器与类型验证。
- [ ] IN FLIGHT: 受控typecheck PID3908049/3908072，外层timeout300，日志/tmp/mercato-nav-typecheck-r2.log及.exit；不可重复启动。源码已在启动后新增组件测试和个人设置入口，因此该次完成后还需增量验证。原站恢复，未发布。

- [x] 受控typecheck-r2 exit0；最新新增测试/管理中心错误状态后再运行 `yarn typecheck > /tmp/mercato-nav-typecheck-r2b.log 2>&1` exit0。
- [x] 权限撤销组件fixture：删除目录后已存favorite和recent从UI求交移除 — `yarn test --runInBand --runTestsByPath src/modules/crm_navigation/components/__tests__/NavigationPreferences.test.tsx src/modules/crm_navigation/components/__tests__/WorkspaceShell.test.tsx` passed，3 tests。
- [ ] IN FLIGHT: 低优先级受控构建supervisor PID3910900，timeout1200 nice15，日志/tmp/mercato-nav-build-r2.log，退出码/tmp/mercato-nav-build-r2.exit。不要并发启动另一个构建；期间做独立只读调查。未发布。

Round2构建supervisor3910900进行中；最新个人设置/组件测试已在构建启动前落盘。下一步不在构建期间改应用源码，先做部署与基线违规调查。构建完成后需再做代码审查和端到端测试。最近源码修改：ManageCenter的catalog.error处理，已在build-r2前完成。

- [x] Round2最新全量lint、单元测试：`yarn lint > /tmp/mercato-nav-lint-r2.log 2>&1` exit0；`yarn test --runInBand > /tmp/mercato-nav-tests-r2.log 2>&1` exit0。受控构建3910900仍运行，源站/login持续200约33ms，未发生资源退化。设计系统门禁仍待处理，不声称可上线。

- [x] WorkspaceSwitcher消费者组件测试：新增模块无需改选择器可发现并跳授权landing、rollback隐藏控件、error不回退全量菜单 — `yarn test --runInBand --runTestsByPath src/modules/crm_navigation/components/__tests__/WorkspaceSwitcher.test.tsx` passed，3 tests；定向eslint exit0。此测试采用共享控件mock，不替代真实Radix键盘/手机UI测试。

门禁调查：298条中raw-backend-table192、arbitrary-tailwind81、hardcoded-palette22、manual-dark-override3。至少1条messenger-payload的[postback: ...]是协议文本被arbitrary class scanner误判；不能整批当成误报，其他原生表格确实存在。未修改门禁/豁免文件或扩大范围重写业务页。

- [x] NavigationSearch组件测试：business/settings/profile均来自同目录，过滤匹配与收藏回调、rollback隐藏 — `yarn test --runInBand --runTestsByPath src/modules/crm_navigation/components/__tests__/NavigationSearch.test.tsx` passed，2 tests；`yarn eslint src/modules/crm_navigation/components/__tests__`及git diff --check passed。新测试文件不影响进行中的生产bundle，但需再跑typecheck。

- [x] 最新独立导航消费者覆盖：search/selector/shell/preferences四个组件均有测试，mock仅替代控件宿主，真实浏览器仍待候选制品完成。低优先级build-r2约5分钟，next-build RSS约7GB，源站/login仍200；不并发typecheck。

部署路径已核验：scripts/auto-deploy/deploy.mjs拒绝非drill跳CI，默认CI制品，dirty工作区不是发布源；必须产生可核验commit/CI成功制品后切换，不能直接改current或以drill绕过。发布阶段尚未启动。


### Build-r2 failure and correction

build-r2 exit1：Next.js PostCSS不能从/storage/build-cache/crm/next解析@tailwindcss/postcss。输出目录.mercato/next是外部symlink，package已安装；不能用加依赖掩盖错误。不修改该symlink或安装包，使用build wrapper支持的OM_DIST_DIR=.mercato/nav-candidate独立目录。r3 supervisor3917576，timeout1200/nice15，日志/tmp/mercato-nav-build-r3.log，退出码/tmp/mercato-nav-build-r3.exit。只构建，不启动或发布。r2带whole-project tracing警告，后续评估。

源站约20:15短暂端口拒绝，后发现服务MainPID3917285、NRestarts0、release未变，登录恢复200约38ms；本次没有执行服务restart，不能确定外部操作来源。不得误称本次部署成功或归咎于导航代码。

- [x] API权限边界：匿名不调用core，空授权不因path而产生入口 — route.test.ts新增2例，定向10 tests passed。新增测试需后续typecheck。

Round2最新持久记录：r2已失败exit1，r3在项目内OM_DIST_DIR候选目录构建中(supervisor3917576)。定向eslint覆盖所有新增组件/模型与导航API通过；typecheck-r2b通过后仅新增tests（需后续补跑）。最新route权限测试10例通过。下一步：等r3完成后按OM_DIST_DIR启动只读候选Next进程（不启动queue/scheduler），选空闲本机端口；明确记录并在测试后终止；不可绕过CI发布门禁。

当前design-system扫描/tmp/mercato-nav-ds-r2.json仍298/4，无本次nav或crm_navigation或header违规。不能据此让全量ds gate变绿。基线项需要独立最小修复，不添加批量豁免；原生表格替换会扩大UI范围，下一轮先设计受控治理切片而非压过门禁。


Round2 handoff：当前两个运行任务需收集，禁止重复：r3构建supervisor3917576，日志/tmp/mercato-nav-build-r3.log，退出/tmp/mercato-nav-build-r3.exit；最新全量Jest shell3918910/yarn3918911，日志/tmp/mercato-nav-tests-r2-final.log，SSH120s超时仍活。测试日志已见导航search/selector/route PASS，但整体未完成。r3未再改runtime源码，独立新增测试不影响bundle，后续typecheck需覆盖新增tests。

- [x] 最新全量Jest收集完成：/tmp/mercato-nav-tests-r2-final.log记录137 suites passed、1170 tests passed、10 suites/14 tests skipped，129.272秒。shell/yarn均已退出。跳过项为既有条件测试，不作为集成验收。

构建r3进展：Next编译2.9分钟成功，进入TypeScript。Next自动给tsconfig.json增加nav-candidate/types和dev/types两项，需要构建结束后读文件并移除这两个本地候选专用include，避免污染提交；这是build自动改写，不应提交进应用契约。构建stamp digest在变动前计算，候选只用于验证，不能当作正式发布制品。

新增scripts/nav-candidate-check.mjs（尚未运行），显式loopback BASE_URL，已有employee凭据只内部使用，检查完整目录/投影/no-store、Chromium 1440/390与light/dark、真实Select点击与Escape、溢出及pageerror；只读不会发消息。node --check和eslint通过。候选需构建成功后启动next-only测试；该脚本不是Playwright共享runner集成用例，后续应将观察到的流程固化到既有runner，不能替代完整验收。


### Round2 candidate evidence

- [x] 项目内候选构建：r3 exit0，编译2.9min、TypeScript3.8min成功。Next新增的本地候选types include已从tsconfig恢复，不带入提交（需后续diff确认）。
- [x] 独立Next候选PID3925381，loopback3387，不启动queue/scheduler；API/browser探测首次Chromium启动15秒超时，第二次同脚本exit0。完整API目录14组→当前客户空间侧栏3组，crm完整目录保持，Cache-Control no-store。
- [x] 真实浏览器：1440 light、390 light、390 dark，均9个空间选项、真实Radix打开/Escape成功、无横向溢出、无pageerror。日志/tmp/mercato-nav-browser-r2b.log。未覆盖手机抽屉/收藏刷新/设置筛选/组织切换/失效态，Phase2不关闭。
- [x] 候选PID3925381已TERM，无持续候选服务；Playwright首次失败的3925792已不存在。源站/login之后5秒超时，需要观察恢复，不重启其它服务。

尚未上线。r3 stamp来自dirty工作区与本地候选，仅验收用途；正式发布仍需CI制品。审查记录.ai/analysis/navigation-review-2026-11-16.md仍request changes。

Round2收尾：source/login重新返回200，耗时3.837秒，未切release，无本次next-build/nav-candidate残留进程。所有本轮启动任务已收集：typecheck exit0、r2 build exit1、r3 build exit0、最新全量test137 suites/1170 tests通过、候选浏览器首次失败后第二次exit0；候选已关闭。后续不得复用已移除本地tsconfig include前的stamp作为正式制品。

下一轮优先：1完善剩余真实UI路径并固化共享runner；2修复审查major（跨租户上下文、provider缓存增长、OpenAPI可选参数、失效筛选）；3逐类处理ds门禁而非批量豁免；4所有gate后commit/CI制品/现有executor发布、三个角色及公网验证。目标仍active，Phase2仍in_progress。


### Round3 evidence

- 候选3926740在3387启动，运行增强nav-candidate-check，exit0：桌面/手机/light/dark选择器、手机真实打开菜单及可见授权链接/Escape通过。另浏览器在manage检索客户6条、收藏1条后刷新仍显示取消收藏1条，设置层级真实可见。该探测只读与本地偏好，无业务写入。候选已TERM。
- 修正ManageCenter在权限变化导致level/category失效时自动派生all，不保留空过滤；导航API添加可选chrome/path OpenAPI query描述。需要最新构建和回归。
- 最新typecheck PID3927674，日志/tmp/mercato-nav-r3-types.log，SSH120s超时仍执行，不重复。候选构建后全目录类型检查会变慢，需等待结果。

最新类型检查进程已退出，日志/tmp/mercato-nav-r3-types.log无错误，未捕获exit status，因此不当作完整通过证据；相关API/模型测试24 passed及定向eslint/diff-check通过。OpenAPI query已被类型编译读取且无输出错误。需后续以明确exit文件重跑最终门禁。

- [x] 真实流程固化既有Playwright runner：.ai/qa/tests/navigation-workspaces.spec.ts；`BASE_URL=http://127.0.0.1:3387 yarn playwright test --config .ai/qa/tests/playwright.config.ts navigation-workspaces --retries=0` 3 passed（2.1m）。覆盖匿名拒绝/完整目录保留/选择器、收藏刷新/设置层级、手机抽屉/暗色无溢出。日志/tmp/mercato-nav-playwright-r3.log。候选PID3930249已TERM。此候选未包含后续OpenAPI描述及失效filter修复，需最终重建回归。

审查后续：组织切换UI以om_selected_tenant/org cookie及router刷新协调；仅currentOrganization不足以区分superadmin的跨租户all-org，需要服务器明确派生effective scope或复用已有scope resolver，不能信任cookie原值作为授权。下一步按installed directory scope合同补脱敏导航scope，偏好只隔离不授权。


### Preference scope review repair

新增lib/preference-scope.ts复用installed resolveFeatureCheckContext和request container，API新增navigationPreferenceScope供偏好隔离。客户端只有serverScope.userId匹配当前用户才持久化；scope失败则本次内存偏好，不写存储，不从原始cookie决定授权。明确null租户/组织不得用??回旧layout身份，避免superadmin all-org混用。API及偏好组件13 tests passed；typecheck首次提示AuthContext nullable，改NonNullable后exit0。最新null处理需最终回归与重新构建。

- [x] Trusted scope helper测试复用所选租户并保留all-organizations null，route/偏好14 tests passed。测试mock参数类型首次导致TS2554，补参数后`yarn typecheck > /tmp/mercato-nav-r3-final-types2.log 2>&1` exit0。

后续必须重建：scope字段与失效筛选改变runtime，旧候选不能验证这些改动。完整ds gate依然298/4，不因新导航无违规而宣称绿色。

Round3构建r4 supervisor3932897，OM_DIST_DIR=.mercato/nav-candidate/timeout1200/nice15，日志/tmp/mercato-nav-build-r4.log，退出/tmp/mercato-nav-build-r4.exit。期间不改runtime。最新全量lint exit0，日志/tmp/mercato-nav-lint-r3.log。目标持续active，正式发布仍未开始。

- [x] scope修复后全量测试：`yarn test --runInBand > /tmp/mercato-nav-tests-r3.log 2>&1` exit0，138 suites/1172 tests passed，10 suites/14 tests skipped。source/login200。r4仍待完成；无部署。

- [x] r4构建exit0，最新scope/API/filter修复已编译；Playwright共享runner最新候选3 passed（2.1m），日志/tmp/mercato-nav-playwright-r4.log；candidate3938191已TERM，候选专用tsconfig include恢复。无发布。完整ds门禁及review剩余项仍未通过。


### Phase 2 latest evaluation

最新r4完整候选构建exit0及3项Playwright通过已收集，candidate已停止。scope helper为已有feature scope resolver的公开调用；failure关闭持久化，不扩大目录。当前Phase2仍in_progress：需要把workspace分组应用到旧business目录（目前仍显示legacy groups）、明确空/加载错误恢复并完成缓存边界检查。

全量ds gate298历史违规/4 stale属于独立清理面，不能改扫描器或批量豁免以发布。本目标不会通过暗中降级门禁来换取完成状态。下阶段先完成所有导航交付，再以单独受控切片治理阻断项。

- [x] 业务目录统一编排：BusinessHome改为复用buildWorkspaces/searchWorkspaceEntries，保留原category URL和fallback旧模式；BusinessCategory加载失败有明确重试。组件fixture验证销售/支付同空间且原链接不变 — BusinessHome.test.tsx 1 test passed；`yarn typecheck > /tmp/mercato-nav-r3-business-types.log 2>&1` exit0及定向eslint passed。
- [x] 新业务目录后全量Jest：`yarn test --runInBand > /tmp/mercato-nav-tests-r3-final.log 2>&1` exit0。需最终构建；r4不含这两处runtime改动。


Round3 handoff：r5构建supervisor3941719，日志/tmp/mercato-nav-build-r5.log及.exit，OM_DIST_DIR nav-candidate timeout1200 nice15。期间勿改runtime，勿并发构建。当前无候选Next服务。source/login200，原release未切。下一轮先收集r5并恢复Next自动添加的候选tsconfig include；再启动3387 next-only候选跑共享Playwright并结束服务。最终发布前ds gate和review仍必需，未commit/CI/publish。

- [x] r5最新runtime构建exit0，Playwright3/3再次通过（/tmp/mercato-nav-playwright-r5.log）；候选3945727已TERM，候选types include恢复。全量lint-r3-final exit0。没有本轮运行任务残留。source版本未切换。


Round3收尾：构建r5 exit0、Playwright3/3通过、全量139 suites/1173 tests、lint/typecheck已记录；所有本轮build和candidate已收集/停止。source/login200，current仍7deecc02。尚需独立审查provider缓存增长/范围切换窗口与稳定契约，以及清理full ds gate（298真实/误报混合+4 stale）；不能绕过gate或提前标记目标完成。下一轮优先解决这些阻断项，目标保持active。


### Round4 scope transition repair

WorkspaceShell订阅已有organization scope事件，用scope version作为AppShell的React key及API cache discriminator；仅范围变更重挂，普通路径变化不重挂业务子树。目的是丢弃旧scope provider状态，避免loading仍展示前组织入口。组件测试真实emit事件确认scope key变化，2 tests及yarn typecheck exit0。需重新候选验证切换行为，不能仅组件测试宣称全部隔离。

删除.ds-check-ignore中4个已扫描证明失效的条目，未增加豁免/降低门禁；剩余298项仍待修复。scope缓存key增长问题仍需长期访问评估，不能直接改安装包。

- [x] 门禁精确误报修复：scripts/ds-check.test.mjs先失败（protocol postback被误判为CSS），scripts/ds-check.mjs只排除含空白的伪arbitrary property，真实[color:red]和w-[20px]仍被拒绝；node --test通过。最新scan297 findings、0 stale，无新增豁免。192原生表格等仍真实阻断，绝不将全量gate标绿。

- [x] scope重挂后全量Jest `yarn test --runInBand > /tmp/mercato-nav-tests-r4.log 2>&1` exit0；lint-r4 exit0；类型-r4 exit0。门禁scanner精确误报修正独立node测试通过。

本轮范围控制：InboxView/ReplyComposer仅已读取确认真实palette违规，未修改通信业务页面，不触发外部发送。清理192个raw table涉及多个既有模块，不能以导航重构名义无测试大改；保持阻断记录，分阶段治理。


### Authorized autonomous gate-cleanup slice

为通过全量验收，允许独立的无行为语义token修复切片：先仅communications inbox两个已读页面，将error/warning palette改为已存在status语义token，保留所有API/发送/状态逻辑。必须定向既有inbox测试和完整类型/lint，禁止实际发送。不是批量忽略规则，不引入新业务。

Gate-cleanup切片尚未实施；r6构建运行期间不能变更runtime，先完成当前导航的候选验证。不得将上述建议当作已修改事实。
当前r6 supervisor3954449，日志/tmp/mercato-nav-build-r6.log，exit文件同前缀.exit；需收集。

- [x] r6 scope事件重挂构建exit0，最新Playwright3/3通过（2.3m）；候选3959181已TERM，Next候选include恢复。日志/tmp/mercato-nav-playwright-r6.log。137? 最新全量以r4 log为准：139 suites/1174 tests passed。

- [x] 独立无业务行为token修复：InboxView和ReplyComposer将error/warning/success palette替换现有status token，无API/发送/状态逻辑变化；`yarn test --runInBand --testPathPatterns='inbox|reply|send-attempt'` exit0，`yarn typecheck` exit0。ds剩285/0，比297减少12；仍未通过。后续构建必须包含这两处变化。

- [x] PrototypeShell语义token机械映射：原CSS var arbitrary类替换等义border-border/bg-muted/bg-foreground/text-background/text-foreground，无路由/数据变化；定向eslint通过，ds从285降274。需要既有prototype Playwright最终验证。该变更不新增忽略。

本轮所有build/candidate已收集和终止；新token变动使旧构建失效，下一轮需最终重建。full gate尚274项，目标不能complete。

Round4最新token修复后全量Jest exit0（/tmp/mercato-nav-tests-r4-final.log）及typecheck exit0（/tmp/mercato-nav-r4c-types.log）。保留274项设计系统真实债务为阻断，不改门禁以求上线。下一轮优先选一个原生表格页面完整迁移到DataTable（需读canonical props/reference，覆盖原交互），不要再反复构建尚未通过全部gate的相同候选。


### Gate cleanup: Agent directory vertical slice

独立将agent_directory的只读原生表格改为已安装DataTable，保留Agent来源、模型覆盖、search/module filter、所有字段和configure链接。稳定entityId=agent_directory:agent、extensionTableId=agent_directory.agents。无API/权限/数据写入；loading/error/empty仍明确；增加组件fixture证明关键字段和配置链接。使用共享DataTable公开props，禁止CSS隐藏table绕过。该切片完成之前不进入下一表格。

- [x] AgentDirectory只读表迁移DataTable：保留8列、实际模型覆盖、configure链接、search/module filter；组件fixture验证覆盖优先级/链接/空结果。定向test、eslint、两次typecheck exit0，ds274→248。原data-agent-row/data-agent-configure标识保留。真实DataTable浏览器仍待最新构建，不能仅mock关闭此切片。

Round4收尾：无构建/候选残留；全部runtime改动后尚需full test/lint/build/真实agent目录回归；gate剩248，未commit/发布。不要重复构建旧版本。下一轮先验证本切片，再迁移其它原生表格。目标active。

Latest gate-cleanup slice full test exit0 /tmp/mercato-nav-tests-r4-agent.log, lint exit0 /tmp/mercato-nav-r4-agent-lint.log。候选r7构建supervisor3965345，日志/tmp/mercato-nav-build-r7.log及.exit，timeout1200 nice15；期间不改runtime，完成后需真实AgentDirectory浏览器确认8列/筛选/配置链接，prototype六页和inbox token也需回归。全部构建产物仅测试，不是CI可发布制品。


Round4 real regression: r7 build exit0, AgentDirectory browser9 rows/8 columns/search/configure passed. Combined Playwright6/7 passed; favorite click detached because initial OrganizationSwitcher scope synchronization remounted shell during interaction. No selector-force workaround. Fix WorkspaceShell accepts trusted initialScope from server layout and ignores identical first synchronization; actual differing scope still remounts. Candidate3969700 stopped. Need fresh build/regression. Gate debt248 remains, no release.

initialScope相同首次事件不重挂的回归fixture3/3 passed，typecheck先前scopefix exit0，定向lint passed。r8 build supervisor3974190，日志/tmp/mercato-nav-build-r8.log/exit，timeout1200 nice15；勿改runtime，待完成后只测最新候选。r7那次6/7真实失败保留，不当作通过，需重跑组合7项。

Round4 host resource incident: r8 reached static page collection with42 workers, SSH commands intermittently time out, no build exit file. supervisor3974190 no longer exists at latest kill attempt; descendants unresolved. Latest full test command /tmp/mercato-nav-r4-scopefix-tests.log had no output, process IDs unknown; do not duplicate. Need inspect own descendants/resource state before new work. No candidate or deployment started. Agent table/semantic token cleanup verified as above; remaining ds248. Next round first collect/cancel remaining own jobs and verify source.

Resource incident resolved: own r8 next-build3975704 and Jest3979273 terminated, recorded42 build child PIDs separately TERM after parent exited; source/login200. r8 interrupted during42-worker page collection, no success exit. Need cap Next worker count via supported experimental.cpus config before retry; no further unbounded build on this host. Latest test command cancelled, previous test evidence unchanged. Candidate-specific tsconfig includes restored. Target remainsactive; no release.

Build resource correction: next.config.ts experimental.cpus defaults2, OM_BUILD_CPUS optional bounded1..8. This limits static collection instead of42 workers, preserves all pages/build validation. Must typecheck/build verify before use; not a test bypass. No rebuild this round until host steady.

- [x] Build CPU bound config typecheck exit0; latest full test after identical-initial-scope fix exit0 (/tmp/mercato-nav-r4-final2-tests.log). No running build/candidate. Next round cap2 build to verify initial synchronization regression and AgentDirectory/prototype combination. Full ds still248, no release.

Final round4 active job: r9 supervisor3980368, OM_BUILD_CPUS=2, log/tmp/mercato-nav-build-r9.log and.exit. All previous jobs stopped/collected. Do not duplicate. Runtime unchanged during build. Source/login last200. Next collect r9, restore candidate tsconfig include, rerun7 shared Playwright and actual agent table; full ds248 unresolved.

Round4 final evidence: capped2-worker r9 build exit0, combined existing prototype+navigation Playwright7/7 passed, initial-scope remount race no longer reproduced. Candidate3981678 stopped, candidate tsconfig include restored. source unchanged. Gate debt248 still prevents release; no blanket ignore. Current app runtime/schema/routes unchanged except documented nav/presentation fixes and worker budget. All own build/test/candidate jobs collected or stopped.

Round5 module_directory gate cleanup slice: migrate read-only table to DataTable with module_directory:module / module_directory.modules, preserve5 columns, filters, details dialog and config/open links. No API or permission change; requires component/type/browser evidence before completion.

Round5 leadgen candidates table slice: replace raw table with canonical DataTable leadgen:candidate/leadgen.candidates, preserve original action JSX and disabled predicates, no API/state-machine changes; no actual verification/approval/write requests during validation. ModuleDirectory test/type/lint passed; ds248→225 before this slice.

Round5 prototype table slice: five static demo tables migrated canonical DataTable with stable per-surface entity/extension ids, candidate selection preserved onRowClick, no persistence/sending introduced; preserve state switches and disabled demo actions. Standard3-column grid replaces arbitrary widths; requires prototype7-path browser regressions.

Round5 current: ds106 findings/0 stale after ModuleDirectory23, Leadgen15, Prototype104 removals. Full tests-r5 exit0, prototype/module/leadgen typecheck & lint pass. Browser evidence pending so slices not closed. r10 build supervisor3984568, log/tmp/mercato-nav-build-r10.log and.exit, bounded2 workers timeout1200 nice15. Do not modify runtime while build active. After build run prototype+navigation and module directory/leadgen read-only browser; no actual actions. Still no publication untilds106 resolved.

Round5 r10build exit0、prototype/nav组合Playwright7/7通过。实际ModuleDirectory79行和详情对话框打开/Escape通过；columns读0因为关闭dialog后的恢复尚未等待，不当作列数证明。Leadgen页面标题与无Application error通过，未点击验证/审核/入库。candidate3985702已TERM；tsconfig恢复。门禁剩106/0，继续清理，不发布。

Round5 full ds gate now PASS: 521 files,0 findings/0 stale. No new ignores. Remaining ModelCatalog two tables migrated DataTable preserving original cell/action JSX and mutation closures; SystemUpdate run table migrated preserving readonly fields and all upgrade guards. Small widths/text/CSS var mappings now standard scale. Suppressions shared Table migrated DataTable (scanner counted capital Table as raw); add/release logic preserved. Latest full tests/typecheck/lint exit0; model/system update/migrated pages need real read-only browser regression before release. Inbox height now standardh-screen and message max-widthfull requires responsive check. No external mutations performed.

Round5 r11build exit0, combined Playwright7/7 passed; readonly smoke model/system-update/suppressions/modules/inbox no pageerror. Model smoke saw0 rows before load settled, not a nonempty-model assertion; requires fixture test. Candidate3992361 stopped, tsconfig restored. ds PASS521files, type/lint/full test pass. Still need final review, CI commit/artifact and publication verification. No release or external mutation.

Model nonempty fixture real-browser: initial employee request denied server-side (correct), test corrected to independent superadmin session, no permission widening. Intercept GET catalog/provider only, block mutations. Fixture1 passed:7 columns,model row/edit dialog/Escape. Log/tmp/mercato-nav-model-fixture2.log exit0. Candidate3995844 stopped. All jobs collected; no current source deployment. Final review/CI remain.
