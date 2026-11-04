#!/usr/bin/env node
/**
 * Managed patch: consolidate the settings rail from 12 sections to 8 (T8).
 *
 * The rail data is built server-side: `resolveBackendChromePayload` calls
 * `serializeSectionGroups(...)` in core/.../auth/lib/backendChrome.js and ships
 * the result as `chromePayload.settingsSections`; AppShell renders it.
 *
 * Key lesson from two failed attempts: at serialization time `group.label` is
 * still the DEFAULT (English) name — the Chinese heading is produced later on
 * the client from `group.labelKey`. Matching on the label therefore never hit.
 * This patch merges on `labelKey`, which is stable across locales.
 *
 * Idempotent; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'

const MARKER = '/* [patched:settings-groups] */'
const TARGET = 'node_modules/@open-mercato/core/dist/modules/auth/lib/backendChrome.js'

/** pageGroupKey -> merged section. Eight sections remain in total. */
const MERGE = {
  'settings.sections.system': { id: 'settings.sections.system', labelKey: 'settings.sections.system', label: '系统', order: 1 },
  'settings.sections.moduleConfigs': { id: 'settings.sections.moduleConfigs', labelKey: 'settings.sections.moduleConfigs', label: '模块配置', order: 5 },
  'settings.sections.auth': { id: 'settings.sections.access', labelKey: 'settings.sections.access', label: '身份与权限', order: 2 },
  'settings.sections.directory': { id: 'settings.sections.access', labelKey: 'settings.sections.access', label: '身份与权限', order: 2 },
  'settings.sections.security': { id: 'settings.sections.security', labelKey: 'settings.sections.security', label: '安全', order: 9 },
  'backend.nav.security': { id: 'settings.sections.security', labelKey: 'settings.sections.security', label: '安全', order: 9 },
  'customer_accounts.settings.section': { id: 'settings.sections.portal', labelKey: 'settings.sections.portal', label: '客户与门户', order: 3 },
  'settings.sections.dataDesigner': { id: 'settings.sections.data', labelKey: 'settings.sections.data', label: '数据与集成', order: 4 },
  'backend.nav.externalSystems': { id: 'settings.sections.data', labelKey: 'settings.sections.data', label: '数据与集成', order: 4 },
  'currencies.nav.group': { id: 'settings.sections.org', labelKey: 'settings.sections.org', label: '组织与财务', order: 6 },
  'backend.nav.settings': { id: 'settings.sections.org', labelKey: 'settings.sections.org', label: '组织与财务', order: 6 },
  'availability.nav.group': { id: 'settings.sections.org', labelKey: 'settings.sections.org', label: '组织与财务', order: 6 },
  'settings.sections.featureToggles': { id: 'settings.sections.dev', labelKey: 'settings.sections.dev', label: '开发者与定制', order: 8 },
  'backend.nav.developers': { id: 'settings.sections.dev', labelKey: 'settings.sections.dev', label: '开发者与定制', order: 8 },
  'appShell.sidebarCustomizationGroup': { id: 'settings.sections.dev', labelKey: 'settings.sections.dev', label: '开发者与定制', order: 8 },
}

const HELPER = `${MARKER}
const __SETTINGS_SECTION_MERGE = ${JSON.stringify(MERGE)};
function __mergeSettingsSections(groups) {
  if (!Array.isArray(groups)) return groups;
  const merged = new Map();
  for (const group of groups) {
    if (!group) continue;
    const target = __SETTINGS_SECTION_MERGE[group.labelKey] || __SETTINGS_SECTION_MERGE[group.id];
    const id = target ? target.id : group.id;
    const labelKey = target ? target.labelKey : group.labelKey;
    const label = target ? target.label : group.label;
    const order = target ? target.order : group.order;
    if (!merged.has(id)) {
      merged.set(id, { id, label, labelKey, order, items: [] });
    }
    const bucket = merged.get(id);
    if (Array.isArray(group.items)) bucket.items.push(...group.items);
  }
  return Array.from(merged.values());
}
`

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:settings-groups] target not found: ${TARGET}`)
  process.exit(1)
}

let source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:settings-groups] already applied')
  process.exit(0)
}

const ANCHOR = 'async function serializeSectionGroups(groups) {\n'
if (!source.includes(ANCHOR)) {
  console.error('[patch:settings-groups] anchor not found — package changed, update the patch')
  process.exit(1)
}
source = source.replace(ANCHOR, HELPER + '\n' + ANCHOR)
source = source.replace(
  ANCHOR + '  return Promise.all(groups.map(',
  ANCHOR + '  groups = __mergeSettingsSections(groups);\n  return Promise.all(groups.map(',
)

fs.writeFileSync(file, source)
console.log('[patch:settings-groups] merges settings sections by labelKey at the server serializer')
