import { Dictionary, DictionaryEntry } from "@open-mercato/core/modules/dictionaries/data/entities";
import {
  normalizeDictionaryValue,
  sanitizeDictionaryColor,
  sanitizeDictionaryIcon
} from "@open-mercato/core/modules/dictionaries/lib/utils";
import {
  registerCommand
} from "@open-mercato/shared/lib/commands";
import { extractUndoPayload } from "@open-mercato/shared/lib/commands/undo";
import { buildChanges, requireId } from "@open-mercato/shared/lib/commands/helpers";
import { ensureOrganizationScope, ensureTenantScope } from "@open-mercato/shared/lib/commands/scope";
import { CrudHttpError } from "@open-mercato/shared/lib/crud/errors";
import { resolveTranslations } from "@open-mercato/shared/lib/i18n/server";
import { findOneWithDecryption } from "@open-mercato/shared/lib/encryption/find";
function ensureDictionaryEntryScope(ctx, scope) {
  ensureTenantScope(ctx, scope.tenantId);
  ensureOrganizationScope(ctx, scope.organizationId);
}
const ENTRY_CHANGE_KEYS = ["value", "label", "color", "icon", "position", "isDefault"];
function toScopeEnsurer(fn) {
  return typeof fn === "function" ? fn : ensureDictionaryEntryScope;
}
async function loadSnapshot(em, id) {
  const entry = await findOneWithDecryption(em, DictionaryEntry, id, { populate: ["dictionary"] });
  if (!entry) return null;
  return {
    id: entry.id,
    dictionaryId: entry.dictionary.id,
    dictionaryKey: entry.dictionary.key,
    organizationId: entry.organizationId,
    tenantId: entry.tenantId,
    value: entry.value,
    label: entry.label,
    color: entry.color ?? null,
    icon: entry.icon ?? null,
    position: entry.position ?? 0,
    isDefault: entry.isDefault ?? false,
    createdAt: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : new Date(entry.createdAt).toISOString(),
    updatedAt: entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : new Date(entry.updatedAt).toISOString()
  };
}
function stripControlChars(value) {
  if (typeof value !== "string") return value;
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
}
function applySnapshot(entry, snapshot) {
  const normalizedValue = stripControlChars(snapshot.value);
  const normalizedLabel = stripControlChars(snapshot.label);
  entry.value = normalizedValue;
  entry.normalizedValue = normalizeDictionaryValue(normalizedValue);
  entry.label = normalizedLabel;
  entry.color = snapshot.color ?? null;
  entry.icon = snapshot.icon ?? null;
  if (snapshot.position !== void 0) entry.position = snapshot.position;
  if (snapshot.isDefault !== void 0) entry.isDefault = snapshot.isDefault;
  entry.organizationId = snapshot.organizationId;
  entry.tenantId = snapshot.tenantId;
  entry.createdAt = new Date(snapshot.createdAt);
  entry.updatedAt = new Date(snapshot.updatedAt);
}
function ensureDictionaryForUndoFactory(fallback) {
  if (fallback) return fallback;
  return async ({ em, snapshot }) => {
    const dictionary = await em.findOne(Dictionary, snapshot.dictionaryId);
    return dictionary ?? null;
  };
}
function getDuplicateError(config) {
  return config.duplicateError ?? "Value already exists in this dictionary.";
}
function sanitizeCreatePayload(input) {
  const rawValue = typeof input?.value === "string" ? input.value.trim() : "";
  if (!rawValue) {
    throw new CrudHttpError(400, { error: "Dictionary entry value is required." });
  }
  const normalized = normalizeDictionaryValue(rawValue);
  const rawLabel = typeof input?.label === "string" ? input.label.trim() : "";
  const label = rawLabel || rawValue;
  const color = sanitizeDictionaryColor(input?.color ?? null);
  const icon = sanitizeDictionaryIcon(input?.icon ?? null);
  const position = typeof input?.position === "number" ? input.position : void 0;
  return { value: rawValue, normalized, label, color, icon, position };
}
function sanitizeUpdatePayload(input) {
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(input, "value")) {
    const rawValue = typeof input?.value === "string" ? input.value.trim() : "";
    if (!rawValue) {
      throw new CrudHttpError(400, { error: "Dictionary entry value is required." });
    }
    payload.value = rawValue;
    payload.normalized = normalizeDictionaryValue(rawValue);
  }
  if (Object.prototype.hasOwnProperty.call(input, "label")) {
    const rawLabel = typeof input?.label === "string" ? input.label.trim() : "";
    payload.label = rawLabel;
  }
  if (Object.prototype.hasOwnProperty.call(input, "color")) {
    payload.color = sanitizeDictionaryColor(input?.color ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(input, "icon")) {
    payload.icon = sanitizeDictionaryIcon(input?.icon ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(input, "position")) {
    const rawPosition = typeof input?.position === "number" ? input.position : void 0;
    if (rawPosition !== void 0) {
      payload.position = rawPosition;
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "isDefault")) {
    payload.isDefault = typeof input?.isDefault === "boolean" ? input.isDefault : void 0;
  }
  return payload;
}
function registerDictionaryEntryCommands(config) {
  const scopeEnsurer = toScopeEnsurer(config.ensureScope);
  const ensureDictionaryForUndo = ensureDictionaryForUndoFactory(config.ensureDictionaryForUndo);
  const translationKeyPrefix = config.translationKeyPrefix ?? config.commandPrefix;
  const fallbackSingular = config.labels?.singular ?? "Dictionary entry";
  const fallbackCreate = config.labels?.create ?? `Create ${fallbackSingular}`;
  const fallbackUpdate = config.labels?.update ?? `Update ${fallbackSingular}`;
  const fallbackDelete = config.labels?.delete ?? `Delete ${fallbackSingular}`;
  const duplicateMessage = getDuplicateError(config);
  const createCommand = {
    id: `${config.commandPrefix}.create`,
    async execute(rawInput, ctx) {
      const parsed = config.createSchema.parse(rawInput);
      const em = ctx.container.resolve("em").fork();
      const { dictionary, scope } = await config.resolveDictionaryForCreate({ em, ctx, parsed });
      scopeEnsurer(ctx, scope);
      const { value, normalized, label, color, icon, position } = sanitizeCreatePayload(parsed);
      const duplicate = await em.findOne(DictionaryEntry, {
        dictionary,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        normalizedValue: normalized
      });
      if (duplicate) {
        throw new CrudHttpError(409, { error: duplicateMessage });
      }
      const entry = em.create(DictionaryEntry, {
        dictionary,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        value,
        normalizedValue: normalized,
        label,
        color,
        icon,
        ...position !== void 0 ? { position } : {},
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      });
      em.persist(entry);
      await em.flush();
      return { entryId: entry.id };
    },
    captureAfter: async (_input, result, ctx) => {
      const em = ctx.container.resolve("em").fork();
      return loadSnapshot(em, result.entryId);
    },
    buildLog: async ({ result, snapshots }) => {
      const after = snapshots.after;
      if (!after) return null;
      const { translate } = await resolveTranslations();
      return {
        actionLabel: translate(`${translationKeyPrefix}.audit.create`, fallbackCreate),
        resourceKind: config.resourceKind,
        resourceId: result.entryId,
        tenantId: after.tenantId,
        organizationId: after.organizationId,
        snapshotAfter: after,
        payload: {
          undo: { after }
        }
      };
    },
    undo: async ({ logEntry, ctx }) => {
      const undo = extractUndoPayload(logEntry);
      const after = undo?.after ?? logEntry?.snapshotAfter ?? null;
      if (!after) return;
      const em = ctx.container.resolve("em").fork();
      scopeEnsurer(ctx, { tenantId: after.tenantId, organizationId: after.organizationId });
      const entry = await em.findOne(DictionaryEntry, after.id);
      if (entry) {
        await em.remove(entry).flush();
        return;
      }
      await em.nativeDelete(DictionaryEntry, { id: after.id });
    }
  };
  const updateCommand = {
    id: `${config.commandPrefix}.update`,
    async prepare(input, ctx) {
      const id = requireId(input, "Dictionary entry id is required");
      const em = ctx.container.resolve("em");
      const snapshot = await loadSnapshot(em, id);
      if (snapshot) {
        scopeEnsurer(ctx, { tenantId: snapshot.tenantId, organizationId: snapshot.organizationId });
      }
      return snapshot ? { before: snapshot } : {};
    },
    async execute(rawInput, ctx) {
      const parsed = config.updateSchema.parse(rawInput);
      const em = ctx.container.resolve("em").fork();
      const id = requireId(parsed, "Dictionary entry id is required");
      const { entry, dictionary, scope } = await config.resolveEntry({ em, ctx, id, parsed });
      scopeEnsurer(ctx, scope);
      const updates = sanitizeUpdatePayload(parsed);
      if (updates.value !== void 0 && updates.normalized !== void 0) {
        if (updates.normalized !== entry.normalizedValue) {
          const duplicate = await em.findOne(DictionaryEntry, {
            dictionary,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            normalizedValue: updates.normalized,
            id: { $ne: entry.id }
          });
          if (duplicate) {
            throw new CrudHttpError(409, { error: duplicateMessage });
          }
          entry.value = updates.value;
          entry.normalizedValue = updates.normalized;
          if (updates.label === void 0) {
            entry.label = entry.value;
          }
        }
      }
      if (updates.label !== void 0) {
        entry.label = updates.label || entry.value;
      }
      if (Object.prototype.hasOwnProperty.call(updates, "color")) {
        entry.color = updates.color ?? null;
      }
      if (Object.prototype.hasOwnProperty.call(updates, "icon")) {
        entry.icon = updates.icon ?? null;
      }
      if (updates.position !== void 0) {
        entry.position = updates.position;
      }
      if (updates.isDefault !== void 0) {
        entry.isDefault = updates.isDefault;
      }
      await em.flush();
      return { entryId: entry.id };
    },
    captureAfter: async (_input, result, ctx) => {
      const em = ctx.container.resolve("em").fork();
      return loadSnapshot(em, result.entryId);
    },
    buildLog: async ({ snapshots }) => {
      const before = snapshots.before;
      const after = snapshots.after;
      if (!before || !after) return null;
      const { translate } = await resolveTranslations();
      return {
        actionLabel: translate(`${translationKeyPrefix}.audit.update`, fallbackUpdate),
        resourceKind: config.resourceKind,
        resourceId: before.id,
        tenantId: before.tenantId,
        organizationId: before.organizationId,
        snapshotBefore: before,
        snapshotAfter: after,
        changes: buildChanges(
          before,
          after,
          ENTRY_CHANGE_KEYS
        ),
        payload: {
          undo: { before, after }
        }
      };
    },
    undo: async ({ logEntry, ctx }) => {
      const undo = extractUndoPayload(logEntry);
      const before = undo?.before ?? logEntry?.snapshotBefore ?? null;
      if (!before) return;
      const em = ctx.container.resolve("em").fork();
      scopeEnsurer(ctx, { tenantId: before.tenantId, organizationId: before.organizationId });
      const dictionary = await ensureDictionaryForUndo({ em, ctx, snapshot: before });
      if (!dictionary) return;
      let entry = await em.findOne(DictionaryEntry, before.id);
      if (!entry) {
        entry = em.create(DictionaryEntry, {
          id: before.id,
          dictionary,
          tenantId: before.tenantId,
          organizationId: before.organizationId,
          value: before.value,
          normalizedValue: normalizeDictionaryValue(before.value),
          label: before.label,
          color: before.color,
          icon: before.icon,
          createdAt: new Date(before.createdAt),
          updatedAt: new Date(before.updatedAt)
        });
        em.persist(entry);
      } else {
        entry.dictionary = dictionary;
        applySnapshot(entry, before);
      }
      await em.flush();
    }
  };
  const deleteCommand = {
    id: `${config.commandPrefix}.delete`,
    async prepare(input, ctx) {
      const id = requireId(input, "Dictionary entry id is required");
      const em = ctx.container.resolve("em");
      const snapshot = await loadSnapshot(em, id);
      if (snapshot) {
        scopeEnsurer(ctx, { tenantId: snapshot.tenantId, organizationId: snapshot.organizationId });
      }
      return snapshot ? { before: snapshot } : {};
    },
    async execute(input, ctx) {
      const id = requireId(input, "Dictionary entry id is required");
      const em = ctx.container.resolve("em").fork();
      const { entry, scope } = await config.resolveEntry({ em, ctx, id });
      scopeEnsurer(ctx, scope);
      em.remove(entry);
      await em.flush();
      return { entryId: id };
    },
    buildLog: async ({ snapshots }) => {
      const before = snapshots.before;
      if (!before) return null;
      const { translate } = await resolveTranslations();
      return {
        actionLabel: translate(`${translationKeyPrefix}.audit.delete`, fallbackDelete),
        resourceKind: config.resourceKind,
        resourceId: before.id,
        tenantId: before.tenantId,
        organizationId: before.organizationId,
        snapshotBefore: before,
        payload: {
          undo: { before }
        }
      };
    },
    undo: async ({ logEntry, ctx }) => {
      const undo = extractUndoPayload(logEntry);
      const before = undo?.before ?? logEntry?.snapshotBefore ?? null;
      if (!before) return;
      const em = ctx.container.resolve("em").fork();
      scopeEnsurer(ctx, { tenantId: before.tenantId, organizationId: before.organizationId });
      const dictionary = await ensureDictionaryForUndo({ em, ctx, snapshot: before });
      if (!dictionary) return;
      let entry = await em.findOne(DictionaryEntry, before.id);
      if (!entry) {
        entry = em.create(DictionaryEntry, {
          id: before.id,
          dictionary,
          tenantId: before.tenantId,
          organizationId: before.organizationId,
          value: before.value,
          normalizedValue: normalizeDictionaryValue(before.value),
          label: before.label,
          color: before.color,
          icon: before.icon,
          createdAt: new Date(before.createdAt),
          updatedAt: new Date(before.updatedAt)
        });
        em.persist(entry);
      } else {
        entry.dictionary = dictionary;
        applySnapshot(entry, before);
      }
      await em.flush();
    }
  };
  registerCommand(createCommand);
  registerCommand(updateCommand);
  registerCommand(deleteCommand);
}
export {
  ensureDictionaryEntryScope,
  registerDictionaryEntryCommands,
  toScopeEnsurer
};
//# sourceMappingURL=factory.js.map
