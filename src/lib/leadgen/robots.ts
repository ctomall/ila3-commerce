/**
 * robots.txt evaluation (M5).
 *
 * `@open-mercato/web-research` protects against SSRF and can delay requests per host, but
 * it does **not** read robots.txt (verified: no robots reference anywhere in the package).
 * A lead-generation crawler that ignores robots is a compliance problem, so this layer
 * decides "may we fetch this path" before any request leaves the process.
 *
 * Rules implemented (RFC 9309, the parts that matter here):
 * - groups are `User-agent:` lines followed by their `Allow`/`Disallow` lines;
 * - the most specific matching user-agent group wins, `*` is the fallback;
 * - the longest matching path rule wins; on a tie `Allow` wins;
 * - `*` wildcards and a trailing `$` anchor are supported;
 * - an empty or missing robots.txt means everything is allowed.
 */

export type RobotsRule = { allow: boolean; pattern: string }
export type RobotsGroup = { agents: string[]; rules: RobotsRule[] }
export type RobotsFile = { groups: RobotsGroup[]; raw?: string }

export function parseRobots(text: string | null | undefined): RobotsFile {
  if (!text) return { groups: [] }
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null
  let expectingAgents = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim()
    if (!line) continue
    const separator = line.indexOf(':')
    if (separator === -1) continue
    const field = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()

    if (field === 'user-agent') {
      const agent = value.toLowerCase()
      // A new User-agent line after rules starts a new group.
      if (!expectingAgents || current === null) {
        current = { agents: [agent], rules: [] }
        groups.push(current)
        expectingAgents = true
      } else {
        current.agents.push(agent)
      }
      continue
    }

    if (field === 'allow' || field === 'disallow') {
      if (!current) continue
      expectingAgents = false
      // `Disallow:` with an empty value means "allow everything" in practice.
      if (field === 'disallow' && value === '') continue
      current.rules.push({ allow: field === 'allow', pattern: value })
    }
  }

  return { groups, raw: text ?? undefined }
}

function agentMatches(groupAgent: string, userAgent: string): number {
  if (groupAgent === '*') return 0
  const ua = userAgent.toLowerCase()
  if (ua === groupAgent) return 2
  if (ua.includes(groupAgent)) return 1
  return -1
}

function patternMatches(pattern: string, path: string): number | null {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern
  if (!body) return null

  const escaped = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  const regex = new RegExp(`^${escaped}${anchored ? '$' : ''}`)
  return regex.test(path) ? body.replace(/\*/g, '').length : null
}

/**
 * The decision for one URL. `userAgent` must be the string we actually send, so an agent
 * specific group is honoured rather than silently falling back to `*`.
 */
export function isAllowed(
  robots: RobotsFile,
  input: { userAgent: string; path: string },
): { allowed: boolean; reason: string } {
  if (!robots.groups.length) return { allowed: true, reason: 'no robots.txt rules' }

  let bestScore = -1
  let chosen: RobotsGroup | null = null
  for (const group of robots.groups) {
    const score = Math.max(...group.agents.map((agent) => agentMatches(agent, input.userAgent)), -1)
    if (score > bestScore) {
      bestScore = score
      chosen = group
    }
  }
  if (!chosen || bestScore < 0) return { allowed: true, reason: 'no matching user-agent group' }

  let winner: { allow: boolean; length: number; pattern: string } | null = null
  for (const rule of chosen.rules) {
    const length = patternMatches(rule.pattern, input.path)
    if (length === null) continue
    if (
      winner === null ||
      length > winner.length ||
      (length === winner.length && rule.allow && !winner.allow)
    ) {
      winner = { allow: rule.allow, length, pattern: rule.pattern }
    }
  }

  if (!winner) return { allowed: true, reason: 'no rule matches this path' }
  return winner.allow
    ? { allowed: true, reason: `allow ${winner.pattern}` }
    : { allowed: false, reason: `disallow ${winner.pattern}` }
}

/** Convenience wrapper used by the crawler before enqueueing a URL. */
export function checkRobots(
  robotsText: string | null | undefined,
  input: { userAgent: string; path: string },
): { allowed: boolean; reason: string } {
  return isAllowed(parseRobots(robotsText), input)
}
