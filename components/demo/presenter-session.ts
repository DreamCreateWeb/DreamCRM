// Presenter sessionStorage scope — ALL presenter state (beat index, visited,
// per-beat notes, timer start, track override) lives under the 'dc.demo'
// prefix, keyed to ONE prospect at a time. Before this existed, demo #2
// silently resumed demo #1's clock and position ("the demo never ends").
// Pure sessionStorage helpers; every call is safe in private mode.

export const PRESENTER_KEY_PREFIX = 'dc.demo'
const SCOPE_KEY = 'dc.demo-key'
export const DEMO_START_KEY = 'dc.demo-started-at'
export const DEMO_NOTES_PREFIX = 'dc.demo-notes.'

/** Epoch ms the demo clock started (null before the timer mounts). */
export function readDemoStartedAt(): number | null {
  try {
    const raw = Number(sessionStorage.getItem(DEMO_START_KEY))
    return Number.isFinite(raw) && raw > 0 ? raw : null
  } catch {
    return null
  }
}

/** Snapshot of every per-beat note — { beatId: text }. */
export function readAllBeatNotes(): Record<string, string> {
  const out: Record<string, string> = {}
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(DEMO_NOTES_PREFIX)) {
        const v = sessionStorage.getItem(k)
        if (v) out[k.slice(DEMO_NOTES_PREFIX.length)] = v
      }
    }
  } catch {
    /* private mode */
  }
  return out
}

/** Store a per-beat note (empty value removes it). */
export function writeBeatNote(beatId: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(`${DEMO_NOTES_PREFIX}${beatId}`, value)
    else sessionStorage.removeItem(`${DEMO_NOTES_PREFIX}${beatId}`)
  } catch {
    /* private mode */
  }
}

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
