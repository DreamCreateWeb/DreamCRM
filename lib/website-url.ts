// Client-safe URL helpers for the Website Studio.
//
// Lives outside the `'use server'` action file (which may only export async
// functions) so both the server action (`saveDifferenceVideo`) and the Studio
// client component can share one validator.

/**
 * Accepts an http(s) URL or a same-origin `/`-rooted path (uploaded clips), or
 * empty (clears the field). Rejects `javascript:`/`data:` and other schemes.
 */
export function isValidVideoUrl(raw: string): boolean {
  const v = raw.trim()
  if (!v) return true
  if (v.startsWith('/')) return true
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
