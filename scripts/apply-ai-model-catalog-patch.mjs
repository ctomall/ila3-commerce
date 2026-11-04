#!/usr/bin/env node
/**
 * Applies the "tenant model catalog" merge to the prebuilt @open-mercato/ai-assistant
 * package in node_modules.
 *
 * Two read-only surfaces need to know about tenant-added models:
 *   - GET /api/ai_assistant/settings        (settings page provider/model dropdowns)
 *   - GET /api/ai_assistant/ai/agents/:id/models  (chat model picker)
 *
 * The package ships prebuilt (dist/*.js) and its source build script
 * (scripts/build-package.mjs) is not part of the published tarball, so this
 * script patches dist directly. It is idempotent: re-running it is a no-op.
 *
 * Usage: node scripts/apply-ai-model-catalog-patch.mjs [--root /path/to/app]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const rootFlagIndex = args.indexOf('--root')
const appRoot = resolve(rootFlagIndex >= 0 ? args[rootFlagIndex + 1] ?? process.cwd() : process.cwd())
const packageRoot = join(appRoot, 'node_modules', '@open-mercato', 'ai-assistant')
const distRoot = join(packageRoot, 'dist', 'modules', 'ai_assistant')
const storePath = join(distRoot, 'lib', 'model-catalog-store.js')

const storeSource = `const PROVIDER_STORE_VERSION = "v3";
import { existsSync, readFileSync } from "node:fs";
import { createDecipheriv, scryptSync } from "node:crypto";
import { join } from "node:path";
import { createLogger } from "@open-mercato/shared/lib/logger";
import { createOpenAICompatibleProvider } from "./llm-adapters/openai.js";
const logger = createLogger("ai_assistant");
const MODULE_ID = "ai_assistant";
const CONFIG_NAME = "model_catalog";
export async function loadModelCatalogEntries(container, scope) {
  try {
    if (!container || typeof container.hasRegistration !== "function") return [];
    if (!container.hasRegistration("moduleConfigService")) return [];
    const service = container.resolve("moduleConfigService");
    const value = await service.getValue(MODULE_ID, CONFIG_NAME, { scope });
    const entries = Array.isArray(value?.entries) ? value.entries : [];
    return entries.filter((entry) => entry && typeof entry.providerId === "string" && typeof entry.modelId === "string");
  } catch (error) {
    logger.warn("AI model catalog \\u2014 failed to load tenant catalog", { err: error });
    return [];
  }
}
export function applyCatalogToModels(providerId, models, entries) {
  const mine = entries.filter((entry) => entry.providerId === providerId);
  if (mine.length === 0) return models;
  const pending = new Map(mine.map((entry) => [String(entry.modelId).trim().toLowerCase(), entry]));
  const merged = [];
  for (const model of models) {
    const key = String(model.id).trim().toLowerCase();
    const entry = pending.get(key);
    if (!entry) {
      merged.push(model);
      continue;
    }
    pending.delete(key);
    if (entry.enabled === false) continue;
    merged.push({
      ...model,
      name: entry.name || model.name,
      contextWindow: entry.contextWindow ?? model.contextWindow,
      tags: Array.isArray(entry.tags) && entry.tags.length > 0 ? entry.tags : model.tags
    });
  }
  for (const entry of pending.values()) {
    if (entry.enabled === false) continue;
    merged.push({
      id: entry.modelId,
      name: entry.name || entry.modelId,
      contextWindow: entry.contextWindow ?? void 0,
      tags: Array.isArray(entry.tags) ? entry.tags : []
    });
  }
  return merged;
}
function resolveProviderFile() {
  return process.env.OM_AI_PROVIDERS_FILE || join(process.cwd(), "storage", "ai-model-providers.json");
}
function decryptProviderSecret(payload) {
  if (typeof payload !== "string" || !payload.startsWith("enc:v1:")) return null;
  try {
    const secret = process.env.MODEL_CONFIG_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
    if (!secret) return null;
    const key = scryptSync(secret, "open-mercato:model-provider-credentials:v1", 32);
    const [iv, tag, data] = payload.slice("enc:v1:".length).split(":");
    if (!iv || !tag || !data) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
function envSafeProviderId(id) {
  return String(id).toUpperCase().replace(/[^A-Z0-9]/g, "_");
}
function setProviderEnv(name, value) {
  const store = globalThis;
  if (!store.__OM_AI_PROVIDER_ENV_ORIGINALS__) store.__OM_AI_PROVIDER_ENV_ORIGINALS__ = {};
  if (!(name in store.__OM_AI_PROVIDER_ENV_ORIGINALS__)) {
    store.__OM_AI_PROVIDER_ENV_ORIGINALS__[name] = process.env[name];
  }
  process.env[name] = value;
}
export function applyProviderFileConfig(registry) {
  try {
    const file = resolveProviderFile();
    if (!existsSync(file)) return;
    const raw = JSON.parse(readFileSync(file, "utf8"));
    for (const [providerId, credential] of Object.entries(raw.credentials || {})) {
      const provider = registry.get(providerId);
      if (!provider) continue;
      const apiKey = decryptProviderSecret(credential?.apiKey);
      const keyName = provider.envKeys?.[0];
      if (apiKey && keyName) setProviderEnv(keyName, apiKey);
      if (credential?.baseURL) setProviderEnv(envSafeProviderId(providerId) + "_BASE_URL", credential.baseURL);
    }
    if (raw.defaultModel?.providerId && raw.defaultModel?.modelId) {
      setProviderEnv("OM_AI_PROVIDER", raw.defaultModel.providerId);
      setProviderEnv("OM_AI_MODEL", raw.defaultModel.modelId);
    }
    for (const provider of raw.customProviders || []) {
      if (!provider?.id || !provider?.baseURL) continue;
      const envName = "OM_CUSTOM_" + envSafeProviderId(provider.id) + "_API_KEY";
      const apiKey = decryptProviderSecret(provider.apiKey);
      if (apiKey) setProviderEnv(envName, apiKey);
      registry.register(createOpenAICompatibleProvider({
        id: provider.id,
        name: provider.name || provider.id,
        baseURL: provider.baseURL,
        envKeys: [envName],
        defaultModel: provider.defaultModel || "",
        defaultModels: []
      }));
    }
  } catch (error) {
    logger.warn("AI model providers \\u2014 failed to apply runtime config file", { err: error });
  }
}
`

function read(path) {
  return readFileSync(path, 'utf8')
}

function writeOnce(path, content, marker) {
  if (!existsSync(path)) {
    writeFileSync(path, content)
    return true
  }
  const current = read(path)
  if (current.includes(marker)) return false
  writeFileSync(path, content)
  return true
}

function backup(path) {
  const bak = `${path}.model-catalog.bak`
  if (!existsSync(bak)) writeFileSync(bak, read(path))
}

function patchSettingsRoute() {
  const file = join(distRoot, 'api', 'settings', 'route.js')
  let source = read(file)
  if (source.includes('applyCatalogToModels')) {
    console.log('settings route: already patched')
    return
  }
  backup(file)

  const importAnchor = 'import { llmProviderRegistry } from "../../lib/llm-registry.js";'
  if (!source.includes(importAnchor)) throw new Error('settings route: llm-registry import anchor not found')
  source = source.replace(
    importAnchor,
    `${importAnchor}\nimport { applyCatalogToModels, loadModelCatalogEntries } from "../../lib/model-catalog-store.js";`,
  )

  const loadAnchor = '    const allRawProviders = ['
  if (!source.includes(loadAnchor)) throw new Error('settings route: allRawProviders anchor not found')
  source = source.replace(
    loadAnchor,
    `    const modelCatalogEntries = await loadModelCatalogEntries(await createRequestContainer(), {\n      tenantId: auth.tenantId ?? null,\n      organizationId: auth.orgId ?? null\n    });\n${loadAnchor}`,
  )

  if (!source.includes('defaultModels: clippedDefaults')) throw new Error('settings route: clippedDefaults anchor not found')
  source = source.replace(
    'defaultModels: clippedDefaults',
    'defaultModels: applyCatalogToModels(p.id, clippedDefaults, modelCatalogEntries)',
  )
  if (!source.includes('defaultModels: envClippedDefaults')) throw new Error('settings route: envClippedDefaults anchor not found')
  source = source.replace(
    'defaultModels: envClippedDefaults',
    'defaultModels: applyCatalogToModels(p.id, envClippedDefaults, modelCatalogEntries)',
  )

  writeFileSync(file, source)
  console.log('settings route: patched')
}

function patchAgentModelsRoute() {
  const file = join(distRoot, 'api', 'ai', 'agents', '[agentId]', 'models', 'route.js')
  let source = read(file)
  if (source.includes('applyCatalogToModels')) {
    console.log('agent models route: already patched')
    return
  }
  backup(file)

  const importAnchor = 'import { llmProviderRegistry } from "../../../../../lib/llm-registry.js";'
  if (!source.includes(importAnchor)) throw new Error('agent models route: llm-registry import anchor not found')
  source = source.replace(
    importAnchor,
    `${importAnchor}\nimport { applyCatalogToModels, loadModelCatalogEntries } from "../../../../../lib/model-catalog-store.js";`,
  )

  const loadAnchor = '    const providers = allowRuntimeOverride ?'
  if (!source.includes(loadAnchor)) throw new Error('agent models route: providers anchor not found')
  source = source.replace(
    loadAnchor,
    `    const modelCatalogEntries = await loadModelCatalogEntries(container, {\n      tenantId: auth.tenantId ?? null,\n      organizationId: auth.orgId ?? null\n    });\n${loadAnchor}`,
  )

  const filterAnchor = `      const filteredModels = modelsForPicker(provider, allowedModelIds).filter(
        (model) => isModelAllowedForProviderInEffective(effectiveAllowlist, provider.id, model.id)
      );`
  if (!source.includes(filterAnchor)) throw new Error('agent models route: filteredModels anchor not found')
  source = source.replace(
    filterAnchor,
    `      const allowlistedModels = modelsForPicker(provider, allowedModelIds).filter(
        (model) => isModelAllowedForProviderInEffective(effectiveAllowlist, provider.id, model.id)
      );
      const filteredModels = applyCatalogToModels(provider.id, allowlistedModels, modelCatalogEntries);`,
  )

  writeFileSync(file, source)
  console.log('agent models route: patched')
}

function patchDeepSeekPreset() {
  const file = join(distRoot, 'lib', 'openai-compatible-presets.js')
  let source = read(file)
  if (source.includes('DEEPSEEK_PRESET')) {
    console.log('deepseek preset: already patched')
    return
  }
  backup(file)

  const presetAnchor = 'const OPENAI_COMPATIBLE_PRESETS = ['
  if (!source.includes(presetAnchor)) throw new Error('deepseek preset: array anchor not found')
  source = source.replace(
    presetAnchor,
    `const DEEPSEEK_PRESET = {\n  id: "deepseek",\n  name: "DeepSeek",\n  baseURL: "https://api.deepseek.com/v1",\n  baseURLEnvKeys: ["DEEPSEEK_BASE_URL"],\n  envKeys: ["DEEPSEEK_API_KEY"],\n  defaultModel: "deepseek-chat",\n  defaultModels: [\n    {\n      id: "deepseek-chat",\n      name: "DeepSeek Chat (V3.2)",\n      contextWindow: 128000,\n      tags: ["budget", "fast"]\n    },\n    {\n      id: "deepseek-reasoner",\n      name: "DeepSeek Reasoner (R1)",\n      contextWindow: 128000,\n      tags: ["reasoning"]\n    }\n  ]\n};\n${presetAnchor}`,
  )

  const firstEntryAnchor = 'const OPENAI_COMPATIBLE_PRESETS = [\n  OPENAI_PRESET,'
  if (!source.includes(firstEntryAnchor)) throw new Error('deepseek preset: first entry anchor not found')
  source = source.replace(firstEntryAnchor, 'const OPENAI_COMPATIBLE_PRESETS = [\n  DEEPSEEK_PRESET,\n  OPENAI_PRESET,')

  writeFileSync(file, source)
  console.log('deepseek preset: patched')
}

function patchLlmBootstrap() {
  const file = join(distRoot, 'lib', 'llm-bootstrap.js')
  let source = read(file)
  if (source.includes('applyProviderFileConfig')) {
    console.log('llm bootstrap: already patched')
    return
  }
  backup(file)

  const importAnchor = 'import { OPENAI_COMPATIBLE_PRESETS } from "./openai-compatible-presets.js";'
  if (!source.includes(importAnchor)) throw new Error('llm bootstrap: preset import anchor not found')
  source = source.replace(
    importAnchor,
    `${importAnchor}\nimport { applyProviderFileConfig } from "./model-catalog-store.js";`,
  )

  const callAnchor = '  bootstrapped = true;'
  if (!source.includes(callAnchor)) throw new Error('llm bootstrap: bootstrapped anchor not found')
  source = source.replace(callAnchor, `  applyProviderFileConfig(llmProviderRegistry);\n${callAnchor}`)

  writeFileSync(file, source)
  console.log('llm bootstrap: patched')
}

function patchRegistryUnregister() {
  const file = join(
    appRoot,
    'node_modules',
    '@open-mercato',
    'shared',
    'dist',
    'lib',
    'ai',
    'llm-provider-registry.js',
  )
  let source = read(file)
  if (source.includes('unregister(id)')) {
    console.log('registry unregister: already patched')
    return
  }
  backup(file)

  const anchor = `  get(id) {
    return this.providers.get(id) ?? null;
  }`
  if (!source.includes(anchor)) throw new Error('registry unregister: get() anchor not found')
  source = source.replace(
    anchor,
    `  unregister(id) {
    this.providers.delete(id);
  }
${anchor}`,
  )
  writeFileSync(file, source)
  console.log('registry unregister: patched')
}

function patchChatErrorMapping() {
  const file = join(distRoot, 'api', 'ai', 'chat', 'route.js')
  let source = read(file)
  if (source.includes('model_configuration_required')) {
    console.log('chat error mapping: already patched')
    return
  }
  backup(file)

  const anchor = '    logger.error("AI Chat Agent \\u2014 Dispatch failure", { err: error });'
  if (!source.includes(anchor)) throw new Error('chat error mapping: dispatch failure anchor not found')
  source = source.replace(
    anchor,
    `    if (error && (error.code === "no_provider_configured" || error.code === "api_key_missing")) {\n      return jsonError(\n        400,\n        "The configured model provider has no usable API key. Open Model configuration to add the provider key or choose another default model.",\n        "model_configuration_required",\n        { action: "configure_models", href: "/backend/config/ai-assistant/models" }\n      );\n    }\n${anchor}`,
  )

  writeFileSync(file, source)
  console.log('chat error mapping: patched')
}

function patchChatErrorUi() {
  const file = join(appRoot, 'node_modules', '@open-mercato', 'ui', 'dist', 'ai', 'AiChat.js')
  let source = read(file)
  if (source.includes('data-ai-error-action')) {
    console.log('chat error UI: already patched')
    return
  }
  backup(file)

  const warningAnchor = '    "moderation_unavailable"\n  ]);'
  if (!source.includes(warningAnchor)) throw new Error('chat error UI: warning codes anchor not found')
  source = source.replace(
    warningAnchor,
    '    "moderation_unavailable",\n    "model_configuration_required"\n  ]);',
  )

  const switchAnchor = '    default:\n      return fallback;'
  if (!source.includes(switchAnchor)) throw new Error('chat error UI: switch default anchor not found')
  source = source.replace(
    switchAnchor,
    `    case "model_configuration_required":\n      return translate(\n        "ai_assistant.errors.modelConfigurationRequired",\n        "The model provider is not configured. Open Model configuration to add its API key or choose another default model."\n      );\n${switchAnchor}`,
  )

  const messageAnchor = '            resolveChatErrorMessage(chat.error.code, chat.error.message, t)'
  if (!source.includes(messageAnchor)) throw new Error('chat error UI: message anchor not found')
  source = source.replace(
    messageAnchor,
    `${messageAnchor},\n            chat.error.code === "model_configuration_required" ? /* @__PURE__ */ jsx(\n              "a",\n              {\n                href: "/backend/config/ai-assistant/models",\n                className: "ml-2 inline-flex items-center whitespace-nowrap font-medium underline underline-offset-2",\n                "data-ai-error-action": "model-config",\n                children: t("ai_assistant.errors.configureModels", "Open model configuration")\n              }\n            ) : null`,
  )

  writeFileSync(file, source)
  console.log('chat error UI: patched')
}

if (!existsSync(packageRoot)) {
  console.error(`@open-mercato/ai-assistant not found at ${packageRoot}`)
  process.exit(1)
}

writeOnce(storePath, storeSource, 'PROVIDER_STORE_VERSION = "v3"')
patchSettingsRoute()
patchAgentModelsRoute()
patchDeepSeekPreset()
patchRegistryUnregister()
patchLlmBootstrap()
patchChatErrorMapping()
patchChatErrorUi()
console.log('done')
