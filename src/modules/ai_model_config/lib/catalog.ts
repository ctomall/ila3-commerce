import { randomUUID } from 'node:crypto'

/**
 * Model catalog storage + merge logic.
 *
 * The catalog is a tenant-scoped JSON document inside the framework's
 * `module_configs` table:
 *
 *   module_id = "ai_assistant"
 *   name      = "model_catalog"
 *   value     = { version: 1, entries: ModelCatalogEntry[] }
 *
 * Every entry is either
 *   - a *custom* model (a model id the provider's curated catalog does not
 *     ship), or
 *   - an *override* of a built-in model (rename / retag / hide it).
 *
 * Providers themselves remain environment-configured (API keys, base URLs),
 * which keeps secrets out of tenant JSON and keeps the runtime resolution
 * order untouched.
 */

export const MODEL_CATALOG_MODULE_ID = 'ai_assistant'
export const MODEL_CATALOG_CONFIG_NAME = 'model_catalog'

export const AI_MODEL_TAGS = ['flagship', 'reasoning', 'coding', 'vision', 'budget', 'fast'] as const
export type AiModelTag = (typeof AI_MODEL_TAGS)[number]

export type ModelCatalogEntry = {
  id: string
  providerId: string
  modelId: string
  name: string
  contextWindow: number | null
  tags: AiModelTag[]
  enabled: boolean
  builtin: boolean
  createdAt: string
  updatedAt: string
}

export type ModelCatalogScope = {
  tenantId?: string | null
  organizationId?: string | null
}

export type ModuleConfigServiceLike = {
  getValue<T = unknown>(
    moduleId: string,
    name: string,
    options?: { defaultValue?: T | null; scope?: ModelCatalogScope },
  ): Promise<T | null>
  setValue(
    moduleId: string,
    name: string,
    value: unknown,
    scope?: ModelCatalogScope,
  ): Promise<unknown>
}

export type MergedModel = {
  entryId: string | null
  providerId: string
  modelId: string
  name: string
  contextWindow: number | null
  tags: string[]
  enabled: boolean
  builtin: boolean
  overridden: boolean
}

export type BuiltinModelLike = {
  id: string
  name: string
  contextWindow?: number | null
  tags?: readonly string[]
}

const MAX_CONTEXT_WINDOW = 100_000_000

export function normalizeModelId(value: string): string {
  return value.trim().toLowerCase()
}

export function sanitizeTags(value: unknown): AiModelTag[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const tags: AiModelTag[] = []
  for (const candidate of value) {
    if (typeof candidate !== 'string') continue
    const normalized = candidate.trim().toLowerCase()
    if (!(AI_MODEL_TAGS as readonly string[]).includes(normalized)) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    tags.push(normalized as AiModelTag)
  }
  return tags
}

export function sanitizeContextWindow(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return null
  const rounded = Math.trunc(numeric)
  if (rounded <= 0 || rounded > MAX_CONTEXT_WINDOW) return null
  return rounded
}

export function sanitizeEntry(raw: unknown): ModelCatalogEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const providerId = typeof record.providerId === 'string' ? record.providerId.trim() : ''
  const modelId = typeof record.modelId === 'string' ? record.modelId.trim() : ''
  if (!providerId || !modelId) return null
  const name = typeof record.name === 'string' && record.name.trim().length > 0
    ? record.name.trim()
    : modelId
  const now = new Date().toISOString()
  return {
    id: typeof record.id === 'string' && record.id.length > 0 ? record.id : randomUUID(),
    providerId,
    modelId,
    name,
    contextWindow: sanitizeContextWindow(record.contextWindow),
    tags: sanitizeTags(record.tags),
    enabled: record.enabled !== false,
    builtin: record.builtin === true,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  }
}

export async function loadModelCatalog(
  service: ModuleConfigServiceLike,
  scope: ModelCatalogScope,
): Promise<ModelCatalogEntry[]> {
  const value = await service.getValue<{ entries?: unknown }>(
    MODEL_CATALOG_MODULE_ID,
    MODEL_CATALOG_CONFIG_NAME,
    { scope },
  )
  const entries = Array.isArray(value?.entries) ? value.entries : []
  return entries
    .map((entry) => sanitizeEntry(entry))
    .filter((entry): entry is ModelCatalogEntry => entry !== null)
}

export async function saveModelCatalog(
  service: ModuleConfigServiceLike,
  scope: ModelCatalogScope,
  entries: ModelCatalogEntry[],
): Promise<void> {
  await service.setValue(
    MODEL_CATALOG_MODULE_ID,
    MODEL_CATALOG_CONFIG_NAME,
    { version: 1, entries },
    scope,
  )
}

export type UpsertCatalogInput = {
  providerId: string
  modelId: string
  name: string
  contextWindow?: number | null
  tags?: AiModelTag[]
  enabled?: boolean
  builtin?: boolean
}

/**
 * Insert-or-update by (providerId, modelId). Re-adding a built-in model id
 * creates an override entry instead of a duplicate.
 */
export async function upsertCatalogEntry(
  service: ModuleConfigServiceLike,
  scope: ModelCatalogScope,
  input: UpsertCatalogInput,
): Promise<{ entry: ModelCatalogEntry; created: boolean; entries: ModelCatalogEntry[] }> {
  const entries = await loadModelCatalog(service, scope)
  const key = `${input.providerId}::${normalizeModelId(input.modelId)}`
  const existingIndex = entries.findIndex(
    (entry) => `${entry.providerId}::${normalizeModelId(entry.modelId)}` === key,
  )
  const now = new Date().toISOString()
  if (existingIndex >= 0) {
    const existing = entries[existingIndex]
    const updated: ModelCatalogEntry = {
      ...existing,
      name: input.name.trim() || existing.name,
      contextWindow: input.contextWindow === undefined
        ? existing.contextWindow
        : sanitizeContextWindow(input.contextWindow),
      tags: input.tags === undefined ? existing.tags : sanitizeTags(input.tags),
      enabled: input.enabled === undefined ? existing.enabled : input.enabled !== false,
      updatedAt: now,
    }
    entries[existingIndex] = updated
    await saveModelCatalog(service, scope, entries)
    return { entry: updated, created: false, entries }
  }
  const created: ModelCatalogEntry = {
    id: randomUUID(),
    providerId: input.providerId,
    modelId: input.modelId.trim(),
    name: input.name.trim() || input.modelId.trim(),
    contextWindow: sanitizeContextWindow(input.contextWindow ?? null),
    tags: sanitizeTags(input.tags ?? []),
    enabled: input.enabled !== false,
    builtin: input.builtin === true,
    createdAt: now,
    updatedAt: now,
  }
  entries.push(created)
  await saveModelCatalog(service, scope, entries)
  return { entry: created, created: true, entries }
}

export async function updateCatalogEntry(
  service: ModuleConfigServiceLike,
  scope: ModelCatalogScope,
  id: string,
  patch: Partial<UpsertCatalogInput>,
): Promise<ModelCatalogEntry | null> {
  const entries = await loadModelCatalog(service, scope)
  const index = entries.findIndex((entry) => entry.id === id)
  if (index < 0) return null
  const current = entries[index]
  const now = new Date().toISOString()
  const next: ModelCatalogEntry = {
    ...current,
    providerId: patch.providerId?.trim() || current.providerId,
    modelId: patch.modelId?.trim() || current.modelId,
    name: patch.name?.trim() || current.name,
    contextWindow: patch.contextWindow === undefined
      ? current.contextWindow
      : sanitizeContextWindow(patch.contextWindow),
    tags: patch.tags === undefined ? current.tags : sanitizeTags(patch.tags),
    enabled: patch.enabled === undefined ? current.enabled : patch.enabled !== false,
    updatedAt: now,
  }
  entries[index] = next
  await saveModelCatalog(service, scope, entries)
  return next
}

export async function deleteCatalogEntry(
  service: ModuleConfigServiceLike,
  scope: ModelCatalogScope,
  id: string,
): Promise<boolean> {
  const entries = await loadModelCatalog(service, scope)
  const next = entries.filter((entry) => entry.id !== id)
  if (next.length === entries.length) return false
  await saveModelCatalog(service, scope, next)
  return true
}

/**
 * Bulk import models discovered from an upstream `/models` endpoint.
 * Existing entries keep their user-edited name/tags/enabled state; only new
 * ids are appended. One read + one write regardless of the list size.
 */
export async function importDiscoveredModels(
  service: ModuleConfigServiceLike,
  scope: ModelCatalogScope,
  providerId: string,
  models: ReadonlyArray<{ id: string; name: string }>,
): Promise<{ imported: number; total: number; models: MergedModel[] }> {
  const entries = await loadModelCatalog(service, scope)
  const existingKeys = new Set(
    entries
      .filter((entry) => entry.providerId === providerId)
      .map((entry) => normalizeModelId(entry.modelId)),
  )
  const now = new Date().toISOString()
  let imported = 0
  for (const model of models) {
    const key = normalizeModelId(model.id)
    if (!key || existingKeys.has(key)) continue
    existingKeys.add(key)
    entries.push({
      id: randomUUID(),
      providerId,
      modelId: model.id.trim(),
      name: model.name.trim() || model.id.trim(),
      contextWindow: null,
      tags: [],
      enabled: true,
      builtin: false,
      createdAt: now,
      updatedAt: now,
    })
    imported += 1
  }
  if (imported > 0) {
    await saveModelCatalog(service, scope, entries)
  }
  return { imported, total: models.length, models: mergeProviderModels(providerId, [], entries) }
}

/**
 * Merge the catalog over one provider's curated models.
 *
 * - built-in model with an entry  -> entry wins (name / context / tags / enabled)
 * - built-in model without entry  -> shown as-is, enabled
 * - entry without a built-in match -> appended as a custom model
 *
 * Callers that feed a picker should filter `enabled`, while the settings page
 * keeps disabled rows visible so they can be re-enabled.
 */
export function mergeProviderModels(
  providerId: string,
  builtins: readonly BuiltinModelLike[],
  entries: readonly ModelCatalogEntry[],
): MergedModel[] {
  const pending = new Map<string, ModelCatalogEntry>()
  for (const entry of entries) {
    if (entry.providerId !== providerId) continue
    pending.set(normalizeModelId(entry.modelId), entry)
  }
  const merged: MergedModel[] = []
  for (const builtin of builtins) {
    const key = normalizeModelId(builtin.id)
    const entry = pending.get(key)
    if (entry) {
      pending.delete(key)
      merged.push({
        entryId: entry.id,
        providerId,
        modelId: builtin.id,
        name: entry.name || builtin.name,
        contextWindow: entry.contextWindow ?? builtin.contextWindow ?? null,
        tags: entry.tags.length > 0 ? entry.tags : [...(builtin.tags ?? [])],
        enabled: entry.enabled,
        builtin: true,
        overridden: true,
      })
      continue
    }
    merged.push({
      entryId: null,
      providerId,
      modelId: builtin.id,
      name: builtin.name,
      contextWindow: builtin.contextWindow ?? null,
      tags: [...(builtin.tags ?? [])],
      enabled: true,
      builtin: true,
      overridden: false,
    })
  }
  for (const entry of pending.values()) {
    merged.push({
      entryId: entry.id,
      providerId,
      modelId: entry.modelId,
      name: entry.name || entry.modelId,
      contextWindow: entry.contextWindow,
      tags: entry.tags,
      enabled: entry.enabled,
      builtin: false,
      overridden: false,
    })
  }
  return merged
}
