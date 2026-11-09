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
import fs from 'node:fs'
import path from 'node:path'

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

/**
 * Identity parts that end up in a path must be a plain token.
 *
 * `policyVersion` comes from tenant data, so an unvalidated value is a path-traversal
 * primitive: `../../../../..` turns the memory root into `/`, and the chmod that follows
 * would then rewrite the mode of whatever it resolved to. Audit finding A-P1-3.
 */
const IDENT = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const assertIdent = (field: string, value: string): string => {
  if (typeof value !== 'string' || !IDENT.test(value)) {
    throw new Error(`${field} must be a plain identifier (the value may not contain a path separator): ${JSON.stringify(value)}`)
  }
  return value
}

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
  // The memory root embeds this value, so it is validated here rather than trusted.
  assertIdent('policyVersion', input.policyVersion)
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

/**
 * Create the profile on disk: four 0700 directories and a 0600 metadata file.
 *
 * Derivation produces names; this produces the thing those names point at. The modes are
 * the mechanism, not a detail: 0700 on the directory is what makes "employee B cannot read
 * employee A's session" true at the OS level even when both profiles live on one machine,
 * and 0600 on the metadata keeps the identity mapping out of other users' reach.
 *
 * Collision handling fails closed. If the profile's directory already exists and its
 * metadata names a different user, this throws instead of reusing the directory: a hash
 * collision, a copy-paste bug, or a restored snapshot must not silently turn into two
 * employees sharing one session root.
 *
 * Returns the metadata path so a caller can audit what was written.
 */
export function materializeProfile(profile: EmployeeProfile, root: string): { profileDir: string; metadataPath: string; created: boolean } {
  if (!root) throw new Error('materializeProfile requires a root directory')
  if (!/^[a-f0-9]{32}$/.test(profile.profileKey)) throw new Error(`refusing profile key ${JSON.stringify(profile.profileKey)}`)
  const resolvedRoot = path.resolve(root)
  const profileDir = profile.roots.session.replace(/\/session$/, '')
  // The roots are relative to `<root>/profiles/<key>`; re-anchor them under the caller's root.
  const keyed = path.join(resolvedRoot, 'profiles', profile.profileKey)
  // `profiles/` is traversable (0711) on purpose: the per-employee directory is the
  // boundary that must hold, and a 0700 parent would deny a stranger one level too early,
  // making every denial below unattributable (audit finding A-P2-9).
  fs.mkdirSync(path.join(resolvedRoot, 'profiles'), { recursive: true, mode: 0o711 })
  fs.chmodSync(path.join(resolvedRoot, 'profiles'), 0o711)
  for (const relative of [profile.roots.session, profile.roots.artifacts, profile.roots.memory, profile.roots.browser]) {
    const suffix = relative.slice(profileDir.length)
    const target = path.join(keyed, suffix)
    // Belt and braces: even with a validated identifier, refuse to touch anything that
    // resolves outside this profile's own directory.
    if (!path.resolve(target).startsWith(`${keyed}${path.sep}`) && path.resolve(target) !== keyed) {
      throw new Error(`refusing to create ${target}: resolves outside the profile directory`)
    }
    fs.mkdirSync(target, { recursive: true, mode: 0o700 })
    // mkdir's mode is masked by the umask, so state the intent explicitly.
    fs.chmodSync(target, 0o700)
  }
  const metadataPath = path.join(keyed, 'profile.json')
  const metadata = {
    userId: profile.userId,
    tenantId: profile.tenantId,
    organizationId: profile.organizationId,
    assistantId: profile.assistantId,
    policyVersion: profile.policyVersion,
    profileKey: profile.profileKey,
  }
  let created = true
  if (fs.existsSync(metadataPath)) {
    const existing = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as { userId?: string; profileKey?: string }
    if (existing.userId !== profile.userId || existing.profileKey !== profile.profileKey) {
      throw new Error(
        `profile directory ${profile.profileKey.slice(0, 8)} already belongs to another identity; refusing to reuse it`,
      )
    }
    created = false
  }
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 })
  fs.chmodSync(metadataPath, 0o600)
  return { profileDir: keyed, metadataPath, created }
}
