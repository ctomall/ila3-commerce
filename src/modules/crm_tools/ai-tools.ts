/**
 * Module-root AI tool pack: one read-only CRM lookup for the employee assistant (M4-3).
 *
 * This file is the *declaration*; the testable logic lives in `lib/companyLookup.ts`.
 * The split matters: a tool declaration is mostly metadata that a generator folds into
 * `ai-tools.generated.ts`, while the things that can leak data (scope source, SQL shape,
 * parameter order, limit clamp) are pure functions with unit tests.
 *
 * Follows the three rules the reference pack states:
 *  1. scope comes from `McpToolContext`, never from the input schema;
 *  2. `requiredFeatures` names a feature that already exists (`customers.companies.view`);
 *  3. the handler re-parses its input, so invoking it from anywhere other than the model
 *     is equally safe.
 */
import type { EntityManager } from '@mikro-orm/postgresql'
import { CustomerCompanyProfile } from '@open-mercato/core/modules/customers/data/entities'
import { defineAiTool } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/ai-tool-definition'
import type { AiToolDefinition, McpToolContext } from '@open-mercato/ai-assistant/modules/ai_assistant/lib/types'
import {
  buildFindCompaniesQuery,
  COMPANY_LOOKUP_FEATURE,
  findCompaniesInputSchema,
  requireToolScope,
  shapeCompanyRecords,
  type CompanyRow,
  type FindCompaniesInput,
} from './lib/companyLookup'

export type FindCompaniesResult = {
  companies: CompanyRow[]
  /** Echoed so a reviewer can see which scope answered, without trusting the model's words. */
  scope: { tenantId: string; organizationId: string }
  note: string
}

const findCompaniesTool: AiToolDefinition = defineAiTool<unknown, FindCompaniesResult>({
  name: 'crm.find_companies',
  displayName: 'CRM — find companies',
  description:
    'Search companies the caller can already see in the CRM by name or domain, newest data first. Read-only: it never creates, updates or deletes anything, and the tenant/organization come from the session, not from the arguments.',
  tags: ['read', 'crm', 'customers'],
  isMutation: false,
  requiredFeatures: [COMPANY_LOOKUP_FEATURE],
  inputSchema: findCompaniesInputSchema,
  async handler(input, context: McpToolContext) {
    const scope = requireToolScope(context)
    const parsed: FindCompaniesInput = findCompaniesInputSchema.parse(input ?? {})
    const { where, options } = buildFindCompaniesQuery(scope, parsed)
    const em = context.container.resolve<EntityManager>('em')
    // Through the ORM on purpose: company names and domains are encrypted at rest and the
    // ORM is what decrypts them. Raw SQL here returned ciphertext to the model.
    const records = await em.find(CustomerCompanyProfile, where, options)
    return {
      companies: shapeCompanyRecords(records),
      scope,
      note: '只读查询；结果受调用者自身的 tenant/organization 与 customers.companies.view 权限约束',
    }
  },
})

export const aiTools: AiToolDefinition[] = [findCompaniesTool]
