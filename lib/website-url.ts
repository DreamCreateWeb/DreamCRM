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

// Hosts whose share links are WEB PAGES, not video files. The public templates
// play the URL through a bare `<video src>`, so one of these links renders as
// a silent empty box (the "grey video" report, 2026-08-07: a Google Drive
// share link saved fine and played nothing). Detected at both entry surfaces
// AND the save action, because saving a link that is guaranteed not to play is
// worse than refusing it with a reason.
const PAGE_NOT_FILE_HOSTS: Array<{ match: RegExp; label: string }> = [
  { match: /(^|\.)drive\.google\.com$/i, label: 'Google Drive' },
  { match: /(^|\.)docs\.google\.com$/i, label: 'Google Drive' },
  { match: /(^|\.)photos\.google\.com$/i, label: 'Google Photos' },
  { match: /(^|\.)dropbox\.com$/i, label: 'Dropbox' },
  { match: /(^|\.)youtube\.com$/i, label: 'YouTube' },
  { match: /^youtu\.be$/i, label: 'YouTube' },
  { match: /(^|\.)vimeo\.com$/i, label: 'Vimeo' },
]

/**
 * Why a syntactically-valid video URL still won't play on the site, or null if
 * it looks playable. Returns human copy naming the host — shown verbatim under
 * the URL field and returned from the save action.
 */
export function videoUrlProblem(raw: string): string | null {
  const v = raw.trim()
  if (!v || v.startsWith('/')) return null
  let u: URL
  try {
    u = new URL(v)
  } catch {
    return null // shape errors are isValidVideoUrl's job
  }
  const host = PAGE_NOT_FILE_HOSTS.find((h) => h.match.test(u.hostname))
  if (!host) return null
  // Dropbox direct-content links DO stream (dl.dropboxusercontent.com, or
  // ?raw=1 / dl=1 on the share host) — only the plain share page is a dead end.
  if (host.label === 'Dropbox') {
    const q = u.searchParams
    if (q.get('raw') === '1' || q.get('dl') === '1') return null
  }
  return `That's a ${host.label} page link, not a video file — the site's player can't play it. Upload the video here instead, or paste a direct .mp4/.webm link.`
}
