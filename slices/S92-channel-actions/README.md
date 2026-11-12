# S92 · 账号运维动作：重连 / 重新授权、解除绑定（F1-05）

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F1-05；D6 §2 一期范围。
> 状态：**完成（暂停除外，理由见 §3）**；无迁移、无生产数据变更。

## 1. 复用已装路由，不另造删除路径

| 场景 | 目标 | 权限（hub 侧强制） |
| --- | --- | --- |
| 个人渠道解除 | `DELETE /api/communication_channels/channels/{id}` | `communication_channels.connect_user_channel`（且必须是 owner） |
| 团队共享渠道解除 | `DELETE /api/communication_channels/admin/channels/{id}` | `communication_channels.admin`（hub 会把个人渠道掩码 404） |

`lib/channel-actions.ts` 的 `planChannelDisconnect` 决定走哪条路由并给出确认文案（个人=“只影响你本人”，团队=“影响整个团队收件箱”，两者都写明“历史消息保留”）。**故意不选错路**：用 admin 路由删个人渠道即使被 hub 掩码成 404，也是越权尝试。

## 2. 重连

- 团队渠道 → 打开工作台的连接表单并预选 provider（`/backend/communications/channels/connect?provider=…`）；
- 个人渠道 → 指向「我的资料 → 连接渠道」（hub 注入菜单），**不在工作台重造个人凭据表单**，避免绕开 hub 的作用域规则。

## 3. 明确不做「暂停」

装好的渠道模型只有 `connected / requires_reauth / error / disconnected` 四种状态，`visibility` 是共享标记不是开关。加一个“暂停”按钮意味着发明一个 hub 不持久化的状态——那会让“暂停了但其实还在收”成为新的谎。要暂停需先扩展安装模块（移植/补丁），属独立决策。

## 4. 测试

`__tests__/channel-actions.test.ts`（5 条）：个人→owner 路由 + 只影响本人；团队→admin 路由 + 影响团队 + 带账号名；两条都写明历史保留；团队重连带 provider 预选；个人重连指向 hub 资料页而不是新表单。

## 5. 证据

- `npx jest src/modules/communications` → **53 passed / 3 skipped（realdb）/ 317 tests**。
- `yarn typecheck` exit 0（此前由他人 leadgen 在途改动造成的 5 条错误已消失，本轮复跑全绿）。
- 改动文件 `eslint` exit 0；`ACCEPTANCE-MATRIX.md` 的 F1-05 行同步更新。

## 6. 边界

- 解除是 hub 的软删除（`deleted_at`），不是撤销平台侧授权；要撤销平台授权仍需到平台后台（设计里已把两者分开表述）。
- 未做批量解除；未在解除前统计“会影响多少条未解决会话”（属增强）。
