/**
 * THE GUARDIAN (Transformation Phase 4 — DESIGN.md primitive #5), pure half.
 *
 * DreamCRM's promise to a clinic is "your practice exploded and you barely
 * did anything." That promise needs a guardian: somebody watching whether
 * the machine is actually running for each clinic, and noticing when it
 * isn't — before the clinic does. That somebody is Dream Create, and this
 * module is how the platform decides which clinics need a human this week.
 *
 * The audience is the PLATFORM OWNER, never the clinic (tenant-voice
 * convention): these strings say "they" and name the practice, and they are
 * never rendered in a clinic tenant.
 *
 * Why a pure module: the verdict is the part worth pinning in tests, and it
 * must be reasoned about without a database. The service half gathers the
 * signals; this decides what they mean.
 */

export type EngineState =
  /** The machine is running and producing work. Nothing to do. */
  | 'healthy'
  /** Alive, low volume, nothing failing — an honestly quiet week. */
  | 'quiet'
  /** Alive, but the practice's own new-patient trend has dropped. */
  | 'stalled'
  /** The machine cannot act: its switches are off, or it keeps failing. */
  | 'blocked'
  /** No evidence of life at all — the strongest signal, and the reason the
   *  ledger exists. A clinic seeing nothing happen is the failure mode this
   *  whole product is a promise against. */
  | 'silent'

/** Worst first — the sweep sorts on this so the owner reads the practices
 *  that need them at the top, and never has to hunt. */
export const ENGINE_STATE_RANK: Record<EngineState, number> = {
  silent: 0,
  blocked: 1,
  stalled: 2,
  quiet: 3,
  healthy: 4,
}

/** States that put a clinic on the owner's list. `quiet` deliberately does
 *  NOT: a small practice with a calm week is not a problem, and crying wolf
 *  is how a guardian gets ignored. */
export function needsAttention(state: EngineState): boolean {
  return state === 'silent' || state === 'blocked' || state === 'stalled'
}

export interface EngineSignals {
  /** Days since the clinic's account was created. A brand-new practice has
   *  no baseline and no history — it is never "stalled", only starting. */
  ageDays: number
  /** Ledger WORK entries in the trailing 7 days, and the 7 before that. */
  actions7: number
  actionsPrev7: number
  /** Ledger FAILURE entries in the trailing 7 days ("tried X, couldn't"). */
  failures7: number
  /** The two engines whose absence explains most silence. */
  remindersOn: boolean
  reviewRequestsOn: boolean
  /** SEATED new patients (the journey spine's definition, everywhere) in
   *  the trailing 30 days and the 30 before that. */
  seated30: number
  seatedPrev30: number
  /** Cards genuinely waiting on a human in that clinic. A pile-up is a
   *  signal about the CLINIC's attention, not the machine's health, so it
   *  colors the recommendation rather than the state. */
  openProposals: number
}

export interface EngineVerdict {
  state: EngineState
  /** One line naming what is true, in the owner's voice. */
  headline: string
  /** The evidence behind it — never a bare number without its meaning. */
  why: string
  /** What Dream Create should actually do. null when nothing is needed. */
  recommendation: string | null
}

/** A clinic younger than this has no meaningful baseline to fall from. */
export const NEW_CLINIC_GRACE_DAYS = 14
/** Repeated "tried and couldn't" inside a week means something is wired
 *  wrong (an expired token, a revoked connection), not bad luck. */
export const FAILURE_ALARM_COUNT = 3
/** A drop past this share of the prior month reads as a real stall rather
 *  than ordinary week-to-week noise. */
export const STALL_DROP_RATIO = 0.5
/** Below this, month-over-month percentages are noise — a practice going
 *  from 2 seated to 1 is not a stall, it is a Tuesday. */
export const STALL_MIN_BASELINE = 4

/**
 * What is true about this clinic's machine right now. Ordered by severity:
 * the first rule that fires wins, because the owner needs the WORST true
 * thing, not a list of everything mildly notable.
 */
export function assessEngine(s: EngineSignals): EngineVerdict {
  const brandNew = s.ageDays < NEW_CLINIC_GRACE_DAYS

  // SILENT — two full weeks with nothing in the ledger. For a live clinic
  // this is the machine not running, and it is invisible from inside the
  // product (the clinic just sees a quiet dashboard and assumes that is
  // normal). A brand-new practice gets the gentler reading.
  if (s.actions7 === 0 && s.actionsPrev7 === 0) {
    if (brandNew) {
      return {
        state: 'quiet',
        headline: 'Just getting started — nothing has run yet',
        why: `Signed up ${s.ageDays} ${s.ageDays === 1 ? 'day' : 'days'} ago and the machine has nothing to work with yet.`,
        recommendation:
          'Worth a welcome check-in: are their patients imported and their hours set? That is what the engines run on.',
      }
    }
    return {
      state: 'silent',
      headline: 'Nothing has run for two weeks',
      why: 'No reminders, no review asks, no campaigns — the ledger is empty for 14 days straight.',
      recommendation:
        'Check their integrations and patient data first. A clinic seeing nothing happen is the one most likely to leave.',
    }
  }

  // BLOCKED — the machine is trying and failing, or has been switched off.
  // Failures outrank switches: a wired-wrong connection is our problem to
  // fix, a switched-off engine is a conversation.
  if (s.failures7 >= FAILURE_ALARM_COUNT) {
    return {
      state: 'blocked',
      headline: `The machine tried and couldn’t, ${s.failures7} times this week`,
      why: 'Repeated failures in one week usually mean a connection went stale — an expired Google token, a disconnected mailbox.',
      recommendation: 'Look at their integrations; this is ours to fix, not theirs to notice.',
    }
  }
  if (!s.remindersOn && !s.reviewRequestsOn) {
    return {
      state: 'blocked',
      headline: 'Both engines are switched off',
      why: 'Appointment reminders and automatic review requests are both off, so most of the machine cannot act at all.',
      recommendation:
        'Ask what made them turn these off — it is usually one bad experience worth understanding.',
    }
  }

  // STALLED — alive, but the practice's own new-patient number has fallen.
  // Measured against ITSELF, never against other clinics: a two-chair rural
  // practice and a six-chair city one share no baseline.
  const baselineBigEnough = s.seatedPrev30 >= STALL_MIN_BASELINE
  if (baselineBigEnough && !brandNew && s.seated30 < s.seatedPrev30 * STALL_DROP_RATIO) {
    const drop = Math.round((1 - s.seated30 / s.seatedPrev30) * 100)
    return {
      state: 'stalled',
      headline: `New patients are down ${drop}% on their own last month`,
      why: `${s.seatedPrev30} new patients seated the month before, ${s.seated30} this past month. The machine is running — the growth is not.`,
      recommendation:
        'This is the guarantee talking. Look at where their new patients came from before, and what changed.',
    }
  }

  // QUIET vs HEALTHY — both fine; the difference is only whether there is
  // anything to celebrate. Neither goes on the owner's list.
  if (s.actions7 === 0) {
    return {
      state: 'quiet',
      headline: 'A quiet week, engines on',
      why: 'Nothing ran this week, but the engines are on and last week was normal — a calm week, not a broken one.',
      recommendation: null,
    }
  }

  return {
    state: 'healthy',
    headline: `${s.actions7} ${s.actions7 === 1 ? 'thing' : 'things'} handled this week`,
    why:
      s.seated30 > 0
        ? `${s.seated30} new ${s.seated30 === 1 ? 'patient' : 'patients'} seated in the last 30 days.`
        : 'The machine is running normally.',
    recommendation: null,
  }
}

/**
 * The one line the owner reads before any names — the guardian's own
 * summary of its sweep. Plain counts; no exclamation marks; and silence is
 * reported as good news rather than as an empty state.
 */
export function summarizeSweep(states: EngineState[]): string {
  const flagged = states.filter(needsAttention).length
  if (states.length === 0) return 'No clinics to watch yet.'
  if (flagged === 0) {
    return `All ${states.length} ${states.length === 1 ? 'practice is' : 'practices are'} running normally.`
  }
  return `${flagged} of ${states.length} ${states.length === 1 ? 'practice needs' : 'practices need'} you.`
}
