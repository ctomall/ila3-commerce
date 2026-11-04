# 运维手册（ILA3 Commerce）

## 服务

| systemd 单元 | 作用 |
|---|---|
| `mercato.service` | 应用本体（Next.js + queue worker + scheduler） |
| `cloudflared-mercato.service` | Cloudflare 隧道 `mercato` → `127.0.0.1:3000` |
| `cloudflared.service` | Cloudflare 隧道 `dsh` → `127.0.0.1:52101` |
| `postgresql@18-main.service` | PostgreSQL 18 |
| `ila3-db-backup.timer` | 每日 03:20（Asia/Shanghai）逻辑备份 |
| `ila3-self-update.service` | 一次性升级单元（由后台「系统升级」页面触发） |

```bash
sudo systemctl status mercato
sudo journalctl -u mercato -f
sudo systemctl restart mercato
```

## 一键升级

后台 → 设置 → 模块配置 → **系统升级**（`/backend/config/system-update`），仅超级管理员可用。

流程：写请求文件 → `systemctl start ila3-self-update.service`（独立 cgroup）→ `git fetch`
→ 校验工作区干净 → 打 `pre-update-<时间戳>` 标签 → 停服 → `git reset --hard`
→ `yarn install/generate/build` → 起服 → 轮询 `http://127.0.0.1:3000/login`
→ 失败则回滚到旧提交并重建。

关键点：

* 升级进程**不在** `mercato.service` 的 cgroup 内，否则重启会把它自己杀掉。
* 升级前必须提交并推送，否则“工作区脏”会直接拒绝（或需 force）。
* 升级期间页面会断开，属预期；状态落在 `.mercato/system-update/state.json`，
  日志落在 `.mercato/system-update/update.log`。
* 需要 `ENABLE_SELF_UPDATE=true`。

手动触发等价命令：

```bash
echo '{"ref":null,"force":false,"actor":"cli"}' > .mercato/system-update/request.json
sudo systemctl start ila3-self-update.service
journalctl -u ila3-self-update -f
```

## 备份与恢复

```bash
# 立即备份（默认保留 7 天）
sudo /usr/local/bin/ila3-db-backup open_mercato

# 恢复到临时库验证
sudo -u postgres createdb mercato_restore_check
sudo -u postgres pg_restore -d mercato_restore_check --no-owner --no-privileges \
  /data/backup/postgres/open_mercato-<时间戳>.dump
sudo -u postgres psql -d mercato_restore_check -tAc \
  "select count(*) from information_schema.tables where table_schema='public';"
sudo -u postgres dropdb mercato_restore_check
```

备份文件权限为 `root:postgres 640`（`postgres` 用户需可读以完成恢复）。

## 网络与安全基线

* 入站：ufw 默认拒绝，仅放行 `22/tcp`。应用与数据库只经回环 + Cloudflare 隧道。
* PostgreSQL：`pg_hba.conf` 仅允许 `127.0.0.1/32`、`::1/128`（已移除 `192.168.10.0/24`）。
* 应用进程监听 `*:3000`，对局域网的实际可达性由 ufw 阻断（若需回环绑定，
  需给 `next start` 传 `-H`，见 `cli/../mercato.ts` 的 spawn 参数）。
* 如需临时恢复局域网访问：

```bash
sudo ufw allow from 192.168.10.0/24 to any port 3000 proto tcp
sudo ufw delete allow from 192.168.10.0/24 to any port 3000 proto tcp   # 撤销
```

## 品牌

品牌名集中在 `src/lib/branding.ts`，可用 `NEXT_PUBLIC_BRAND_NAME` /
`NEXT_PUBLIC_BRAND_SHORT_NAME` 覆盖。上游登录页硬编码的 `/open-mercato.svg`
由 `scripts/apply-brand-patch.mjs` 在构建前改写为 `/brand.svg`（幂等，
已接入 `yarn build`，重装依赖后自动生效）。

## 已知残留

* `wms` 的余额校验提示里保留了真实命令 `mercato wms verify-balances --repair`，
  这是可执行命令而非品牌文案，故意不改。
* i18n 内部键名（如 `business_rules....openMercato...`）保留原名，改键名会
  导致模块查表失配。

## 已知网络限制（2026-11-05 实测）

### 路径 MTU 黑洞

本机网卡 `enp2s0f1` 为 MTU 1500，但到 Cloudflare 边缘的实际路径 MTU 只有 **1480**：

| 探测（`ping -M do -s N region1.v2.argotunnel.com`） | 结果 |
|---|---|
| 269 B（默认） | 0% 丢包，RTT ≈ 273 ms |
| 1452 B（MTU 1480） | 0% 丢包 |
| 1472 B（MTU 1500） | **100% 丢包** |

含义：满 1500 字节的包会被静默丢弃且不回 ICMP，TCP/QUIC 只能靠重传降到小包，
表现为「小响应正常、大响应偶发卡死」（曾实测 4 KB 的 JS chunk 25 秒只下 4 KB）。

**验证过的处置方式**（本次未落地，因为风险 > 收益）：

* 路由级：`ip route replace default via <gw> dev enp2s0f1 mtu 1400` —— 不触碰链路状态，
  但本次实测对吞吐无明显改善（96 / 50 / 26 KB/s，波动依旧），故已回退。
* 网卡级：`ip link set dev enp2s0f1 mtu 1400` —— **危险**：在线上执行会让该网卡
  进入 `NO-CARRIER / state DOWN`（本次已触发一次短暂失联，`ip link set ... up` + MTU 1500 恢复）。
  若要做，必须走 netplan 在开机时下发，并确保有带外/控制台访问。
* 若强制隧道走 HTTP/2（TCP），可再配合 `iptables -t mangle -A OUTPUT -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --set-mss 1400`。

### 隧道吞吐与延迟

* 主机裸出口（`speed.cloudflare.com` 1 MB）：≈ 370 KB/s，正常。
* 经隧道取 `/login`（约 300 KB gzip）：浏览器实测 TTFB ≈ 1.8 s、load ≈ 3.3 s、
  30 个资源、单请求 ≈ 0.9–1 s —— 瓶颈是**高 RTT（≈ 273 ms）与链路抖动**，不是带宽。
* 结论：页面可用但偏慢；要根治应从 Cloudflare 侧（隧道区域 / Argo Smart Routing）
  或换更近的出口入手，而非在源站调参。

## 界面语言（OM_FORCE_LOCALE）

本部署是中文单语，`.env` 中设置：

```
OM_FORCE_LOCALE=zh
```

效果：`<html lang="zh">`、界面文案走中文词典、日期按中文格式（如 `2026年11月3日 15:10`），
语言切换器随之隐藏。要恢复“跟随浏览器”的多语言行为，删除该变量并重启即可。

> 注意：强制语言只影响**界面文案**；业务数据（客户名、SKU 等）与字典数据（货币、计量单位）
> 来自数据库，与语言无关。

## 升级窗口实测（T15）

分阶段构建上线后，升级停机窗口 = 停止服务 → 目录重命名 → 启动 → 健康检查。
构建在服务运行期间完成，不计入停机时间。

