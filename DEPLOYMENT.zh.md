# Open Mercato 部署说明（hermes 服务器）

> 部署时间：2026-11-03　|　版本：Open Mercato 0.9.0（classic 预设）　|　Next.js 16.3.6

## 1. 访问入口

| 项目 | 值 |
|---|---|
| 公网地址 | **https://mercato.ila3.top** |
| 登录页 | https://mercato.ila3.top/login |
| 后台 | https://mercato.ila3.top/backend |
| API 文档 | https://mercato.ila3.top/backend/docs |
| 内网地址 | http://192.168.10.45:3000 |

演示账号（`yarn initialize` 生成的种子账号，密码均为 `secret`）：

| 账号 | 角色 |
|---|---|
| `superadmin@acme.com` | 超级管理员（跨组织） |
| `admin@acme.com` | 管理员 |
| `employee@acme.com` | 员工 |

> ⚠️ 上线给真实用户前请务必修改这三个密码，并把 `.env` 里的 `DEMO_MODE` 设为 `false`。

## 2. 系统构成

```
浏览器 ──HTTPS──> Cloudflare 边缘
                     │  (命名隧道 mercato, QUIC 出站，无需开放端口)
                     ▼
          cloudflared-mercato.service
                     │  http://127.0.0.1:3000
                     ▼
             mercato.service（Next.js 生产构建 + workers）
                     │
                     ▼
        PostgreSQL 18（本机 127.0.0.1:5432，库 open_mercato）
```

* 应用目录：`/home/pro/apps/mercato`
* Node.js 24.22 / Yarn 4.18（corepack 之外的全局 `@yarnpkg/cli-dist`）
* 依赖装的是生产构建：`yarn build` → `.next/`，由 `yarn start`（`mercato server start`）托管
* 缓存/队列/限流当前使用单机策略（sqlite / local / memory），日志会提示“single-instance infrastructure”，单机部署可忽略

## 3. 服务管理（systemd）

| 单元 | 说明 | 常用命令 |
|---|---|---|
| `mercato.service` | 应用本体 | `sudo systemctl restart mercato` / `journalctl -u mercato -f` |
| `cloudflared-mercato.service` | Cloudflare 隧道 | `sudo systemctl status cloudflared-mercato` |
| `postgresql.service` | 数据库 | `sudo systemctl status postgresql` |

三个服务均已 `enable`，服务器重启后自动拉起。

### 数据库

```
库名：open_mercato
用户：mercato / mercato_2026
连接：postgres://mercato:mercato_2026@127.0.0.1:5432/open_mercato
```

备份：

```bash
PGPASSWORD=mercato_2026 pg_dump -h 127.0.0.1 -U mercato -Fc open_mercato > ~/backup-$(date +%F).dump
```

### 改完代码后重新发布

```bash
cd /home/pro/apps/mercato
yarn generate        # 改了模块/路由/i18n 文件时需要
yarn build           # 生产构建（约 1–2 分钟）
sudo systemctl restart mercato
```

## 4. 中文（i18n）实现

Open Mercato 原生只有 en / pl / es / de / ko 五种语言，**没有中文**。本次部署把中文作为“运行时注册的额外语言”接入，未修改 `node_modules`：

1. **注册语言 + 加载字典**：`src/lib/i18n/register-dictionary-loader.ts`
   * `registerLocales(['zh'])`（模块加载时执行，服务端与客户端都生效）
   * `loadAppDictionary` 里增加 `zh` 分支，动态导入 `src/i18n/zh.json`
2. **字典文件**：`src/i18n/zh.json`，当前 **12551 个键**（项目内唯一权威副本），包含
   * 应用外壳全部 1178 个键（菜单、按钮、表格、表单、错误提示、空状态…），100% 覆盖；
   * 四个业务模块（customers / sales / catalog / wms）的**全部**字典键 100% 翻译，共 6297 键；
   * **设置区（26 个设置页：系统状态、模块遥测、缓存、用户/角色/API 密钥/设备、数据字典、查询索引、加密、翻译、通知、搜索、AI 助手、定时任务、各模块配置…）的界面文案已全部翻译**；
   * 全站爬取（130 个页面）发现的缺口（集成、合规、工作流、文档、员工、保修、支付等）也已补齐；
   * 其余后端模块的导航分组名、页面标题、常用列名/操作/状态、筛选器、KPI、登录页等。

### 翻译流水线（在项目内，可重复执行）

```
scripts/i18n-zh/
  merge.mjs          合并脚本：把批次译文按“英文原文值”映射到所有同名键，最后应用 overrides
  batches/NN.txt     第 N 批的原文（id<TAB>英文）
  batches/NN.zh.txt  第 N 批的译文（id|中文）
  overrides.json     人工校准的覆盖（侧边栏分组名等），优先级最高
```

```bash
cd /home/pro/apps/mercato
yarn i18n:zh:merge     # = node scripts/i18n-zh/merge.mjs，幂等，可反复执行
yarn build && sudo systemctl restart mercato
```

新增译文只需在 `batches/` 里加一对 `NN.txt` / `NN.zh.txt`，再跑一次合并；想让某个键名固定成特定中文（不被批次覆盖），写进 `overrides.json` 即可。

### 覆盖率（2026-11-04 实测）

| 层面 | 覆盖 |
|---|---|
| 应用外壳字典（1178 键） | 100% |
| **四大业务模块**（customers 2905 / sales 1496 / catalog 837 / wms 1059） | **6297/6297 = 100%** |
| **设置区界面文案**（26 个设置页抓取） | **100%**（抓取到的字典文案全部命中中文） |
| 已启用模块字典合计（20982 键） | 约 52% |
| 中文字典总键数 | **12223** |
| **主流程界面实测**：18 个业务页面 + 26 个设置页，排除业务数据后 | 业务页剩 4 条（`AI`、`USD`、`healthy`、`Services`），设置页 0 条 |

结论：**业务主流程、设置区与全站界面文案已全部中文**；页面上仍会看到的英文是**业务数据本身**（客户名、SKU、公司名等），属于租户数据。

### 种子数据（数据字典）也中文化了

除了界面文案，数据库里 `yarn initialize` 种下的 405 条字典数据也翻译了标签：

| 表 | 行数 | 处理 |
|---|---|---|
| `dictionaries.name` | 19 | 全部中文（货币、计量单位、订单状态、付款状态、发货状态、保修原因、资源类型…） |
| `dictionary_entries.label` | 291 | 全部中文（162 种货币如 `EUR – 欧元`、39 种计量单位、状态/原因/类型） |
| `customer_dictionary_entries.label` | 95 | 除 4 个品牌词（LinkedIn / Facebook / Typeform / SaaS）外全部中文 |

* **只改 `label`（显示名），`value`（代码里用的键值）保持英文不动**，不会影响代码逻辑与已有记录。
* 脚本：`scripts/i18n-zh/apply-dict-labels.mjs`（幂等、带事务、`--dry` 可预演），译文在 `batches/14.*`，变更记录写到 `scripts/i18n-zh/data/dict-labels-applied.json`。

### 已知残留（无法通过词典修复）

| 文案 | 原因 | 处理方式 |
|---|---|---|
| `AI`、`USD` | 品牌/币种代码，故意保留 | 无需处理 |
| `healthy`（工作流健康度） | 由状态枚举直接映射，未经词典 | 需改模块的状态标签映射 |
| `Services`（三个模块的页面标题） | `page.meta.js` 里只有 `pageTitle` 没有 `pageTitleKey` | 需覆盖各模块页面元数据 |

3. **回退规则**：`zh` 不在基础语言列表里，因此加载时会先合并完整英文词典，再叠加中文词典 —— 未翻译的深层文案自动回退英文，不会出现空串或 key 泄露。
4. **语言切换**：语言由 Cookie `locale` → `Accept-Language` → 默认语言（en）依次判定。
   * 中文浏览器访问自动进入中文；
   * 右上角用户菜单里有语言切换器（会列出「中文」）；
   * `admin@acme.com` 与 `superadmin@acme.com` 的个人语言已设为 `zh`。
5. **继续补充中文**：直接把键值追加进 `src/i18n/zh.json` → `yarn build` → 重启服务即可，无需改动包。

> 说明：模块深层业务文案（例如某些详情页字段说明）仍是英文回退。需要时可分批补充，键名与英文词典一一对应，可参考 `/home/pro/om-docs/zh.json`。

## 5. 菜单按功能模块重排

* 位置：`src/modules.ts` 的 `enabledModules`（`dashboards` 条目的 `overrides.nav.groupOrder`）。
* 作用：决定侧边栏分组顺序；分组名来自中文词典里的 `*.nav.group` 键。
* 当前顺序（业务在前、平台后置）：

```
客户关系 → 销售 → 商品目录 → 库存仓储 → 在线结账 → 售后服务 → 合规（EUDR）
→ 资源排程 → 员工与团队 → 工时管理 → 业务规则 → 工作流 → 文档 → 媒体与附件
→ 消息 → AI 收件箱处理 → 集成 → 通信
```

* 想调整顺序：改 `groupOrder` 数组里的顺序即可（分组 id 列表见该数组）。
* 想在某个分组内调整条目顺序 / 改名 / 隐藏：后台右上角头像旁的「自定义侧边栏」（支持按角色保存方案，`/api/auth/sidebar/variants`）。
* 想把某个页面移动到别的分组：该页面所属模块的 `page.meta` 里定义了 `pageGroupKey`，需要覆盖该页面的元数据（属于模块级改动），可后续按需处理。

## 6. 本次对服务器的其他改动

| 改动 | 原因 | 回滚方式 |
|---|---|---|
| 新增 `~/.ssh/authorized_keys` 公钥 | 免密 SSH 运维 | 删除对应行 |
| 创建 sudo 免密规则 `/etc/sudoers.d/90-pro-nopasswd` | 安装、systemd 操作自动化 | 删除该文件 |
| `/etc/ssh/sshd_config.d/99-nopenalties.conf`（`PerSourcePenalties no`） | 避免频繁连接被 sshd 惩罚性断开 | 删除该文件并 reload ssh |
| npm 源改为 `registry.npmmirror.com`，Yarn 写入 `.yarnrc.yml` | 国内网络加速 | 恢复 `.yarnrc.yml.orig` |
| 新建 Cloudflare 隧道 `mercato` + DNS `mercato.ila3.top` | 公网访问 | `cloudflared tunnel delete mercato` |
| 安装 Playwright Chromium 及系统依赖 | 截图验证界面 | `apt remove` 相关包 |

## 7. 已知限制 / 待办

1. **域名**：`ila3.top` 是本机 Cloudflare 证书可管理的区域，因此用 `mercato.ila3.top`。若想用 `xxx.ctomall.com`，需要 ctomall.com 所在 Cloudflare 账号的 API Token（该区域当前是泛解析 A 记录，无法从本机写入隧道记录）。
2. **单机部署**：应用以单实例运行，若要多实例需改用 Redis（`REDIS_URL`）并把缓存/队列/限流策略切到 redis/async。
3. **无 Redis / Meilisearch**：事件与搜索走 PostgreSQL 回退方案；如需向量/模糊搜索可后续加装。
4. **演示模式**：`DEMO_MODE=true` 会显示演示环境提示条；正式使用请关闭。
5. **深层中文**：见 §4 说明，可按需继续补。

## 8. 模型配置（AI 模型目录）

设置区新增「模块配置 → 模型配置」页面（`/backend/config/ai-assistant/models`），用于自由增删改 AI 助手可用的模型：

* 任意已注册提供方（OpenAI / Anthropic / Google / Azure / DeepSeek / OpenRouter / Ollama …）下可添加任意模型 ID；
* 支持改名、上下文窗口、能力标签、启停、删除；
* 内置模型可覆盖，并可一键「恢复」；
* 页面内可直接设置租户级默认模型（复用 `ai_agent_runtime_overrides`）；
* 模型目录按租户保存在 `module_configs`（`ai_assistant / model_catalog`），无需数据库迁移；
* 提供方 API Key / Base URL 可直接在设置页配置：AES-256-GCM 加密存储、保存即生效、无需重启。保存后自动调用提供方的 `/models` 拉取模型并导入目录，同时把模型设为系统级 AI 底座（`OM_AI_PROVIDER`/`OM_AI_MODEL`）。也支持继续使用环境变量，设置页保存值优先。

代码与设计：[`MODEL-CONFIG.zh.md`](./MODEL-CONFIG.zh.md)（本目录）。

### 维护要点

* 新增页面属于 app 模块 `src/modules/ai_model_config/`，已在 `src/modules.ts` 注册（`{ id: 'ai_model_config', from: '@app' }`）。
* 设置页下拉与聊天模型选择器需要读取模型目录。预构建的 `@open-mercato/ai-assistant` 包没有构建脚本，因此用
  `scripts/apply-ai-model-catalog-patch.mjs` 对其进行**幂等补丁**（写入 `dist/.../lib/model-catalog-store.js`，
  在 settings / agent-models 两个路由里合并目录，注册内置 `DeepSeek` 提供方，补上 registry `unregister()`，并让 `llm-bootstrap` 启动时应用 `storage/ai-model-providers.json` 中的凭据/自定义提供方/系统默认）。**升级或重装 `@open-mercato/ai-assistant` 后必须重跑该脚本**，
  再 `yarn build && sudo systemctl restart mercato`。
* 中文词条在 `i18n/models.zh.json`，通过 `node scripts/merge-ai-model-zh.mjs` 合并进 `src/i18n/zh.json`。
* 端到端验收：`node scripts/verify-ai-model-config.mjs`、`node scripts/verify-provider-config.mjs`（Playwright；截图输出到 `/home/pro/om-docs/models/`）。
* 提供方密钥改动后再执行 `yarn build` 不是必需的；只有改动代码或补丁时才需要重新构建。

