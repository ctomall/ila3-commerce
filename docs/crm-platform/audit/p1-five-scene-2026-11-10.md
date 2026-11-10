# P1 五场景导航在正式入口的验证（2026-11-10）

## 发现并修掉的生产回归：导航 API 走公网自取 → 502

- 现象：通过 `https://mercato.ila3.top` 打开后台，侧栏为空、页面停在“加载中…”。
- 原因：`/api/crm_navigation/navigation` 用 `new URL('/api/auth/admin/nav', req.url)` 自取，
  请求 URL 是公网域名；本机无法访问自己的 Cloudflare 域名，服务端 fetch 在 4s 内失败 →
  路由返回 502（日志 `[crm_navigation] core nav unavailable { reason: 'network', status: 502 }`，
  01:19 起连续出现）。用 `127.0.0.1` 访问时正常，所以只在正式入口暴露。
- 修复 `8b18427`：新增 `resolveInternalOrigin()`，默认 `http://127.0.0.1:${PORT}`
  （可用 `CRM_NAV_INTERNAL_ORIGIN` 覆盖），路由改用内部地址自取；新增 3 个单测。
- 验证（生产 `51a7799a`，含该修复）：
  - 用**公网 Host 头**复现生产条件请求导航 API：`HTTP 200`，返回 5 个场景
    `workbench,assistant,customers,business,messages`（旧代码在该条件下 502）；
  - 以 `acceptance-employee` 渲染后台：侧栏出现 工作台 / AI助手 / 客户 / 业务 / 消息 + 管理中心 + 个人账户，
    导航 API 200（`p1-five-scene-rail-employee-2026-11-10.png`）；
  - 业务场景页：7 个分类、39 项功能、常用入口 6 项（`p1-business-scene-employee-2026-11-10.png`）。
  - 说明：截图取自 `http://127.0.0.1:3000`（同一 release 51a7799a）；当时浏览器经隧道的静态资源加载
    极慢（单个 chunk 6.4s），公网地址页面停在骨架，故未用公网 URL 截图。

## 独立门禁

`node scripts/crm-nav-scene-check.mjs --base http://127.0.0.1:3000 --strict`：
admin scenes=5 tabs=3 business=8 manage=10 messages=4 authorized=128 rendered=124 unknown=0；
employee scenes=5 tabs=3 business=7 manage=6 messages=4 authorized=66 rendered=62 unknown=0；
`all invariants hold`。

## 待决策：employee 角色的“管理中心”范围

以 `acceptance-employee`（仅 employee）打开 `/backend/manage`，看到 **12 个入口**，包含
用户 / Webhook / 集成 / 数据同步 / 支付交易 / 模块配置 / API 文档；`GET /api/auth/users` 返回 200，
列出全部 3 个账号（邮箱 + 角色），`/api/auth/roles` 为 403。employee 角色确实持有 `auth.users.list`（113 项之一），
因此这是**角色授权范围**问题，不是菜单隐藏问题。

是否收紧由业务决定：若普通业务员不应看到用户名单与集成/支付配置，需要从 employee 角色撤销
`auth.users.list` 等技术类 feature（属权限数据变更，需批准）；本轮未改。
