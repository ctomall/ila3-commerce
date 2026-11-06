import { modules } from '@/.mercato/generated/modules.runtime.generated'
import { apiRoutes } from '@/.mercato/generated/api-routes.generated'
import { buildApiDocsOpenApiDocument } from '@open-mercato/core/modules/api_docs/lib/document'

/**
 * Shared loader for the generated API documents.
 *
 * Building the OpenAPI document from every registered route is expensive (the
 * response is ~11 MB and costs about a second of CPU), so it is cached per
 * process. Only authenticated callers reach this code; the access-control
 * metadata is always included because the caller is known.
 */
const TTL_MS = 60_000

let cache: { at: number; doc: unknown } | null = null

export async function loadOpenApiDocument(): Promise<unknown> {
  const now = Date.now()
  if (cache && now - cache.at < TTL_MS) return cache.doc
  const doc = await buildApiDocsOpenApiDocument({
    modules,
    apiRoutes,
    includeAccessControlMetadata: true,
  })
  cache = { at: now, doc }
  return doc
}
