import type { ModuleInfo } from '@open-mercato/shared/modules/registry'

export const metadata: ModuleInfo = {
  name: 'communications',
  title: 'Communications Mobile Facade',
  version: '0.1.0',
  description:
    'Additive employee-facing facade over the installed communication_channels hub: send from a mailbox the caller owns, and read the conversations those channels carry.',
  author: 'ILA3 Commerce Team',
  license: 'MIT',
}
