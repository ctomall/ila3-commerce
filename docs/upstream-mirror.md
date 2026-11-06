# 上游镜像：ctomall/open-mercato

## 这是什么

`open-mercato/open-mercato`（MIT，上游 0.9.0 版本）的**私有源码快照**，用于实现
[upstream-hooks-proposal.md](upstream-hooks-proposal.md) 里的三个钩子，从而把本仓库的
14 条受管补丁删到 14±1。

| 项 | 值 |
|---|---|
| 仓库 | `ctomall/open-mercato`（**private**） |
| 源 | 上游 tag `v0.9.0`，commit `f451ce4c` |
| 内容 | 完整源码树（16913 文件，约 455 MB），**单个提交**快照 |
| 许可证 | MIT（保留上游版权与许可声明） |
| 分支 | `main` |

## 为什么是"单提交快照"而不是完整历史

上游全量约 **917 MB**，直接用浅克隆推送会被服务端拒绝
（`remote unpack failed: index-pack failed` / `did not receive expected object`），
GitHub 的 Import API 也已废弃（返回 404 deprecated）。

因此采取：本地 clone `--depth 1 --branch v0.9.0` → 以 orphan 分支提交整棵树 → 推送。
代价是没有上游提交历史；收益是推送体积从 ~917 MB 降到 ~137 MB 且一次成功。

**如需完整历史**（只有当需要 `git rebase` 到某个上游提交时才必要）：

```bash
git clone git@github.com:ctomall/open-mercato.git om-mirror && cd om-mirror
git remote add upstream https://github.com/open-mercato/open-mercato.git
git fetch --unshallow upstream        # 约 900 MB，一次性
git push origin upstream/main:refs/heads/upstream-main
```

## 升级流程（上游发新 tag 时）

1. 在镜像仓库里 `git fetch upstream --tags`，拿到新 tag（如 `v0.10.0`）；
2. 把本仓库的三个钩子提交 rebase/cherry-pick 到新 tag：
   `git rebase --onto v0.10.0 v0.9.0 hooks`；
3. 打 tag 并推送：`git tag v0.10.0-ila3.1 && git push --tags`；
4. 应用仓库把依赖指向新 tag（或重新打包），跑 `yarn hooks:check` 应保持 3/3。

**改动面必须小**：只碰
`packages/shared/src/modules/overrides.ts`、
`packages/core/src/modules/auth/lib/backendChrome.tsx`、
`packages/ui/src/backend/DataTable.tsx`、
`packages/ui/src/backend/injection/spotIds.ts`。
改得越多，下次 rebase 越贵。

## 应用侧怎么消费（待定，需确认）

| 方式 | 命令 | 前提 |
|---|---|---|
| git ref（临时验证最快） | `"@open-mercato/ui": "git+ssh://git@github.com/ctomall/open-mercato.git#v0.9.0-ila3.1&path:/packages/ui"` | 需要可构建产物（`prepare` 脚本）或仓库内提交 dist；CI 需 SSH 权限 |
| 私有 registry（CI 最稳） | `npm publish` 到私有源后正常装 | 需要 registry + token |
| 本地 portal（开发验证） | `yarn` 的 `portal:../om-mirror/packages/ui` | 只适合本机，CI 不可用 |

**当前状态**：镜像已就绪但**尚未实现钩子**，应用仍使用 npm 上的 0.9.0 + 14 条补丁。

## 当前状态（已推送）

| 分支 | HEAD | 内容 |
|---|---|---|
| `main` | `85a58cc8` | 快照 `a6072e46` + **DataTable 源码改造**（`aria-sort` 两条表头路径、空/错误态插画） |

远端校验：`packages/ui/src/backend/DataTable.tsx` 含 `aria-sort` 2 处、`state-empty.svg` / `state-error.svg`。

## 产物如何进入应用（已自动化）

1. 在镜像里构建：`cd packages/ui && node build.mjs`（约 5.3 秒，452 入口）；
2. 复制产物：`cp dist/backend/DataTable.js <repo>/vendor/open-mercato/ui/DataTable.js`；
3. 应用构建时由补丁 `source-built-datatable` 安装到 `node_modules`，因此 `npm ci` 后仍可复现。

应用侧对应删除：`group-data-table-behaviour`（3 条 dist 编辑）。
