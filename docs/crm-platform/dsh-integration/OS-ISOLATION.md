# 员工级 OS 隔离（C 阶段）

状态：已实现，生产开关 `OM_DSH_OS_ISOLATION=1`。2026-11-12 授权后实施。

## 1. 为什么需要

修复前所有 DSH 子进程都以应用用户 `pro` 运行。员工目录虽然 0700，但同 uid 进程
可以随意读取彼此目录（`/proc/<pid>/root`、直接 open 都不受 mode 限制），因此
“0700”不是员工隔离。真实证据：`/home/pro/.local/state/ila3-dsh/root/homes/`
下两个员工目录均 `pro:pro 700`。

## 2. 结构

```
员工身份 (tenant, org, user)
  └─ sha256(tenant\0org\0user)[:32] = <hash>
       ├─ Unix 用户   dsh-<hash[:16]>   (system, nologin, 加入 dsh-runtime 组)
       ├─ DSH_HOME    /srv/dsh/homes/<hash>            0700 该用户
       ├─ workspace   /srv/dsh/workspaces/<hash>/<run> 0700 该用户
       └─ tmp         /srv/dsh/tmp/<hash>              0700 该用户
```

- 应用（pro）通过 `sudo -n -u dsh-… -- /usr/local/lib/dsh-agent/run-with-env …` 启动；
  sudoers 由 provisioner 按用户生成，只允许 pro 以该用户执行 runner。
- runner 读取一次性 env 文件（`/run/dsh-agent/<run>/env`，0640，组=该员工用户），
  删除后 `cd` 到 workspace 再 exec DSH。token、模型 key 不出现在 argv。
- runner/provisioner 均为 root 拥有、0555/0755，员工用户不可改。
- DSH 源码可读性通过 `dsh-runtime` 组实现（`/home/pro` 750 组 dsh-runtime，
  `/home/pro/dsh-src` 组读 + setgid），员工数据目录保持 700，不在组权限内。
- 每日 root 定时器 `dsh-agent-prune.timer` 清理过期 run workspace 和 /run 目录。

## 3. 回退

- 关闭 `OM_DSH_OS_ISOLATION`（或不设）→ 走旧路径：pro 直接 spawn，`OM_DSH_ROOT`
  仍为旧目录。代码无需回退。
- 隔离模式下的历史会话：安装器把旧 `root/homes/<hash>` 迁移到 `/srv/dsh/homes/<hash>`
  并 chown 给对应用户，旧 DSH session 可继续。
- 删除某个员工用户/数据属于重要删除，需另行审批；`provision.sh prune` 只删过期
  run workspace。

## 4. 未覆盖

- DSH 子进程仍可访问 `/tmp`（共享）与网络；需要更强隔离时用容器/网络命名空间。
- 同一 `dsh-runtime` 组内的员工用户可读 DSH 源码（非员工数据）。
- provisioner 依赖宿主 sudo；部署到无 sudo 的环境需改用 setuid helper 或容器。
- 应用用户本身仍是 `pro`，拥有 sudo 全权；该边界属于部署层，不在本次范围。
