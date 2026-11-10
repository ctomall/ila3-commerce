# 备份恢复：以门禁里的演练为准（2026-11-10 修正）

本轮先写了一个快速恢复检查（`crm-backup-restore-drill.mjs`），随后发现仓库里**已经有一个更严格的
官方演练并已接入发布级门禁**：

```bash
node scripts/crm-restore-drill.mjs     # crm-verify-all 的 restore-drill 门（--full）
```

它比快速检查多做：dump 生产 → 恢复到一次性库 → 比对**结构**（列/索引/约束/序列/触发器等）与
**内容**（探针表行数 + 整行摘要），且每次运行先让比对器在两个临时 schema 的四处人为差异上自证会红；
明确声明不覆盖 PITR/保留策略/跨大版本恢复。

因此：

- 已删除重复的 `scripts/crm-backup-restore-drill.mjs`，避免维护两份恢复脚本；
- 快速检查当次的结果（备份 `open_mercato-20261109-192133.dump`、11.8 MB、恢复成功、行数
  users 3/4、messages 4/5、interactions 0/1、生产未被改动）保留为**一次性观察**，发布级证据以
  `crm-restore-drill` 门为准。
