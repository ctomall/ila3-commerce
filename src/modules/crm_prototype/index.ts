import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/**
 * Interactive prototype for the CRM lead-generation flow (M3).
 *
 * Prototype only: no data access, no writes, no outbound. Every page carries a
 * "原型演示 · 非生产数据" banner and is navHidden, so the real menus keep their
 * current entry counts (see docs/crm-platform/04-prototype.md).
 */
export const metadata: ModuleInfo = {
  name: 'crm_prototype',
  title: 'CRM Prototype',
  version: '0.1.0',
  description: 'Non-production prototype of the six CRM lead-generation pages (zh, light, table-first).',
  author: 'Acme Corp',
  license: 'MIT',
}

export default metadata
