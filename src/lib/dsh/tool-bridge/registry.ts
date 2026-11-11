/**
 * Static registry of tools the DSH bridge exposes (C1).
 *
 * The registry is the allow-list of *implemented* bridge tools. The run token's
 * `tools[]` can only narrow this list, never extend it: a name that is not here
 * is `unknown_tool` (404) even if a token lists it.
 *
 * `crm.update_company` is registered as read-only:false on purpose. It is not
 * implemented and phase C will wire it to `canWriteToCrm()`; registering the
 * name now makes a write attempt fail with `write-not-enabled` instead of a
 * misleading `unknown-tool`, which is what the model needs to stop retrying.
 */
import { z } from 'zod'
import { COMPANY_LOOKUP_FEATURE, findCompaniesInputSchema } from '@/modules/crm_tools/lib/companyLookup'
import type { CustomerScope, ToolDescriptor } from './authorize'
import { FIND_COMPANIES_TOOL, findCompanies, type FindCompaniesContext } from './crm-find-companies'
import type { RunTokenClaims } from './run-token'

/** The part of a zod schema the route needs; keeps the registry decoupled from zod's types. */
export type ToolInputSchema = {
  safeParse(input: unknown):
    | { success: true; data: unknown }
    | { success: false; error: { issues: ReadonlyArray<{ path: PropertyKey[]; message: string }> } }
}

export type ToolExecutionContext = {
  em: FindCompaniesContext['em']
  claims: RunTokenClaims
  scope: CustomerScope
}

export type DshTool = ToolDescriptor & {
  inputSchema: ToolInputSchema
  execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown>
}

export const COMPANY_UPDATE_TOOL = 'crm.update_company'

export const TOOL_REGISTRY: Readonly<Record<string, DshTool>> = {
  [FIND_COMPANIES_TOOL]: {
    name: FIND_COMPANIES_TOOL,
    readOnly: true,
    requiredFeatures: [COMPANY_LOOKUP_FEATURE],
    inputSchema: findCompaniesInputSchema,
    execute: (input, context) => findCompanies(input, context),
  },
  [COMPANY_UPDATE_TOOL]: {
    name: COMPANY_UPDATE_TOOL,
    readOnly: false,
    // Real ACL id from the customers module (companies POST/PUT/DELETE metadata).
    requiredFeatures: ['customers.companies.manage'],
    inputSchema: z.object({}).strict(),
    // Unreachable: authorizeToolCall() refuses every non-read-only tool first.
    execute: async () => {
      throw new Error('write tools are not enabled')
    },
  },
}

export function getToolDescriptor(name: string): DshTool | null {
  return Object.prototype.hasOwnProperty.call(TOOL_REGISTRY, name) ? TOOL_REGISTRY[name] : null
}
