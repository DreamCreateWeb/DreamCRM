// Shared spam-trust primitives for every PUBLIC form (contact, insurance
// verifier, booking, careers apply, review, membership join). Two cheap,
// JS-free-friendly bot filters that cost a real user nothing:
//
//  1. HONEYPOT — a visually-hidden field a human never sees or fills, but
//     naive bots auto-complete. Any value present ⇒ treat as a bot.
//  2. TIME-TRAP — a hidden timestamp of when the form mounted. A human takes
//     at least a few seconds to fill a form; a bot submits instantly. A submit
//     that arrives faster than MIN_ELAPSED_MS ⇒ treat as a bot.
//
// Both are *silent*: on a bot hit the server action returns its normal success
// shape (so the bot gets no signal to adapt) WITHOUT writing anything. This is
// the standard honeypot doctrine — never 400, never error, just no-op.
//
// Pure + client-safe (no server-only imports) so the form components can import
// the field names + the mount-timestamp helper, and the server actions can
// import the validator.

/** Hidden field names. Deliberately innocuous so a bot's autofill heuristics
 *  target them. Kept stable so existing tests + forms agree. */
export const HONEYPOT_FIELD = 'company_website'
export const TIMETRAP_FIELD = 'form_loaded_at'

/** A human almost never submits a real form in under ~2.5s. Bots fire in ms.
 *  Generous enough that even an autofill-then-click power user clears it. */
export const MIN_ELAPSED_MS = 2500

/** Absurd-future / very-old guards: a tampered or stale timestamp shouldn't
 *  pass. We accept anything from "now" back to 24h ago. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Decide whether a submission looks like a bot, given the raw FormData (or a
 * plain object) carrying the honeypot + time-trap fields.
 *
 * Returns `true` when the submission should be SILENTLY DROPPED (honeypot
 * filled, or submitted implausibly fast). Returns `false` for a plausible
 * human submission. A missing time-trap field is treated as human (forms
 * rendered before this shipped, or JS disabled, shouldn't be penalized — the
 * honeypot still covers the common bot case).
 */
export function looksLikeBot(
  data: { get(name: string): unknown } | Record<string, unknown>,
  now: number = Date.now(),
): boolean {
  const read = (name: string): unknown =>
    typeof (data as { get?: unknown }).get === 'function'
      ? (data as { get(n: string): unknown }).get(name)
      : (data as Record<string, unknown>)[name]

  // 1. Honeypot: any non-empty value ⇒ bot.
  const hp = read(HONEYPOT_FIELD)
  if (typeof hp === 'string' && hp.trim().length > 0) return true

  // 2. Time-trap: only enforce when a parseable timestamp is present.
  const rawTs = read(TIMETRAP_FIELD)
  if (typeof rawTs === 'string' && rawTs.trim()) {
    const ts = Number(rawTs)
    if (Number.isFinite(ts) && ts > 0) {
      const elapsed = now - ts
      // Submitted suspiciously fast, or with a timestamp in the future / older
      // than a day (tampered / replayed) ⇒ bot.
      if (elapsed < MIN_ELAPSED_MS) return true
      if (elapsed > MAX_AGE_MS) return true
    }
  }

  return false
}
