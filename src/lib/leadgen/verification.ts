/**
 * Deterministic verification primitives for lead generation (M5).
 *
 * Everything here is a pure function over strings and small records: no I/O, no
 * database, no network. That is deliberate — the whole point of the verification step
 * is that the same input always produces the same verdict, so it can be replayed and
 * audited later.
 *
 * Rules encoded here (see docs/crm-platform/06-leadgen.md):
 * 1. Never invent a contact. No evidence URL means the candidate fails verification.
 * 2. MX is a weak signal. It can never make an address "deliverable"; at best it
 *    removes one reason to doubt.
 * 3. Role addresses (info@, sales@) are not personal contacts: needs review, not fail.
 * 4. Dedupe prefers the registrable domain, then a tax id, then name + country.
 */
import { createHash } from 'node:crypto'

const MULTI_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.cn', 'net.cn', 'org.cn', 'com.au',
  'net.au', 'org.au', 'co.jp', 'co.kr', 'com.hk', 'com.tw', 'com.sg', 'co.nz',
  'com.br', 'com.mx', 'com.tr', 'co.za', 'co.in', 'com.sa', 'com.ae',
])

const ROLE_LOCAL_PARTS = new Set([
  'info', 'sales', 'contact', 'admin', 'support', 'office', 'hello', 'enquiry',
  'enquiries', 'inquiry', 'inquiries', 'marketing', 'hr', 'jobs', 'careers',
  'service', 'billing', 'accounts', 'purchase', 'procurement', 'noreply', 'no-reply',
])

export type AddressKind = 'role' | 'personal' | 'unknown'

export type Evidence = {
  url: string
  fetchedAt: string
  /** Fields the extractor claims it read from the page. */
  fields: Partial<Record<'companyName' | 'domain' | 'contactName' | 'contactTitle' | 'email' | 'phone', string>>
}

export type CandidateInput = {
  companyName: string
  domain?: string | null
  country?: string | null
  taxId?: string | null
  contactName?: string | null
  contactTitle?: string | null
  email?: string | null
  phone?: string | null
  sourceUrl?: string | null
  evidence: Evidence[]
}

export type SignalCheck = {
  name: string
  result: 'ok' | 'weak' | 'missing' | 'conflict'
  detail?: string
}

export type Verification = {
  verdict: 'pass' | 'needs_review' | 'fail'
  reasons: string[]
  checks: SignalCheck[]
  /** Deliverability is never asserted here; the UI must show it as unknown. */
  deliverability: 'unknown'
  dedupeKey: string | null
}

/** Lowercase host part, strip protocol/path/port/userinfo and a leading www. */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null
  let value = String(input).trim().toLowerCase()
  if (!value) return null
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  value = value.replace(/^[^@/]*@/, '')
  value = value.split('/')[0]
  value = value.split(':')[0]
  value = value.replace(/\.+$/, '')
  if (!value || !value.includes('.')) return null
  const labels = value.split('.').filter(Boolean)
  if (labels.length < 2) return null
  const suffix2 = labels.slice(-2).join('.')
  const suffix3 = labels.slice(-3).join('.')
  if (MULTI_LABEL_SUFFIXES.has(suffix2)) {
    return labels.length >= 3 ? labels.slice(-3).join('.') : null
  }
  if (MULTI_LABEL_SUFFIXES.has(suffix3)) return suffix3
  return suffix2
}

/** Bare domain (no www, no scheme) used for comparison, keeping the full host. */
export function normalizeHost(input: string | null | undefined): string | null {
  if (!input) return null
  let value = String(input).trim().toLowerCase()
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  value = value.replace(/^[^@/]*@/, '')
  value = value.split('/')[0].split(':')[0].replace(/\.+$/, '')
  value = value.replace(/^www\./, '')
  return value.includes('.') ? value : null
}

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const value = String(email).trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null
  return value
}

export function emailHash(email: string | null | undefined): string | null {
  const normalized = normalizeEmail(email)
  if (!normalized) return null
  return createHash('sha256').update(normalized).digest('hex')
}

export function classifyAddress(email: string | null | undefined): AddressKind {
  const normalized = normalizeEmail(email)
  if (!normalized) return 'unknown'
  const local = normalized.split('@')[0]
  if (ROLE_LOCAL_PARTS.has(local)) return 'role'
  if (/^(info|sales|contact|admin|support|office)[.-]/.test(local)) return 'role'
  return 'personal'
}

/**
 * Company-level dedupe key. Priority: registrable domain, then tax id, then
 * normalized name + country. Null means "not enough to dedupe on" — the caller must
 * treat that as needs-review rather than inventing a key.
 */
export function companyDedupeKey(input: {
  domain?: string | null
  taxId?: string | null
  name?: string | null
  country?: string | null
}): string | null {
  const domain = normalizeDomain(input.domain)
  if (domain) return `d:${domain}`
  const taxId = String(input.taxId ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  const country = String(input.country ?? '').trim().toUpperCase()
  if (taxId.length >= 5) return `t:${country}:${taxId}`
  const name = String(input.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (name.length >= 2) return `n:${name}|${country}`
  return null
}

function domainsAgree(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return a === b
}

/**
 * Deterministic verification. Same input in, same verdict out — no clock, no network,
 * no randomness. `mxChecked` is passed in by the caller because doing DNS here would
 * make the function impure.
 */
export function verifyCandidate(candidate: CandidateInput, options: { mxChecked?: boolean } = {}): Verification {
  const checks: SignalCheck[] = []
  const reasons: string[] = []

  const evidence = Array.isArray(candidate.evidence) ? candidate.evidence : []
  checks.push({
    name: 'evidence_present',
    result: evidence.length > 0 ? 'ok' : 'missing',
    detail: `${evidence.length} 条`,
  })
  if (evidence.length === 0) reasons.push('没有证据链接：不允许入库，也不允许补造联系人')

  const company = candidate.companyName?.trim() ?? ''
  checks.push({ name: 'company_name', result: company.length >= 2 ? 'ok' : 'missing' })
  if (company.length < 2) reasons.push('公司名缺失')

  const domain = normalizeDomain(candidate.domain)
  const host = normalizeHost(candidate.domain)
  checks.push({ name: 'domain', result: domain ? 'ok' : 'missing', detail: domain ?? undefined })
  if (!domain) reasons.push('没有可用域名：只能按名称+国家去重，需人工确认')

  const sourceHost = normalizeHost(candidate.sourceUrl)
  const domainAgrees = domainsAgree(host, sourceHost)
  checks.push({
    name: 'source_domain',
    result: domainAgrees ? 'ok' : host && sourceHost ? 'conflict' : 'missing',
    detail: sourceHost ? `来源 ${sourceHost}` : undefined,
  })
  if (host && sourceHost && !domainAgrees) reasons.push('官网域名与来源页域名不一致，需人工核对')

  const email = normalizeEmail(candidate.email)
  const emailKind = classifyAddress(email)
  if (email) {
    const emailEvidenced = evidence.some((e) => Object.values(e.fields ?? {}).some((v) => normalizeEmail(v) === email))
    checks.push({
      name: 'email_evidence',
      result: emailEvidenced ? 'ok' : 'weak',
      detail: emailEvidenced ? undefined : '抓取到的证据里没有这个邮箱',
    })
    if (!emailEvidenced) reasons.push('邮箱不在证据里：可能是推断出来的，需人工确认')
  } else {
    checks.push({ name: 'email_evidence', result: 'missing' })
  }

  checks.push({ name: 'address_kind', result: emailKind === 'role' ? 'weak' : 'ok', detail: emailKind })
  if (emailKind === 'role') reasons.push('角色邮箱（info@/sales@ 这类）：不是个人联系人，需人工判断')

  // MX is recorded but deliberately cannot upgrade the verdict on its own.
  checks.push({
    name: 'mx',
    result: options.mxChecked ? 'weak' : 'missing',
    detail: options.mxChecked ? 'MX 只说明域名收信配置存在，不是邮箱存在或可送达的证明' : undefined,
  })

  let verdict: Verification['verdict']
  if (!company || evidence.length === 0) verdict = 'fail'
  else if (reasons.length > 0) verdict = 'needs_review'
  else verdict = 'pass'

  return {
    verdict,
    reasons,
    checks,
    deliverability: 'unknown',
    dedupeKey: companyDedupeKey({
      domain: candidate.domain,
      taxId: candidate.taxId,
      name: candidate.companyName,
      country: candidate.country,
    }),
  }
}

/**
 * "Can we email this company" is separate from "is the company valid": a company
 * without an address stays in the CRM. Suppression always wins, and MX never counts.
 */
export function canEmail(input: {
  email?: string | null
  suppressed?: boolean
  bounced?: boolean
  complained?: boolean
}): { reachable: boolean; reason: string } {
  if (input.suppressed) return { reachable: false, reason: '收件人被抑制（退订/投诉/退信）' }
  if (input.complained) return { reachable: false, reason: '曾投诉，永久抑制' }
  if (input.bounced) return { reachable: false, reason: '曾硬退信' }
  if (!normalizeEmail(input.email)) return { reachable: false, reason: '没有邮箱：公司可保留，但不可触达' }
  return { reachable: true, reason: '有邮箱且未被抑制；送达仍以实际回执为准' }
}
