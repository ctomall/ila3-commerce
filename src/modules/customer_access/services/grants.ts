/**
 * Pure rules for `customer_access` grants.
 *
 * Kept separate from the ORM so the permission semantics — which grant widens
 * reads, which widens writes, what a revocation means — are unit-testable and
 * cannot drift from the scope resolver by accident.
 */
export type CustomerAccessLevel = 'view' | 'edit'

export type GrantRecord = {
  id: string
  tenantId: string
  organizationId: string
  userId: string
  customerEntityId: string
  accessLevel: CustomerAccessLevel
  grantedBy: string | null
  createdAt: string
  revokedAt: string | null
}

export const ACCESS_LEVELS: readonly CustomerAccessLevel[] = ['view', 'edit']

export function isAccessLevel(value: unknown): value is CustomerAccessLevel {
  return value === 'view' || value === 'edit'
}

/** A grant is live only while it has no revocation timestamp. */
export function isGrantLive(grant: Pick<GrantRecord, 'revokedAt'>): boolean {
  return grant.revokedAt === null
}

export type ScopeLists = {
  /** Every live grant: widens reads. */
  grantedEntityIds: string[]
  /** Grants with level `edit`: widens writes. Always a subset of reads. */
  editableEntityIds: string[]
}

/** Deduplicated, stable lists derived from live grants only. */
export function toScopeLists(grants: readonly GrantRecord[]): ScopeLists {
  const read = new Set<string>()
  const edit = new Set<string>()
  for (const grant of grants) {
    if (!isGrantLive(grant)) continue
    read.add(grant.customerEntityId)
    if (grant.accessLevel === 'edit') edit.add(grant.customerEntityId)
  }
  return {
    grantedEntityIds: [...read].sort(),
    editableEntityIds: [...edit].sort(),
  }
}

/** Whether an employee may write one customer, given ownership and grants. */
export function canWriteCustomer(input: {
  ownerUserIds: readonly string[]
  callerUserId: string
  customerOwnerUserId: string | null
  editableEntityIds: readonly string[]
  customerEntityId: string
}): boolean {
  if (input.customerOwnerUserId !== null && input.customerOwnerUserId === input.callerUserId) return true
  return input.editableEntityIds.includes(input.customerEntityId)
}

/** Refuse a grant that would duplicate ownership semantics. */
export function describeGrant(input: {
  userId: string
  customerEntityId: string
  accessLevel: CustomerAccessLevel
}): string {
  return `${input.accessLevel} access for ${input.userId} on ${input.customerEntityId}`
}
