/**
 * Per-employee DSH profile derivation (M4).
 *
 * The contract (03-dsh-contract.md §4–§5) says every tool call is authorised per call and
 * that each employee gets an independent profile: own session directory, own artifact
 * directory, own memory partition, own browser state, own channel credentials. Nothing in
 * the repo derived that object yet, so "isolated per employee" was a property of a design
 * document rather than of code.
 *
 * This module derives the profile from the facts that are already authoritative — the
 * live, RBAC-filtered tool list the runtime returns for that user, the assistant's own
 * ceiling, and an optional narrowing requested by a caller (a child agent, a single run).
 * It is pure: the same inputs produce the same profile, which is what lets a run be
 * audited after the fact.
 *
 * Three properties this module is responsible for, and what they do NOT mean:
 *
 * 1. `tools ⊆ granted ∩ assistantTools ∩ requested`. A child can only narrow. The registry
 *    it reads from does not enforce this itself (`appendAllowedTools` / `replaceAllowedTools`
 *    exist), so the intersection has to happen here rather than be assumed.
 * 2. Every path is keyed by a hash of the identity tuple, so no employee id — not one's own,
 *    not a colleague's — appears in a filesystem path. Derivation proves the *names* are
 *    disjoint; it cannot prove the filesystem permissions under them are.
 * 3. `revoke()` fails closed: no tools, and the profile is marked revoked so a caller that
 *    checks `revoked` can stop scheduling.
 *
 * Isolation at runtime (file ownership, DSH actually honouring these roots) is NOT proven
 * by this module. It is the part M4 still cannot execute.
 */
import { createHash } from 'node:crypto'

export type EmployeeProfileInput = {
  userId: string
  tenantId: string
  organizationId: string
  assistantId: string
  /** Bumped when the employee's policy changes; memory must not span versions. */
  policyVersion: string
  /** Tools the runtime reports for this user *after* RBAC filtering. */
  grantedTools: readonly string[]
  /** The assistant's own ceiling — what it is allowed to expose at all. */
  assistantTools: readonly string[]
  /** Optional narrowing from a caller. Never widens: anything outside is dropped. */
  requestedTools?: readonly string[]
}

export type DroppedTool = { tool: string; reason: 'not-in-assistant-ceiling' | 'not-granted' | 'outside-request' }

export type EmployeeProfile = {
  profileKey: string
  userId: string
  tenantId: string
  organizationId: string
  assistantId: string
  policyVersion: string
  tools: string[]
  dropped: DroppedTool[]
  roots: {
    /** DSH session state (cookies live one level down). */
    session: string
    /** Per-run artifacts. */
    artifacts: string
    /** Long-term memory, partitioned by policy version. */
    memory: string
    /** Browser profile: localStorage/cookies must not be shared. */
    browser: string
  }
  revoked: boolean
}

const ROOT = 'profiles'

/** Stable, filesystem-safe, and deliberately not reversible to a user id. */
export function profileKeyOf(input: Pick<EmployeeProfileInput, 'userId' | 'tenantId' | 'organizationId' | 'assistantId' | 'policyVersion'>): string {
  // Validate the five identity fields only: callers pass the whole input object, and a
  // blanket `Object.entries` walk used to reject the tool arrays as if they were ids.
  const fields = ['tenantId', 'organizationId', 'userId', 'assistantId', 'policyVersion'] as const
  for (const field of fields) {
    const value = input[field]
    if (typeof value !== 'string' || value.trim() === '') {
      throw new Error(`profile key requires a non-empty ${field}`)
    }
  }
  return createHash('sha256')
    .update(fields.map((field) => input[field]).join('\u0000'))
    .digest('hex')
    .slice(0, 32)
}

const unique = (values: readonly string[]): string[] => [...new Set(values)].sort()

export function deriveProfile(input: EmployeeProfileInput): EmployeeProfile {
  const ceiling = new Set(input.assistantTools)
  const granted = new Set(input.grantedTools)
  const request = input.requestedTools === undefined ? null : new Set(input.requestedTools)
  const profileKey = profileKeyOf(input)

  const tools: string[] = []
  const dropped: DroppedTool[] = []
  for (const tool of unique([...input.grantedTools, ...input.assistantTools, ...(input.requestedTools ?? [])])) {
    if (!ceiling.has(tool)) dropped.push({ tool, reason: 'not-in-assistant-ceiling' })
    else if (!granted.has(tool)) dropped.push({ tool, reason: 'not-granted' })
    else if (request !== null && !request.has(tool)) dropped.push({ tool, reason: 'outside-request' })
    else tools.push(tool)
  }

  const base = `${ROOT}/${profileKey}`
  return {
    profileKey,
    userId: input.userId,
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    assistantId: input.assistantId,
    policyVersion: input.policyVersion,
    tools,
    dropped,
    roots: {
      session: `${base}/session`,
      artifacts: `${base}/artifacts`,
      memory: `${base}/memory/${input.policyVersion}`,
      browser: `${base}/browser`,
    },
    revoked: false,
  }
}

/**
 * Fail closed. A revoked employee keeps the identity (so the audit trail still resolves)
 * and loses every tool, which is the only part of the profile that can cause a write.
 */
export function revoke(profile: EmployeeProfile): EmployeeProfile {
  return { ...profile, tools: [], revoked: true }
}

/**
 * The guard a child agent's profile must pass before it runs.
 *
 * Returns the widening attempt rather than silently trimming, so a caller can log it: a
 * request for a tool the parent does not hold is an escalation attempt, not a typo.
 */
export function wideningAttempt(parent: EmployeeProfile, child: EmployeeProfile): string[] {
  const allowed = new Set(parent.tools)
  return child.tools.filter((tool) => !allowed.has(tool)).sort()
}

/** Two profiles must not share a session, artifact, memory or browser root. */
export function sharedRoots(a: EmployeeProfile, b: EmployeeProfile): string[] {
  const seen = new Map<string, string>()
  for (const [kind, root] of Object.entries(a.roots)) seen.set(root, `a.${kind}`)
  return Object.entries(b.roots)
    .filter(([, root]) => seen.has(root))
    .map(([kind, root]) => `${seen.get(root)} == b.${kind}`)
}
