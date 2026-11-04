import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

/**
 * Table-style directory of the registered AI agents.
 *
 * Complements the stock AI settings page (a single-agent dropdown) with a list
 * view: every accessible agent, its module, execution mode, mutation policy and
 * the model that will actually be used.
 */
export const metadata: ModuleInfo = {
  name: 'agent_directory',
  title: 'AI Agent Directory',
  version: '0.1.0',
  description: 'Settings page listing every registered AI agent with its module, execution mode and effective model.',
  author: 'Acme Corp',
  license: 'MIT',
}

export default metadata
