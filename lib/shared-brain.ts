/**
 * THE SHARED BRAIN (Transformation Phase 4 — DESIGN.md primitive #5), pure
 * half.
 *
 * "Cross-clinic learning (patterns, never patient data) feeds every clinic's
 * defaults: no individual clinic has to be smart, because the platform
 * already knows."
 *
 * The first thing it learns is WHEN to send. Today every automated campaign
 * aims at 10:00 clinic-local — a reasonable guess somebody made once. The
 * platform is in a position to know the real answer, because it watches
 * every clinic's sends and every open, and the answer is the same shape for
 * everybody: an hour of the day.
 *
 * What crosses the boundary is a COUNT PER HOUR. No email, no name, no
 * patient, no clinic identity — the aggregate that reaches this module is
 * already anonymous, and nothing here could re-identify anyone if it tried.
 *
 * Three rules keep a learned default from being worse than the guess it
 * replaces:
 *
 *  1. SAMPLE FLOOR. An hour needs real volume before its rate means
 *     anything; a 100% open rate on four sends is not a finding.
 *  2. CLINIC FLOOR. An hour needs several DIFFERENT practices behind it, or
 *     "the platform has learned" is really "one big clinic has a habit" —
 *     and that is exactly the claim this primitive must not make falsely.
 *  3. STABILITY. The learned hour only moves off the shipped default when it
 *     beats it by a real margin. Without that, the platform's send time
 *     wobbles week to week chasing noise, and nobody can reason about it.
 *
 * When the data does not clear those bars, the shipped default stands and
 * the brain says so. It ships inert on purpose — with one live clinic
 * nothing can clear the clinic floor, which is the correct and honest
 * behaviour, not a bug to work around.
 */

/** The shipped guess, and the floor every resolver falls back to. Mid-morning:
 *  a patient inbox glance is likeliest and a booking call is answerable. */
export const DEFAULT_SEND_HOUR = 10

/** Learned hours are confined to the same daylight window the machine is
 *  already allowed to send inside. Without this the brain could discover
 *  that 3 AM sends get opened at a lovely rate (by insomniacs, hours later)
 *  and start mailing patients in the middle of the night. */
export const LEARNABLE_HOUR_MIN = 8
export const LEARNABLE_HOUR_MAX = 18

/** Sends in an hour bucket before its open rate is worth reading. */
export const MIN_SENDS_PER_HOUR = 200
/** Distinct practices behind an hour bucket. This is the floor that makes
 *  the word "cross-clinic" true. */
export const MIN_CLINICS_PER_HOUR = 3
/** How much better the winner must be than the standing default, in
 *  absolute open rate, before the platform changes its mind. */
export const MIN_LIFT = 0.03

export interface HourStat {
  /** 0–23, in the SENDING clinic's own wall clock. */
  hour: number
  sent: number
  opened: number
  /** Distinct practices contributing to this bucket. */
  clinics: number
}

export interface SendHourFinding {
  /** The hour every clinic's automations should aim at. */
  hour: number
  /** True when the hour in force is something the platform WORKED OUT
   *  rather than the shipped guess. Verification round 2: this used to mean
   *  "this pass produced a finding", so a routine week where the challenger
   *  fell under MIN_LIFT flipped the owner's badge to "Still learning" while
   *  every clinic was still sending at a learned 3 PM. A badge that denies
   *  what the scheduler is doing is exactly the magic number the card
   *  exists to prevent. */
  learned: boolean
  /** Plain English, for the platform owner. Never a bare number. */
  why: string
  /** Total sends considered, for the owner's own sense of the sample. */
  sampleSends: number
}

function rate(s: HourStat): number {
  return s.sent > 0 ? s.opened / s.sent : 0
}

function qualifies(s: HourStat): boolean {
  return (
    s.hour >= LEARNABLE_HOUR_MIN &&
    s.hour <= LEARNABLE_HOUR_MAX &&
    s.sent >= MIN_SENDS_PER_HOUR &&
    s.clinics >= MIN_CLINICS_PER_HOUR
  )
}

function hourLabel(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

/**
 * What hour should every clinic's automations aim at, given what the whole
 * platform has seen? Pure: hand it the anonymous buckets, get back the
 * decision and the sentence explaining it.
 */
export function learnBestSendHour(
  stats: readonly HourStat[],
  /**
   * The hour currently in force — what a change would actually change.
   *
   * Round-1 audit: this used to be hardwired to DEFAULT_SEND_HOUR, so once
   * the brain moved to 3 PM the stability guard silently stopped guarding
   * anything. Each week's winner was measured against hour 10 — an hour
   * nobody was sending at — so the platform could hop 3 PM → 4 PM → 2 PM
   * week after week, every hop clearing MIN_LIFT against a bystander. That
   * is precisely the oscillation MIN_LIFT exists to prevent.
   */
  currentHour: number = DEFAULT_SEND_HOUR,
): SendHourFinding {
  const sampleSends = stats.reduce((n, s) => n + s.sent, 0)
  const incumbent =
    Number.isInteger(currentHour) &&
    currentHour >= LEARNABLE_HOUR_MIN &&
    currentHour <= LEARNABLE_HOUR_MAX
      ? currentHour
      : DEFAULT_SEND_HOUR
  const eligible = stats.filter(qualifies)

  if (eligible.length === 0) {
    return {
      hour: incumbent,
      learned: incumbent !== DEFAULT_SEND_HOUR,
      why: `Not enough to go on yet, so every clinic still sends at ${hourLabel(incumbent)}. An hour needs ${MIN_SENDS_PER_HOUR} sends across at least ${MIN_CLINICS_PER_HOUR} practices before it counts.`,
      sampleSends,
    }
  }

  // Best rate wins; ties break toward the EARLIER hour, so a coin-flip
  // between two hours resolves the same way every run rather than
  // oscillating with row order.
  const best = eligible.reduce((a, b) => {
    const d = rate(b) - rate(a)
    return d > 0 || (d === 0 && b.hour < a.hour) ? b : a
  })

  const standing = eligible.find((s) => s.hour === incumbent)
  if (best.hour === incumbent) {
    return {
      hour: incumbent,
      learned: true,
      why: `${hourLabel(incumbent)} really is the best hour to send — ${Math.round(rate(best) * 100)}% of those get opened, across ${best.clinics} practices.`,
      sampleSends,
    }
  }

  // STABILITY: beat the standing default by a real margin or leave it be.
  // When the default hour itself has no qualifying data there is nothing to
  // beat, and the winner stands on its own.
  if (standing && rate(best) - rate(standing) < MIN_LIFT) {
    return {
      hour: incumbent,
      learned: incumbent !== DEFAULT_SEND_HOUR,
      why: `${hourLabel(best.hour)} is doing slightly better than ${hourLabel(incumbent)}, but not by enough to be sure. Staying at ${hourLabel(incumbent)} until it is.`,
      sampleSends,
    }
  }

  return {
    hour: best.hour,
    learned: true,
    why: `${hourLabel(best.hour)} beats every other hour — ${Math.round(rate(best) * 100)}% of those sends get opened, across ${best.clinics} practices. Every clinic now aims there.`,
    sampleSends,
  }
}

/* ── What gets stored, and how it is read back ─────────────────────────── */

export interface SharedBrain {
  sendHour: number
  sendHourLearned: boolean
  sendHourWhy: string
  /** ISO instant of the last successful learning pass, or null. */
  learnedAt: string | null
}

/**
 * Read the brain out of platform_config, FLOORING every failure path at the
 * shipped defaults — the same posture `resolveGuardianAudience` takes. A
 * missing row, an unreachable database, a half-written value: all of them
 * mean "we have not learned anything", never an undefined hour that would
 * schedule a clinic's mail at NaN o'clock.
 */
export function resolveSharedBrain(stored: unknown): SharedBrain {
  const fallback: SharedBrain = {
    sendHour: DEFAULT_SEND_HOUR,
    sendHourLearned: false,
    sendHourWhy: 'Still learning.',
    learnedAt: null,
  }
  if (!stored || typeof stored !== 'object') return fallback
  const brain = (stored as Record<string, unknown>).sharedBrain
  if (!brain || typeof brain !== 'object') return fallback
  const b = brain as Record<string, unknown>

  // The hour is the one value that reaches a scheduler, so it is validated
  // hardest: an integer inside the window the machine may send in, or the
  // default. A stored 25, a "10", a null all resolve to 10.
  const raw = b.sendHour
  const hour =
    typeof raw === 'number' &&
    Number.isInteger(raw) &&
    raw >= LEARNABLE_HOUR_MIN &&
    raw <= LEARNABLE_HOUR_MAX
      ? raw
      : DEFAULT_SEND_HOUR

  return {
    sendHour: hour,
    // A hour that failed validation is never reported as learned, whatever
    // the stored flag says.
    sendHourLearned: hour === raw && b.sendHourLearned === true,
    sendHourWhy: typeof b.sendHourWhy === 'string' && b.sendHourWhy ? b.sendHourWhy : fallback.sendHourWhy,
    learnedAt: typeof b.learnedAt === 'string' ? b.learnedAt : null,
  }
}
