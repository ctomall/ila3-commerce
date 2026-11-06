# 左侧导航：怎么设计才"方便"（方案，待批准）

## 一、现状（已核实，不是推测）

| 层 | 现状 | 证据 |
|---|---|---|
| 入口 | **声明式**：每页 `page.meta.js` 写 `pageGroupKey` / `pageOrder` / `icon`，框架聚合 | `customers/.../companies/page.meta.js`；`nav-check` 统计 212 个入口、0 冲突 |
| 分组顺序 | 包内**硬编码数组** `defaultGroupOrder`（10 个 id），可用模块 `nav.groupOrder` 覆盖 | `core/.../auth/lib/backendChrome.js` |
| 设置分区合并 | `__SETTINGS_SECTION_MERGE`（15→8）**硬编码在我们自己的补丁里** | 同上 + `apply-settings-groups.mjs` |
| 侧栏底栏（头像/折叠） | **补丁改包内 JSX** | `apply-sidebar-footer-inline.mjs` |
| 外壳扩展点 | 已有 6 个侧栏注入点 + `useSidebarCollapse()` | `spotIds.js`：`backend:sidebar:footer`、`backend:sidebar:nav-footer`、`backend:sidebar:top`、`backend:sidebar:nav`、`backend:nav:badges`、`global:sidebar:status-badges` |

**痛点不是"没有声明式"，而是三类改动落在三个不同地方**：

| 想做的事 | 今天要改哪 | 后果 |
|---|---|---|
| 加一个菜单项 | 那个页面的 `page.meta.js` | ✅ 正常 |
| 调分组顺序 | 包内 `defaultGroupOrder`，或写 `nav.groupOrder` | ⚠️ 两处真相，容易只改一处 |
| 把 23 组收成 8 组 | 包内合并表 | ❌ 升级即被覆盖 |
| 改侧栏底栏 | `node_modules` JSX 补丁 | ❌ 与上游耦合，靠脚本复现 |

## 二、设计目标

1. **加页面不改代码**（保持现状，别破坏）。
2. **调顺序/分组 = 改一份数据**，不改包。
3. **外壳组件（底栏、状态徽标）走官方注入点**，不再打补丁。
4. **错配在构建期报错**，不在生产侧栏里露出来。

## 三、三层设计

### L1 · 入口（保持 page.meta，不新增概念）

```
src/modules/<mod>/backend/<page>/page.meta.js
  pageGroupKey: 'customers.nav.group'
  pageOrder: 110
  icon: 'building2'
```

唯一新增的可选字段：`navParent`（当前页面属于某个父入口时用），避免再靠子路由约定。

### L2 · 分组目录（新，唯一真相）

`src/nav/groups.ts`：

```ts
export type NavGroup = {
  id: string                      // 组 id（与 pageGroupKey 对应）
  label: string                   // 中文标签（进侧栏）
  order: number                   // 4 的倍数，组间用 10 递增
  parent?: string                 // 收敛到上层组时填（IA 调整只改这一行）
  icon?: string
  hidden?: boolean
}

export const NAV_GROUPS: NavGroup[] = [
  { id: 'sales',            label: '客户与销售', order: 10,
    members: ['customers.nav.group', 'customers~sales.nav.group'] },
  { id: 'catalog',          label: '商品与库存', order: 20,
    members: ['catalog.nav.group', 'wms.nav.group', 'checkout.nav.group'] },
  // …
]
```

规则：
- **声明组**优先；**未声明**的 `pageGroupKey` 按首次出现顺序追加，永不丢弃（保证新增模块自动可见）。
- 一份 `members` 即完成"23 → 8"，**改 IA 不用改代码逻辑**。
- 同步产出 `nav.groupOrder`，不再维护第二处顺序。

### L3 · 外壳槽位（用现成注入点）

- 底栏（头像 + 折叠）→ 注入 `backend:sidebar:footer`
- 导航底部附加项 → `backend:sidebar:nav-footer`
- 状态徽标 → `global:sidebar:status-badges`

注入项可通过 `useSidebarCollapse()` 拿到 `{ collapsed, setCollapsed }`，**因此底栏完全可以不用补丁**。
一次最小改造：把现有底栏从补丁迁成 `src/widgets/sidebar-footer.tsx` 注入。

## 四、校验门禁（已落地雏形）

`node scripts/nav-check.mjs` 当前输出：

```
groups            : 34
settings sections : 8
items             : 212
duplicate hrefs   : 0
issues            : 0
```

建议纳入 `yarn build` 前置，校验项：

| 检查 | 为什么 |
|---|---|
| 每个 `pageGroupKey` 都有归属（声明或自动追加） | 防"加了页面却看不见" |
| 组与入口标签在 zh/en 都存在 | 防回退英文/裸 key |
| 同一组内 href 不重复 | 防重复项 |
| 空组不渲染 | 防空气泡 |
| `order` 无冲突、4 的倍数 | 保持间距节奏 |

## 五、迁移路线（每步可独立验收）

| 步 | 内容 | 验收 |
|---|---|---|
| **1** | 设置分区合并表从补丁搬进 `src/nav/settings-sections.ts`，补丁只剩一行 import | 8 个设置分区不变；`nav-check` 0 issue；补丁数 -1 |
| **2** | 引入 `src/nav/groups.ts`，用 `members` 把 23 组收成 8 组 | 侧栏业务页高度 ≤728px（一屏）；`nav-check` 0 issue |
| **3** | 底栏从补丁迁成注入 widget | 展开/折叠、头像跳转与现在一致；`node_modules` 不再有 footer 补丁 |

## 六、不要做

- **不要**在每个模块里再写一份分组元数据（双源，必然不同步）。
- **不要**继续给 `AppShell` 加 props 做外壳定制（每加一个都要补丁）。
- **不要**把分组顺序写进页面 meta（页面不该知道全局排序）。

## 七、这套设计能省什么

| 变更 | 今天 | 设计后 |
|---|---|---|
| 加菜单项 | 改 page.meta | 不变 |
| 调分组顺序 | 改包内数组或 `nav.groupOrder` | 改 `groups.ts` 一个数字 |
| 23→8 收敛 | 改包内合并表 | 改 `members` 一行 |
| 改底栏 | 打补丁 + 重打包 | 改 app 组件 |
| 错配发现 | 上线后肉眼 | 构建期 `nav-check` 失败 |
