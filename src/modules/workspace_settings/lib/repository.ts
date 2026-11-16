import type { EntityManager } from '@mikro-orm/postgresql'
import { NavigationPreference, WorkspaceLayout } from '../data/entities'
import { EMPTY_LAYOUT, parseLayoutConfig, type WorkspaceLayoutConfig } from './layout'
import { EMPTY_PREFERENCE, normalizePreference, type NavigationPreferenceValue } from './preferences'
import type { WorkspaceScope } from './scope'

export type StoredLayout = { config: WorkspaceLayoutConfig; revision: number | null }

export async function loadLayout(
  em: EntityManager,
  scope: Pick<WorkspaceScope, 'tenantId' | 'organizationId'>,
): Promise<StoredLayout> {
  const row = await em.findOne(WorkspaceLayout, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  })
  if (!row) return { config: EMPTY_LAYOUT, revision: null }
  return { config: parseLayoutConfig(row.config), revision: row.revision }
}

export async function saveLayout(
  em: EntityManager,
  scope: WorkspaceScope,
  config: WorkspaceLayoutConfig,
): Promise<StoredLayout> {
  const existing = await em.findOne(WorkspaceLayout, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  })
  if (existing) {
    existing.config = config as unknown as Record<string, unknown>
    existing.revision += 1
    existing.updatedBy = scope.userId
    await em.flush()
    return { config, revision: existing.revision }
  }
  const created = em.create(WorkspaceLayout, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    config: config as unknown as Record<string, unknown>,
    revision: 1,
    updatedBy: scope.userId,
  })
  em.persist(created)
  await em.flush()
  return { config, revision: created.revision }
}

export async function loadPreference(em: EntityManager, scope: WorkspaceScope): Promise<NavigationPreferenceValue> {
  const row = await em.findOne(NavigationPreference, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    userId: scope.userId,
  })
  if (!row) return EMPTY_PREFERENCE
  const parsed = normalizePreference({
    favorites: row.favorites,
    recentWorkspace: row.recentWorkspace,
    selectedPreset: row.selectedPreset,
  })
  return parsed.ok ? parsed.value : EMPTY_PREFERENCE
}

export async function savePreference(
  em: EntityManager,
  scope: WorkspaceScope,
  value: NavigationPreferenceValue,
): Promise<NavigationPreferenceValue> {
  const existing = await em.findOne(NavigationPreference, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    userId: scope.userId,
  })
  if (existing) {
    existing.favorites = value.favorites
    existing.recentWorkspace = value.recentWorkspace
    existing.selectedPreset = value.selectedPreset
    existing.revision += 1
    await em.flush()
    return value
  }
  const created = em.create(NavigationPreference, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    userId: scope.userId,
    favorites: value.favorites,
    recentWorkspace: value.recentWorkspace,
    selectedPreset: value.selectedPreset,
    revision: 1,
  })
  em.persist(created)
  await em.flush()
  return value
}
