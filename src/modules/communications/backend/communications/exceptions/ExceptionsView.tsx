'use client'

import { useCallback, useEffect, useState } from 'react'

type Reconciliation = { outcome: string; note: string; operatorUserId: string; at: string }

type DeadLetter = {
  id: string
  channelId: string
  channelDisplayName: string
  providerKey: string
  errorClass: string
  errorMessage: string
  externalUid: string | null
  externalMessageId: string | null
  createdAt: string | null
}

type Row = {
  linkId: string
  messageId: string
  conversationId: string
  conversationLabel: string
  externalConversationId: string | null
  channelDisplayName: string
  providerKey: string
  channelType: string
  createdAt: string | null
  lastAttemptAt: string | null
  reconciliation: Reconciliation | null
}

const OUTCOMES: Array<{ value: 'confirmed-sent' | 'confirmed-not-sent'; label: string }> = [
  { value: 'confirmed-sent', label: '平台侧确认已发出' },
  { value: 'confirmed-not-sent', label: '平台侧确认未发出' },
]

/**
 * Unknown-result reconciliation (design rev2 `F8-03`).
 *
 * `unknown` means the platform may or may not have the message, so it is never
 * retried automatically. This page records the human verdict the CLI writes, and
 * says plainly that it does not re-send and does not change the delivery status.
 */
export function ExceptionsView() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, { outcome: 'confirmed-sent' | 'confirmed-not-sent'; note: string }>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [deadLetters, setDeadLetters] = useState<DeadLetter[]>([])
  const [deadError, setDeadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/communications/me/reconciliation', {
        headers: { accept: 'application/json' },
      })
      if (response.status === 403) {
        setError('没有对账权限（需要 communication_channels.manage）')
        return
      }
      if (!response.ok) {
        setError(`待对账列表加载失败（HTTP ${response.status}）`)
        return
      }
      const payload = (await response.json().catch(() => ({}))) as { items?: Row[] }
      setRows(Array.isArray(payload.items) ? payload.items : [])
      setError(null)
    } catch {
      setError('待对账列表加载失败：网络错误')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadDeadLetters = useCallback(async () => {
    try {
      const response = await fetch('/api/communications/me/dead-letters', {
        headers: { accept: 'application/json' },
      })
      if (!response.ok) {
        setDeadError(`死信列表加载失败（HTTP ${response.status}）`)
        return
      }
      const payload = (await response.json().catch(() => ({}))) as { items?: DeadLetter[] }
      setDeadLetters(Array.isArray(payload.items) ? payload.items : [])
      setDeadError(null)
    } catch {
      setDeadError('死信列表加载失败：网络错误')
    }
  }, [])

  useEffect(() => {
    void load()
    void loadDeadLetters()
  }, [load, loadDeadLetters])

  async function submit(row: Row) {
    const draft = drafts[row.linkId] ?? { outcome: 'confirmed-sent' as const, note: '' }
    if (busy) return
    setBusy(row.linkId)
    setError(null)
    try {
      const response = await fetch('/api/communications/me/reconciliation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ linkId: row.linkId, outcome: draft.outcome, note: draft.note }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string }
        setError([payload.code, payload.error].filter(Boolean).join(' · ') || `记录失败（HTTP ${response.status}）`)
        return
      }
      await load()
    } catch (caught) {
      setError(`记录失败：${caught instanceof Error ? caught.message : String(caught)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4 p-6">
      <header>
        <h1 className="text-lg font-semibold">发送结果对账</h1>
        <p className="text-xs text-muted-foreground">
          这里只记录人工核实结论：不会重发、不会改发送状态。同一结果只接受一条结论，后续如需改判请走运维流程。
        </p>
      </header>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => void load()} className="rounded border px-3 py-1 text-xs">
          刷新
        </button>
        <span className="text-xs text-muted-foreground">待对账 {rows.length} 条</span>
      </div>
      {loading ? <p className="text-xs text-muted-foreground">加载中…</p> : null}
      {error ? <p className="text-xs text-red-700 dark:text-red-300">{error}</p> : null}
      {!loading && !error && rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">没有待对账的结果。发送结果未知的消息才会出现在这里。</p>
      ) : null}

      <section className="mt-6 space-y-2">
        <h2 className="text-sm font-semibold">入站死信</h2>
        <p className="text-xs text-muted-foreground">
          平台推来的消息/回执没能入库时留在这里。只展示失败信息，不展示抓取的原始报文；需要重放请走运维。
        </p>
        <button type="button" onClick={() => void loadDeadLetters()} className="rounded border px-3 py-1 text-xs">
          刷新死信
        </button>
        {deadError ? <p className="text-xs text-red-700 dark:text-red-300">{deadError}</p> : null}
        {!deadError && deadLetters.length === 0 ? (
          <p className="text-xs text-muted-foreground">没有死信。</p>
        ) : null}
        {deadLetters.length > 0 ? (
          <ul className="space-y-1 text-xs">
            {deadLetters.map((letter) => (
              <li key={letter.id} className="rounded border px-2 py-1">
                <span className="font-medium">{letter.channelDisplayName || letter.providerKey}</span>
                {' · '}
                <span>{letter.errorClass}</span>
                {' · '}
                <span className="text-muted-foreground">
                  {letter.createdAt ? new Date(letter.createdAt).toLocaleString('zh-CN', { hour12: false }) : '时间未知'}
                </span>
                <p className="mt-1 break-words text-muted-foreground">{letter.errorMessage}</p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {rows.map((row) => {
        const draft = drafts[row.linkId] ?? { outcome: 'confirmed-sent' as const, note: '' }
        return (
          <section key={row.linkId} className="rounded border px-3 py-3 text-xs">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-medium">{row.conversationLabel}</p>
                <p className="text-muted-foreground">
                  {row.channelDisplayName || row.providerKey} · {row.externalConversationId ?? row.conversationId} ·{' '}
                  {row.createdAt ? new Date(row.createdAt).toLocaleString('zh-CN', { hour12: false }) : '时间未知'}
                </p>
              </div>
              <span className="rounded border border-amber-600/40 bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
                结果未知
              </span>
            </div>
            {row.reconciliation ? (
              <p className="mt-2 rounded bg-muted/40 px-2 py-1">
                已记录：{row.reconciliation.outcome === 'confirmed-sent' ? '已发出' : '未发出'} ·{' '}
                {row.reconciliation.note} · {row.reconciliation.at}
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  {OUTCOMES.map((outcome) => (
                    <label key={outcome.value} className="flex items-center gap-1">
                      <input
                        type="radio"
                        name={`outcome-${row.linkId}`}
                        checked={draft.outcome === outcome.value}
                        onChange={() =>
                          setDrafts((current) => ({
                            ...current,
                            [row.linkId]: { ...draft, outcome: outcome.value },
                          }))
                        }
                      />
                      {outcome.label}
                    </label>
                  ))}
                </div>
                <textarea
                  value={draft.note}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [row.linkId]: { ...draft, note: event.target.value },
                    }))
                  }
                  rows={2}
                  maxLength={2000}
                  placeholder="核实依据（至少 8 个字符）：在哪查到的、平台返回了什么"
                  aria-label="核实依据"
                  className="w-full rounded border px-2 py-1"
                />
                <button
                  type="button"
                  onClick={() => void submit(row)}
                  disabled={busy === row.linkId}
                  className="rounded border px-3 py-1 disabled:opacity-50"
                >
                  {busy === row.linkId ? '记录中…' : '记录结论'}
                </button>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
