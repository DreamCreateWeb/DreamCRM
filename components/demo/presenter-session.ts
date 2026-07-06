// Presenter sessionStorage scope — ALL presenter state (beat index, visited,
// per-beat notes, timer start, track override) lives under the 'dc.demo'
// prefix, keyed to ONE prospect at a time. Before this existed, demo #2
// silently resumed demo #1's clock and position ("the demo never ends").
// Pure sessionStorage helpers; every call is safe in private mode.

export const PRESENTER_KEY_PREFIX = 'dc.demo'
const SCOPE_KEY = 'dc.demo-key'

/** Wipe every presenter key — a demo ended, or a different prospect started. */
export function clearPresenterSession(): void {
  try {
    const doomed: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(PRESENTER_KEY_PREFIX)) doomed.push(k)
    }
    for (const k of doomed) sessionStorage.removeItem(k)
  } catch {
    /* private mode — nothing persisted anyway */
  }
}

/** Reset the presenter state when the demo's prospect changes — a fresh
 *  demo starts at beat 1 with a 0:00 clock, never on the last prospect's. */
export function ensurePresenterScope(scope: string): void {
  try {
    if (sessionStorage.getItem(SCOPE_KEY) !== scope) {
      clearPresenterSession()
      sessionStorage.setItem(SCOPE_KEY, scope)
    }
  } catch {
    /* private mode */
  }
}
