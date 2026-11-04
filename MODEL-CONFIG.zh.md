# Open Mercato 模型配置（Settings）设计说明

> 版本：0.9.0 · 部署：hermes（192.168.10.45）· 入口：设置 → 模块配置 → 模型配置
> 页面：`/backend/config/ai-assistant/models` · API：`/api/ai_model_config/*`

## 1. 目标与交互模型

模型配置按“模型平台”的常规方式工作：

1. **填 Key → 自动获取模型**：在提供方上填写 API Key（可选 Base URL）后，服务端调用提供方的 `GET /models`，自动把返回的模型导入目录；无需手工输入模型 ID。
2. **配置即系统 AI 底座**：保存后把所选模型写入系统级默认（`OM_AI_PROVIDER` / `OM_AI_MODEL` 进程环境），所有未显式指定模型的模块、智能体与会话都使用它。
3. **无需重启**：密钥、模型、默认值保存后立即生效；服务重启后由旁路文件自动恢复。
4. **自由管理**：仍可手动新增模型、改名、改上下文/标签、启停、删除、覆盖内置模型。

## 2. 信息架构

```
设置
└── 模块配置
    ├── AI 智能体        /backend/config/ai-assistant/agents
    ├── AI 设置          /backend/config/ai-assistant/settings
    ├── 模型配置  ← 新增  /backend/config/ai-assistant/models
    ├── AI 白名单        /backend/config/ai-assistant/allowlist
    └── …
```

权限：读取 `ai_assistant.view`，修改 `ai_assistant.settings.manage`；页面 `pageOrder = 431`。

## 3. 页面结构

### 3.1 提供方

表格：提供方（名称 + Base URL / 环境变量）、类型（内置/自定义）、凭据、模型数、操作。

- 内置提供方点「配置密钥」：填 API Key，可选 Base URL 覆盖；
- 「新增提供方」：名称、ID、Base URL、API Key（OpenAI 兼容协议）；
- **保存后自动执行模型发现**，把新模型导入目录；若系统尚无默认模型，自动把第一个模型设为系统默认；
- 提供方行提供「获取模型」按钮，可随时重新拉取（例如提供方上新模型）；
- 凭据状态：设置页已配置 / 环境变量 / 未配置；设置页密钥优先于 `.env`，可删除后回退；
- 没有任何凭据时页面顶部显示黄色提示，直接说明 AI 调用会失败。

### 3.2 默认模型（系统 AI 底座）

- 展示当前系统默认（提供方 / 模型 / 「系统默认」徽标）；
- 提供方 + 模型下拉，「保存默认」「清除默认」；
- 保存后立即写入进程环境并持久化，对所有模块/智能体生效；
- 停用当前默认模型、删除其提供方或删除该模型时，自动清除默认设置。

### 3.3 模型目录

- **模型目录只显示已配置密钥的提供方**：未配置提供方的模型（含内置精选列表）在读取目录时被清理，不再出现；
- 自动导入的模型与手动添加的模型混排；列：模型、提供方、上下文、标签、状态、来源、操作；
- 行操作：设为默认、编辑、停用/启用、删除（内置覆盖显示「恢复」）；
- 停用模型不参与默认选择，也会从 AI 助手模型选择器隐藏；
- 「新增模型」保留给无法通过 `/models` 发现的场景。

## 4. 数据模型

无需数据库迁移，使用 `module_configs` 两行 JSON。

### 4.1 模型目录（租户级）

`ai_assistant / model_catalog`：

```ts
type ModelCatalogEntry = {
  id: string
  providerId: string
  modelId: string
  name: string
  contextWindow: number | null
  tags: ('flagship'|'reasoning'|'coding'|'vision'|'budget'|'fast')[]
  enabled: boolean
  builtin: boolean
  createdAt: string
  updatedAt: string
}
```

自动导入的模型以 `builtin: false` 写入；同一提供方重复拉取只追加新 ID，保留已有条目的名称/标签/启停状态。
读取目录时会删除不属于“已配置密钥提供方”的条目，保证模型选择器与目录只包含真正可用的模型。

### 4.2 提供方、凭据与系统默认（实例级）

`ai_assistant / model_providers`（`tenant_id = NULL`）：

```ts
type ProviderConfig = {
  version: 1
  credentials: Record<string, {
    apiKeyEnc: string        // enc:v1:<iv>:<tag>:<ciphertext>
    baseURL: string | null
    updatedAt: string
  }>
  customProviders: Array<{
    id: string
    name: string
    protocol: 'openai-compatible'
    baseURL: string
    apiKeyEnc: string
    defaultModel: string
    enabled: boolean
  }>
  defaultModel: {            // 系统 AI 底座
    providerId: string
    modelId: string
    updatedAt: string
  } | null
}
```

**运行时旁路文件** `storage/ai-model-providers.json`（0600、密文）保存同一份凭据/自定义提供方/系统默认；
每个 ai-assistant bundle 启动时同步读取，恢复 `process.env` 与自定义提供方注册，因此重启后系统底座仍生效。

## 5. 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ai_model_config/providers` | 提供方列表、凭据来源、系统默认 |
| POST | `/api/ai_model_config/providers` | 新增自定义提供方并自动拉取模型 |
| PUT | `/api/ai_model_config/providers/[id]` | 保存/清除密钥、Base URL；保存后自动拉取 |
| DELETE | `/api/ai_model_config/providers/[id]` | 删除自定义提供方（连带模型与默认） |
| POST | `/api/ai_model_config/providers/[id]/models` | 重新调用 `/models` 并导入新模型 |
| GET | `/api/ai_model_config/models` | 合并后的模型目录 |
| POST/PUT/DELETE | `/api/ai_model_config/models[/id]` | 手动新增/编辑/删除模型 |
| PUT/DELETE | `/api/ai_model_config/default` | 设置/清除系统默认模型 |

模型发现支持：OpenAI 兼容（Bearer）、Anthropic（x-api-key）、Google（key 查询参数）。

## 6. 运行时

1. 保存凭据后写入 `process.env`（`DEEPSEEK_API_KEY`、`OM_CUSTOM_<ID>_API_KEY`），覆盖 `.env`；删除时用 globalThis 账本恢复原值。
2. 自动注册自定义提供方到 `llmProviderRegistry`（删除时 `unregister`）。
3. 系统默认写入 `process.env.OM_AI_PROVIDER` / `OM_AI_MODEL`，`model-factory` 每次解析都会读取，实现“全系统 AI 底座”；
   显式的模块/智能体/请求覆盖仍可优先。
4. 设置接口与聊天模型选择器合并目录中的自定义/覆盖模型（对 ai-assistant dist 打幂等补丁）。
5. 重启由 `llm-bootstrap` 应用旁路文件恢复上述状态。

## 7. 安全

- API Key 使用 AES-256-GCM 加密，密钥由 `AUTH_SECRET`/`MODEL_CONFIG_SECRET` 经 scrypt 派生；
- 接口从不返回明文；旁路文件 0600，仅服务端可读；
- 修改凭据需要 `ai_assistant.settings.manage`；
- 自定义提供方与凭据为实例级（单机部署全租户共用），模型目录按租户保存。

## 8. 代码位置

```
src/modules/ai_model_config/
├── lib/catalog.ts               目录存储、合并、批量导入
├── lib/credentials.ts           AES-256-GCM
├── lib/provider-config.ts       提供方/凭据/系统默认、运行时应用、旁路文件
├── lib/provider-discovery.ts    各协议 /models 拉取与解析
├── lib/model-sync.ts            拉取 → 导入 → 首次设默认
├── api/providers/route.ts       GET / POST
├── api/providers/[id]/route.ts  PUT / DELETE
├── api/providers/[id]/models/   POST 重新拉取
├── api/models/…                 手动模型 CRUD
├── api/default/route.ts         PUT / DELETE 系统默认
└── backend/config/ai-assistant/models/  页面
```

补丁脚本 `scripts/apply-ai-model-catalog-patch.mjs`：
目录合并、DeepSeek 提供方、registry `unregister`、`llm-bootstrap` 应用旁路文件（含系统默认）。

## 9. 部署与回滚

```bash
cd /home/pro/apps/mercato
node scripts/apply-ai-model-catalog-patch.mjs   # 幂等；升级/重装包后必须重跑
node scripts/merge-ai-model-zh.mjs
yarn generate && yarn build
sudo systemctl restart mercato
```

回滚：移除 `ai_model_config` 模块注册；还原 `dist/**/*.model-catalog.bak`；删除 `module_configs` 中
`ai_assistant / model_catalog`、`ai_assistant / model_providers` 两行及 `storage/ai-model-providers.json`。

## 10. 验收（2026-11-04）

- **模型发现**：本地 mock `/v1/models` → 保存自定义提供方 → `modelSync {ok:true,total:2,imported:2}`，目录出现两个模型；
- **系统默认**：自动设为 `mock-gw/mock-chat`；`GET /api/ai_assistant/settings` 的 `resolvedDefault` 同步变为该模型（`source: env_default`）；
- 删除提供方后系统默认清空、模型移除；
- 界面流程：填 Key 保存 → 自动获取模型 → 默认卡片显示模型（Playwright 通过）；
- 重启后凭据与默认仍生效；清除后立即失效；
- 目录过滤：仅保留已配置密钥的提供方；对未配置提供方（如 openai）手动添加模型后再读取，条目会被清理且不出现在响应中；
- 权限：员工读取 200、写入 403。

## 11. 日常使用

1. 设置 → 模块配置 → 模型配置；
2. 提供方点「配置密钥」填 Key → 保存（自动获取模型并设置系统默认）；
3. 需要换底座模型时，在「默认模型」选择并保存，或在目录行点「设为默认」；
4. 提供方有新模型时点「获取模型」刷新；
5. 不需要的模型可停用/删除，内置模型可「恢复」。

## 12. 示例：DeepSeek

1. 在 <https://platform.deepseek.com/api_keys> 创建 Key；
2. 模型配置 → DeepSeek → 配置密钥 → 粘贴保存；
3. 系统自动调用 `https://api.deepseek.com/v1/models`，导入 `deepseek-chat` / `deepseek-reasoner`；
4. 若尚无默认模型，自动设为系统默认；也可在「默认模型」手动选择；
5. 打开任意智能体/对话即可使用，无需重启。

> 也支持环境变量预置（`DEEPSEEK_API_KEY`），但设置页保存值优先；删除后回退。

## 13. 后续

- 模型下拉展示上下文/价格等元数据（需提供方返回或内置映射）；
- 拉取失败时提供“手动添加”直达入口；
- 系统默认的变更审计（谁在何时切换了底座模型）。
