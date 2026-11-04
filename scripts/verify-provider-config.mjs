import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = '/home/pro/om-docs/models'
mkdirSync(OUT, { recursive: true })
const log = (m) => console.log(`[providers] ${m}`)
const assert = (c, m) => { if (!c) throw new Error(`ASSERTION FAILED: ${m}`); log(`ok: ${m}`) }
const cleanOverlays = (page) => page.evaluate(() => {
  for (const el of document.querySelectorAll('div, section, aside')) {
    const text = el.textContent ?? ''
    if ((text.startsWith('演示环境') || text.includes('接受 Cookie')) && text.length < 400) el.remove()
  }
})

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3000', locale: 'zh-CN', viewport: { width: 1500, height: 1000 } })
try {
  const login = await context.request.post('/api/auth/login', { form: { email: 'superadmin@acme.com', password: 'secret' } })
  assert(login.ok(), 'logged in')
  const page = await context.newPage()

  // Save a key through the settings UI.
  await page.goto('/backend/config/ai-assistant/models', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-ai-provider-row="deepseek"]', { timeout: 30000 })
  await cleanOverlays(page)
  await page.click('[data-ai-provider-configure="deepseek"]')
  await page.waitForSelector('[data-ai-provider-api-key]', { timeout: 10000 })
  await page.fill('[data-ai-provider-api-key]', 'sk-ui-test-deepseek-0001')
  await page.click('[data-ai-provider-save]')
  await page.waitForFunction(() => {
    const row = document.querySelector('[data-ai-provider-row="deepseek"]')
    return row?.textContent?.includes('设置页')
  }, { timeout: 20000 })
  log('UI saved the DeepSeek key')
  const settings = await (await context.request.get('/api/ai_assistant/settings')).json()
  assert(settings.availableProviders.find((p) => p.id === 'deepseek')?.configured === true, 'provider configured immediately (no restart)')
  assert(!JSON.stringify(settings).includes('sk-ui-test-deepseek'), 'API never returns the key')
  await cleanOverlays(page)
  await page.screenshot({ path: `${OUT}/10-deepseek-configured.png` })

  // Custom provider + seed model.
  const custom = await context.request.post('/api/ai_model_config/providers', {
    data: { id: 'my-gateway', name: 'My Gateway', baseURL: 'https://gateway.example.com/v1', apiKey: 'sk-custom-0002', defaultModel: 'my-model-1' },
  })
  assert(custom.ok(), `create custom provider (${custom.status()})`)
  const page2 = await context.newPage()
  await page2.goto('/backend/config/ai-assistant/models', { waitUntil: 'domcontentloaded' })
  await page2.waitForSelector('[data-ai-provider-row="my-gateway"]', { timeout: 30000 })
  await cleanOverlays(page2)
  await page2.locator('[data-ai-provider-row="my-gateway"]').scrollIntoViewIfNeeded()
  await page2.waitForTimeout(300)
  await page2.screenshot({ path: `${OUT}/11-custom-provider.png` })
  const catalog = await (await context.request.get('/api/ai_model_config/models')).json()
  assert(catalog.models.some((m) => m.providerId === 'my-gateway' && m.modelId === 'my-model-1'), 'seed model in catalog')
  const delCustom = await context.request.delete('/api/ai_model_config/providers/my-gateway')
  assert(delCustom.ok(), 'delete custom provider')
  const settings2 = await (await context.request.get('/api/ai_assistant/settings')).json()
  assert(!settings2.availableProviders.some((p) => p.id === 'my-gateway'), 'custom provider unregistered')

  // Clear the saved key through the UI.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-ai-provider-row="deepseek"]', { timeout: 30000 })
  await cleanOverlays(page)
  await page.click('[data-ai-provider-configure="deepseek"]')
  await page.waitForSelector('[data-ai-provider-clear]', { timeout: 10000 })
  await page.click('[data-ai-provider-clear]')
  await page.waitForFunction(() => {
    const row = document.querySelector('[data-ai-provider-row="deepseek"]')
    return row?.textContent?.includes('未配置')
  }, { timeout: 20000 })
  log('UI cleared the saved key')
  const settings3 = await (await context.request.get('/api/ai_assistant/settings')).json()
  assert(settings3.availableProviders.find((p) => p.id === 'deepseek')?.configured === false, 'provider unconfigured immediately after clear')

  log('done')
} finally {
  await browser.close()
}
