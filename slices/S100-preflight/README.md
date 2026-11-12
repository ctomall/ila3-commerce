# S100 · 发布前基线检查脚本（含“别人的代码”归因）

> 目的：把本目标反复用到的门禁串成一条可复跑命令，并解决一个真实痛点——**多人共用工作树时，typecheck 失败到底是谁的**。
> 状态：**完成**；只读，不提交、不重置、不删文件、不碰生产库。

## 1. 用法

```bash
yarn preflight:communications            # generate + typecheck + 模块测试 + 真库 5 套
yarn preflight:communications --with-lint
yarn preflight:communications --skip-generate --skip-typecheck
yarn preflight:communications --owned src/modules/communications --owned scripts
```

退出码语义（这是脚本的核心）：

| 退出码 | 含义 |
| --- | --- |
| 0 | owned 范围内所有门禁通过 |
| 1 | **本片范围内**有门禁失败（自己的回归） |
| 2 | 仓库门禁失败但**全部落在 owned 范围之外**（他人未提交在途改动）→ 不可发布，但不谎报为本片回归 |
| 3 | harness 自身错误 |

## 2. 为什么需要归因

本轮之前遇到过一次：全仓 `typecheck` 报 5 条错误，全在 `src/modules/leadgen/**`（别的 agent 未提交的改动），`src/modules/communications` 0 条。没有归因时，只能靠人肉 grep 判断；有了 `--owned`，脚本把 tsc 诊断按路径分桶，打印 `owned-scope errors` / `outside scope` 与具体文件，并给出正确退出码。

归因逻辑只会在仓库已经坏掉时运行——那正是它绝不能错的时候，所以加了 `--check-attribution` 自检模式（固定样本，断言 owned=2/foreign=2、空输入=0/0），并由 `preflight-attribution.test.ts` 在 jest 里跑。

## 3. 实跑

```
[preflight] communications slice
[preflight] owned scope: src/modules/communications

[preflight] steps
  PASS  generate      44336ms
  PASS  typecheck     23470ms
  PASS  module-tests  13037ms
  PASS  realdb        12682ms

[preflight] result
  PASS — every gate green in the owned scope
```

总计约 **1 分 34 秒**。`--check-attribution` 输出：

```
[preflight] attribution self-check PASS (owned=2 foreign=2)
[preflight] empty-input self-check PASS
```

## 4. 边界

- 不含 **构建（`yarn build`）**：构建会写 `.next` 且耗时明显更长，属发布流水线步骤；本脚本定位是“本地提交前/交付前快速自查”，没有把构建伪装成已通过。
- `--with-lint` 是**全仓** eslint（`yarn lint`），默认不开以免每次 2 分钟以上；本片的改动文件在交付时已单独 lint。
- realdb 依赖本机 PostgreSQL 二进制；脚本用 `scripts/realdb-suite.mjs`（S98），失败会显式标 FAIL 而非静默跳过。
- 未接入 CI：与 S98 同一理由（需流水线起库/资源配额决策）。

## 5. 证据

- 全量实跑：4 门 PASS（上表），退出码 0
- `--check-attribution` 两行 PASS
- 新增测试 `preflight-attribution.test.ts`（2 条）通过；`package.json` 注册 `preflight:communications`
- 全部模块测试：**57 套件通过 / 8 skipped / 334 tests**（见提交时的完整输出）
