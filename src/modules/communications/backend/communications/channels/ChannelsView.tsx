'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { planChannelDisconnect, planChannelReconnect } from '../../../lib/channel-actions'

type Availability = { available: boolean; code: string; hint: string }

type Channel = {
  id: string
  providerKey: string
  channelType: string
  displayName: string
  visibility: 'private' | 'shared'
  status: string | null
  externalIdentifier: string | null
  lastError: string | null
  availability: { inbound: Availability; outbound: Availability }
}

type Summary = { total: number; inboundUnavailable: number; outboundUnavailable: number }

function stateChip(availability: Availability) {
  const cls = availability.available
    ? 'border-status-success-border bg-status-success-bg text-status-success-text'
    : 'border-status-warning-border bg-status-warning-bg text-status-warning-text'
  return (
    <span className={`rounded border px-2 py-0.5 text-xs ${cls}`}>
      {availability.available ? '可用' : availability.code}
    </span>
  )
}

/**
 * Account list (design rev2 `F1-01` + `F8-05`).
 *
 * Rows carry the platform identity, ownership, lifecycle status and — the point of
 * F8-05 — an explicit can-receive / can-send state with an actionable hint, so a
 * channel that cannot receive is never mistaken for an empty inbox.
 */
export function ChannelsView() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionNote, setActionNote] = useState<{ id: string; ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/communications/me/channels', { headers: { accept: 'application/json' } })
      if (!response.ok) {
        setError(`账号列表加载失败（HTTP ${response.status}）`)
        return
      }
      const payload = (await response.json().catch(() => ({}))) as { items?: Channel[]; summary?: Summary }
      setChannels(Array.isArray(payload.items) ? payload.items : [])
      setSummary(payload.summary ?? null)
      setError(null)
    } catch {
      setError('账号列表加载失败：网络错误')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function disconnect(channel: Channel) {
    const plan = planChannelDisconnect({
      id: channel.id,
      visibility: channel.visibility,
      providerKey: channel.providerKey,
      displayName: channel.displayName,
    })
    if (!window.confirm(plan.warning)) return
    setBusyId(channel.id)
    setActionNote(null)
    try {
      const response = await fetch(plan.url, { method: plan.method })
      if (response.status === 403) {
        setActionNote({ id: channel.id, ok: false, text: `没有解除权限：需要 ${plan.permission}` })
        return
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        setActionNote({
          id: channel.id,
          ok: false,
          text: payload.error || `解除失败（HTTP ${response.status}）`,
        })
        return
      }
      setActionNote({ id: channel.id, ok: true, text: '已解除：历史消息保留，账号不再收发。' })
      await load()
    } catch (caught) {
      setActionNote({
        id: channel.id,
        ok: false,
        text: `解除失败：${caught instanceof Error ? caught.message : String(caught)}`,
      })
    } finally {
      setBusyId(null)
    }
  }

  function reconnect(channel: Channel) {
    const plan = planChannelReconnect({
      id: channel.id,
      visibility: channel.visibility,
      providerKey: channel.providerKey,
    })
    if (plan.kind === 'hub-profile') {
      setActionNote({ id: channel.id, ok: true, text: plan.note })
      return
    }
    window.location.assign(plan.href)
  }

  return (
    <div className="space-y-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">渠道账号</h1>
          <p className="text-xs text-muted-foreground">
            平台身份来自平台返回，不手填；「可收/可发」按账号状态与当前连接的适配器判定，不猜测平台网络。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void load()} className="rounded border px-3 py-1 text-xs">
            刷新
          </button>
          <Link href="/backend/communications/channels/connect" className="rounded border px-3 py-1 text-xs">
            连接渠道
          </Link>
        </div>
      </header>

      {summary ? (
        <p className="text-xs text-muted-foreground">
          共 {summary.total} 个账号；收不到信的 {summary.inboundUnavailable} 个，发不出去的 {summary.outboundUnavailable} 个。
        </p>
      ) : null}
      {loading ? <p className="text-xs text-muted-foreground">加载中…</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {!loading && !error && channels.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          还没有可用账号。管理员连接渠道后，这里会出现平台身份与收发状态。
        </p>
      ) : null}

      {channels.length > 0 ? (
        <DataTable<Channel>
          columns={[
            {
              id: 'account',
              header: '平台账号',
              cell: ({ row }) => (
                <div>
                  <div className="font-medium">{row.original.displayName || row.original.id.slice(0, 8)}</div>
                  <div className="text-muted-foreground">{row.original.providerKey}</div>
                </div>
              ),
            },
            {
              id: 'identifier',
              header: '身份',
              cell: ({ row }) => row.original.externalIdentifier ?? '—',
            },
            {
              id: 'visibility',
              header: '归属',
              cell: ({ row }) => (row.original.visibility === 'shared' ? '团队共享' : '个人'),
            },
            {
              id: 'status',
              header: '状态',
              cell: ({ row }) => row.original.status ?? '未连接',
            },
            {
              id: 'inbound',
              header: '可收',
              cell: ({ row }) => (
                <div>
                  {stateChip(row.original.availability.inbound)}
                  {!row.original.availability.inbound.available ? (
                    <div className="mt-1 text-muted-foreground">{row.original.availability.inbound.hint}</div>
                  ) : null}
                </div>
              ),
            },
            {
              id: 'outbound',
              header: '可发',
              cell: ({ row }) => (
                <div>
                  {stateChip(row.original.availability.outbound)}
                  {!row.original.availability.outbound.available ? (
                    <div className="mt-1 text-muted-foreground">{row.original.availability.outbound.hint}</div>
                  ) : null}
                </div>
              ),
            },
            {
              id: 'actions',
              header: '操作',
              cell: ({ row }) => {
                const channel = row.original
                return (
                  <div className="flex flex-col items-start gap-1">
                    <button type="button" onClick={() => reconnect(channel)} className="rounded border px-2 py-0.5">
                      重连 / 重新授权
                    </button>
                    <button
                      type="button"
                      onClick={() => void disconnect(channel)}
                      disabled={busyId === channel.id}
                      className="rounded border px-2 py-0.5 disabled:opacity-50"
                    >
                      {busyId === channel.id ? '解除中…' : '解除绑定'}
                    </button>
                    {actionNote?.id === channel.id ? (
                      <span className={`max-w-72 ${actionNote.ok ? 'text-muted-foreground' : 'text-destructive'}`}>
                        {actionNote.text}
                      </span>
                    ) : null}
                  </div>
                )
              },
            },
          ]}
          data={channels}
          emptyState={<p className="text-xs text-muted-foreground">还没有可用账号。</p>}
        />
      ) : null}
      {channels.some((channel) => channel.lastError) ? (
        <section className="rounded border border-dashed px-3 py-2 text-xs">
          <h2 className="font-medium">最近错误</h2>
          <ul className="mt-1 space-y-1">
            {channels
              .filter((channel) => channel.lastError)
              .map((channel) => (
                <li key={channel.id}>
                  {channel.displayName || channel.id.slice(0, 8)}：{channel.lastError}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
