import { createLogger } from '@open-mercato/shared/lib/logger'
import { getOrm } from '@open-mercato/shared/lib/db/mikro'
import { DshAssistantBinding } from '../data/entities'

const logger = createLogger('dsh_runs').child({ subscriber: 'ensure-binding-on-login' })

/**
 * Persist the one-assistant-per-employee binding as soon as the employee signs
 * in, instead of waiting for the first chat turn. The packaged auth module does
 * not emit `auth.user.created`, but it does emit `auth.login.success` with the
 * identity triple we need, so login is the earliest reliable hook.
 *
 * Best-effort: a failure here must never block login; the chat path still
 * provisions lazily as a fallback.
 */
export const metadata = {
  event: 'auth.login.success',
  persistent: false,
  priority: 50,
  id: 'dsh_runs:ensure-binding-on-login',
}

type LoginPayload = {
  id?: unknown
  tenantId?: unknown
  organizationId?: unknown
}

export default async function handler(payload: LoginPayload): Promise<void> {
  const userId = typeof payload.id === 'string' ? payload.id : null
  const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId : null
  const organizationId = typeof payload.organizationId === 'string' ? payload.organizationId : null
  if (!userId || !tenantId || !organizationId) return

  try {
    const orm = await getOrm()
    const em = orm.em.fork({ clear: true })
    const existing = await em.findOne(DshAssistantBinding, { tenantId, organizationId, userId })
    if (existing) return
    const binding = em.create(DshAssistantBinding, {
      tenantId,
      organizationId,
      userId,
      assistantId: 'crm-assistant',
      status: 'active',
      revision: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(binding)
    await em.flush()
    logger.info('Provisioned DSH assistant binding on login', { userId })
  } catch (error) {
    // A unique-constraint race is benign: another request created it first.
    if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505') return
    logger.warn('Could not provision DSH assistant binding on login', {
      err: error instanceof Error ? error.message : 'unknown',
    })
  }
}
