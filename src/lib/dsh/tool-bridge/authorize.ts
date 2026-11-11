/**
 * Per-call authorization for the DSH tool bridge (C1).
 *
 * A run token proves *who* is calling and *which tools the run may use*; it does
 * not prove that the caller may still use them. Every bridge call therefore
 * re-reads the authoritative facts at call time:
 *
 *   1. the assistant binding exists and is `active` (injected repository/callback);
 *   2. the binding's identity is the token's identity (tenant/organization/user);
 *   3. the tool is read-only (writes are refused until phase C enables them);
 *   4. the token's `tools[]` contains the requested tool;
 *   5. the caller still holds the tool's real ACL feature id (never a role name);
 *   6. the caller's customer scope resolves, and is passed to the query.
 *
 * Nothing here reads a request body: identity and tools come from the verified
 * token only. A rejection is a stable code plus a generic message so the HTTP
 * layer can answer 403/404 without leaking binding state, ACL internals or
 * driver errors.
 */
import type { BindingState } from '@/lib/dsh/run'
import type { RunTokenClaims } from './run-token'

export type ToolDescriptor = {
  name: string
  /** The bridge only enables reads today; a false value is refused unconditionally. */
  readOnly: boolean
  /** Real ACL feature ids from the owning module's `acl.ts`. */
  requiredFeatures: readonly string[]
}

/** The subset of the B1 binding entity the bridge needs; no password/secret fields. */
export type BindingRecord = {
  id: string
  userId: string
  tenantId: string
  organizationId: string
  state: BindingState
}

export type BindingLookup = (bindingId: string) => Promise<BindingRecord | null>

export type FeatureCheckInput = {
  userId: string
  tenantId: string
  organizationId: string
  features: readonly string[]
}

/** Resolves `userHasAllFeatures` against the live RBAC service. */
export type FeatureCheck = (input: FeatureCheckInput) => Promise<boolean>

/**
 * What the CRM currently lets this employee see.
 *
 * `organization` means every company in the caller's organization. It is NOT a
 * per-employee customer boundary — see `scope.ts` for why that distinction must
 * stay explicit until `customer_access` ships.
 */
export type CustomerScope = {
  mode: 'organization' | 'own'
  ownerUserIds: readonly string[]
}

export type CustomerScopeResolver = (input: {
  userId: string
  tenantId: string
  organizationId: string
}) => Promise<CustomerScope>

export type AuthorizeDeps = {
  bindings: BindingLookup
  checkFeatures: FeatureCheck
  resolveCustomerScope: CustomerScopeResolver
  /**
   * C-phase hook. When writes are enabled this must consult `canWriteToCrm()`
   * from `src/lib/dsh/run.ts` (run still `running` AND binding still active at
   * the moment of the write). Until then it is intentionally not called: every
   * non-read-only tool is refused with `write_not_enabled`.
   */
  canWriteToCrm?: (input: { runId: string; bindingId: string }) => Promise<boolean>
}

export type AuthorizationCode =
  | 'unknown_tool'
  | 'write_not_enabled'
  | 'tool_not_allowed'
  | 'binding_inactive'
  | 'binding_mismatch'
  | 'binding_unavailable'
  | 'feature_denied'
  | 'feature_unavailable'
  | 'scope_unavailable'

export type AuthorizationResult =
  | { ok: true; descriptor: ToolDescriptor; scope: CustomerScope }
  | { ok: false; status: 403 | 404; code: AuthorizationCode; message: string }

const reject = (status: 403 | 404, code: AuthorizationCode, message: string): AuthorizationResult => ({
  ok: false,
  status,
  code,
  message,
})

/** Validate and normalize the resolver's answer; anything unexpected fails closed. */
function normalizeScope(value: unknown): CustomerScope | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (record.mode !== 'organization' && record.mode !== 'own') return null
  if (!Array.isArray(record.ownerUserIds)) return null
  const ownerUserIds: string[] = []
  for (const owner of record.ownerUserIds) {
    if (typeof owner !== 'string' || owner.trim() === '') return null
    ownerUserIds.push(owner.trim())
  }
  // An organization-wide scope has no owner list; normalizing keeps the scope
  // shape predictable for the query builder.
  return record.mode === 'organization' ? { mode: 'organization', ownerUserIds: [] } : { mode: 'own', ownerUserIds }
}

export async function authorizeToolCall(input: {
  claims: RunTokenClaims
  tool: string
  descriptor: ToolDescriptor | null
  deps: AuthorizeDeps
}): Promise<AuthorizationResult> {
  const { claims, tool, descriptor, deps } = input

  if (!descriptor || descriptor.name !== tool) {
    return reject(404, 'unknown_tool', 'Unknown tool')
  }

  // Writes come first, before the token's tool list: a non-read-only tool is
  // refused even if a token was issued with it, and the answer is the same for
  // every caller. Phase C replaces this branch with canWriteToCrm().
  if (descriptor.readOnly !== true) {
    return reject(403, 'write_not_enabled', 'Write tools are not enabled')
  }

  if (!claims.tools.includes(tool)) {
    return reject(403, 'tool_not_allowed', 'Tool is not allowed for this run')
  }

  let binding: BindingRecord | null
  try {
    binding = await deps.bindings(claims.bindingId)
  } catch {
    // A repository outage must never read as "no binding, allow".
    return reject(403, 'binding_unavailable', 'Assistant binding is unavailable')
  }
  if (!binding) return reject(403, 'binding_inactive', 'Assistant binding is not active')
  if (binding.id !== claims.bindingId) {
    return reject(403, 'binding_mismatch', 'Assistant binding does not match the run identity')
  }
  if (
    binding.userId !== claims.userId ||
    binding.tenantId !== claims.tenantId ||
    binding.organizationId !== claims.organizationId
  ) {
    return reject(403, 'binding_mismatch', 'Assistant binding does not match the run identity')
  }
  if (binding.state !== 'active') {
    return reject(403, 'binding_inactive', 'Assistant binding is not active')
  }

  const requiredFeatures = descriptor.requiredFeatures ?? []
  // A read tool without a feature would be callable by every authenticated
  // employee; treat that as a configuration error rather than an implicit grant.
  if (requiredFeatures.length === 0) {
    return reject(403, 'feature_denied', 'Forbidden')
  }

  let granted: boolean
  try {
    granted = await deps.checkFeatures({
      userId: claims.userId,
      tenantId: claims.tenantId,
      organizationId: claims.organizationId,
      features: requiredFeatures,
    })
  } catch {
    return reject(403, 'feature_unavailable', 'Forbidden')
  }
  if (!granted) return reject(403, 'feature_denied', 'Forbidden')

  let scope: CustomerScope | null
  try {
    scope = normalizeScope(
      await deps.resolveCustomerScope({
        userId: claims.userId,
        tenantId: claims.tenantId,
        organizationId: claims.organizationId,
      }),
    )
  } catch {
    return reject(403, 'scope_unavailable', 'Customer scope is unavailable')
  }
  if (!scope) return reject(403, 'scope_unavailable', 'Customer scope is unavailable')

  return { ok: true, descriptor, scope }
}
