# S88 · webhook 验签前基础限流

> 设计依据：`full-design/rev2/D1-functional-spec.zh.md` F8-04、D6 §3-R7 / §7-S88（D-6）。
> 状态：**代码 + 限流器压测完成**；未改任何生产配置（阈值调优需你批准改 env）。

## 1. 为什么放在“验签前”

webhook 处理器必须先验 HMAC 才能信任任何内容——包括账号维度。因此能在“验签前”廉价甩掉无效流量的位置只有一个：API 分发器在调用 handler **之前**执行的 `metadata.rateLimit`（`src/app/api/[...slug]/route.ts:418-445`）。两条专用 webhook 路由（WhatsApp/Messenger）之前没有该配置，Gmail 通道有（120/min）。

## 2. 改动

| 文件 | 内容 |
| --- | --- |
| `lib/webhook-rate-limit.ts`（新） | 两个 provider 的限流配置：默认 **1200 点 / 60 秒**，独立 `keyPrefix`（`cc_webhook_whatsapp` / `cc_webhook_messenger`），支持 env 覆盖 |
| `api/webhook/whatsapp/route.ts`、`.../messenger/route.ts` | `POST.metadata.rateLimit` 指向上述配置；`requireAuth` 仍为 false |

阈值取值理由（不是拍脑袋）：所有事件都来自 Meta 的少量出口 IP，按 IP 收紧会误伤真实业务；平台对 429 的重试语义**未核实**，低阈值可能静默丢消息。所以**先高再调**，用 `RATE_LIMIT_CC_WEBHOOK_WHATSAPP_{POINTS,DURATION,BLOCK_DURATION}`（Messenger 同构）在观察后收紧。

## 3. 实测（限流器本身，不是造 Meta 流量）

```
[S88 probe] cap=1200/60s allowed=1200 limited=20 elapsed=20.4ms perRequest=16.7us
```

- 到阈值前全部放行，第 1201 次起 429，带 `Retry-After` / `X-RateLimit-Limit`；
- 每请求开销约 **17–22 µs**（内存策略），对 webhook 延迟可忽略；
- 不同 key / 不同 provider 前缀互不挤占；`RATE_LIMIT_ENABLED=false` 时按框架语义 fail-open。

## 4. 已知边界（必须读）

1. **默认键是 `global`，不是每 IP**：分发器用 `getClientIp(req, trustProxyDepth)` 当 key，而 `getClientIp` 在 `RATE_LIMIT_TRUST_PROXY_DEPTH <= 0` 时返回 `null`，分发器回落 `RATE_LIMIT_FALLBACK_KEY = 'global'`。也就是说：**当前部署（未设该 env）下，每个 provider 只有一个全局桶**，1200/分钟是该渠道全部事件的总闸。
   - 想按真实客户端 IP 分桶，需要设 `RATE_LIMIT_TRUST_PROXY_DEPTH`；但链路是 Cloudflare→本机，取第几跳必须**先核对实际 `X-Forwarded-For` 链**再设，设错等于按伪造头分桶。这是生产 env 变更，等你批准。
2. **平台 429 重试语义未核实**（Meta 文档出口被拦）。在观察真实 429 数量前，不宣称“与平台重试兼容”。
3. 限流在**认证解析之后、handler 之前**执行；本应用这两条路由 `requireAuth:false`，所以等价于“验签前”。

## 5. 建议的观察与调优（需你批准执行）

上线后 7 天看：`requestRateLimited` 生命周期事件、429 数量、死信/入站延迟。若 429 集中在业务高峰且无异常流量 → 调高 `POINTS`；若有明显扫描/伪造流量 → 先确认 `TRUST_PROXY_DEPTH` 再收紧。

## 6. 测试与证据

- `__tests__/webhook-rate-limit.test.ts`（4 条）：默认 1200/60s 与独立前缀；env 覆盖生效；两条路由 metadata 确实引用常量且 `requireAuth:false`。
- `__tests__/webhook-rate-limit-press.test.ts`（3 条）：阈值前放行/到点 429（含 `Retry-After`）；按 key/前缀分桶；禁用时 fail-open；并输出上表压测数据。
- 全模块：**47 passed / 3 skipped（realdb）/ 276 tests**；`yarn typecheck` exit 0；改动文件 `eslint` exit 0。
