'use client'

import * as React from 'react'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { PrototypeNotice, StateSwitcher, type PrototypePageId } from './PrototypeShell'

const STATE_OPTIONS = [
  { id: 'ready', label: '正常' },
  { id: 'empty', label: '空' },
  { id: 'error', label: '错误' },
  { id: 'forbidden', label: '无权限' },
  { id: 'budget', label: '额度耗尽' },
  { id: 'duplicate', label: '重复' },
  { id: 'conflict', label: '并发冲突' },
]

const STATE_COPY: Record<string, string> = {
  empty: '还没有数据。原型里这是空态；生产实现要给「下一步做什么」，不是只写「暂无数据」。',
  error: '加载失败：无法连接服务器，请检查网络后重试。（复用列表页已修的错误分支）',
  forbidden: '你没有查看这条记录的权限。生产实现返回 404 而不是 403，避免泄露「存在」这件事。',
  budget: '本周额度已用完（12 / 12）。任务会排队到下一个周期，或者由主管提额。',
  duplicate: '这家公司已存在：归属人 王倩，最近更新 3 天前。原型只显示这一句，不展示对方的客户资料。',
  conflict: '这条记录已被他人更新（版本 7 → 8）。请刷新后重试，你的修改没有覆盖对方的内容。',
  cancelled: '任务已取消（Run cancelled）：额度已退回，之后不会再有新候选提交。',
  disconnected:
    '连接中断：任务已暂停，重连后从上次游标继续，不会重复提交同一批候选。若 10 分钟内未恢复，任务按「已取消」处理并退回额度。',
}

function useDemoState(initial = 'ready', options: Array<{ id: string; label: string }> = STATE_OPTIONS) {
  const [state, setState] = React.useState(initial)
  const switcher = (
    <StateSwitcher value={state} onChange={setState} options={options} />
  )
  return { state, switcher }
}

const TASK_STATE_OPTIONS = [
  ...STATE_OPTIONS,
  { id: 'cancelled', label: '已取消' },
  { id: 'disconnected', label: '连接中断' },
]

function StateBanner({ state }: { state: string }) {
  if (state === 'ready') return null
  return (
    <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">
      {STATE_COPY[state] ?? state}
    </div>
  )
}

/* ------------------------------------------------------------------ 业务员首页 */

function HomeSection() {
  const { state, switcher } = useDemoState()
  const cards = [
    ['本周候选', '18', '较上周 +6'],
    ['待我审核', '5', '最早 2 小时前'],
    ['已入库', '9', '重复 2 · 拒绝 2'],
    ['额度余量', '3 / 12', '周额度'],
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">我的本周</h2>
        {switcher}
      </div>
      <StateBanner state={state} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, hint]) => (
          <Card key={label}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">今日任务</CardTitle>
          <Button size="sm" variant="outline" disabled title="原型：AI 入口随业务动作出现">
            让助手继续调研
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable entityId="crm_prototype:home_task" extensionTableId="crm_prototype.home_tasks" sortable={false} data={[
            {id:'de',name:'德国储能渠道',market:'户用储能 · 德国',status:'调研中',count:12},
            {id:'vn',name:'越南 LED 工程商',market:'LED 面板灯 · 越南',status:'待审核',count:6},
            {id:'ae',name:'中东 EPC 总包',market:'光伏支架 · 阿联酋',status:'排队',count:0},
          ]} columns={[
            {accessorKey:'name',header:'任务'},{accessorKey:'market',header:'产品 · 市场'},
            {id:'status',header:'状态',cell:({row})=><Badge tone={row.original.status==='待审核'?'warning':row.original.status==='排队'?'neutral':'info'}>{row.original.status}</Badge>},
            {accessorKey:'count',header:'候选'},
          ]} />
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ 开发任务 */

function TasksSection() {
  const { state, switcher } = useDemoState('ready', TASK_STATE_OPTIONS)
  const rows = [
    ['德国储能渠道', '户用储能 · 德国', '公开网页 + 展会名录', '8 / 20', '12', '调研中'],
    ['越南 LED 工程商', 'LED 面板灯 · 越南', '公开网页', '4 / 10', '6', '待审核'],
    ['中东 EPC 总包', '光伏支架 · 阿联酋', '展会名录', '0 / 8', '0', '排队'],
    ['波兰暖通批发', '热泵 · 波兰', '公开网页', '3 / 10', '4', '已取消'],
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">开发任务</h2>
        <div className="flex items-center gap-2">
          {switcher}
          <Button size="sm" disabled title="原型：不创建真实任务">新建任务</Button>
        </div>
      </div>
      <StateBanner state={state} />
      {state === 'empty' ? (
        <PrototypeNotice>还没有开发任务。选一个产品和一个市场开始。</PrototypeNotice>
      ) : (
        <Card>
          <CardContent className="p-0">
            <DataTable entityId="crm_prototype:task" extensionTableId="crm_prototype.tasks" sortable={false} data={rows.map(([name,market,source,quota,candidates,status])=>({id:name,name,market,source,quota,candidates,status}))} columns={[
              {accessorKey:'name',header:'任务'},{accessorKey:'market',header:'产品 · 市场'},{accessorKey:'source',header:'来源'},{accessorKey:'quota',header:'额度'},{accessorKey:'candidates',header:'候选'},
              {id:'status',header:'状态',cell:({row})=><Badge tone={row.original.status==='待审核'?'warning':row.original.status==='调研中'?'info':'neutral'}>{row.original.status}</Badge>},
              {id:'actions',header:'操作',cell:()=> <span className="text-xs text-muted-foreground">查看候选 · 取消</span>},
            ]} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ 候选审核 */

const CANDIDATES = [
  ['Nordwind Energie GmbH', 'nordwind-energie.de', 'Marta Klein · 采购', 3, 'pass', '新公司'],
  ['SunPeak Solar Trading', 'sunpeaksolar.vn', 'Nguyen An · 总监', 2, 'needs_review', '重复（归属 王倩）'],
  ['Gulf EPC Contracting', 'gulf-epc.ae', 'Omar Haddad · 项目经理', 4, 'pass', '新公司'],
  ['Warmtec Hurt sp. z o.o.', 'warmtec.pl', 'Piotr Nowak · 经理', 1, 'fail', '新公司'],
]

function CandidatesSection() {
  const { state, switcher } = useDemoState()
  const [selected, setSelected] = React.useState(0)
  const row = CANDIDATES[selected]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">候选审核</h2>
        {switcher}
      </div>
      <StateBanner state={state} />
      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardContent className="p-0">
            <DataTable entityId="crm_prototype:candidate" extensionTableId="crm_prototype.candidates" sortable={false} data={CANDIDATES.map(([name,domain,contact,evidence,verdict,dedupe],index)=>({id:String(index),name,domain,contact,evidence,verdict,dedupe,index}))} onRowClick={candidate=>setSelected(candidate.index)} columns={[
              {accessorKey:'name',header:'公司'},{accessorKey:'domain',header:'域名'},{accessorKey:'contact',header:'联系人'},{accessorKey:'evidence',header:'证据'},
              {id:'verdict',header:'验证',cell:({row})=><Badge tone={row.original.verdict==='pass'?'success':row.original.verdict==='fail'?'error':'warning'}>{row.original.verdict==='pass'?'通过':row.original.verdict==='fail'?'不通过':'需复核'}</Badge>},
              {accessorKey:'dedupe',header:'去重'},
            ]} />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">抽屉 · {row[0]}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">证据（{row[3]} 条）</span>
              <span>· 官网首页 — 抓取 2 小时前，HTTP 200</span>
              <span>· 展会名录 — 抓取 2 小时前，字段吻合 3/4</span>
              <span>· 招聘页 — 抓取 1 天前，判断为经销商</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">验证</span>
              <span>规则版本 v1 · 结论 {row[4] === 'pass' ? '通过' : row[4] === 'fail' ? '不通过' : '需复核'}</span>
              <span className="text-xs text-muted-foreground">
                注意：验证通过只代表「公开信息一致」，不代表邮箱可送达；MX 只作弱信号。
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled title="原型：不写库">通过并入库</Button>
              <Button size="sm" variant="outline" disabled>拒绝</Button>
              <Button size="sm" variant="outline" disabled>合并到已有公司</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ 客户列表 */

const ACCOUNTS = [
  ['Nordwind Energie GmbH', '王倩', '客户', '3 天前', '有邮箱'],
  ['SunPeak Solar Trading', '李强', '潜在客户', '7 天前', '无邮箱'],
  ['Gulf EPC Contracting', '陈默', '客户', '1 天前', '有邮箱'],
  ['Harborview Analytics', '王倩', '逾期未联系', '21 天前', '有邮箱'],
]

function AccountsSection() {
  const { state, switcher } = useDemoState()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">客户列表</h2>
        {switcher}
      </div>
      <StateBanner state={state} />
      {state === 'empty' ? (
        <PrototypeNotice>还没有客户。去「候选审核」通过一条，或导入名单。</PrototypeNotice>
      ) : (
        <Card>
          <CardContent className="p-0">
            <DataTable entityId="crm_prototype:account" extensionTableId="crm_prototype.accounts" sortable={false} data={ACCOUNTS.map(([name,owner,stage,last,reachable])=>({id:name,name,owner,stage,last,reachable}))} columns={[
              {accessorKey:'name',header:'公司'},{accessorKey:'owner',header:'归属'},{accessorKey:'stage',header:'阶段'},{accessorKey:'last',header:'最后触达'},
              {id:'reachable',header:'可触达',cell:({row})=><Badge tone={row.original.reachable==='有邮箱'?'success':'neutral'}>{row.original.reachable}</Badge>},
            ]} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ 客户详情 */

function AccountDetailSection() {
  const { state, switcher } = useDemoState()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Nordwind Energie GmbH</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            nordwind-energie.de · 德国 · 归属 王倩 · 客户 · 来源：候选入库（2026-11-06）
          </p>
        </div>
        <div className="flex items-center gap-2">
          {switcher}
          <Button size="sm" disabled title="原型：不发送">写邮件</Button>
        </div>
      </div>
      <StateBanner state={state} />
      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">资料</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <span>关系健康度：良好</span>
            <span>续约季度：一季度</span>
            <span>竞争风险：中</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">时间线</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <span>11-08 助手提交候选（证据 3 条）</span>
            <span>11-08 审核通过，写入 CRM</span>
            <span>11-07 抓取官网首页</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">助手建议</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <Badge tone="info">AI 建议 · 需人工确认</Badge>
            <span>该公司近 30 天有 2 条招聘，判断在扩产，建议以「交期」切入。</span>
            <span className="text-xs text-muted-foreground">建议不自动执行；发送必须走审批。</span>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ 邮件草稿审批 */

function DraftsSection() {
  const [state, setState] = React.useState('ready')
  const options = [
    { id: 'ready', label: '待审批' },
    { id: 'approved', label: '已批准' },
    { id: 'sent', label: '已发送' },
    { id: 'unknown', label: '发送未知' },
    { id: 'superseded', label: '已失效' },
    { id: 'error', label: '错误' },
  ]
  const copy: Record<string, string> = {
    unknown: '发送状态未知：provider 超时。先查询，不重发——重发会造成同一收件人收到两封。',
    superseded: '正文已修改，原审批失效。必须重新审批后才能发送。',
    error: '加载失败：无法连接服务器，请检查网络后重试。',
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">邮件草稿审批</h2>
        <StateSwitcher value={state} onChange={setState} options={options} />
      </div>
      {copy[state] ? (
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm">{copy[state]}</div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="h-fit">
          <CardContent className="p-0">
            <DataTable entityId="crm_prototype:draft" extensionTableId="crm_prototype.drafts" sortable={false} data={[
              {id:'1',recipient:'marta@nordwind-energie.de',status:'待审批'},
              {id:'2',recipient:'omar@gulf-epc.ae',status:'已发送'},
              {id:'3',recipient:'an@sunpeaksolar.vn',status:'已失效'},
            ]} columns={[
              {accessorKey:'recipient',header:'收件人'},
              {id:'status',header:'状态',cell:({row})=><Badge tone={row.original.status==='待审批'?'warning':row.original.status==='已发送'?'success':'neutral'}>{row.original.status}</Badge>},
            ]} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">主题：关于 2027 年储能逆变器供货合作</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p className="text-xs text-muted-foreground">
              收件人 marta@nordwind-energie.de · 模板 v3 · 正文 hash 7f3c…a1 · 由 王倩 发起
            </p>
            <p>您好 Marta，我们提供 3–6kW 户用储能逆变器，交期 25 天，支持德语说明书。若贵司 2027 年有采购计划，我可以先寄样机。</p>
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              审批门：批准时绑定正文 hash。<strong className="font-medium text-foreground">正文 / 收件人 / 附件任一变化 → 审批失效，必须重批。</strong>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled title="原型：不发送">批准</Button>
              <Button size="sm" variant="outline" disabled>驳回</Button>
              <Button size="sm" variant="outline" disabled>撤销批准</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function PrototypeSection({ section }: { section: PrototypePageId }) {
  switch (section) {
    case 'home': return <HomeSection />
    case 'tasks': return <TasksSection />
    case 'candidates': return <CandidatesSection />
    case 'accounts': return <AccountsSection />
    case 'account-detail': return <AccountDetailSection />
    case 'drafts': return <DraftsSection />
    default: return null
  }
}
