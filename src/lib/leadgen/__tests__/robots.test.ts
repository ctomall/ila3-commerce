import { describe, expect, it } from '@jest/globals'
import { checkRobots, isAllowed, parseRobots } from '../robots'

const UA = 'ILA3-Research/1.0 (+https://mercato.ila3.top/bot)'

describe('parseRobots', () => {
  it('returns no groups for empty or missing text', () => {
    expect(parseRobots('').groups).toHaveLength(0)
    expect(parseRobots(null).groups).toHaveLength(0)
  })

  it('groups agents with their rules and ignores comments and blank lines', () => {
    const parsed = parseRobots(`
# leading comment
User-agent: *
Disallow: /private

User-agent: BadBot
Disallow: /
`)
    expect(parsed.groups).toHaveLength(2)
    expect(parsed.groups[0]).toEqual({ agents: ['*'], rules: [{ allow: false, pattern: '/private' }] })
    expect(parsed.groups[1].agents).toEqual(['badbot'])
  })

  it('treats an empty Disallow as "allow everything"', () => {
    const parsed = parseRobots('User-agent: *\nDisallow:\n')
    expect(parsed.groups[0].rules).toHaveLength(0)
  })
})

describe('isAllowed', () => {
  it('allows everything when there is no robots.txt', () => {
    expect(checkRobots(null, { userAgent: UA, path: '/anything' })).toEqual({
      allowed: true,
      reason: 'no robots.txt rules',
    })
  })

  it('blocks a disallowed prefix', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /private\n')
    expect(isAllowed(robots, { userAgent: UA, path: '/private/list' }).allowed).toBe(false)
    expect(isAllowed(robots, { userAgent: UA, path: '/public/list' }).allowed).toBe(true)
  })

  it('lets an agent-specific group win over the wildcard', () => {
    const robots = parseRobots(`
User-agent: *
Disallow: /

User-agent: ILA3-Research
Disallow: /admin
`)
    expect(isAllowed(robots, { userAgent: UA, path: '/products' }).allowed).toBe(true)
    expect(isAllowed(robots, { userAgent: UA, path: '/admin/panel' }).allowed).toBe(false)
  })

  it('longest match wins, and Allow wins a tie', () => {
    const robots = parseRobots(`
User-agent: *
Disallow: /shop
Allow: /shop/public
`)
    expect(isAllowed(robots, { userAgent: UA, path: '/shop/public/x' }).allowed).toBe(true)
    expect(isAllowed(robots, { userAgent: UA, path: '/shop/checkout' }).allowed).toBe(false)

    const tie = parseRobots('User-agent: *\nDisallow: /a\nAllow: /a\n')
    expect(isAllowed(tie, { userAgent: UA, path: '/a' }).allowed).toBe(true)
  })

  it('supports * wildcards and $ anchors', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /*/cart$\nDisallow: /*?session=\n')
    expect(isAllowed(robots, { userAgent: UA, path: '/en/cart' }).allowed).toBe(false)
    expect(isAllowed(robots, { userAgent: UA, path: '/en/cart/items' }).allowed).toBe(true)
    expect(isAllowed(robots, { userAgent: UA, path: '/search?session=1' }).allowed).toBe(false)
  })

  it('falls back to allow when the wildcard group has no matching rule', () => {
    const robots = parseRobots('User-agent: *\nDisallow: /only-this\n')
    expect(isAllowed(robots, { userAgent: UA, path: '/something-else' }).allowed).toBe(true)
  })

  it('does not treat a different agent as a match', () => {
    const robots = parseRobots('User-agent: OtherBot\nDisallow: /\n')
    expect(isAllowed(robots, { userAgent: UA, path: '/x' }).allowed).toBe(true)
  })
})
