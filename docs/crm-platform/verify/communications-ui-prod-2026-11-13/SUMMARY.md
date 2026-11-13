# Communications UI evidence (prod)

- base: http://127.0.0.1:3000
- release: be8b034e5a6be54fa4dab7f270a93e9ac1137378
- at: 2026-11-13T03:55:19.197Z

| role | page | rendered | heading | main text | screenshot |
| --- | --- | --- | --- | --- | --- |
| superadmin | channels | yes | 渠道账号 | 我们使用必要的 Cookie 记住你的偏好。了解我们如何管理数据，请参阅 隐私. 关闭 接受 Cookie 渠道账号 平台身份来自平台返回，不手填；「可收/可发 | prod-superadmin-channels.png |
| superadmin | channels-connect | yes | 连接渠道 | 我们使用必要的 Cookie 记住你的偏好。了解我们如何管理数据，请参阅 隐私. 关闭 接受 Cookie 连接渠道 为整个组织创建 WhatsApp 或 Me | prod-superadmin-channels-connect.png |
| superadmin | inbox | yes | 全渠道收件箱 | 我们使用必要的 Cookie 记住你的偏好。了解我们如何管理数据，请参阅 隐私. 关闭 接受 Cookie 全渠道收件箱 客户 · 渠道 · 来源账号 连接渠道 | prod-superadmin-inbox.png |
| superadmin | exceptions | yes | 发送结果对账 | 我们使用必要的 Cookie 记住你的偏好。了解我们如何管理数据，请参阅 隐私. 关闭 接受 Cookie 发送结果对账 这里只记录人工核实结论：不会重发、不会 | prod-superadmin-exceptions.png |
| employee | channels | yes | 渠道账号 | 我们使用必要的 Cookie 记住你的偏好。了解我们如何管理数据，请参阅 隐私. 关闭 接受 Cookie 渠道账号 平台身份来自平台返回，不手填；「可收/可发 | prod-employee-channels.png |
| employee | channels-connect | yes |  | 我们使用必要的 Cookie 记住你的偏好。了解我们如何管理数据，请参阅 隐私. 关闭 接受 Cookie Access Denied You do not h | prod-employee-channels-connect.png |
| employee | inbox | yes | 全渠道收件箱 | 我们使用必要的 Cookie 记住你的偏好。了解我们如何管理数据，请参阅 隐私. 关闭 接受 Cookie 全渠道收件箱 客户 · 渠道 · 来源账号 连接渠道 | prod-employee-inbox.png |
| employee | exceptions | yes |  | 我们使用必要的 Cookie 记住你的偏好。了解我们如何管理数据，请参阅 隐私. 关闭 接受 Cookie Access Denied You do not h | prod-employee-exceptions.png |

## Assertions

- PASS inbox renders for both roles — superadmin=true employee=true
- PASS channels list renders for both roles — superadmin=true employee=true
- PASS employee is denied the tenant connect wizard — denied=true rendered=true
- PASS employee is denied the exceptions console (manage) — denied=true rendered=true
- PASS threads API is readable for both roles (view) — superadmin=200 employee=200
- PASS dead-letters API is manage-only — superadmin=200 employee=403
