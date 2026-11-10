/**
 * "Settled surface" predicate shared by the full acceptance harness and the T3
 * targeted evidence script.
 *
 * A page is settled when no loading indicator is visible AND the main surface
 * shows one of:
 *   - rows   (a table/data list has data rows)
 *   - empty  (an explicit empty-state message)
 *   - error  (a readable error plus a retry control)
 *   - form   (a rendered form with fields and a submit control — account pages
 *             such as Change Password are forms, not tables)
 *
 * Anything else is NOT settled. This is the gate that makes an infinite
 * spinner impossible to pass: `unknown` and `loading` both fail.
 */

export async function surfaceState(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      if (rect.width < 2 || rect.height < 2) return false
      if (style.display === 'none' || style.visibility === 'hidden') return false
      if (element.classList.contains('sr-only') || element.closest('.sr-only')) return false
      return true
    }
    const main = document.querySelector('main') ?? document.body
    const rawText = (main.innerText ?? '').replace(/\s+/g, ' ').trim()
    const loadingIndicators = Array.from(main.querySelectorAll('.animate-spin, [role="status"], [aria-busy="true"], [aria-label*="加载"], [aria-label*="Loading"]')).filter(visible)
    const loadingText = /正在加载|加载中|Loading table|Loading\.\.\.|加载更多/.test(rawText)
    const rows = Array.from(main.querySelectorAll('table tbody tr')).filter(visible).length
    const dataRows = rows + Array.from(main.querySelectorAll('[data-testid*="row"], [data-row]')).filter(visible).length
    const empty = /没有|暂无|尚未|还没有|You have no|No [a-z ]+ yet|No results|Nothing here|是空的/i.test(rawText) && rawText.length > 20
    const errorText = /加载失败|Failed to load|出错了|Error loading|Something went wrong|无法加载/i.test(rawText)
    const retry = Array.from(main.querySelectorAll('button, a')).some((element) => visible(element) && /重试|重新加载|Retry|Try again|Reload/i.test(element.innerText ?? ''))
    const formFields = Array.from(main.querySelectorAll('form input, form textarea, form select')).filter(visible).length
    const formSubmit = Array.from(main.querySelectorAll('form button, form [type="submit"]')).some(visible)
    const interactiveControls = Array.from(main.querySelectorAll('button, a[href], input, textarea, select')).filter(visible).length
    const surface = dataRows > 0 ? 'rows' : (errorText && retry) ? 'error' : empty ? 'empty' : (formFields >= 1 && formSubmit) ? 'form' : (loadingIndicators.length > 0 || loadingText) ? 'loading' : 'unknown'
    return {
      loadingIndicators: loadingIndicators.length,
      loadingText,
      rows: dataRows,
      empty,
      errorText,
      retry,
      formFields,
      formSubmit,
      interactiveControls,
      surface,
      textLength: rawText.length,
      text: rawText.slice(0, 400),
    }
  })
}

/**
 * Polls `surfaceState` until settled or the timeout expires. Returns the last
 * observation plus `settled`, `waitedMs` and the timeout flag.
 */
export async function waitSettled(page, { timeout = 9000, poll = 300 } = {}) {
  const started = Date.now()
  let last = await surfaceState(page).catch(() => null)
  // A non-table settings surface (e.g. /backend/sidebar-customization) has no
  // rows/empty/error/form marker. It IS settled once loading is gone, the main
  // region has interactive controls, and its text length has been stable for
  // at least two polls. Requiring stability keeps a skeleton that merely has
  // static chrome from being counted as a finished page.
  let stable = { textLength: -1, since: 0 }
  while (Date.now() - started < timeout) {
    if (last && !last.loadingIndicators && !last.loadingText) {
      if (last.surface !== 'loading' && last.surface !== 'unknown') {
        return { settled: true, waitedMs: Date.now() - started, ...last }
      }
      const now = Date.now()
      const hasStableContent = last.textLength >= 80 && last.interactiveControls > 0
      if (hasStableContent && stable.textLength === last.textLength && now - stable.since >= 500) {
        return { settled: true, waitedMs: now - started, surface: 'custom-surface', ...last }
      }
      if (hasStableContent && stable.textLength !== last.textLength) stable = { textLength: last.textLength, since: now }
      else if (!hasStableContent) stable = { textLength: -1, since: 0 }
    } else {
      stable = { textLength: -1, since: 0 }
    }
    await new Promise((resolve) => setTimeout(resolve, poll))
    last = await surfaceState(page).catch(() => null)
  }
  return { settled: false, waitedMs: Date.now() - started, timedOut: true, ...(last ?? {}) }
}
