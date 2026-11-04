#!/usr/bin/env node
/**
 * End-to-end smoke test for the AI model configuration settings page.
 * Run on the server: node scripts/verify-ai-model-config.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
const OUT = '/home/pro/om-docs/models'
mkdirSync(OUT, { recursive: true })

const log = (message) => console.log(`[verify] ${message}`)

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`)
  log(`ok: ${message}`)
}

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({
  locale: 'zh-CN',
  viewport: { width: 1500, height: 1000 },
  baseURL: BASE,
  extraHTTPHeaders: { 'Accept-Language': 'zh-CN,zh;q=0.9' },
})

try {
  const login = await context.request.post('/api/auth/login', {
    form: { email: 'superadmin@acme.com', password: 'secret' },
  })
  log(`login status ${login.status()}`)
  assert(login.ok(), 'signed in through the login API')

  const page = await context.newPage()
  page.on('pageerror', (error) => console.error('[pageerror]', error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') console.error('[console.error]', message.text())
  })

  const cleanOverlays = async () => {
    await page.evaluate(() => {
      for (const element of document.querySelectorAll('div, section, aside')) {
        const text = element.textContent ?? ''
        if (text.startsWith('演示环境') && text.length < 400) element.remove()
        if (text.includes('接受 Cookie') && text.length < 400) element.remove()
      }
    }).catch(() => {})
  }

  const apiCheck = await context.request.get('/api/ai_model_config/models')
  const apiBody = await apiCheck.json()
  assert(apiCheck.status() === 200, `catalog API returns 200 (got ${apiCheck.status()})`)
  assert(apiBody.providers.length > 0, `catalog API lists ${apiBody.providers.length} providers`)
  assert(apiBody.models.length > 0, `catalog API lists ${apiBody.models.length} models`)

  await page.goto('/backend/config/ai-assistant/models', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-ai-models-add]', { timeout: 30000 })
  await page.waitForTimeout(1200)
  await cleanOverlays()
  const heading = await page.locator('h1').first().innerText()
  log(`page heading: ${heading}`)
  assert(heading.includes('模型配置') || heading.includes('Model Configuration'), 'page renders its title')
  await page.screenshot({ path: `${OUT}/01-page-zh.png` })

  // Add a custom model through the dialog (provider: OpenAI).
  await page.click('[data-ai-models-add]')
  await page.waitForSelector('[data-ai-models-editor-id]', { timeout: 10000 })
  await page.click('[data-ai-models-editor-provider]')
  await page.getByRole('option', { name: /^OpenAI/ }).click()
  await page.fill('[data-ai-models-editor-id]', 'gpt-5.2-preview')
  await page.fill('[data-ai-models-editor-name]', 'GPT-5.2 Preview')
  await page.fill('[data-ai-models-editor-context]', '400000')
  await cleanOverlays()
  await page.screenshot({ path: `${OUT}/02-dialog-zh.png` })
  await page.click('[data-ai-models-editor-save]')
  await page.waitForSelector('[data-ai-models-row="openai:gpt-5.2-preview"]', { timeout: 20000 })
  log('custom model row appears')
  await page.waitForTimeout(600)
  await cleanOverlays()
  await page.screenshot({ path: `${OUT}/03-added-model.png` })

  // The settings API (used by the AI settings page) must now expose it.
  const settingsCheck = await page.evaluate(async () => {
    const res = await fetch('/api/ai_assistant/settings', { credentials: 'include' })
    const body = await res.json()
    const openai = body.availableProviders?.find((provider) => provider.id === 'openai')
    return openai?.defaultModels?.some((model) => model.id === 'gpt-5.2-preview') ?? false
  })
  assert(settingsCheck === true, 'custom model is merged into /api/ai_assistant/settings')

  // Edit it.
  await page.click('[data-ai-models-edit="openai:gpt-5.2-preview"]')
  await page.waitForSelector('[data-ai-models-editor-name]', { timeout: 10000 })
  await page.fill('[data-ai-models-editor-name]', 'GPT-5.2 Preview (400K)')
  await page.click('[data-ai-models-editor-save]')
  await page.waitForTimeout(1500)
  assert(
    await page.locator('[data-ai-models-row="openai:gpt-5.2-preview"]').innerText().then((text) => text.includes('400K')),
    'renamed model shows the new name',
  )

  // Set as default.
  await page.click('[data-ai-models-set-default="openai:gpt-5.2-preview"]')
  await page.waitForTimeout(1800)
  const defaultText = await page.evaluate(async () => {
    const res = await fetch('/api/ai_assistant/settings', { credentials: 'include' })
    const body = await res.json()
    return body.tenantOverride ? `${body.tenantOverride.providerId}/${body.tenantOverride.modelId}` : null
  })
  assert(defaultText === 'openai/gpt-5.2-preview', `tenant default saved (${defaultText})`)
  await cleanOverlays()
  await page.screenshot({ path: `${OUT}/04-default-set.png` })

  // Disable the custom model and confirm the feed hides it (row stays visible with a Disabled badge).
  await page.click('[data-ai-models-toggle="openai:gpt-5.2-preview"]')
  await page.waitForTimeout(1500)
  const hiddenFromPicker = await page.evaluate(async () => {
    const res = await fetch('/api/ai_assistant/settings', { credentials: 'include' })
    const body = await res.json()
    const openai = body.availableProviders?.find((provider) => provider.id === 'openai')
    return !(openai?.defaultModels?.some((model) => model.id === 'gpt-5.2-preview') ?? false)
  })
  assert(hiddenFromPicker, 'disabled model disappears from the settings/provider feed')
  const defaultClearedOnDisable = await page.evaluate(async () => {
    const res = await fetch('/api/ai_assistant/settings', { credentials: 'include' })
    const body = await res.json()
    return body.tenantOverride === null
  })
  assert(defaultClearedOnDisable, 'disabling the current default model clears its override')
  await cleanOverlays()
  await page.screenshot({ path: `${OUT}/05-disabled-model.png` })

  // Delete it and clear the default override.
  await page.click('[data-ai-models-delete="openai:gpt-5.2-preview"]')
  await page.waitForSelector('[data-ai-models-delete-confirm]', { timeout: 10000 })
  await page.click('[data-ai-models-delete-confirm]')
  await page.waitForTimeout(1800)
  assert((await page.locator('[data-ai-models-row="openai:gpt-5.2-preview"]').count()) === 0, 'deleted model is gone')

  if (await page.locator('[data-ai-models-default-clear]').isEnabled()) {
    await page.click('[data-ai-models-default-clear]')
    await page.waitForTimeout(1500)
  }
  const cleared = await page.evaluate(async () => {
    const res = await fetch('/api/ai_assistant/settings', { credentials: 'include' })
    const body = await res.json()
    return body.tenantOverride === null
  })
  assert(cleared, 'default override cleared')

  // Restore the catalog to its clean state and capture the final view.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-ai-models-add]', { timeout: 30000 })
  await page.waitForTimeout(800)
  await cleanOverlays()
  await page.screenshot({ path: `${OUT}/06-final.png` })
  log('done')
} finally {
  await browser.close()
}
