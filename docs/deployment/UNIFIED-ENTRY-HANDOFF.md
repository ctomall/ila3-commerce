# 统一升级入口实施交接
用户已批准按统一发布设计改造。
本助手新增 scripts/auto-deploy/entry.mjs、entry.test.mjs，不修改当前其他Agent已编辑的 deploy.mjs、lib.mjs。
已应用 systemd drop-in：ila3-self-update.service 调 entry.mjs --legacy-ui；ila3-auto-deploy.service 调 entry.mjs --auto。两者最终共用既有 deploy.mjs 与其 flock、CI、健康和回滚。旧 system-update.mjs 不再由这两个 systemd 入口执行；未删除原脚本，未禁用其他手工命令。
入口 fetch 远端 main 并固定 SHA；full SHA 要是远端 main 祖先；防降级和分叉；拒绝 force/过期/重复UI请求；UI request 兼容当前release与开发目录。6单测通过，真实 fetch dry-run 通过，配置 show 已核对；登录200。未执行真实手动升级端到端验收；没有宣称完整自动发布改造完成。
必须后续完成：CI完整运行包/可信清单及下载校验，替代现场构建；精确迁移兼容门禁；UI同源/运行commit确认与统一状态；重启中断与并发/回滚验收。entry wrapper 本身仍依赖开发目录，后续应随受管发布控制器部署。UI前置拒绝（过期/非法版本等）目前 systemd日志报错，未写统一可读失败状态，需补齐。
本轮没有发布CRM新业务版本、没有执行数据库迁移、没有reset工作树。systemd备份 /tmp/ila3-unified-backup；回退配置需移除对应20-unified-entry.conf并daemon-reload（不在此自动执行）。请接管新文件后纳入Git和测试，禁止强制add其他Agent文件。
