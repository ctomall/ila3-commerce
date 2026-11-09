# 发布包校验与截图续作
本轮新增 artifact-contract.mjs / artifact-contract.test.mjs，10项单测通过；仅校验契约，未接下载和生产安装，不声称构建一次发布完成。
输入必须绑定可信CI元数据（repo、workflow run、commit、平台）及本地实际算出的压缩包sha256，不能只相信包内manifest。迁移标记必须来自审阅/数据库兼容检查，不能自报false即放行。
缺失步骤：CI完整包（不含秘密/业务数据）→可信清单→安全解包（路径穿越/链接检查）→实际内容完整性→依赖平台兼容→接入现有release模块替代现场构建→故障演练。
实拍正式页面 /backend/config/system-update，文件 /home/pro/dsh/delivery-shots/crm-live-update.png（1440x1000，superadmin）。页面仍显示“打标签/检出构建重启”等旧说明、Version英文、HEAD以及“尚未执行”，没有接入新发布记录。不能把新统一入口已接通说成前端完整更新。
请CRM主Agent接管新文件并安排发布子Agent实现产物链；UI子Agent在同一正式升级页修正数据源和文案（不另增页面），从实际进程/发布记录读取当前SHA、目标SHA、最近发布、失败原因；旧请求状态兼容保留。独立QA验收。正式导航真实业务闭环继续并行。
