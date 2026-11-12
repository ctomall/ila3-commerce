'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

type Customer = {
  id: string
  displayName: string
  kind: string
  primaryEmail: string | null
  primaryPhone: string | null
}

/**
 * Conversation ↔ customer link (design rev2 `F4-01`).
 *
 * Reads the linked customer plus candidates from the installed customers module
 * (`/threads/[id]/customer`), and links/unlinks through the same endpoint. The
 * endpoint enforces `customers.people.view` / `.manage`, so a caller without the
 * grant sees the server's refusal rather than a silently empty list.
 */
export function CustomerLink(props: { threadId: string }) {
  const router = useRouter()
  const [linked, setLinked] = useState<Customer | null>(null)
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<Customer[]>([])
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (term: string) => {
      const suffix = term.trim().length >= 2 ? `?q=${encodeURIComponent(term.trim())}` : ''
      try {
        const response = await fetch(`/api/communications/me/threads/${props.threadId}/customer${suffix}`, {
          headers: { accept: 'application/json' },
        })
        if (response.status === 403) {
          setError('没有客户查看权限（需要 customers.people.view）')
          setCandidates([])
          return
        }
        if (!response.ok) {
          setError(`客户信息加载失败（HTTP ${response.status}）`)
          return
        }
        const payload = (await response.json().catch(() => ({}))) as {
          linked?: Customer | null
          candidates?: Customer[]
        }
        setLinked(payload.linked ?? null)
        setCandidates(Array.isArray(payload.candidates) ? payload.candidates : [])
        setError(null)
      } catch {
        setError('客户信息加载失败：网络错误')
      } finally {
        setLoaded(true)
      }
    },
    [props.threadId],
  )

  useEffect(() => {
    void load('')
  }, [load])

  async function apply(customerId: string | null) {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/communications/me/threads/${props.threadId}/customer`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerId }),
      })
      if (response.status === 403) {
        setError('没有关联客户的权限（需要 customers.people.manage）')
        return
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; code?: string }
        setError([payload.code, payload.error].filter(Boolean).join(' · ') || `保存失败（HTTP ${response.status}）`)
        return
      }
      setQuery('')
      await load('')
      router.refresh()
    } catch (caught) {
      setError(`保存失败：${caught instanceof Error ? caught.message : String(caught)}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mt-2 rounded border border-dashed px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {linked ? `已关联：${linked.displayName || linked.id.slice(0, 8)}` : '未关联客户'}
        </span>
        {linked ? (
          <button
            type="button"
            onClick={() => void apply(null)}
            disabled={pending}
            className="rounded border px-2 py-0.5 disabled:opacity-50"
          >
            解除关联
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            void load(event.target.value)
          }}
          placeholder="按姓名/邮箱/电话搜索（至少 2 个字符）"
          aria-label="搜索客户"
          className="min-w-0 flex-1 rounded border px-2 py-1"
        />
      </div>
      {candidates.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {candidates.map((candidate) => (
            <li key={candidate.id} className="flex flex-wrap items-center gap-2">
              <span className="flex-1 truncate">
                {candidate.displayName || candidate.id.slice(0, 8)}
                {candidate.primaryEmail ? ` · ${candidate.primaryEmail}` : ''}
                {candidate.primaryPhone ? ` · ${candidate.primaryPhone}` : ''}
              </span>
              <button
                type="button"
                onClick={() => void apply(candidate.id)}
                disabled={pending || linked?.id === candidate.id}
                className="rounded border px-2 py-0.5 disabled:opacity-50"
              >
                {linked?.id === candidate.id ? '已关联' : '关联'}
              </button>
            </li>
          ))}
        </ul>
      ) : loaded && query.trim().length >= 2 && !error ? (
        <p className="mt-2 text-muted-foreground">没有匹配的客户。可先到客户模块新建，再回来关联。</p>
      ) : null}
      {error ? <p className="mt-2 text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  )
}
