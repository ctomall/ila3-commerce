import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { generateMarkdownFromOpenApi } from '@open-mercato/shared/lib/openapi'
import { API_DOCS_CALLER_SCOPED_HEADERS } from '@open-mercato/core/modules/api_docs/lib/document'
import { loadOpenApiDocument } from '../document-cache'
import { apiDocsDisabled } from '../availability'

export const dynamic = 'force-dynamic'

/**
 * Markdown rendering of the API document. It shares the authenticated cache with
 * the JSON endpoint; both are only served to signed-in callers.
 */
export async function GET(req: Request) {
  if (apiDocsDisabled()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const auth = await getAuthFromRequest(req as never).catch(() => null)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: API_DOCS_CALLER_SCOPED_HEADERS })
  }
  const doc = await loadOpenApiDocument()
  const markdown = generateMarkdownFromOpenApi(doc as never)
  return new Response(markdown, {
    headers: {
      ...API_DOCS_CALLER_SCOPED_HEADERS,
      'content-type': 'text/markdown; charset=utf-8',
    },
  })
}
