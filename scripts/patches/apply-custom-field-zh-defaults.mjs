#!/usr/bin/env node
/**
 * Managed patch: localize the code-defined custom fields of the customers module.
 *
 * The API merges seeded defaults from `customFieldDefaults.js` with the rows in
 * `custom_field_defs`, and the code definition wins. That is why translating the
 * database (scripts/migrate-custom-field-zh.mjs) changed option values but left
 * headers like "Relationship health" in English — the label comes from here.
 *
 * The label/option map is imported from src/lib/custom-field-zh.ts so there is a
 * single source of truth shared with the DB migration.
 *
 * Idempotent. Run before `yarn build`; asserted by scripts/verify-patches.mjs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { CUSTOM_FIELD_LABELS, CUSTOM_FIELD_OPTIONS } from '../../src/lib/custom-field-zh.ts'

const MARKER = '/* [patched:cf-zh] */'
const TARGET = 'node_modules/@open-mercato/core/dist/modules/customers/customFieldDefaults.js'

const INJECT = `${MARKER}
const __CF_ZH_LABELS = ${JSON.stringify(CUSTOM_FIELD_LABELS)};
const __CF_ZH_OPTIONS = ${JSON.stringify(CUSTOM_FIELD_OPTIONS)};
function __cfLocalizeFields(fields) {
  if (!Array.isArray(fields)) return fields;
  for (const field of fields) {
    if (!field || typeof field !== "object") continue;
    const label = __CF_ZH_LABELS[field.key];
    if (label) field.label = label;
    if (Array.isArray(field.options)) {
      field.options = field.options.map((option) => {
        if (option && typeof option === "object" && "value" in option) {
          const zh = __CF_ZH_OPTIONS[String(option.value)];
          return zh ? { ...option, label: zh } : option;
        }
        const value = String(option);
        const zh = __CF_ZH_OPTIONS[value];
        return zh ? { value, label: zh } : option;
      });
    }
  }
  return fields;
}
[CUSTOMER_ACTIVITY_CUSTOM_FIELDS, CUSTOMER_COMPANY_CUSTOM_FIELDS, CUSTOMER_DEAL_CUSTOM_FIELDS, CUSTOMER_PERSON_CUSTOM_FIELDS].forEach(__cfLocalizeFields);
`

const file = path.resolve(process.cwd(), TARGET)
if (!fs.existsSync(file)) {
  console.error(`[patch:cf-zh] target not found: ${TARGET}`)
  process.exit(1)
}

let source = fs.readFileSync(file, 'utf8')
if (source.includes(MARKER)) {
  console.log('[patch:cf-zh] already applied')
  process.exit(0)
}

const ANCHOR = 'export {\n'
if (!source.includes(ANCHOR)) {
  console.error('[patch:cf-zh] export anchor not found — package changed, update the patch')
  process.exit(1)
}
source = source.replace(ANCHOR, INJECT + '\n' + ANCHOR)
fs.writeFileSync(file, source)
console.log('[patch:cf-zh] localized code-defined custom fields')
