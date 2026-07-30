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
  /** DAYS in the trailing 7 on which something failed ("tried X, couldn't").
   *  Days, not rows: a burst of hand-backs in one instant is one bad day,
   *  and FAILURE_ALARM_COUNT is documented to mean days of a broken thing. */
  failures7: number
  /** The two engines whose absence explains most silence. */
  remindersOn: boolean
  reviewRequestsOn: boolean
  /** SEATED new patients (the journey spine's definition, everywhere) in
   *  the trailing 30 days and the 30 before that. */
  seated30: number
  seatedPrev30: number
  /** Cards genuinely waiting on a human in that clinic. A pile-up is a
   *  signal about the CLINIC's attention, not the machine's health, so at
   *  `PILEUP_COUNT` it appends a clause to the recommendation and leaves the
   *  state alone. */
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
/** Distinct DAYS of "tried and couldn't" inside a week. Something wired
 *  wrong (an expired token, a revoked connection), not one bad afternoon. */
export const FAILURE_ALARM_COUNT = 3
/** A drop past this share of the prior month reads as a real stall rather
 *  than ordinary week-to-week noise. */
export const STALL_DROP_RATIO = 0.5
/** Below this, month-over-month percentages are noise — a practice going
 *  from 2 seated to 1 is not a stall, it is a Tuesday. */
export const STALL_MIN_BASELINE = 4
/** Finished work sitting unanswered past this reads as disengagement rather
 *  than a busy week — a practice that has stopped opening the inbox at all.
 *  It never changes the STATE (the machine is working fine; the person is
 *  the one who went quiet), only what Dream Create should say about it. */
export const PILEUP_COUNT = 8

/** The pile-up clause, appended to whatever the finding already recommends.
 *  Exported so the copy has one home and the tests read the real string. */
function pileupClause(openProposals: number): string {
  return ` Worth knowing: ${openProposals} pieces of finished work are sitting unanswered in their inbox, so they may have stopped opening it.`
}

/**
 * What is true about this clinic's machine right now. Ordered by severity:
 * the first rule that fires wins, because the owner needs the WORST true
 * thing, not a list of everything mildly notable.
 */
export function assessEngine(s: EngineSignals): EngineVerdict {
  const verdict = classify(s)
  // A pile-up is a fact about the PERSON, not the machine, so it never
  // changes the state — but it changes the conversation, and the owner
  // walking into a call without it would be missing half the story. Only on
  // findings that actually reach them: adding it to a healthy verdict would
  // write a sentence nobody ever reads.
  if (needsAttention(verdict.state) && s.openProposals >= PILEUP_COUNT && verdict.recommendation) {
    return { ...verdict, recommendation: verdict.recommendation + pileupClause(s.openProposals) }
  }
  return verdict
}

function blockedByFailures(s: EngineSignals): EngineVerdict {
  return {
    state: 'blocked',
    headline: `The machine hit trouble on ${s.failures7} ${s.failures7 === 1 ? 'day' : 'days'} this week`,
    // NO SPECULATION ABOUT THE CAUSE (verification round 2). This used to
    // assert "usually an expired Google token, a disconnected mailbox" —
    // a guess, and one the Guardian cannot currently check, because
    // `recordEngineFailure` has two writers today (the proposal engine and
    // the autonomy hand-back) and the send/sync automations do not yet
    // report. The report now says what it
    // actually knows and lets the per-capability list below carry the rest.
    why: 'Repeated failures in one week mean something is wired wrong rather than merely quiet — the machine is trying and being turned away.',
    recommendation: 'Start with what it was trying; this is ours to fix, not theirs to notice.',
  }
}

function classify(s: EngineSignals): EngineVerdict {
  const brandNew = s.ageDays < NEW_CLINIC_GRACE_DAYS

  // BLOCKED BY FAILURES first, ahead of silence (round-1 audit). A clinic
  // whose every attempt is failing has an EMPTY work ledger — failures are
  // not work — so the silence rule would fire and report "nothing has run",
  // which is both less true and less useful than "it tried and couldn't".
  // The evidence for the real problem is already in hand; leading with
  // silence would send Dream Create hunting for a cause it already knows.
  if (s.failures7 >= FAILURE_ALARM_COUNT) return blockedByFailures(s)

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
        // NULL, like every other non-flagged verdict (verification round 2).
        // `quiet` is excluded from needsAttention, the panel renders only
        // flagged rows and shouldAlert refuses non-attention states — so
        // this was the module's one recommendation written for a reader that
        // does not exist. Welcoming a brand-new practice is a real need, but
        // it belongs to a surface that actually shows starting clinics
        // (backlog), not to copy computed on every sweep and thrown away.
        recommendation: null,
      }
    }
    return {
      state: 'silent',
      headline: 'Nothing has run for two weeks',
      // Round-7 audit: `actions7` is WORK-only, so this branch is reachable
      // with one or two failures on record (the alarm pre-empts only at
      // three). Asserting "the ledger is empty" then contradicted the "What
      // it tried" list printed directly beneath it in the same email.
      why:
        s.failures7 > 0
          ? 'No reminders, no review asks, no campaigns got through in 14 days — the only entries are the attempts that failed.'
          : 'No reminders, no review asks, no campaigns — the ledger is empty for 14 days straight.',
      recommendation:
        'Check their integrations and patient data first. A clinic seeing nothing happen is the one most likely to leave.',
    }
  }

  // BLOCKED — the machine is trying and failing, or has been switched off.
  // Failures outrank switches: a wired-wrong connection is our problem to
  // fix, a switched-off engine is a conversation.
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
      why:
        s.failures7 > 0
          ? `${s.seatedPrev30} new patients seated the month before, ${s.seated30} this past month — but something also failed this week, so check the numbers are real before reading this as lost growth.`
          : `${s.seatedPrev30} new patients seated the month before, ${s.seated30} this past month. The machine is running — the growth is not.`,
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

/**
 * ALERTING POLICY. A guardian that emails the same problem every morning
 * gets muted, and a muted guardian is worse than none — so a persisting
 * problem is raised once and then only at this cadence.
 */
export const RE_ALERT_DAYS = 7

export interface AlertMemory {
  /** The state Dream Create last reported for this clinic. */
  state: EngineState | null
  /** When it last emailed about it. */
  alertedAt: Date | null
}

/**
 * Should this clinic's state reach the owner's inbox right now?
 *
 *  - Nothing that does not need a human ever alerts.
 *  - A NEW or CHANGED problem always alerts: "silent" becoming "blocked" is
 *    news even though both were already bad.
 *  - The SAME problem alerts again only after RE_ALERT_DAYS, so a clinic
 *    that stays broken for a fortnight produces two emails, not fourteen.
 *  - A problem with no memory of ever being alerted alerts (a missing stamp
 *    must never silence a real alarm — the same posture the sweep takes
 *    with a missing createdAt).
 */
export function shouldAlert(memory: AlertMemory, next: EngineState, now: Date): boolean {
  if (!needsAttention(next)) return false
  if (memory.state !== next) return true
  if (!memory.alertedAt) return true
  return now.getTime() - memory.alertedAt.getTime() >= RE_ALERT_DAYS * 24 * 60 * 60 * 1000
}

/* ─────────────────────────────────────────────────────────────────────────
 * WHO THE GUARDIAN TELLS (Phase 4 slice 3)
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * The Guardian can speak to two audiences, and it ships LOCKED to one.
 *
 *  - 'platform' (DEFAULT): only Dream Create hears it. The owner reads the
 *    panel and gets the email; the clinic is told nothing.
 *  - 'clinic': the practice is told directly, in its own voice, in its own
 *    ledger — and the owner stops being emailed about that clinic (they
 *    keep the panel). The report went where it belongs.
 *
 * Unlocking is a human decision, made once, by the platform owner. Nothing
 * here can widen it: the resolver FLOORS anything unrecognized at
 * 'platform', the same posture resolveTrust takes with an unknown level, so
 * a typo or a half-written config can never start talking to customers.
 */
export type GuardianAudience = 'platform' | 'clinic'

export function resolveGuardianAudience(stored: unknown): GuardianAudience {
  if (!stored || typeof stored !== 'object') return 'platform'
  const v = (stored as Record<string, unknown>).guardianAudience
  return v === 'clinic' ? 'clinic' : 'platform'
}

/**
 * Is this something the CLINIC can actually do something about?
 *
 * This is the judgment that keeps the clinic-facing half kind. A silent
 * engine or a stale Google token is OUR failure — telling a practice "the
 * machine has done nothing for two weeks" hands them alarm and no lever,
 * and the fix was never theirs. Those stay with Dream Create no matter what
 * the audience is set to. What a clinic CAN act on is a switch they turned
 * off, and a conversation about their own growth.
 */
export function clinicActionable(state: EngineState, s: EngineSignals): boolean {
  if (state === 'stalled') return true
  if (state !== 'blocked') return false
  // WHY the failure check comes first (round-1 audit). `classify` only ever
  // emits switch-blocked when BOTH switches are off, so an OR here was true
  // for a case it was never meant to cover: blocked-BY-FAILURES where one
  // switch happens to also be off. That combination is common — a practice
  // that turned reminders off AND has a stale Google token — and it routed
  // the finding to the clinic as "reminders are switched off", a half-truth
  // that hid the real break, while the owner (the only party who can fix a
  // stale token) was never emailed at all. Misrouted AND lost.
  if (s.failures7 >= FAILURE_ALARM_COUNT) return false
  return !s.remindersOn || !s.reviewRequestsOn
}

/**
 * The same finding, said to the practice instead of about it. Second
 * person, no percentages thrown at anybody, and never a number without a
 * next step — the anti-shame law applies hardest here, because this is the
 * machine telling somebody their business is slower than it was.
 *
 * Returns null when the finding is not the clinic's to act on.
 */
export function clinicNote(state: EngineState, s: EngineSignals): string | null {
  if (!clinicActionable(state, s)) return null
  if (state === 'blocked') {
    // All three shapes are live. `classify` only reaches this state with
    // BOTH off, but the clinic-facing READER re-derives the sentence from
    // the switches as they stand right now (getActiveGuardianNote), so a
    // practice that has since turned one back on gets the accurate
    // single-switch line instead of a note still insisting on both.
    if (!s.remindersOn && !s.reviewRequestsOn) {
      return 'Appointment reminders and automatic review requests are both switched off right now, so I can’t send either. Turn them back on whenever you’re ready and I’ll pick them straight back up.'
    }
    if (!s.remindersOn) {
      return 'Appointment reminders are switched off right now, so I can’t send any. Turn them back on whenever you’re ready.'
    }
    return 'Automatic review requests are switched off right now, so I can’t ask happy patients for reviews. Turn them back on whenever you’re ready.'
  }
  // stalled. No offer of anything that isn't already wired: the recall
  // engine files its own card when there are patients due, so promising one
  // here would be the machine writing a cheque another module may not cash.
  //
  // AND IT MUST NOT CLAIM TO BE FINE WHEN IT ISN'T (round-8 audit). Round 7
  // taught the OWNER's version of this sentence to hedge when the week also
  // had failures, and left this sibling asserting "Nothing is broken on my
  // side" unconditionally — reachable whenever failures7 is 1 or 2, since
  // the alarm only pre-empts a stall at three. The machine telling a
  // practice it is fine while its own failure rows sit in that practice's
  // ledger is the worst version of the thing this phase exists to prevent.
  const opening = `Fewer new patients came in this past month than the month before (${s.seated30} against ${s.seatedPrev30}).`
  if (s.failures7 > 0) {
    return `${opening} Some of my own jobs also hit trouble this week, so let me get those working before we read too much into the numbers. I’ll keep you posted.`
  }
  return `${opening} Nothing is broken on my side — everything is still running. It’s worth a look at where new patients usually find you, and whether anything changed there.`
}
