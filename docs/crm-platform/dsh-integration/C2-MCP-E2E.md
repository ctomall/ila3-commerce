# C2 CRM MCP 工具桥：隔离 e2e 说明（未执行）

> 状态：说明与预期证据，不是验收记录。本文步骤未在真实 DSH/模型/数据库上跑过；已执行的只有 jest 协议/接线测试。

## 目标链路

```
DSH runtime
  └─ @deepseek-ai/dsh-mcp-client (stdio, serverName=crm)
       └─ node scripts/dsh-crm-mcp.mjs
            └─ POST $OM_DSH_BRIDGE_URL/crm.find_companies
                 Authorization: Bearer $OM_DSH_TOOL_TOKEN
                 └─ src/app/api/internal/dsh-tools/[tool]/route.ts
                      └─ verifyRunToken → binding → ACL → customer scope → ORM
```

不接真实模型也能验证前三段（协议 + token + HTTP 语义）；最后一段的 binding/ACL/ORM 需要数据库和 B1 绑定，属于另批。

## 1. 纯协议级（无 app、无 DB、无模型）——已由 jest 覆盖

```bash
npx jest src/app/api/internal/dsh-tools/__tests__/dsh-crm-mcp.test.ts \
  --config jest.config.cjs --silent
```

测试自己起一个 stub HTTP 桥，spawn `scripts/dsh-crm-mcp.mjs`，覆盖 initialize 协商、tools/list schema、tools/call 成功、400/401/403 → `isError:true` + 稳定 code、缺 env 退出、stdout 只有 JSON-RPC。可作为本层的可重复证据。

## 2. 手工协议级（可选）

终端 A：起一个只回显请求的假桥（不要把真实 token 写进 shell history/日志）：

```bash
node -e '
const http=require("node:http");
http.createServer((req,res)=>{let b="";req.on("data",c=>b+=c);req.on("end",()=>{
  res.writeHead(403,{"content-type":"application/json"});
  res.end(JSON.stringify({error:"Forbidden",code:"binding_inactive"}));
});}).listen(3921,"127.0.0.1",()=>console.error("stub bridge on 3921"));
'
```

终端 B：

```bash
OM_DSH_BRIDGE_URL=http://127.0.0.1:3921/api/internal/dsh-tools \
OM_DSH_TOOL_TOKEN=not-a-real-token \
node scripts/dsh-crm-mcp.mjs
```

逐行输入（每行一条 JSON-RPC；stdout 只会回 JSON-RPC）：

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual","version":"0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"crm_find_companies","arguments":{"query":"Acme","limit":5}}}
{"jsonrpc":"2.0","id":4,"method":"ping","params":{}}
```

预期：id=1 回协商版本/serverInfo/capabilities；id=2 回 `crm_find_companies` schema；id=3 回 `{content:[{type:"text",text:"{\"error\":\"Forbidden\",\"code\":\"binding_inactive\",\"status\":403}"}],isError:true}`；stderr 无 token。

## 3. 接真实 app 路由（需要已启动的 app；仍可不接模型）

用测试账号/已启动实例，设置与路由一致的 env（`OM_DSH_RUN_TOKEN_SECRET` 必须与 app 相同），把真实签名 token 通过受保护方式注入，不落日志：

- 无 token 调 `POST /api/internal/dsh-tools/crm.find_companies` → 401 `unauthorized`。
- 有效签名 token + 不存在的 binding（当前无 B1） → 403 `binding_inactive`（预期 fail-closed，不是缺陷）。
- 只有 B1 插入 active binding、用户具备 `customers.companies.view` 时才会到 ORM；这需要数据库，属 B1/D 阶段。

## 4. 全链路（真实 DSH + 模型，未做）

```bash
OM_AI_ENGINE=dsh \
OM_DSH_RUN_TOKEN_SECRET=... \
OM_DSH_BRIDGE_URL=http://127.0.0.1:3000/api/internal/dsh-tools \
OM_DSH_MCP_SCRIPT=/abs/path/scripts/dsh-crm-mcp.mjs \
# 启动 app 后，正式聊天入口完成一轮 prompt
```

预期证据（未来验收）：DSH 日志出现 `mcp__crm__crm_find_companies` 工具调用；bridge 日志只有 `runId/tool/decision/durationMs`；无 token；返回公司行符合组织 scope。当前缺 B1 binding，因此该轮工具调用应稳定得到 403，而不是伪造结果。

## 已知边界

- `bindingId` 目前是占位 `unbound`（token schema 要求非空，无法写 null）；它不可能匹配任何行，因此 403 是预期。
- MCP 只有 `crm_find_companies`；写工具尚未启用。
- `customer_access` 未上线，scope 只有组织级（组织隔离 ≠ 员工客户隔离）。
- 未接真实模型/DB，不声称工具闭环已验收。
