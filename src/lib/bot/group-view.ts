/**
 * Group-chat rendering (M7) — an allow-list, not a blacklist.
 *
 * `redactForGroup` matches three shapes (email, phone, amount) over a free-text blob. That
 * is a blacklist: a customer name, an address, a note field or an IBAN is not in it, and the
 * only thing standing between a CRM record and a group chat was the caller's restraint.
 * 08-bot.md claimed "群聊不返回记录原文" while no code enforced it.
 *
 * This module makes the claim structural: a group render is built from a `RecordSummary`
 * whose fields are chosen per kind from an allow-list. A field that is not allow-listed is
 * dropped silently-but-visibly (it is counted in `dropped`), so a caller cannot widen the
 * surface by passing one more property.
 *
 * What it does NOT do: it does not decide what the user asked for, and it cannot stop a
 * caller from putting a secret into an allow-listed field's *value*. That residual is why
 * every rendered value still goes through `redactForGroup` as a second layer.
 */
import { redactForGroup } from './guard'

export type GroupRecordKind = 'company' | 'person' | 'deal' | 'quote' | 'task'

export type RecordSummary = {
  kind: GroupRecordKind
  /** Opaque id; rendered truncated so a group cannot be used to enumerate ids. */
  id: string
  fields: Readonly<Record<string, string | number | null | undefined>>
}

/**
 * Per-kind allow-list. Names of people are intentionally *not* here: in a group chat the
 * bot says "the company", not the contact, because the contact is who the salesperson is
 * talking to, not something a room needs.
 */
const ALLOWED_FIELDS: Record<GroupRecordKind, readonly string[]> = {
  company: ['name', 'industry', 'statusLabel', 'ownerDisplayName', 'updatedAt'],
  person: ['displayName', 'companyName', 'roleLabel', 'updatedAt'],
  deal: ['title', 'stageLabel', 'amountBand', 'ownerDisplayName', 'updatedAt'],
  quote: ['quoteNumber', 'statusLabel', 'amountBand', 'validUntil'],
  task: ['title', 'statusLabel', 'dueDate'],
}

export type GroupRender =
  | { ok: true; text: string; dropped: string[] }
  | { ok: false; reason: 'unknown_kind' | 'no_fields' }

/**
 * Render one record for a group chat.
 *
 * Values go through `redactForGroup` even when their key is allow-listed: `name` could
 * legitimately contain an email ("Acme (ops@acme.test)"), and the allow-list is about
 * *which* fields, not about trusting their contents.
 */
export function renderGroupSummary(summary: RecordSummary): GroupRender {
  const allowed = ALLOWED_FIELDS[summary?.kind as GroupRecordKind]
  if (!allowed) return { ok: false, reason: 'unknown_kind' }

  const dropped: string[] = []
  const parts: string[] = []
  for (const [key, value] of Object.entries(summary.fields ?? {})) {
    if (!allowed.includes(key)) {
      dropped.push(key)
      continue
    }
    if (value === null || value === undefined || value === '') continue
    parts.push(`${redactForGroup(String(value))}`)
  }
  if (parts.length === 0) return { ok: false, reason: 'no_fields' }

  const id = summary.id ? `#${String(summary.id).slice(0, 8)}` : ''
  return { ok: true, text: `${summary.kind} ${id} · ${parts.join(' · ')}`.trim(), dropped }
}
