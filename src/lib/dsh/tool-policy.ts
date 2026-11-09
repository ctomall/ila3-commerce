/**
 * Tool authorization classes (M4-5) — 05-security-poc §7's three buckets, defined by facts.
 *
 * The PoC asks for "每用户能力 / 实例全局 / 高权限三类各一个样本" and says a high-privilege
 * tool is only visible to an authorized employee, and that a shared instance must not be
 * trusted with it. That needs a definition, not a vibe, so the class comes from metadata
 * the tool registry actually carries:
 *
 *   high_privilege   `isDestructive`, `isBulk`, or no `requiredFeatures` at all. These can
 *                    affect many records, cannot be undone, or are callable by any
 *                    authenticated user — none of which a shared instance can contain.
 *   instance_global  declared in appendix/tool-policy.json: a tool whose effect is not
 *                    scoped to the caller (settings, provider configuration).
 *   per_user         everything else: a user-scoped capability, gated by RBAC.
 *
 * The declaration file only ever *adds* instance_global; high_privilege is computed from
 * the registry so it cannot be silently under-declared. The gate fails when the two
 * disagree in either direction.
 */

export type ToolDescriptor = {
  name: string
  requiredFeatures?: readonly string[]
  isMutation?: boolean
  isDestructive?: boolean
  isBulk?: boolean
}

export type ToolClass = 'per_user' | 'instance_global' | 'high_privilege'

export type InstanceMode = 'shared' | 'isolated'

export type ClassifyInput = {
  tool: ToolDescriptor
  /** Tool names declared as instance-global in the appendix file. */
  instanceGlobal?: readonly string[]
}

export function classifyTool(input: ClassifyInput): ToolClass {
  const { tool } = input
  const features = tool.requiredFeatures ?? []
  if (tool.isDestructive === true) return 'high_privilege'
  if (tool.isBulk === true) return 'high_privilege'
  if (features.length === 0) return 'high_privilege'
  if ((input.instanceGlobal ?? []).includes(tool.name)) return 'instance_global'
  return 'per_user'
}

export type PolicyRejection =
  | 'features_denied'
  | 'high_privilege_requires_isolation'
  | 'instance_global_not_shared'
  | 'unknown_tool'

export type PolicyDecision = { allowed: true; risk: ToolClass } | { allowed: false; risk: ToolClass; reason: PolicyRejection }

/**
 * Whether one tool may run for a caller on an instance of the given mode.
 *
 * `callerFeatures` is the employee's feature set as resolved at call time — passed in, not
 * trusted from the request. The runtime already does this per tool; stating it here keeps
 * the decision in one place for the classes that add a second reason to refuse.
 */
export function mayRunTool(input: {
  tool: ToolDescriptor | null
  instanceMode: InstanceMode
  callerFeatures: readonly string[]
  instanceGlobal?: readonly string[]
}): PolicyDecision {
  const { tool, instanceMode, callerFeatures } = input
  if (!tool) return { allowed: false, risk: 'per_user', reason: 'unknown_tool' }
  const risk = classifyTool({ tool, instanceGlobal: input.instanceGlobal })

  const required = tool.requiredFeatures ?? []
  const missing = required.filter((feature) => !callerFeatures.includes(feature))
  if (missing.length > 0) return { allowed: false, risk, reason: 'features_denied' }

  // A shared instance may not run a tool that can touch many records, cannot be undone, or
  // is callable by anyone: there is no per-employee boundary to contain it.
  if (risk === 'high_privilege' && instanceMode === 'shared') {
    return { allowed: false, risk, reason: 'high_privilege_requires_isolation' }
  }
  // Instance-global tools change the deployment for everyone; they belong to the operator,
  // never to a shared tenant-facing instance.
  if (risk === 'instance_global') return { allowed: false, risk, reason: 'instance_global_not_shared' }

  return { allowed: true, risk }
}

/** Inventory summary for the gate and the docs: counts per class, grouped by module prefix. */
export function summarize(tools: readonly ToolDescriptor[], instanceGlobal: readonly string[] = []) {
  const classes: Record<ToolClass, string[]> = { per_user: [], instance_global: [], high_privilege: [] }
  for (const tool of tools) classes[classifyTool({ tool, instanceGlobal })].push(tool.name)
  for (const key of Object.keys(classes) as ToolClass[]) classes[key].sort()
  return {
    total: tools.length,
    counts: {
      per_user: classes.per_user.length,
      instance_global: classes.instance_global.length,
      high_privilege: classes.high_privilege.length,
    },
    classes,
  }
}
