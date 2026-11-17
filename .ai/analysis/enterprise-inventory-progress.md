# 全量覆盖基线：阶段性核验

2026-11-17，源提交71c54ab，运行aeac83a。

| 范围 | 当前证据 | 缺口 |
|---|---|---|
| 模块后台路由 | 290条精确路径 | 详情/创建/编辑的真实交互待逐页核验 |
| 模块公开/门户路由 | 29条精确路径 | 门户资源级权限与流程证据 |
| 静态应用壳页面 | 6个文件单列 | 与模块路由的覆盖/重写关系待验证 |
| 静态应用API | 33个handler单列 | 与catch-all和OpenAPI的关系待核验 |
| OpenAPI操作 | 1006个方法+路径 | 不代表每个端点已可调用或已通过权限测试 |
| 引用元数据 | 87条有精确import来源 | 尚未递归读取和解析 |
| 无法内联提取元数据 | 共99条（含上列87） | 不解释为“无需认证” |
| 页面→接口 | 全部标unmapped | 必须读真实调用点，禁止按模块名称推定 |

脚本：scripts/enterprise-inventory.mjs；fixture：scripts/enterprise-inventory.test.mjs，3项通过；eslint通过；输出enterprise-inventory-baseline.json。脚本不执行metadata，不读取.env或凭据，不修改业务数据。它不是运行时菜单/授权源。

下一轮：解析精确import元数据、校验静态app覆盖、生成逐页设计模板/契约证据；完善全量规格后才通过门禁发布第一个基线版本。其他阶段仍pending，不能标完成。


## Round 2 update

引用元数据87项已静态解析，剩12项为undefined源。保留computed icon不可解析标记。父路径143项有明确breadcrumb，其余不猜。现生成Markdown逐页/操作矩阵，8fixturetests、eslint通过。API调用映射仍unmapped，不得声称全部功能闭环。下一步补effective overrides、source component和真实调用证据。线上未改。


## Round 3 update

319/319页面已有组件源路径；169/319有直接API字面量或模板引用（带行号），150需跟踪子组件/helper。12undefined元数据依旧未知，不能声明无鉴权。逐页Markdown包含源码、复用组件、建议交互、父路径与状态验收项。10fixturetests+lint通过；不等于真实运行验证。下一轮effective overrides/child imports/helper调用及单页闭环验证。线上未改。


## Round 3 final

319/319页面组件已定位；275页经有界本地依赖追踪发现请求调用点；7条追踪达到上限，明确标truncated，不宣称完整。80条导航覆盖与base声明分别记录。13fixturetests+lintpassed。JSON/Markdown逐页包括source、组件导入、helper/template引用、未验证状态，禁止从静态证据推导权限通过。无运行时/数据库/发布变更，源站仍原版本。下一轮对照真实声明集合与有效覆盖完成基线版本，自评审后先交付审计版本，再逐页补真实交互。
