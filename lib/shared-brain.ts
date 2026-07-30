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
  /**
   * Whether the hour in force was WORKED OUT rather than merely defaulted.
   * Round-8 audit: `learned` was being re-derived as `incumbent !==
   * DEFAULT_SEND_HOUR`, which is wrong in the likeliest steady state of all
   * — the platform genuinely learning that 10 AM is best. The same stored
   * hour then reported "Learned" one week and "Still learning" the next.
   * Whether we learned something is a fact about the PAST, so it is carried
   * forward, not re-guessed from the value.
   */
  currentLearned = false,
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
      learned: currentLearned,
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

  // A COMPARISON NEEDS TWO ARMS (round-11 audit). Every automated send in
  // the platform aims at the hour in force, so that bucket fills and no
  // other one does — `eligible` is realistically `[incumbent]` alone for a
  // long time. With one arm, "really is the best hour to send" is the
  // shipped guess re-badged as a finding, and `learned: true` is carried
  // forward forever, so the badge could never honestly return to "still
  // learning". That is precisely the magic number this card exists to make
  // impossible.
  if (eligible.length < 2) {
    return {
      hour: incumbent,
      learned: currentLearned,
      why: `Only ${hourLabel(eligible[0].hour)} has enough behind it to read so far, so there is nothing to compare it against yet. Every clinic still sends at ${hourLabel(incumbent)}.`,
      sampleSends,
    }
  }

  const standing = eligible.find((s) => s.hour === incumbent)
  if (best.hour === incumbent) {
    return {
      hour: incumbent,
      learned: true,
      why: `${hourLabel(incumbent)} really is the best hour to send — ${Math.round(rate(best) * 100)}% of those get opened, across ${best.clinics} practices, and it beat the other ${eligible.length - 1} ${eligible.length === 2 ? 'hour' : 'hours'} with enough data to judge.`,
      sampleSends,
    }
  }

  // NEVER MOVE WITHOUT MEASURING AGAINST WHAT IS IN FORCE (round-11 audit).
  // When the incumbent has no qualifying bucket of its own, the old code
  // skipped MIN_LIFT entirely and swapped the platform's send hour on the
  // strength of one arm — while telling the owner it "beats every other
  // hour", a comparison that had not happened. The stability floor exists
  // exactly so this value cannot wobble; a missing incumbent is a reason to
  // wait, not a reason to skip the check.
  if (!standing) {
    return {
      hour: incumbent,
      learned: currentLearned,
      why: `${hourLabel(best.hour)} looks good, but not enough goes out at ${hourLabel(incumbent)} yet to know whether it is actually better. Staying at ${hourLabel(incumbent)} until there is something to compare.`,
      sampleSends,
    }
  }

  // STABILITY: beat the standing default by a real margin or leave it be.
  if (rate(best) - rate(standing) < MIN_LIFT) {
    return {
      hour: incumbent,
      learned: currentLearned,
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
  /**
   * Sends the last pass actually looked at (round-10 in-phase gap).
   *
   * `SendHourFinding.sampleSends` was computed on every path and documented
   * "for the owner's own sense of the sample", and then never stored and
   * never rendered. That matters more here than it would elsewhere: the
   * brain SHIPS INERT, so for months the owner's only output from slice 5 is
   * a card saying "Still learning" and quoting the floors — with no reading
   * against them. "200 sends across 3 practices" next to "we have seen 46"
   * is the difference between an honest wait and a magic number, which is
   * the whole reason this card exists.
   */
  sampleSends: number
}

/** The weekly pass is stale after this. A missed week is a blip; two is the
 *  cron having stopped, which is the failure this repo has actually had. */
export const BRAIN_STALE_DAYS = 15

export function brainStale(brain: SharedBrain, now: Date): boolean {
  if (!brain.learnedAt) return false
  const at = new Date(brain.learnedAt).getTime()
  if (Number.isNaN(at)) return false
  return now.getTime() - at > BRAIN_STALE_DAYS * 24 * 60 * 60 * 1000
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
    sampleSends: 0,
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
    sampleSends:
      typeof b.sampleSends === 'number' && Number.isFinite(b.sampleSends) && b.sampleSends >= 0
        ? Math.floor(b.sampleSends)
        : 0,
  }
}
