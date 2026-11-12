import * as React from 'react'
import { headers } from 'next/headers'
import Link from 'next/link'
import { describeMedia, mediaHref } from '../../../lib/media'
import { ReplyComposer } from './ReplyComposer'
import { InternalNotes } from './InternalNotes'
import { InboxLiveRefresh } from './InboxLiveRefresh'
import { newestCursor } from '../../../lib/inbox-live'
import { pickReplyRecipient } from '../../../lib/reply-recipient'
import { deliveryStatusLabel } from '../../../lib/delivery-status'
import { loadErrorMessage, selfFetch } from '../../../lib/inbox-fetch'
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
  /** Linked platform message text, projected by the BFF (additive). */
  body: string | null
  /** Display text: sanitized plain text for html bodies, body otherwise. */
  bodyText: string | null
  bodyFormat: 'text' | 'markdown' | 'html' | null
  subject: string | null
  media: {kind: string; fileName?: string; mimeType?: string; externalId?: string; downloaded: boolean; attachmentId?: string; fileSize?: number} | null
}

type ThreadDetail = {
  conversation: { id: string; subject: string | null; externalConversationId: string; customer: ThreadRow['customer'] }
  channel: ThreadRow['channel'] & { status?: string | null }
  items: MessageRow[]
  /** Older-page cursor; absent when the window is already the oldest. */
  nextBefore?: string | null
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

/**
 * Server-rendered so the inbox is readable without client hydration: staff see
 * the customer, channel and source account on the first paint, and the detail
 * view is a plain link (?thread=<id>) rather than client state. Sending remains
 * a server-side API call owned by the BFF (capability/window gates included).
 */
export async function InboxView({
  selectedId: selectedIdProp,
  before = null,
  canReply = false,
}: {
  selectedId?: string | null
  /** Older-page cursor from the URL; null/absent means the newest window. */
  before?: string | null
  /** Resolved server-side with the same reply grants the send route enforces. */
  canReply?: boolean
}) {
  const headerStore = await headers()
  const cookie = headerStore.get('cookie') ?? ''
  const selectedId = selectedIdProp ?? null

  const listResult = await selfFetch<{ items: ThreadRow[] }>('/api/communications/me/threads', cookie)
  const threads = listResult.ok ? listResult.data.items ?? [] : []
  const detailQuery = before
    ? `?limit=100&before=${encodeURIComponent(before)}`
    : '?limit=100'
  const detailResult = selectedId
    ? await selfFetch<ThreadDetail>(`/api/communications/me/threads/${selectedId}/messages${detailQuery}`, cookie)
    : null
  const detail = detailResult?.ok ? detailResult.data : null
  const listError = listResult.ok ? null : listResult.status
  const detailError = detailResult && !detailResult.ok ? detailResult.status : null

  return (
    <Page>
      <PageBody>
        <div className="flex h-[calc(100vh-9rem)] min-h-[560px] gap-4">
          <aside className="flex w-[400px] shrink-0 flex-col rounded-lg border bg-card">
            <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
              <div>
                <h1 className="text-base font-semibold">全渠道收件箱</h1>
                <p className="text-xs text-muted-foreground">客户 · 渠道 · 来源账号</p>
              </div>
              <Link className="text-xs underline" href="/backend/communications/channels/connect">
                连接渠道
              </Link>
            </div>
            <ul className="divide-y overflow-y-auto">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <Link
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
                  </Link>
                </li>
              ))}
              {listError !== null ? (
                <li className="p-4 text-sm text-red-700 dark:text-red-300">{loadErrorMessage(listError, 'list')}</li>
              ) : threads.length === 0 ? (
                <li className="p-4 text-sm text-muted-foreground">没有可访问的会话。</li>
              ) : null}
            </ul>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card">
            {selectedId ? (
              <InboxLiveRefresh
                threadId={selectedId}
                after={newestCursor(detailResult && detailResult.ok ? detailResult.data.items : [])}
              />
            ) : null}
            {detailError !== null ? (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-red-700 dark:text-red-300">
                {loadErrorMessage(detailError, 'detail')}
              </div>
            ) : !detail ? (
              <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {selectedId ? '没有找到该会话。' : '选择左侧会话查看消息'}
              </div>
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
                        <span>{deliveryStatusLabel(item.deliveryStatus)}</span>
                        <span>{when(item.createdAt)}</span>
                      </div>
                      {item.subject ? (
                        <p className="mt-2 break-words text-sm font-medium text-foreground">{item.subject}</p>
                      ) : null}
                      {item.bodyText ?? item.body ? (
                        // Plain text only: channel HTML was sanitized and flattened
                        // server-side, so this never needs dangerouslySetInnerHTML.
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                          {item.bodyText ?? item.body}
                        </p>
                      ) : null}
                      <p className="mt-1 break-all text-xs text-muted-foreground">平台消息号：{item.externalMessageId}</p>
                      {item.media ? (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          {describeMedia(item.media)}
                          {mediaHref(item.media) ? (
                            <>
                              {' · '}
                              <a
                                className="underline"
                                href={mediaHref(item.media) as string}
                                target="_blank"
                                rel="noreferrer"
                              >
                                打开附件
                              </a>
                            </>
                          ) : (
                            <span className="text-muted-foreground">（附件尚未下载，渠道恢复后由媒体 Worker 拉取）</span>
                          )}
                        </p>
                      ) : null}
                    </article>
                  ))}
                  {detail.items.length === 0 ? <p className="text-sm text-muted-foreground">该会话暂无消息。</p> : null}
                </div>
                <div className="flex items-center justify-between border-t px-5 py-2 text-xs">
                  {detail.nextBefore ? (
                    <Link href={`/backend/communications/inbox/${selectedId}/before/${encodeURIComponent(detail.nextBefore)}`} className="text-primary underline-offset-2 hover:underline">
                      加载更早消息
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">已到最早</span>
                  )}
                  {before ? (
                    <Link href={`/backend/communications/inbox/${selectedId}`} className="text-primary underline-offset-2 hover:underline">
                      返回最新
                    </Link>
                  ) : null}
                </div>
                <footer className="border-t px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    回复身份：{detail.channel.displayName}（{detail.channel.visibility === 'shared' ? '团队共享渠道' : '个人渠道'}）· 服务端会再次校验归属与发送窗口
                  </p>
                  {!canReply ? (
                    <p className="mt-2 rounded border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      只读：当前账号没有回复权限（需要 communications.reply，或已授予的旧版连接权限）。可继续查看客户消息。
                    </p>
                  ) : ['whatsapp', 'messenger', 'email', 'imap', 'gmail'].includes(
                      (detail.channel.channelType ?? '').toLowerCase(),
                    ) ? (
                    <ReplyComposer
                      channelId={detail.channel.id}
                      to={pickReplyRecipient(detail.items, detail.conversation.externalConversationId)}
                      subject={detail.conversation.subject ?? ''}
                      channelType={detail.channel.channelType ?? ''}
                      parentMessageId={
                        [...detail.items].reverse().find((item) => item.direction === 'inbound')?.messageId ?? null
                      }
                      threadId={selectedId}
                    />
                  ) : null}
                  {canReply && selectedId ? <InternalNotes threadId={selectedId} /> : null}
                  {canReply ? (
                    <p className="mt-2 rounded border border-dashed px-3 py-2 text-xs text-muted-foreground">
                      {['whatsapp', 'messenger'].includes((detail.channel.channelType ?? '').toLowerCase())
                        ? '客服窗口内可直接回复文本；超出 24 小时窗口需改用已审核模板，服务端会返回 422 WINDOW_CLOSED 而不是让平台拒收。'
                        : '邮件渠道可在此回复文本；附件与模板选择器与 Android 共用同一 BFF。'}
                    </p>
                  ) : null}
                </footer>
              </>
            )}
          </section>
        </div>
      </PageBody>
    </Page>
  )
}
