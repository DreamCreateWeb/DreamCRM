/**
 * Test helper for the Draft→Publish write routing. Draftable website columns
 * no longer write their live column — `stageWebsiteValues` merges them into
 * the `website_draft` jsonb via a SQL fragment:
 *   COALESCE(website_draft, '{}'::jsonb) || $json::jsonb
 * A mocked `db.update().set(...)` therefore receives `websiteDraft` as a
 * drizzle SQL object whose param chunk holds the staged values as JSON.
 * These helpers unwrap it so assertions can keep reading "what the save
 * wrote" as one flat object (live columns + staged keys together).
 */

/** The staged payload inside a mocked set's websiteDraft SQL fragment. */
export function stagedJson(set: Record<string, unknown>): Record<string, unknown> {
  const frag = set.websiteDraft as { queryChunks?: unknown[] } | null | undefined
  if (!frag || typeof frag !== 'object' || !Array.isArray(frag.queryChunks)) return {}
  for (const chunk of frag.queryChunks) {
    // The interpolated JSON payload rides as a raw string chunk (drizzle wraps
    // it into a Param at query-build time, not template time).
    if (typeof chunk === 'string') {
      try {
        return JSON.parse(chunk) as Record<string, unknown>
      } catch {
        /* not the payload chunk */
      }
    }
  }
  return {}
}

/** Live column writes + staged draft keys, minus bookkeeping — the flat
 *  "what this save wrote, as the editor sees it" view. */
export function writtenSet(set: Record<string, unknown>): Record<string, unknown> {
  const direct: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(set)) {
    if (k !== 'websiteDraft' && k !== 'updatedAt') direct[k] = v
  }
  return { ...direct, ...stagedJson(set) }
}
