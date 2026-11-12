'use client'

import { useCallback, useEffect, useState } from 'react'

type Note = {
  id: string
  body: string
  bodyFormat: string
  subject: string
  authorUserId: string
  threadId: string | null
  createdAt: string | null
}

/**
 * Internal notes panel for one inbox conversation (design rev2 `F3-06`).
 *
 * Notes are `messages.message` rows with `visibility: 'internal'` and no channel
 * link, so the delivery command treats them as internal-only and nothing reaches
 * the customer. Displayed in their own panel — deliberately not interleaved with
 * the customer thread — so a staff member can never mistake a note for a message
 * the customer received.
 *
 * Self-fetching because the inbox page is a server component whose detail payload
 * is the customer conversation; mixing a second staff-only source into it would
 * blur that boundary.
 */
export function InternalNotes(props: { threadId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/communications/me/threads/${props.threadId}/notes`, {
        headers: { accept: 'application/json' },
      })
      if (!response.ok) {
        setError(`备注加载失败（HTTP ${response.status}）`)
        return
      }
      const payload = (await response.json().catch(() => ({}))) as { items?: Note[] }
      setNotes(Array.isArray(payload.items) ? payload.items : [])
      setError(null)
    } catch {
      setError('备注加载失败：网络错误')
    } finally {
      setLoaded(true)
    }
  }, [props.threadId])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = text.trim()
    if (!body || pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/communications/me/threads/${props.threadId}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string }
        setError([payload.code, payload.error].filter(Boolean).join(' · ') || `备注保存失败（HTTP ${response.status}）`)
        return
      }
      setText('')
      await load()
    } catch (caught) {
      setError(`备注保存失败：${caught instanceof Error ? caught.message : String(caught)}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="mt-3 rounded border border-dashed px-3 py-2" aria-label="内部备注">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-medium">内部备注</h3>
        <span className="text-xs text-muted-foreground">仅内部可见，客户与平台都收不到</span>
      </div>
      {loaded && notes.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">还没有备注。写给同事看的线索、承诺和风险放在这里。</p>
      ) : null}
      {notes.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {notes.map((note) => (
            <li key={note.id} className="rounded bg-amber-500/10 px-2 py-1 text-xs">
              <p className="whitespace-pre-wrap break-words">{note.body}</p>
              <p className="mt-1 text-muted-foreground">
                {note.authorUserId.slice(0, 8)} · {note.createdAt ? new Date(note.createdAt).toLocaleString('zh-CN', { hour12: false }) : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={submit} className="mt-2 space-y-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="内部备注（不会发送给客户）"
          aria-label="内部备注内容"
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded border px-3 py-1 text-xs disabled:opacity-50"
          >
            {pending ? '保存中…' : '保存备注'}
          </button>
          {error ? <span className="text-xs text-red-700 dark:text-red-300">{error}</span> : null}
        </div>
      </form>
    </section>
  )
}
