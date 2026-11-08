import {
  canEmail,
  classifyAddress,
  companyDedupeKey,
  emailHash,
  normalizeDomain,
  normalizeEmail,
  verifyCandidate,
  type CandidateInput,
} from '../verification'

const complete: CandidateInput = {
  companyName: 'Nordwind Energie GmbH',
  domain: 'https://www.nordwind-energie.de/impressum',
  country: 'DE',
  email: 'marta@nordwind-energie.de',
  sourceUrl: 'https://nordwind-energie.de/team',
  evidence: [
    {
      url: 'https://nordwind-energie.de/team',
      fetchedAt: '2026-11-08T10:00:00Z',
      fields: { companyName: 'Nordwind Energie GmbH', email: 'Marta@Nordwind-Energie.de' },
    },
  ],
}

describe('normalizeDomain', () => {
  it('strips scheme, www, path and port', () => {
    expect(normalizeDomain('https://www.Example.COM:8443/a/b?c=1')).toBe('example.com')
    expect(normalizeDomain('example.co.uk')).toBe('example.co.uk')
  })

  it('returns null for a single label or empty input', () => {
    expect(normalizeDomain('localhost')).toBeNull()
    expect(normalizeDomain('')).toBeNull()
    expect(normalizeDomain(null)).toBeNull()
  })

  it('keeps the registrable domain for known multi-label suffixes', () => {
    expect(normalizeDomain('shop.example.com.cn')).toBe('example.com.cn')
    expect(normalizeDomain('a.b.example.co.uk')).toBe('example.co.uk')
  })
})

describe('email helpers', () => {
  it('normalizes case and whitespace and rejects malformed input', () => {
    expect(normalizeEmail('  Marta@Example.DE ')).toBe('marta@example.de')
    expect(normalizeEmail('not-an-email')).toBeNull()
  })

  it('hashes deterministically and case-insensitively', () => {
    expect(emailHash('Marta@Example.de')).toBe(emailHash('marta@example.de'))
    expect(emailHash('marta@example.de')).toMatch(/^[a-f0-9]{64}$/)
    expect(emailHash('bad')).toBeNull()
  })

  it('classifies role addresses separately from people', () => {
    expect(classifyAddress('info@example.com')).toBe('role')
    expect(classifyAddress('sales.uk@example.com')).toBe('role')
    expect(classifyAddress('marta@example.com')).toBe('personal')
    expect(classifyAddress(null)).toBe('unknown')
  })
})

describe('companyDedupeKey', () => {
  it('prefers the registrable domain', () => {
    expect(companyDedupeKey({ domain: 'https://www.acme.de/x', name: 'Acme', country: 'DE' })).toBe('d:acme.de')
  })

  it('falls back to a tax id when there is no domain', () => {
    expect(companyDedupeKey({ taxId: 'DE 811 907 980', name: 'Acme', country: 'DE' })).toBe('t:DE:de811907980')
  })

  it('falls back to name + country, and refuses to invent a key', () => {
    expect(companyDedupeKey({ name: 'Acme  GmbH ', country: 'de' })).toBe('n:acme gmbh|DE')
    expect(companyDedupeKey({ name: '', country: 'DE' })).toBeNull()
  })
})

describe('verifyCandidate', () => {
  it('fails hard when there is no evidence — contacts must not be invented', () => {
    const result = verifyCandidate({ ...complete, evidence: [] })
    expect(result.verdict).toBe('fail')
    expect(result.reasons.join()).toContain('不允许补造')
  })

  it('passes a fully evidenced candidate', () => {
    const result = verifyCandidate(complete)
    expect(result.verdict).toBe('pass')
    expect(result.reasons).toHaveLength(0)
  })

  it('never claims deliverability, even with MX', () => {
    const result = verifyCandidate(complete, { mxChecked: true })
    expect(result.deliverability).toBe('unknown')
    expect(result.checks.find((c) => c.name === 'mx')?.result).toBe('weak')
  })

  it('does not let MX rescue a candidate without evidence', () => {
    const result = verifyCandidate({ ...complete, evidence: [] }, { mxChecked: true })
    expect(result.verdict).toBe('fail')
  })

  it('marks an email that is absent from the evidence as needs-review, not pass', () => {
    const result = verifyCandidate({ ...complete, email: 'guessed@nordwind-energie.de' })
    expect(result.verdict).toBe('needs_review')
    expect(result.reasons.join()).toContain('邮箱不在证据里')
  })

  it('treats a role address as needs-review', () => {
    const withRole: CandidateInput = {
      ...complete,
      email: 'info@nordwind-energie.de',
      evidence: [
        {
          url: 'https://nordwind-energie.de/team',
          fetchedAt: '2026-11-08T10:00:00Z',
          fields: { email: 'info@nordwind-energie.de' },
        },
      ],
    }
    expect(verifyCandidate(withRole).verdict).toBe('needs_review')
  })

  it('flags a source page on a different domain as a conflict', () => {
    const result = verifyCandidate({ ...complete, sourceUrl: 'https://some-directory.example/list/123' })
    expect(result.checks.find((c) => c.name === 'source_domain')?.result).toBe('conflict')
    expect(result.verdict).toBe('needs_review')
  })

  it('is deterministic: identical input yields identical output', () => {
    const a = verifyCandidate(complete)
    const b = verifyCandidate(JSON.parse(JSON.stringify(complete)))
    expect(a).toEqual(b)
    expect(a.dedupeKey).toBe('d:nordwind-energie.de')
  })
})

describe('canEmail', () => {
  it('keeps a company without an address but marks it unreachable', () => {
    expect(canEmail({ email: null })).toEqual({ reachable: false, reason: '没有邮箱：公司可保留，但不可触达' })
  })

  it('lets suppression and complaints win over a valid address', () => {
    expect(canEmail({ email: 'a@b.de', suppressed: true }).reachable).toBe(false)
    expect(canEmail({ email: 'a@b.de', complained: true }).reachable).toBe(false)
    expect(canEmail({ email: 'a@b.de', bounced: true }).reachable).toBe(false)
    expect(canEmail({ email: 'a@b.de' }).reachable).toBe(true)
  })
})
