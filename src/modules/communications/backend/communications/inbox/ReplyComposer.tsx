'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  attemptAfterResponse,
  decideAttempt,
  sendSuccessMessage,
  type SendAttempt,
} from '../../../lib/send-attempt'

type Mode = 'text' | 'media' | 'template'

const MEDIA_KINDS = ['image', 'video', 'audio', 'document'] as const

/**
 * Web inbox reply box: text, a public media link, or a WhatsApp template.
 *
 * Kept thin so web and Android share one BFF. The three modes map exactly onto
 * what the server accepts today: free-form text, a media link (the API does not
 * upload bytes for the web yet, and Messenger is link-only anyway), and a
 * template name+language for a conversation outside the 24h window.
 */
export function ReplyComposer(props: {
  channelId: string
  to: string
  subject: string
  parentMessageId?: string | null
  /** Inbox conversation id; lets the server reject a parent from another thread. */
  threadId?: string | null
  channelType: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('text')
  const [text, setText] = useState('')
  const [mediaKind, setMediaKind] = useState<(typeof MEDIA_KINDS)[number]>('image')
  const [mediaLink, setMediaLink] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateLanguage, setTemplateLanguage] = useState('zh_CN')
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState<{ok: boolean; message: string} | null>(null)
  const [attempt, setAttempt] = useState<SendAttempt | null>(null)

  const whatsapp = props.channelType.toLowerCase() === 'whatsapp'

  function signature(): string {
    return JSON.stringify({
      mode,
      text,
      mediaKind,
      mediaLink,
      templateName,
      templateLanguage,
      to: props.to,
      subject: props.subject,
      parentMessageId: props.parentMessageId ?? null,
      threadId: props.threadId ?? null,
    })
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const body = text.trim()
    if (mode === 'text' && !body) return
    if (mode === 'media' && !mediaLink.trim()) return
    if (mode === 'template' && !templateName.trim()) return
    const decision = decideAttempt(attempt, signature(), () => crypto.randomUUID())
    if ('blocked' in decision) {
      setStatus({ok: false, message: decision.blocked})
      return
    }
    setAttempt(decision.attempt)
    setPending(true)
    setStatus(null)
    try {
      const payload: Record<string, unknown> = {
        channelId: props.channelId,
        to: [props.to],
        subject: props.subject || 'Reply',
        body: {plain: body || (mode === 'template' ? `模板 ${templateName.trim()}` : '')},
        ...(props.parentMessageId ? {parentMessageId: props.parentMessageId} : {}),
        ...(props.threadId ? {threadId: props.threadId} : {}),
        clientRequestId: decision.clientRequestId,
      }
      if (mode === 'media') {
        payload.media = {kind: mediaKind, link: mediaLink.trim()}
      }
      if (mode === 'template') {
        payload.template = {name: templateName.trim(), language: templateLanguage.trim() || 'zh_CN'}
      }
      const response = await fetch('/api/communications/me/send', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(payload),
      })
      const answer = (await response.json().catch(() => ({}))) as {
        code?: string
        error?: string
        replayed?: boolean
        ledgerRecorded?: boolean
      }
      if (response.ok) {
        setAttempt(null)
        setText('')
        setMediaLink('')
        setTemplateName('')
        const success = sendSuccessMessage(answer)
        setStatus({ ok: !success.attention, message: success.message })
        router.refresh()
        return
      }
      const outcome = attemptAfterResponse(response.status)
      if (outcome === 'clear') {
        setAttempt(null)
        setStatus({
          ok: false,
          message: [answer.code, answer.error].filter(Boolean).join(' · ') || `发送被拒绝（${response.status}）`,
        })
      } else if (outcome === 'keep-unknown') {
        setAttempt({...decision.attempt, unknown: true})
        setStatus({
          ok: false,
          message: `发送结果未知（HTTP ${response.status}）：${answer.error ?? answer.code ?? '无响应体'}。请勿修改内容，直接重试会复用同一 clientRequestId。`,
        })
      } else {
        setStatus({
          ok: false,
          message: `同一条回复可能仍在发送中（HTTP 409）：${answer.error ?? answer.code ?? ''}。稍后重试会取回原结果。`,
        })
      }
    } catch (error) {
      setAttempt({...decision.attempt, unknown: true})
      setStatus({
        ok: false,
        message: `网络错误：${error instanceof Error ? error.message : String(error)}。结果未知，请勿修改内容，直接重试会复用同一 clientRequestId。`,
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      {attempt?.unknown ? (
        <p className="rounded border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs text-amber-700">
          上一条发送结果未知：请保持内容不变后重试（复用同一 clientRequestId）；修改内容会被拒绝。
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 text-xs">
        {(
          [
            ['text', '文本'],
            ['media', '媒体链接'],
            ...(whatsapp ? ([['template', '模板']] as const) : []),
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value as Mode)}
            className={`rounded border px-2 py-1 ${mode === value ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto self-center text-muted-foreground">仅 WhatsApp 支持 media id 与模板；Messenger 媒体需公网链接</span>
      </div>

      {mode === 'media' ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={mediaKind}
            onChange={(event) => setMediaKind(event.target.value as (typeof MEDIA_KINDS)[number])}
            className="rounded border px-2 py-1 text-sm"
            aria-label="媒体类型"
          >
            {MEDIA_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
          <input
            type="url"
            value={mediaLink}
            onChange={(event) => setMediaLink(event.target.value)}
            placeholder="https://…（公网可访问的文件链接）"
            className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm"
            aria-label="媒体链接"
          />
        </div>
      ) : null}

      {mode === 'template' ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder="模板名，如 quote_followup"
            className="min-w-0 flex-1 rounded border px-3 py-1.5 text-sm"
            aria-label="模板名"
          />
          <input
            value={templateLanguage}
            onChange={(event) => setTemplateLanguage(event.target.value)}
            placeholder="语言，如 zh_CN"
            className="w-32 rounded border px-3 py-1.5 text-sm"
            aria-label="模板语言"
          />
        </div>
      ) : null}

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        maxLength={4000}
        placeholder={
          mode === 'template'
            ? '正文仅作会话记录，模板内容由平台发送'
            : `回复 ${props.to}（正文将以当前员工身份发出）`
        }
        className="w-full rounded border px-3 py-2 text-sm"
        aria-label="回复内容"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-50"
        >
          {pending ? '发送中…' : '发送回复'}
        </button>
        <span className="text-xs text-muted-foreground">服务端会再次校验归属、渠道能力与发送窗口</span>
      </div>
      {status ? (
        <p className={`text-xs ${status.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
          {status.message}
        </p>
      ) : null}
    </form>
  )
}
