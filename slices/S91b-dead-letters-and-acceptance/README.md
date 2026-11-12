# S91（中）· 入站死信可见 + 一期验收素材

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F8-03、F8-01；D6 §7-S91。
> 状态：**死信接口/页面完成**；验收矩阵与发布兼容策略见同目录 `ACCEPTANCE-MATRIX.md`（**是证据清单，不是验收通过**）。

## 1. 改动

| 文件 | 内容 |
| --- | --- |
| `api/me/dead-letters/route.ts`（新） | `GET` 列出入站死信：渠道、`errorClass`、`errorMessage`（截断 500 字）、external uid、时间；**绝不返回 `raw_body`** |
| `backend/.../exceptions/ExceptionsView.tsx` | 「发送结果对账」页新增“入站死信”区块：加载/空/错误态；只读展示，重放仍需运维 |
| 权限 | `communication_channels.manage`（与 unknown 对账一致） |

## 2. 为什么截断错误信息且不返回原始报文

`raw_body` 是平台抓来的原始 MIME/payload（落库时加密、截断 32KiB），里面可能含客户正文。列表只需要判断“哪条失败、为什么”，不需要再看一遍客户内容；把它们放进浏览器会扩大泄露面。测试直接断言响应里不含原始报文内容。

## 3. 测试（`__tests__/dead-letters-route.test.ts`，3 条）

- 带渠道标签的失败元数据；`errorMessage` 截断到 500；响应序列化后**不含** raw body 内容；
- 按 tenant + `organizationId in [org, null]` 过滤（死信的组织可为空）；
- 匿名 401 且不开容器。

## 4. 证据

- `npx jest src/modules/communications` → **52 passed / 3 skipped（realdb）/ 312 tests**。
- `yarn generate` exit 0（接口已注册 `api-route-metadata.generated.ts`）。
- 改动文件 `eslint` exit 0。
- **typecheck 全仓当前不绿**：5 条错误全部在 `src/modules/leadgen/**` 与 `src/app/api/leadgen/**`（他人未提交的在途改动），`src/modules/communications` **0 条错误**。我没有改、也没有回退别人的文件；这不是本片引入的。
