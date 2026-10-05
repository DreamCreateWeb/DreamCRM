/**
 * THE FIRST WEEK's activation events (docs/ACTIVATION.md Part 3) — the pure
 * vocabulary shared by the cockpit, the day-one kick and the stamps.
 */

export const ACTIVATION_EVENTS = [
  { key: 'a1', label: 'Data connected', short: 'A1' },
  { key: 'a2', label: 'First message sent', short: 'A2' },
  { key: 'a3', label: 'First booking', short: 'A3' },
  { key: 'a4', label: 'First review ask', short: 'A4' },
  { key: 'a5', label: 'First form in', short: 'A5' },
] as const

export type ActivationKey = (typeof ACTIVATION_EVENTS)[number]['key']
export type Activation = Record<ActivationKey, Date | null>

export const ACTIVATION_KEYS: readonly ActivationKey[] = ACTIVATION_EVENTS.map((e) => e.key)

export function isActivationKey(k: unknown): k is ActivationKey {
  return typeof k === 'string' && (ACTIVATION_KEYS as readonly string[]).includes(k)
}

export const EMPTY_ACTIVATION: Activation = { a1: null, a2: null, a3: null, a4: null, a5: null }

/** The stored jsonb (`{ a1: iso, … }`) → typed; junk keys and bad dates are dropped, never thrown. */
export function parseActivation(raw: unknown): Activation {
  const out: Activation = { ...EMPTY_ACTIVATION }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isActivationKey(k) || typeof v !== 'string') continue
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) out[k] = d
  }
  return out
}

/** The earliest real date among candidates, or null. */
export function earliestOf(...dates: Array<Date | null | undefined>): Date | null {
  const real = dates.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()))
  return real.length ? new Date(Math.min(...real.map((d) => d.getTime()))) : null
}
