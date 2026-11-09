import * as React from 'react'
import { headers } from 'next/headers'
import { describeMedia } from '../../../lib/media'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'

type ThreadRow = {
  id: string
  subject: string | null
  externalConversationId: string
  lastMessageAt: string | null
  customer: { id: string; displayName: string; kind: string } | null
  channel: { id: string; providerKey: string; channelType: string; displayName: string; visibility: string }
}

type MessageRow = {
  id: string
  direction: string
  externalMessageId: string
  senderIdentifier: string
  senderDisplayName: string | null
  messageId: string | null
  deliveryStatus: string | null
  createdAt: string
  media: {kind: string; fileName?: string; mimeType?: string; externalId?: string; downloaded: false} | null
}

type ThreadDetail = {
  conversation: { id: string; subject: string | null; externalConversationId: string; customer: ThreadRow['customer'] }
  channel: ThreadRow['channel'] & { status?: string | null }
  items: MessageRow[]
}

function customerLabel(customer: ThreadRow['customer'] | undefined): string {
  if (!customer) return '未关联客户'
  if (customer.displayName) return `客户：${customer.displayName}${customer.kind === 'company' ? '（公司）' : ''}`
  return `客户 ID：${customer.id.slice(0, 8)}`
}

function when(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false })
}

async function selfFetch<T>(path: string, cookie: string, host: string): Promise<T | null> {
  const response = await fetch(`http://${host}${path}`, { headers: { cookie }, cache: 'no-store' })
  if (!response.ok) return null
  return (await response.json()) as T
}

/**
 * Server-rendered so the inbox is readable without client hydration: staff see
 * the customer, channel and source account on the first paint, and the detail
 * view is a plain link (?thread=<id>) rather than client state. Sending remains
 * a server-side API call owned by the BFF (capability/window/G8 gates included).
 */
export async function InboxView({ selectedId: selectedIdProp }: { selectedId?: string | null }) {
  const headerStore = await headers()
  const host = headerStore.get('host') ?? '127.0.0.1:3100'
  const cookie = headerStore.get('cookie') ?? ''
  const selectedId = selectedIdProp ?? null

  const list = await selfFetch<{ items: ThreadRow[] }>('/api/communications/me/threads', cookie, host)
  const threads = list?.items ?? []
  const detail = selectedId
    ? await selfFetch<ThreadDetail>(`/api/communications/me/threads/${selectedId}/messages`, cookie, host)
    : null

  return (
    <Page>
      <PageBody>
        <div className="flex h-[calc(100vh-9rem)] min-h-[560px] gap-4">
          <aside className="flex w-[400px] shrink-0 flex-col rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h1 className="text-base font-semibold">全渠道收件箱</h1>
              <p className="text-xs text-muted-foreground">客户 · 渠道 · 来源账号</p>
            </div>
            <ul className="divide-y overflow-y-auto">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <a
                    className={`block px-4 py-3 hover:bg-muted/60 ${selectedId === thread.id ? 'bg-muted' : ''}`}
                    href={`/backend/communications/inbox/${encodeURIComponent(thread.id)}`}
                  >
                    <div className="truncate text-sm font-medium">{thread.subject || '(无主题)'}</div>
                    <div className={`truncate text-xs ${thread.customer?.displayName ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {customerLabel(thread.customer)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {thread.channel.displayName} · {thread.channel.visibility === 'shared' ? '团队共享' : '个人'}
                      {thread.lastMessageAt ? ` · ${when(thread.lastMessageAt)}` : ''}
                    </div>
                  </a>
                </li>
              ))}
              {threads.length === 0 ? <li className="p-4 text-sm text-muted-foreground">没有可访问的会话。</li> : null}
            </ul>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card">
            {!detail ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">选择左侧会话查看消息</div>
            ) : (
              <>
                <header className="border-b px-5 py-3">
                  <h2 className="text-base font-semibold">{detail.conversation.subject || '(无主题)'}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {customerLabel(detail.conversation.customer)} · {detail.channel.displayName} ·{' '}
                    {detail.channel.visibility === 'shared' ? '团队共享' : '个人'} · 外部会话 {detail.conversation.externalConversationId}
                  </p>
                </header>
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {detail.items.map((item) => (
                    <article
                      key={item.id}
                      className={`max-w-[85%] rounded-lg border p-3 ${item.direction === 'inbound' ? 'bg-muted/40' : 'ml-auto bg-primary/5'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {item.direction === 'inbound' ? `客户 · ${item.senderDisplayName ?? item.senderIdentifier}` : '我方发出'}
                        </span>
                        <span>{item.deliveryStatus ?? '—'}</span>
                        <span>{when(item.createdAt)}</span>
                      </div>
                      <p className="mt-1 break-all text-xs text-muted-foreground">平台消息号：{item.externalMessageId}</p>
                      {item.media ? (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          {describeMedia(item.media)}（媒体下载待 G3，不在本切片伪造本地文件）
                        </p>
                      ) : null}
                    </article>
                  ))}
                  {detail.items.length === 0 ? <p className="text-sm text-muted-foreground">该会话暂无消息。</p> : null}
                </div>
                <footer className="border-t px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    回复身份：{detail.channel.displayName}（{detail.channel.visibility === 'shared' ? '团队共享渠道' : '个人渠道'}）· 服务端会再次校验归属与发送窗口
                  </p>
                  <p className="mt-2 rounded border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    {['whatsapp', 'messenger'].includes((detail.channel.channelType ?? '').toLowerCase())
                      ? '当前渠道出站需上游 provider-native recipient（G8）：服务端会返回 422 OUTBOUND_RECIPIENT_UNSUPPORTED，不会假装已发送。'
                      : '邮件渠道可在 Android 收件箱回复；网页回复输入将在下一轮接入同一 BFF。'}
                  </p>
                </footer>
              </>
            )}
          </section>
        </div>
      </PageBody>
    </Page>
  )
}
