'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

/**
 * Web inbox reply box.
 *
 * The web inbox could read a conversation but not answer it; the Android client
 * and the BFF already had the send path, so this component is deliberately thin:
 * it calls the same `POST /api/communications/me/send` with the cookie auth the
 * page already has, generates the clientRequestId (so a double click cannot send
 * twice), and shows the server's machine code verbatim on refusal — window
 * closed, reauth, unsupported recipient — instead of a generic failure.
 */
export function ReplyComposer(props: {
  channelId: string
  to: string
  subject: string
  parentMessageId?: string | null
}) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<{ok: boolean; message: string} | null>(null)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = text.trim()
    if (!body || pending) return
    setPending(true)
    setStatus(null)
    try {
      const response = await fetch('/api/communications/me/send', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          channelId: props.channelId,
          to: [props.to],
          subject: props.subject || 'Reply',
          body: {plain: body},
          ...(props.parentMessageId ? {parentMessageId: props.parentMessageId} : {}),
          clientRequestId: crypto.randomUUID(),
        }),
      })
      if (response.status === 202) {
        setText('')
        setStatus({ok: true, message: '已提交投递；平台回执到达后状态会更新。'})
        router.refresh()
      } else {
        const payload = (await response.json().catch(() => ({}))) as {
          code?: string
          error?: string
          lastInboundAt?: string | null
        }
        setStatus({
          ok: false,
          message: [payload.code, payload.error].filter(Boolean).join(' · ') || `发送被拒绝（${response.status}）`,
        })
      }
    } catch (error) {
      setStatus({ok: false, message: `网络错误：${error instanceof Error ? error.message : String(error)}`})
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        maxLength={4000}
        placeholder={`回复 ${props.to}（正文将以当前员工身份发出）`}
        className="w-full rounded border px-3 py-2 text-sm"
        aria-label="回复内容"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || text.trim().length === 0}
          className="rounded bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
        >
          {pending ? '发送中…' : '发送回复'}
        </button>
        <span className="text-xs text-muted-foreground">
          仅文本；附件/模板走 API（网页选择器在下一轮）
        </span>
      </div>
      {status ? (
        <p className={`text-xs ${status.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
          {status.message}
        </p>
      ) : null}
    </form>
  )
}
