# DSH企业管理系统：全量覆盖与逐版本交付

Date: 2026-11-17
Status: Ready for implementation — P1 baseline only

## TLDR
复用原版组件、模块发现和现有导航。先生成所有后台/门户/流程路由及API契约的可追踪清单，标注已确认/推定/待验证，再按依赖逐版本交付导航、页面一致性、DSH只读、受控写入、OTA恢复。不以宣传模块清单替代实际功能验收。

## Open Questions
用户明确授权无人值守全权设计；采用最小可逆默认：先只读目录工件，不改权限或数据库；与现有功能重叠的切片只补验证，版本独立验收。任何存储失败不以删除业务数据恢复。

## Problem Statement
上份简报只枚举63业务入口/70设置入口/29公开路由，未逐一覆盖290后台声明中的创建、编辑、详情及流程页。尚无完整页面到契约的可靠映射，不能声称全系统闭环。

## Overview and Success Measures
覆盖所有生成路由、static app入口、已发布OpenAPI；精确路由不丢不造。API按模块同属只能标candidate，不能当作页面调用事实；追踪与人工/浏览器核验才标confirmed。

## Goals
REQ-001 自动可复现全量清单。REQ-002 权限/父路径/组件布局/交互/测试证据逐页可追踪。REQ-003 所有阶段保留旧契约，每步版本+SHA+CI制品及回滚记录。

## Non-goals
首阶段不修改UI、数据、权限、DSH运行时或部署设置；不触发支付/发送。

## Proposed Solution
Phase1脚本使用TypeScript AST读取生成metadata并解析已有meta文件，不执行其代码；输出JSON/Markdown快照；缺失/动态表达式明确标unresolved。模块候选API映射只提供调查线索。

### Design Decisions and Alternatives
复用生成metadata，不扫描node_modules全树；拒绝维护第二套手写菜单。脚本仅生成设计/审计工件，不成为运行时授权源。

## Domain Vocabulary and Business Rules
Declared=生成路由存在，confirmed=实际运行证据，candidate=同模块API但未证明调用。三者不可混淆。未知schema不猜测。

## Users, Permissions, and Scope
只读审计；不输出账号、密钥、token或正文。未验证的权限只标声明值。

## Reuse and Ownership Map
复用backend-route-metadata/frontend-routes/OpenAPI/module declarations；审计工具在scripts，运行时代码仍由模块拥有。

## Architecture and Data Flow
生成路由+page.meta+OpenAPI→AST提取→校验→JSON覆盖矩阵/Markdown报告。源文件保留原样。

## User Journeys
工程师先读取coverage摘要，定位unresolved元数据或candidate契约；每个功能实施前补真实调用测试，不能直接将candidate标完成。

## UI and Interaction Contracts
Phase1无UI变更。后续复用Page/Card/DataTable/CrudForm；每页记录主操作、返回路径、加载/空/错误/冲突/权限/窄屏/主题证据。

## Data Models
Phase1无数据库变更。

## API, Command, and Error Contracts
Phase1无运行契约变更；生成清单包含方法、路径、operationId及引用schema，不复制敏感示例。

## Events, Jobs, Notifications, and Cross-Module Flows
Phase1不产生业务事件或后台任务。

## Security, Privacy, and Compliance
不通过eval/import执行metadata；不读取.env；只从明确输入提取路由和schema。输出不含认证信息。

## Integration Coverage
fixture覆盖内联meta、引用meta、动态路由、未解析表达式及API映射candidate标记；真实生成目录全量对照。

## Implementation Plan
P1目录工具及fixture→真实覆盖矩阵→规格自评审与门禁→独立版本发布。P2导航归位，P3逐页一致性，P4DSH只读，P5审批写入与异步恢复，P6OTA恢复。后续阶段进入前补精确切片/退出门槛，不预先宣称ready。

## Requirement Traceability
REQ-001→P1→路由数及原始路径集合一致；REQ-002→P1→输出逐页模板且明确unresolved；REQ-003→各阶段→全门禁及部署记录。P1不新增模块贡献。

## Rollout, Migration, and Rollback
P1只读工件可直接移除，不影响数据。后续只做兼容扩展，应用回滚保留新增数据。

## Risks and Tradeoffs
静态分析可能不识别computed metadata；如实标记，而非执行不可信脚本。模块相同不证明页面依赖API。

## Acceptance Criteria
AC1后台/前端路径集合与生成源一致。AC2缺失meta不静默忽略。AC3布局及调用映射都区分建议和事实。AC4 fixture与真实输入校验通过。

## Final Compliance Report
Draft：P1工具设计自评审后可实施；后续阶段尚未设计完具体调用链，禁止提前进入。

## Changelog
2026-11-17 初始骨架及自主默认；未改业务代码。


## Implementation Status

| Phase | State | Evidence / remaining |
|---|---|---|
| P1 inventory baseline | verified | AST tool and3 fixtures pass;290backend/29frontend/1006OpenAPIoperations extracted.99metadata references unresolved; static app routes not included; no page→API mapping confirmed. |
| P2 navigation | pending | Depends on full P1 verification. |
| P3 page consistency | pending | Per-page inventory and real-browser evidence required. |
| P4 DSH readonly | pending | Exact runtime/version/feature gates and isolated model service verification. |
| P5 controlled writes | pending | No production mutation; isolated fixtures and transaction/recovery tests. |
| P6 OTA | pending | Existing pipeline reused; destructive migration never bundled. |

### P1 progress
- [x] scripts/enterprise-inventory.mjs AST extraction, no eval or credential reads; `node --test scripts/enterprise-inventory.test.mjs`3passed; scoped eslint exit0.
- [x] Real generated input extract `.ai/analysis/enterprise-inventory-baseline.json`:319modulepages,1006operations; missing call mappings remain unmapped, never inferred from module similarity.
- [ ] IN FLIGHT: resolve99referenced metadata safely, enumerate static app pages/routes, add exact source SHA/provenance and Markdown review matrix, UI/API per-page call evidence, full gates before independent version release. No runtime changes, no migration or deployment this round.

Important correction: prior brief63business+70settings are navigation entries, not all290declared backend pages. The new inventory deliberately surfaces this gap rather than claiming complete coverage. Generated scopes/permissions are declarations, not verified live authorization. Nested nav fields must not be mistaken for page-level metadata (covered by regression fixture).

P1 extension: static src/app pages and route handlers now separately enumerated, preserving group folders omission and catch-all placeholders; counts 6 app pages / 33 app API handlers. Source commit recorded. These may shadow module routes and must not be naively added to unique-page totals. Tool tests3passed/eslintpassed; no background jobs.

P1 latest: namespace import provenance extracted for87of99unresolved page metadata expressions. Other12are undefined metadata, must remain explicit not interpreted as public authorization. Three AST fixtures and scoped lint passed. Raw matrix is intermediate, not completed per-page design/verification. No runtime source modifications; current release remainsaeac83a.

P1 handoff:5ASTtests pass, including exact import provenance and rejecting computed route expressions. Scoped eslintpass. Only4new audit/spec files plus progress report, no runtime/deploy/DB changes, no owned background jobs. Next round must finish references/static overlap/call evidence and a real per-page plan before first version. Goalactive.

Round2 evidence: reference-only metadata reduced99→12; all87references parsed without eval; computed icons remain explicitly unresolved and do not erase requireFeatures.12undefined metadata sources remain unknown (not public). Breadcrumb parents now extracted where declared. Six ASTfixtures passed. No runtime/migration/publish changes.

Round2 matrix output now includesMarkdown for319modulepages and1006operations, plus static6pages/33handlers.143pages have explicit breadcrumb parents; others remain unresolved-parent. This is inventory evidence, not full action/contract verification. P1 remainsin_progress.

Round2 final:8fixturetests+scopedlint pass; inventory self-check validates counts/exact unique routes and refuses unproven confirmed mappings. JSON/Markdown outputs refreshed. P1runtime/prod unchanged; no background jobs started. Next: inspect12undefined page metadata and effective overrides; establish source component loader/call-site provenance, then turn per-page placeholders into precise implementation plans. No deployment before P1 acceptance.


## Round 3 progress

- [x] 319/319 module pages resolved to exact component source through existing generated load() imports, not guessed path construction. App pages remain separate due shadowing.
- [x] 88pages contain direct /api literals, recorded with line and source-literals-only status; not a runtime mapping. Shared helpers/template URLs still need subsequent analysis.
- [x] Component imports Card/Page/DataTable/CrudForm/EmptyState etc extracted as evidence of reuse; not mistaken for mounted runtime layout.
- [x] Nine fixtures and scoped eslint passed. Actual extraction check counts unchanged290/29/1006;12undefined metadata stillunknown. One formatter fixture initially lacked new apiMapping field, fixed fixture, rerunpassed.
- [ ] IN FLIGHT: effective overrides/12undefined scope guards, child imports and helper call tracing, static shadows, page-specific plans; no business changes or publication this round.

Round3 final provenance extension: API template expressions retained withline/source, never substituted with inventedids.169/319pages now have directliteral/template evidence (remaining150needchild/helpertrace). Markdown includes per-page source/components/interaction/return/state checklist and exactAPIreferences.10fixturetests+lintpassed; formatterfixture updated to fullplan shape after missingstates failure. No backgroundjobs or runtimechanges. P1notcomplete.

P1 latest: request helper callsites (apiCall/readApiResultOrThrow/createCrud/updateCrud/deleteCrud/fetch/selfFetch) recorded as AST evidence, retaining relative routes and variable expressions.11tests+lintpassed. No businesschanges; no ownedbackgroundjobs. Next must resolve effective overrides before permissions are labelled effective.

Round3 latest: declaredNavPages overlays extracted separately from src/modules.ts, base metadata never overwritten; effective runtime merge not falsely claimed.12fixturetests+lintpassed.191pages expose direct request-helper callsites; remaining need transitive source evidence. No jobs/migrations/releases.

Round3 checkpoint:80declared navigation overlays recorded independently,12fixturespass,lintpass. Intermediate outputs not committed/released; no runtime edits or backgroundjobs. Complete objective not achieved; goalactive. Nextround: transitive child/helperinspection plus effective override parity, finalize P1 audit/version and proceed to runtime slices without prolonged inventory-only work.

Round3 bounded tracing added: per-page local/alias dependencies max40files/depth3/1MiB each, never execute imports; cutoffs/unresolved imports explicit.13fixturetests+lintpassed. Outputs refreshed; all trace evidence remains static, never runtimeverified. No runtime changes, no jobs. Need move P1 to approved baseline artifact after final parity checks, keeping every gap explicit rather than blocking baseline forever.


## P1 scoped readiness review

P1发布的是声明覆盖与证据基线，不是运行功能改造；所有已知缺口留在矩阵中，按各后续阶段逐项验证。验收为exact route set、无敏感内容、静态引用有source/line、未知明确标注、工具fixture/全门禁通过。无schema/API/UI运行变更，无迁移。生成输入SHA256记录，防止陈旧生成源被误当新版本。P2-P6仍未批准进入，必须各自完成具体契约/测试规格。

P1 review verdict: Ready for implementation；仅P1工具与静态矩阵，授权来自用户无人值守请求。基线不允许静默将unmapped或truncated转confirmed。

P1fullgate started supervisor100986, logprefix/tmp/enterprise-p1-*; exit/tmp/enterprise-p1-gates.exit. Sequencegenerate→refreshinventory→typecheck→lint→ds→fullunit, no build concurrent. Do not duplicate; collect finalresult. No release yet. Next aftergates: exact baseline review, independent version/tag and boundedbuild, CIartifactdeploy. Keep P1in_progress untilallrequired gates pass.

P1 gate supervisor100986 completed exit0: generate/refreshedinventory/typecheck/lint/ds/fullJest allpassed. Logs/tmp/enterprise-p1-*. No backgrounds remain. Next boundedbuild and versionedbaseline release; no runtimefeaturecompletion claimed.

P1独立应用版本0.2.3（此前0.2.2）；仅新增审计工件/工具与版本标识，无UI/API/schema修改。未加tag避免push+tag双流水线。最终build与门禁需包含versionbump。后续各垂直步骤逐patchversion推进。

P1build supervisor104063, bounded2workers/timeout1200/nice15, OM_DIST_DIR=.mercato/enterprise-p1, logs/tmp/enterprise-p1-build.log/.exit. Do notstartparallelbuild; collectexit, restoreNextcandidateincludeaftercompletion. This is0.2.3candidateonly, currentremainsaeac83a. No otherjobsrunning.

P1 candidatebuild104063 finishedexit0. Candidate107561 onloopback3387(nextonly), browser supervisor107680 running shared10tests, logs/tmp/enterprise-p1-browser.log/.exit. Do notduplicate. Next collectbrowser, terminatecandidate, restoreNextcandidateincludes, finalizeversion0.2.3release. Fullobjectiveactive.

P1buildexit0, sharedPlaywright10/10pass(/tmp/enterprise-p1-browser.log); candidate107561stopped; candidateinclude restored. Version0.2.3baseline ready for finalcode review/CI; does not complete P2-P6. No DBcleanup executed; browserfixtures only own app preference actions.


## P1 release evidence — 0.2.3

Commitebaf2dda326bfd575d318c3a406008665d035d64,CI44011650337success. Automaticdeploydeploy-20261117034540-ebaf2dda finisheddeployed,CIgateallow,artifactinstaller. Manualrequestexit75locked-out because sameSHAautoexecutor heldlock; no retry/concurrency. Source unchanged otherthanversion/audit artifacts. Browser livefooter0.2.3(ebaf2dd),manage andfixedhubconfirmed. Firstfixed-link assertion ranbeforeinjectionready (count0), correctedwaitForvisiblepasses; noUIpatchmade.

P1allgates:generate/typecheck/lint/ds539files/fullJest145suites1203tests; standaloneAST13tests; buildexit0; candidate10Playwrightpass. Inputs/inventoryknownlimits remainexplicit; phase completion is baseline delivery only, not runtimeproof ofall319pages. P2-P6pending.

P1state:verified. Next: P2precisespec/runtimeevidence first, do notbulkmodifyUI. Currentrelease0.2.3,previousaeac83a. Noownedbackgroundjobsremain;CI/build/browser/deploycollected,candidatestopped.


## P2 slice A — consistent organization workspace labels (0.2.4)

Autonomous decision: keep installed AppShell/Card/Popover and existing routes. Use one organization-layout projection for switcher/sidebar-visible spaces and full directory/search. Defect: search/BusinessHome ignore organization labels/order; even switcher labels may be overwritten by labelKey translations. applyLayout must remove labelKey only for explicit organization label overrides, preserving localization of defaults. Search/business use ordered (including hidden) projection; switcher uses visible projection. No new permissions/storage/API, no user data fixtures required; synthetic browser nav response fixture proves rename/hidden behavior. AC: same custom label in allconsumers, hidden not offered in switcher but searchable, defaults remain localized, source arrays unchanged, rollbackflag preserves oldbehavior. Tests: purelayout,search/switcher/directorycomponents,realbrowserfixture,fullgates/build then independent0.2.4CIrelease. OtherP2slices/navigationparents remainpending. No new module contributions.

P2A review verdict: Ready for implementation; additive shared helper only, no public identifiers removed.

P2Aprogress: shared directorySpaces applies order/labels while retaininghidden spaces; override labels clearlabelKey toavoidtranslation overridingorganizationname. Search+BusinessHome wired,focusedtests pass. First chainedtypecheckoverranSSHbudget,typeslogemptyandnoDSevidence; don'tcountpass. Restartedboundedfullgate supervis119935 with explicitexit/tmp/enterprise-p2a-gates.exit,logs enterprise-p2a-*2; no concurrentbuild. Otherhostbuilds observed, never killed. No publishyet.

P2Afullgate119935exit0 (generate/type/lint/ds/fullJest). Build121729nowrunning OM_DIST_DIR enterprise-p2a/2workers/timeout1200/nice15,log/tmp/enterprise-p2a-build.log/.exit. No duplicatebuild/runtimeedits untilfinished. Next browserpayloadfixture rename+hidden assertions and cleanup,version0.2.4CIrelease.

P2Abrowserfixture caught BusinessHome translation fallback crmNav.group.customers overridingcustomnameevenafterlabelKeycleared. Fix directcustomlabeldisplaywhenlabelKeyabsent. Candidate125183muststop,oldbuildinvalid,newbuildrequired. NoDBwritesinfixture.

P2A latestpipeline126066running types/lint/ds/fulltests→boundedbuild;logs/tmp/enterprise-p2a-*3 and build2.exit. No otherownedjobs;candidate125183stopped. Waitingnotblocked;continuecollectandfixturebeforeversion0.2.4release.

P2Abuild2exit0, browser11/11pass inclorganizationlabelhiddenfixture. FirstrawprobeassertionspassedbutcleanupinflightcausedTargetClosedError (possibly verboseheaderdump); replacedcommittedspecwithcontext.unrouteAll(wait) andcleanexit. Noresponse/headerscopiedintorepo. Candidate133200stopped. Needfinaltypes/lintafternewtest,CIversion0.2.4release. RemainingP2-P6notcomplete.


## P2A release evidence — 0.2.4

Commit93c59c2684e21f6fbe507a60fc508311e14b0fb7,CI44016777672success,deploy-20261117043244-93c59c26 deployed. Fullgate/buildexit0,candidate11browserpass. Livefooter0.2.4(93c59c2),fixedmanagevisible; deployedorganizationlabel/hiddenfixture1passed(/tmp/enterprise-p2a-live-browser.log). NoDBwriteinthefixture. Previousreleaseebaf2dd. Allownedjobscollected/candidatestopped.

P2Averified; P2overallstillin_progress: pageparents,searchcontext,workbenchshortcuts needtraceableevidence. P3-P6pending. Do notmarkwholegoalcomplete. Next chooseoneconcretenavigationparent/returnpathsliceorverifyexistingflowsbeforemodifying. Testsandversionsmustremainseparate.


## P2B — safe contextual return link (0.2.5)

Scope: app header gains shared Button/Link context affordance only on nested declared destinations. Derive longest segment-boundary parent from completeauthorized catalog groups/manage/personal,normalize documented shellHref aliases. Never usepathname splitting to invent destination,never use/backend ascatch-allparent,neverlinkunknownorunauthorizedroute. Exact listpage showsnolink; nested/create/editpage getsclosestauthorizedentry. preservequery/filters notyet supportedandnotclaimed. NoDB/API/permissionchanges. AC: boundarycollision,unknownpath,root,duplicateentries,settingsnested,alias,hiddenworkspaceentry andauthorizedonlyfixture; componentenabled/disabled/loading; realbrowserroute fixture; fullgates+0.2.5build/CIrelease. Existing breadcrumbs notoverwritten. SharedButton,semanticstyle,keyboardlink,labeli18n, narrowshortlabel. Changesadditive;rollbackoldartifact. Reviewerautonomousdecision readyP2Bonly.

P2Bprogress: parentpure3tests/component2tests; fixturesinitiallymissingreadCrmCatalogrequiredarrays→fixed,thenTSmockbraceerror→fixed,latesttypeexit0. Fullgatespassedbeforecomponentaddition; currentpipeline152886lint/ds/fulltests/buildexplicitexit/tmp/enterprise-p2b-build.exit. Narrowviewiconvisiblewitharialabel; labeldesktoponly. NoAPI/DBwrites. Waitbuildthenbrowserfixturebefore0.2.5release.

P2Bcandidatebuildexit0,12Playwrightpassed incldirectcreatepageparentdesktop/mobile. Browser157707collected,candidate157511stopped. Testbootstrap8.3minbutallcasespass;noextratimeoutalteration. NeedfinalgateafternewtestandCI0.2.5release. NoDBchanges/externalactions.


## P2B release — 0.2.5

9d4ad0009d825598a77986993c97c4e2e1bcaa76 CI44022184610success,deploy-20261117051759-9d4ad000deployed. Allgatespassed/buildexit0/candidate12Playwrightpassed/liveparentdesktop+mobile1passed(/tmp/enterprise-p2b-live.log). Sourcegate/browserbootstrap slow(sharedhost),no retriesorrelaxedassertions. Previous93c59c2. Noownedjobsremain;candidate157511stopped. P2Bverified,overallP2remainingfullbreadcrumb/unknownscopecoverage;P3-P6pending. Do notmarkwholegoalcomplete.


## P3 coverage sweep (pre-implementation)
Read-only authorized directory drives paths, no hand-maintained route array. Explicit loopback/testcredentialfile; blockallnonGETAPIrequests, no saves/send/pay/upgrade. Sequential1440/390renderaudit, results include status/overflow/denial/crash notbusinessacceptance. Failed pages are evidence not permissiontohidegate. Loginonlysideeffect; test scope superadmin meansnotemployee/portalproof. No runtimechange. Script must syntax/lintbeforeexecution, bounded navigation/onebrowser cleanup. New dependentP3UIworkrequiresseparatespec afterresults.


## P3 readonly baseline result

scripts/enterprise-readonly-page-audit.mjs sequential137authorizeddestinations1440/390,exit0. Scriptexit0meanssweepcompleted,notallpagespassed.8narrowoverflowfindings: wms warehouses/zones/locations,messages,config sales/catalog/wms,sidebar-customization. Noobservedpageerrors/denialininitialrender;notloadeddata/businessproof. Common7tablesminwidth640,ancestor.isolateoverflowvisible;requirelocalscrollwithoutclippingmenus. Installedcomponentseamneedsverificationbeforepatch;donotblankethideoverfloworpatchnode_modules. Syntheticresponsefixturesfirst. NoDBwrites/scriptsaveactions;POSTAPIblocked.


## P3A — embedded table narrow containment (0.2.6)
Evidence:7of8overflowpages use installedDataTable embedded wrapper `.isolate` with minwidth640 andoverflowvisible; rows must remain scrollable notshrunk/clipped. Exactcomponentoverrides collapse to data-table:unknown whenhostomitsextensionTableId, so overridewouldaffectunrelatedtables. Smallestapp-ownedthemeextension scoped `#main-content [data-component-handle^="data-table:"] .isolate:has(> table)` below48rem setsmax-width100%/overflow-xauto. Desktopunchanged; no displaynone, no globalbodyoverflowhidden. Preserveallcells/pinnedactions; openactionmenus/dialogs test required. Existing539stylegateunchanged. Hidden narrow sidebar customization10px debt separate notpatchedhere. AC sevenpagesdocumentwidth<=viewport,locallyscrollabletable retainscolumns,desktopunchanged,existingbrowser/regressionfullgates. NoAPI/DBchanges; independent0.2.6release. Choiceapprovedautonomous, reviewsmallestsupportedstylebeforepackageeject.

P3Abuildexit0,7actualoverflowpagesnow390scrollWidth390withlocalscrolltrue,shared13Playwrightpassed. Candidate187352stopped,browser187784collected. Gate0.2.6requiresfinaltypes/lintafternewtest thenCI. Other8thsidebarcustomizationfindingremainspending. NoDBmutationorpackageedits.


## P3A release evidence — 0.2.6

643e2b9fd088c3e8687aa6fdbf27ca4b2abb62d6 CI44028459352success,deploy-20261117061244-643e2b9fdeployed. Fullgates/buildexit0,candidate13Playwrightpassed,sevenoverflowdestinations390width390andlocalscrolltrue. Livedeployedscrollspec1passed(/tmp/enterprise-p3a-live.log). Slowbootstrap8.8min,case7.9sec;notrelaxed. Previous9d4ad00. Allownedjobscollected,no candidates. P3Averified only;oneadditionalnarrowfindinganddynamicpages/publicportalflowsstillunverified. P4/P5/P6pending. Next prioritizeDSHcontract/faulttests after remainingP3verification;do notclaimwholegoalcomplete.


## P3 audit readiness correction
Sidebarcustomization initial400px measurement was skeleton/earlyDOM: settledrealpage390wide. NoUIchangejustified. Audit now recordsboundedDOMquiet andskeletoncount,nevercallsitbusinessready. Preventsfalsepositivefixes;4secbudgetperpage,nonGETstillblocked. Re-sweep137pagesbeforefurtherUIchanges. DSHphase followsseparatefixture/contractspec,not coupledwithauditversion.

P3readinesssweep137completeexit0. Settledsidebarcustomization390nooverflowconfirmed. NewdelayedTypeErrorsseenacrossmanypageswhileauditabortspreferencewrites;donotmasspatchapp. Addedblockedwritemethod/path(noheaders)toauditforexplicitartifactattribution. Additionalsettledoverflowmap/pipeline/wms requiresindependentcontextrepro;noUIchangesbeforecause. Baseline138? actual137only. Noapplicationwritesbeyondlogin, allPOSTblocked.

P3auditfalsepositiveroot: viewportmeasureimmediatelyafterresizecanobservepre-layoutwidth;nextnavigationalsostartednarrowfrompreviousroute. Independentfreshcontexts map/pipeline/sidebar390all390nopageerrors. Fixresetdesktopbeforeeachgoto andwait2animationframesafterresize;captureerrorscategorywithoutmessage/headers. Do notpublisherroneous32overflowclaims; rerunall137withcorrectharnessbeforeUIchanges.

Auditcauseconfirmed:114TypeErrorsnetworkcategorycorrelateblockedPOST/api/auth/feature-check. Readexactinstalledhandler:permissionqueryonly,no mutation. AllowthatPOSTexplicitly,continueblockingallotherwrites;previousfailurescannotbeappdefects. RerunauditbeforeissuingUIpatch. NoAuthwrite/unrestrictedPOSTallow.

Round8 correction: auditpermissions completed137exit0;101networkerrors remainnotindependentlyreproduced. Singlepagesworkbench/calendar/companies withsamePOSTblockpolicy yieldnoerrorsand390document. Sequentialreusedpage asynchronousrequests canbecreditedtonextroute. Auditnownewpageperroute/closebeforeadvance; noUIpatchjustifiedbyunreproducedbulkresults. Keepfindingsunverified. ProceedDSHreadonlyfixtureverification inparallel onlyread-onlyresearch; no model/networkbusinesscalls.


## P4 read-only boundary audit preflight

ReadroutehandleChat: authentication enforced; directinternal route featuregate notyetconfirmed; no assumption that hiddenlauncherprovidessecurity. Existingfixturetests runtimespawn/failclosed/replay/cancel/toolsrununder OM_DSH_MODEL_ENV=off,no externalmodelaccess. Job218945log/tmp/enterprise-dsh-baseline-tests.log/.exit. Do noteditpubliccontractbeforeadditivecompatibilityreview. Pendingquestionanswer still501explicit. Runtimeversion/remotedeploymentmustverifyseparatelyfromdesktopDSHversion.

P3audit artifacts are not fullfeatureproof. Remainingmisattributed errors/flows need isolatedfixtures. Goalactive, no0.2.7scopechosenyet.

P4baselinefixturejob218945exit0; noexternalmodelcalls. See/tmp/enterprise-dsh-baseline-tests.log. Auditjob214600collectedexit0. Noownedbackgroundjobsremain. Next inspectfeaturegateatdirectDSHroute and realproxycontractbeforecoding, then0.2.7minimalfixifconfirmed. No runtimeedits/migrations/releases thisround.


P4confirmedcontractgap: packagedai_assistant/chat metadata requiresai_assistant.view, but staticDSHchat/agentic rewrites onlychecklogin; middlewarecatch-all featuregatenotguaranteedafterstaticrewrite. Existingdsh-healthdoesexplicitRBAC,thereforeUIhealthcannotsecurechat. Next0.2.7addsharedexplicitRBACbeforebody/modelenv/spawn,deny403,failclosed503,deriveexistingtrustedcontextwithoutrolechecks;addanonymous/denied/error/allowedfixturesandrate-limitparityreview. NeedfullBC/securitycontractspec beforecode. Do notinvokeactualunprivilegedmodelprobe orchangeACLtoverify.


## P4A specification — 0.2.7 explicit static AI route permission parity

Existingpackagedcontractrequiresai_assistant.view. Rewritten/staticDSH endpointsmustenforcesamefeatureindependentofhealth/UI. Sharedappmodulehelper lazyresolvesrbacService,userHasAllFeatures withtrustedauth tenant/org;beforecanaryfallback/body/modelenv/spawn. Status403forfalse,503permission_unavailableforresolverfailure,401unchangedatroute. Noauthpayload/input/streamshapechanges;noAPIrename/deprecation. Unit4positive/negative/faultcontexts,routefixturesmustmocksharedhelperallowedbydefaultandexplicitdenialassertnoruntime. AgenticunknownAgentguardstillrunsafterpermission. Rate-limitparityisnextslice,notweakenedhere.

Migration & Backward Compatibility: noDBchanges; sameexistingfeature requirement restored onstaticpath, nolegitimatepreviouscontractremoved. No fallbackretainsunrestrictedstaticbranch. DefaultdenywhenRBACunavailable. Rollback previousartifacthasknownparitygap so disableAIentryifrollbackrequired;donotcallrollbacksecurityfixcomplete. Userauthorizedautonomousimplementation,specselfreviewreadyP4Aonly. Preserveallgeneralgatesandfake-runtime-onlytesting.

P4Aownershipreview: sharedaccesshelper livesdsh_runs/lib notcrm_navigation (AIpolicyisnotnavigationownership). Focusedroute+helpertests passed afterexplicitdenial/outagefixtures.0.2.7 versionbump. Gate220094running,logs/tmp/enterprise-p4a-* explicitexit. Noexternalmodelcalls;testsOM_DSH_MODEL_ENVoff. Needagenticroutefixtureandfullbrowser/build beforeCI, notclaimdone. Auditsarecommittedlocal1617b5e/38b120f,notyetpushedruntimeuntilgates.

P4Aroute/helperdenialfixtures pass,agenticESMstreammodulemocked toassertitneverexecutesondenial;typedmockTSsignaturefixed. Finaltypeexit0. Pipeline222541lint/ds/fullfake-modeltests/buildrunning,logprefix/tmp/enterprise-p4a-*. No productionmodelcallsorACLchanges. Current0.2.6unchangeduntilallgates+CI. Audit-onlychanges may ship withsecuritysliceasvalidationtool,notnewUIfeature.

P4A0.2.7candidateevidence: fullpipeline222541 exit0 (generate/type/lint/ds539files/fullJest149suites1215tests,10skipped/standalonebuildOM_DIST_DIR enterprise-p4a). Post-formattingfocused3suites38tests pass, typecheckexit0, lint0, ds542files0, generate0 nochanges. Candidate239404 loopback3387 next-only: anonymous401 bothroutes; superadmin/admin/employee(rolesdohave ai_assistant.view perrole_acls,superadminis_super_admin) pass gate→same200stream/dsh-agentic502engineerrorasbefore(no modelconfig). No feature-lessaccountexistsinthisDB(operator/supervisor roleshave0users),so live403notdemonstrablewithoutchangingACLorcreatingusers; forbidden/faultbranchesprovenbyroute+helperfixturesonly,stateexplicitlynottrueonline403evidence. SharedPlaywright navigation-workspaces9/9pass10.9min(/tmp/enterprise-p4a-browser.log). Candidatepre-datescosmeticimportreorderonly;behavioridentical,CIbuildisthereleasedartifact.

P4A0.2.7release: commit7132d18, CI44040303734success, deploy-20261117074826-7132d186 result=deployed (service restarted07:52:35, previous643e2b9). current→7132d186, releasepackage0.2.7. Live footer0.2.7(7132d18) fetched through loopback+Hostspoof(authlogin200). Anonymous401 bothroutes unchanged; superadmin200 SSEand502bridge-unavailable, i.e. feature-holderstillpassesgate. No live403evidence(feature-lessaccountabsent), fixturesonly —statedexplicitly. NoACL/credential/DBchanges, norealmodelcalls. SSHchannelexhaustionduringdeploy recovered; noloststate.

## P4B read-only closed loop (hermetic engine, real server/store/bridge)

Goalofloop:browser-styleSSEclient→real chatroute→realspawnpath→scriptedJSON-RPCengine→realbridgeendpoint(realtoken,binding,ACL,toolpolicy)→real ORM runstore→SSEback. Engineis simulated,everythingelse real;thiscoversroute/store/bridge/policyintegrationthatfixturesalonecannot. New scripts:scripts/fixtures/fake-dsh-closed-loop.mjs,scripts/dsh-closed-loop-drill.mjs(no env secret read;per-drillrandomsigningsecret;DSH_RECORDforchilddiagnostics;isolatedport;existingartifact;no externalmodelcall,nomigration,nosettingschange). Evidence docs/crm-platform/dsh-integration/evidence/closed-loop-2026-11-17T080312454Z.json:http200,frames thinking/tool-call/tool-result/text/done;readtool200 ok2companies scopeorganizationtenant+org;writeattempt403 tool_not_allowed;run completed cursor4 runeventsevents1..4contiguous,resultfinalResponse match. Noproductionportused;runsrowswritten toshareddevDBbyauthorizationandleftinplace(honestartifacts,nodeletion). Knownlimit:enginesimulated,rewrite-insame-process;arealDSH-binary+fake-OpenAIendpointvariantremainsopen. Writesapprovalpath(P5)notexercised.

## P3B dynamic page audit + narrow detail-page containment (0.2.8 candidate)

Gap:105baseline routescontainplaceholders,79requireauth;navigation-onlysweepneverreachesthem. Newscripts/enterprise-dynamic-page-audit.mjs(read-only,samewrite-blockallowlist,13list-APIidsources,sentinelUUIDotherwise,1440/390). Result79routes:27rendered,50not-found-state,2denied,0crashedafter sentinel correction;24narrow-onlyoverflow. Firstsentinelall-zerosUUIDcaused500DATABASE_ERRORonthree modulesandmisleading"crashed"5 —correctedrecordedasfixturedefect,notpagedefect. Realdefectsfound:(a)narrowoverflowrootcauses—topbaractionsrowshrink-0max-contentpushesdocument16px;record-table sr-only absolutethenotpositionedwrapperescapesclipping(919px ordertable→863pxdoc);(b)non-UUID idsfilter→500DATABASE_ERRORinsteadof400(notfixed,recorded);(c)workspace_settingspreferences400withoutselectedorgonsomerecords(recorded). Fix0.2.8in globals.css:headerwrap+clusterflex-basis100%(plainwidth100%rejected:starvedleftcolumn,mobilemenubuttonunclickable—drawer testcaughtit),narrowpositionedlocalscrollportfortablewrapper. NewPlaywrightcasemeasurescompanies/ordersdetailat390aftertablepaint. No backend/ACL/DBchanges;no writes. Verified:fullPlaywright10/10pass on candidate built fromOM_DIST_DIRenterprise-p3b(12.0m,includesnewdetailcaseanddrawer);post-fixdynamicsweep79/79=26rendered+51not-found+2denied,0crashed,0overflow(afterJSONcommitted).

P3B0.2.8release: commitcdb05df,CI44053084354success,deploy-20261117092048-cdb05dffresult=deployed(restart09:22:28,previous7132d18). current→cdb05dff,releasepackage0.2.8,footer0.2.8(cdb05df)via loopback+Hostspoof. ServedCSSchunk verifiedtocontainbothnarrowrules(headerwrap, position:relative overflow-x:auto tablewrapper). Anonymous401onbothAIroutes;superadminchatstill200SSE,sonoregression. Candidatebuildbeforedeploy:10/10Playwright(12.0m) inclnewdetailcaseanddrawer;post-fixdynamicsweep79/79 0overflow0crash. No backend/ACL/DBchanges;candidateandsweepread-only;noownedbackgroundjobsremain.

## P5 next slice design — approvals end-to-end (not yet implemented)

Designonly,no codewritten this round.Scope:hermeticapprovaldrillonsamepatternasP4BwithOM_DSH_WRITES=1andthetokencarrying crm.update_company. Engine(fake-DSH)flow:(1)readtoolcrm.find_companiestogetarealcompany;(2)writetoolupdatecompanyindustry→expect403approval_requiredwithapprovalId+expiresAt+summary;(3)emitassistanttext`approval-required:<uuid>`andpollthesamecalluntildecision(max~60s),recordingeverystatus;(4)after200ok,immediatelyretryidenticalargs→expect409approval_consumed(single-use);(5)writetheoriginalindustrybackviaasecondapproval→runcompletesonlyafterDBequalityisrestored. Drillauthorizestheemployee,readsoriginalindustryfromDBdirectly(readonly),passedtochildonlyviaDSH_-prefixedenvinjectedintotheserverenv(nonewenvcontract),approveseachapprovalIdthroughPOST/api/internal/dsh-write-approvals/<id>{decision:'approve'},andasserts:runcompleted,approvalrowsapproved+consumed,companyindustryequalsoriginalatend,noothercompanyfieldsbyte-identical(compareupdated_at). Iftherestoreapprovalisrejectedorthefinalindustrydiffers,thedrillfailshardandreportstherunid+companyid,itdoesnotattemptSQLrepair. Rollbackplan:OM_DSH_WRITES=0disableswrites;thebridgeandapprovalcodeareunchangedbythisdrill. NOTESTATEYET:thisparagraphrecordsintent;noimplementationorclaim. Nextround:buildengine+druild,focusedtests,isolatedrunonartifact,candidateregression,thenversionbump.

## P5A approval loop evidence (hermetic engine, real server/store/bridge/CRM)

Implementedscripts/dsh-approval-drill.mjs + scripts/fixtures/fake-dsh-approval.mjs. IsolatedinstancefromOM_DIST_DIRartifact,OM_DSH_WRITES=1,randomruntokensecret,targetresolvedafterloginthroughtheemployee'sownAPI(plaintextindustry,scope-correct). Scenariosallthroughcrm.update_companywithuniqueper-runargs:Amissingcompany→approve(realPOST/api/internal/dsh-write-approvals/<id>)→execute404not_found→retry404(routehandsapprovalbackbydesign,no second decision). Brealcompany(BrightsideSolar)→approve→200writeexecuted→retry→409approval_consumed(single-use). Dreject→retry403approval_rejected,neverexecutes. Evidenceapproval-2026-11-17T094359581Z.json:http200,frames thinking/tool-call/text/done,decisions3/3accepted,approvals rows approved(A,notconsumed)/consumed(B,consumed_at)/rejected(D),runcompleted,finaltextcarriesalloutcomes. Datasafety:onlyindustryoftargetchangedduringB,restoredthroughnormalCRMPUT/api/customers/companies(employee session,200),finalAPIreadRenewableEnergy=original,untouchedcolumnsbyte-identicalviaat-restsnapshot,companycount3→3. A first failed drill attempt leftindustry=approval-drill-written-…(restore scenario could not reuse a consumedapproval);restoredmanuallyviaemployeePUTandverifiedbeforethisrun,then thedrillwasredesignedtorestorethroughthenormaleditAPIwithbest-effortrestoreinfinallysoitisrerun-safe. Nootherrowschanged;approval/run/eventrowsleftforaudit. Norealpayment/externalmessages;nomodelcall.

## P6 OTA / upgrade verification (real, current release cdb05dff)

New scripts/p6-ota-verify.mjs (read-only except a held flock) and scripts/p6-failure-drill.mjs (isolated roots). Evidence docs/deployment/p6-ota-verify-2026-11-17T094900507Z.json: release0.2.8/cdb05dff来源ci-artifact run44053084354; manifest commit+workflowRun match release; 20359 files re-hashed 0 mismatches 0 missing, BUILD_ID present, node24=manifest runtime, archive sha256/bytes recorded. Upgradelock:while another process held /home/pro/.local/state/ila3-deploy/deploy.lock, the same deploy entry exited 75 with locked-outJSON; after release it exited0 (help); no deploy run record was created by the blocked attempt. Rollback target:crm-rollback.mjs dry run(--to previous) accepted 7132d18 via previous symlink, apply=false, no swap/restart; application rollback= symlink swap+restart, explicitly not a data restore. OTA entry: System Update status API (superadmin) enabled/canManage, runningVersion0.2.8 runningCommitcdb05dff, candidate cdb05dff with CI gate allow(successful-test-workflow), latest auto run deploy-20261117094308-cdb05dff result=already-current, relation=same. Failure drill evidence p6-failure-drill-2026-11-17T095343657Z.json: isolated hardlink seed on3200-class spare ports(3210/3110),drillA refused candidate-unhealthy exit2 with current unchanged and target healthy; drillB inject-post-switch-failure rolled back(exit2, rollback.healthy true, current restored to seed), production current symlink unchanged before/after, isolated roots removed, own drill server stopped. Not claimed: zero downtime, phone/OTA firmware update, data restore drill. No DB/migration/production-credential changes.

## P3C public/portal/pay page audit (anonymous, read-only)

New scripts/enterprise-public-page-audit.mjs; output .ai/analysis/enterprise-public-page-audit.json + summary .md. 30destinations(orgSlugreal,othersentinels),2viewports,innerText,onlyGET+loopback,allforeignhostsblocked,nowrites/externalcalls. 28rendered,1pay-not-found,1transientdocs-apinav-failure,0overflow,0pageerror. Portal→loginortoken-specificmessages;messagesviewinvalidlink404;quoteloadfailure(non-UUIDtokenlogsZodErrorbeforepagehandlesit—noiseonly);paycancel/successboundedstates;onboardingmanual-unavailable;/docs/apirequireslogin(3/3fresh1440→/login)thoughserverpre-hydrationservesexplorerHTML(definitionalsopublicat/api/docs/openapi);one500underloadrecordedasobservationnotdefect./reset/[token]sentinelrenderstheformbutsubmit-timevalidationnotverified. Limitations:anonymousonly,sentinelbranches,noauthenticatedportal/paysuccessflow,norealpayment. NoDBwrites,noexternalmessages.

P5Acorrection:P5Afinalevidenceapproval-2026-11-17T100755063Z.jsonreplacesearlierpassingfile.Drillbugfixed:theentityidusedbytheAPIis customer_entities.id whileindustrylivestheprofile rowkeyedbyentity_id;theearlierpsql"untouched"snapshotqueriedcustomer_companies.id andmatchednorow,soitpassedvacuously. Thedrillnowcomparesdecryptedvalues(displayName/legalName/brandName/domain/websiteUrl)viathesameAPIbeforeandafter,andtheevidenceshowsallfiveidentical,industryrestoredtoRenewableEnergy,restorePUT200,companies3→3,approvalsapproved(A,notconsumed)/consumed(B,consumed_at)/rejected(D),single-use409approval_consumed,runcompleted. Note:at-restciphertextchangesonanywriteevenforunchangedvalues(newnonce),sociphertextcomparisonisnotavalid"unchanged"test.Duringthisroundoneintermediatefaileddrilleaveindustry=approval-drill-written-…;itwasrestoredthroughemployeePUTbeforethere-run,andthefinalAPIreadconfirmsRenewableEnergy.

## P3D coverage closure + 0.2.9 grid containment

Newscripts/enterprise-coverage-matrix.mjs merges inventory + all sweeps into .ai/analysis/enterprise-coverage-matrix.{json,md}: statuses evidenced/defect/observation/gap, per-class totals, gap list. New scripts/enterprise-direct-page-audit.mjs closes the routes that are not navigation destinations (create/edit, hidden settings, profile, placeholder outside auth sweep): 74 routes, 69 rendered + 5 readable not-found states, 0 crash, 0 page error. After refresh with the full static sweep (137/137 ok) the matrix is 319 pages: 318 evidenced, 1 observation (/docs/api anonymous access inconsistent: client lands on /login, server still serves explorer HTML, one interrupted navigation; definition itself public at /api/docs/openapi — product decision, not silently patched), 0 gaps, 0 defects. Sweep improvement: an overflow reading is re-measured after 400ms and kept only if it persists (removed two transient editor-toolbar false positives). 0.2.9 fixes the two real ones: grid items' automatic min-width let a min-w-[640px] table push the prototype list track to 827px at 390, and a two-column create form pushed its settings column 57px past 1440; rule moved out of the narrow media query: `#main-content .grid > *{min-width:0}`, with narrow `div:has(>table)` local scroll. Candidate (OM_DIST_DIR=.mercato/enterprise-p3c): full gates generate/type/lint/ds/test exit0, build exit0, shared Playwright 12/12 pass incl prototype narrow and checkout create desktop/narrow cases; direct probes show document 390/1440 on checkout create, prototypes, companies list and wms warehouses. Full live re-sweep and release evidence recorded after deploy.

P3D0.2.9release:commit55f4c486,CI44074238904success,deploy-20261117113400-55f4c486 result=deployed(restart11:39:03,previouscdb05dff). Livefooter0.2.9(55f4c48);servedCSSchunkverifiedtocontainglobal`#main-content .grid > *{min-width:0}`andnarrow`div:has(>table)`scrollport. Candidatefullgatesgenerate/type/lint/ds/testexit0,buildOM_DIST_DIRenterprise-p3cexit0,sharedPlaywright12/12pass(13.7m)inclprototypenarrowandcheckoutcreatedesktop+narrow. Livepost-release sweeps on0.2.9:static137ok;dynamic79(0overflow);direct74(0overflow);public30(28rendered+1paynot-found+1docs-apiapiobservation). Matrix:t319evidenced318defect0observation1gap0. Publicauditgothard25sraceafter/docs/apihungthesweeponce;reruncompleted30/30. NoDB/migration/credentialchange;candidate3387stopped.

## P6D rollback vs data restore (real, on the host)

New scripts/p6-rollback-data-drill.mjs; evidence docs/deployment/p6-rollback-data-2026-11-17T121237991Z.json (passed). Steps on live0.2.9:createdonescratchcompanyviaPOST /api/customers/companies,backedupitsentity+profilerowasJSONto/home/pro/backups/…-rollback-drill-data.json,verifiedvisible; applicationrollback `crm-rollback.mjs --to previous --apply` → currentcdb05dff/0.2.8,healthready,scratchSTILLvisible(rollbackdoesnottouchdata);forwarddeploy`deploy.mjs --manual --from-artifact --sha55f4c48…`→0.2.9,scratchstillvisible;data-restorestep:DELETE /api/customers/companies?id=…→200andhidden,thenre-insertedthebacked-upentity+profilerowsfromtheJSONsnapshot,verifiedrowpresent+visible+releaseunchanged0.2.9,thenre-hiddenit. Distinctionrecorded:applicationrollback=symlink+restart,DBuntouched;datarestore=rowrestorefrombackup,releasetouchednever. Finding(notfixed):theDELETEendpointhard-deletesthecustomersentityandcompanyprofilerows(rowsAfterDelete entityExistsfalse companyExistsfalse)despiteadeleted_atcolumn;restoremustthereforebearealre-insertfrombackup,notatombstoneflip. Onlyscratchrowswecreatedweretouched;eachwasbackedupbeforedeletion;firsttwofailediterationsendedwithnorowsleft;nocredential/ACLchange,nomigration.

## P3E per-page backend contract evidence

Matrix now resolves each page's static API references against generated OpenAPI (595 paths), static src/app/api routes (33), and a read-only GET probe of the remainder (scripts/enterprise-api-contract-probe.mjs, output .ai/analysis/enterprise-api-contract-probe.json). 169 distinct page→API refs: 149 resolved by OpenAPI/static inventory + 8 by runtime probe; 12 deliberately unverified (POST-only and side-effecting: auth reset, customer_accounts login/signup/verify/reset, data_sync/run, entities definitions.batch/restore) — a GET 404 would prove nothing and a real POST could email/run writes; 0 confirmed missing. Observation: 8 endpoints exist at runtime but are absent from generated OpenAPI (data_sync/options, resources/tags, staff/team-members, entities/entities, entities/entity-settings, dashboards/widgets/catalog, communication_channels/me/channels, customer_accounts/admin/domain-mappings) — an OpenAPI documentation gap, not fixed. No runtime or DB change in this slice.
