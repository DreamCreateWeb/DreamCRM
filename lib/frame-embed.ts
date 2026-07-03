/**
 * Pure iframe-embeddability judgment for the compare view's LEFT pane (the
 * prospect's real site). The page does a server-side header pre-check (5s
 * GET, headers only) and this function decides: X-Frame-Options DENY or
 * SAMEORIGIN (we're cross-origin to them) blocks; a CSP frame-ancestors
 * directive blocks unless it allows any host ('*'). Fetch failures are
 * treated as blocked by the CALLER — a blank pane mid-demo is the one
 * unacceptable outcome, and the indictment-card fallback is the stronger
 * moment anyway.
 */
export function isFrameBlocked(headers: {
  xfo?: string | null
  csp?: string | null
}): boolean {
  const xfo = headers.xfo?.trim().toUpperCase()
  if (xfo === 'DENY' || xfo === 'SAMEORIGIN') return true

  const csp = headers.csp?.toLowerCase()
  if (csp) {
    const directive = csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('frame-ancestors'))
    if (directive) {
      const sources = directive.replace('frame-ancestors', '').trim()
      // 'none', 'self', or a host list that isn't us — all block a
      // cross-origin embed. Only a wildcard provably allows it.
      return !sources.split(/\s+/).includes('*')
    }
  }
  return false
}
