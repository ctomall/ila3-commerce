import { describe, expect, it, afterEach } from '@jest/globals'
import { apiDocsDisabled } from '../availability'

const original = process.env.API_DOCS_ENABLED

afterEach(() => {
  if (original === undefined) delete process.env.API_DOCS_ENABLED
  else process.env.API_DOCS_ENABLED = original
})

describe('apiDocsDisabled', () => {
  it('is off unless explicitly set to false', () => {
    delete process.env.API_DOCS_ENABLED
    expect(apiDocsDisabled()).toBe(false)
    process.env.API_DOCS_ENABLED = 'true'
    expect(apiDocsDisabled()).toBe(false)
    process.env.API_DOCS_ENABLED = '0'
    expect(apiDocsDisabled()).toBe(false)
  })

  it('accepts case and whitespace around false', () => {
    process.env.API_DOCS_ENABLED = ' FALSE '
    expect(apiDocsDisabled()).toBe(true)
    process.env.API_DOCS_ENABLED = 'false'
    expect(apiDocsDisabled()).toBe(true)
  })
})
