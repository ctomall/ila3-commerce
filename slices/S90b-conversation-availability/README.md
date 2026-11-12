# S90（下）· 会话页「可收 / 可发」提示，并在发不出去时禁用回复

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F8-05；D6 §7-S90。
> 状态：**完成**；无迁移、无生产数据变更。

## 1. 改动

| 文件 | 内容 |
| --- | --- |
| `api/me/threads/[id]/messages/route.ts` | 会话详情响应新增 `channel.availability`（复用 `lib/channel-availability.ts`，含入站白名单、账号标识钉定、适配器注册判定） |
| `backend/.../inbox/InboxView.tsx` | 会话头部下新增琥珀色横幅：分别说明“收 / 发”为什么不可用；**发不出去时不渲染回复框**，改为一句“不要在这里回复，请管理员处理账号后再发” |

## 2. 为什么禁用回复框而不是让它失败

账号状态是 `requires_reauth` / `error` / 适配器缺失时，回复必然失败；让员工写完整段话再看到 422，是把系统的确定性错误转嫁给一线。真实发送失败（平台拒绝/未知）仍走原有的三态提示，两者不混。

## 3. 测试

`__tests__/routes.test.ts` 新增 1 条：Resend 邮箱会话 → `channel.availability.inbound = {available:false, code:'provider_has_no_inbound'}`；jest 进程未注册适配器 → `outbound.code = 'adapter_missing'`（归因部署，不是平台）。

## 4. 证据

- `npx jest src/modules/communications` → **50 passed / 3 skipped（realdb）/ 299 tests**。
- `yarn typecheck` exit 0；改动文件 `eslint` exit 0。

## 5. 边界

- 未探测平台出口（理由见 S90a §2）：横幅说的是“账号/部署”层面的不可用，不宣称网络可达性。
- 会话详情没有“重新连接”按钮：重连入口在账号列表/连接页，避免在会话里做权限外操作。
