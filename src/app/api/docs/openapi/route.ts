import { NextResponse } from 'next/server'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { API_DOCS_CALLER_SCOPED_HEADERS } from '@open-mercato/core/modules/api_docs/lib/document'
import { loadOpenApiDocument } from '../document-cache'

export const dynamic = 'force-dynamic'

/**
 * The API document enumerates every endpoint and its parameters, so it is only
 * served to authenticated callers. It used to be public and cost about a second
 * of CPU per anonymous request.
 */
export async function GET(req: Request) {
  const auth = await getAuthFromRequest(req as never).catch(() => null)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: API_DOCS_CALLER_SCOPED_HEADERS })
  }
  const doc = await loadOpenApiDocument()
  return NextResponse.json(doc, { headers: API_DOCS_CALLER_SCOPED_HEADERS })
}
