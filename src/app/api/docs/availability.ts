/**
 * Deployment switch for the generated API documents.
 *
 * They are already authenticated, but an installation may not want to expose its
 * endpoint inventory at all. Setting API_DOCS_ENABLED=false answers 404 so the route
 * is indistinguishable from a path that does not exist.
 */
export function apiDocsDisabled(): boolean {
  return (process.env.API_DOCS_ENABLED ?? '').trim().toLowerCase() === 'false'
}
