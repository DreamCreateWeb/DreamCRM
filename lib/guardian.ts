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
  /**
   * The same count, ENGINE breaks only — no autonomy hand-backs
   * (round-15 audit).
   *
   * The OWNER's verdict is right to count both: a card handing back day
   * after day is real evidence something is wired wrong. But the
   * CLINIC-voiced hedge built from it promises "let me get those working…
   * I'll keep you posted", and a hand-back is the machine having
   * deliberately STOPPED and put that card back in front of them — so the
   * promise contradicts the machine's own ledger sentence about a card
   * sitting in their inbox right now. Round 11 made this split in the
   * standup and it was never carried here.
   */
  engineFailures7: number
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
  /**
   * WHICH problem, when one state has structurally different ones
   * (round-11 audit). `blocked` is emitted by two rules that have different
   * owners, different fixes and different AUDIENCES — a wired-wrong
   * connection is Dream Create's, two switches off is the practice's — and
   * the alert memory stored only the word "blocked". So a clinic moving
   * from switch-blocked to failure-blocked was "the same problem" and
   * nobody was told for up to a week, while the last thing said about them
   * was the wrong half of the truth. Null when the state is its own whole
   * answer.
   */
  cause: 'failures' | 'switches' | null
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

/** The OTHER axis, named wherever it is known and not already the headline.
 *  One home, so a seventh verdict gets it by asking. */
function switchClause(s: EngineSignals): string {
  if (!s.remindersOn && !s.reviewRequestsOn) {
    return ' Both engines are switched off as well, so nothing could send even once this is fixed.'
  }
  if (!s.remindersOn) return ' Appointment reminders are switched off as well.'
  if (!s.reviewRequestsOn) return ' Automatic review requests are switched off as well.'
  return ''
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
    // AND THE SWITCHES, WHEN THEY ARE ALSO OFF (round-16 audit). This rule
    // fires FIRST, and it said nothing about `remindersOn`/`reviewRequestsOn`
    // even though both sit in the same signals — so a practice with three
    // failure days AND both engines off produced "start with what it was
    // trying; this is ours to fix, not theirs to notice", which is
    // affirmatively wrong: a genuinely clinic-side problem exists, the code
    // knows it, and it reached nobody. Every sibling verdict already carries
    // the other axis; this one was never swept when round 9 made that the
    // rule ("a report that omits a known fact sends the reader hunting for
    // it").
    why:
      'Repeated failures in one week mean something is wired wrong rather than merely quiet — the machine is trying and being turned away.' +
      switchClause(s),
    recommendation:
      'Start with what it was trying; this is ours to fix, not theirs to notice.' +
      (switchClause(s)
        ? ' The switches are a separate conversation to have with them once it is working.'
        : ''),
    cause: 'failures',
  }
}

/** The "and some of ours broke too" clause. `failures7` of 1 or 2 never
 *  reaches the alarm, so it can ride along with ANY other verdict — and a
 *  verdict that has to ignore a failure to stay calm is the thing this
 *  phase exists to stop (round-9 sibling sweep). One home, so a sixth
 *  verdict added later gets it by asking for it. */
function alsoFailedClause(s: EngineSignals): string {
  if (s.failures7 <= 0) return ''
  // DAYS, not jobs (round-11 audit). `failures7` is
  // `count(distinct clinic-local day)`, as its own field doc and
  // `blockedByFailures` both say — this clause was the third rendering and
  // the only one that changed the noun, so a day carrying six breaks read as
  // "1 job of ours did hit trouble". A counter disagreeing with its
  // explainer is this phase's signature defect, and it got in through a
  // fix for that same defect.
  return ` Something of ours also hit trouble on ${s.failures7} ${s.failures7 === 1 ? 'day' : 'days'} this week, though — ours to fix.`
}

/** BOTH ENGINES OFF — the one switch verdict `classify` emits, hoisted so
 *  the silence branch can reach it too (round-9 audit; see below). */
function blockedBySwitches(s: EngineSignals): EngineVerdict {
  return {
    state: 'blocked',
    headline: 'Both engines are switched off',
    why:
      'Appointment reminders and automatic review requests are both off, so most of the machine cannot act at all.' +
      alsoFailedClause(s),
    recommendation:
      'Ask what made them turn these off — it is usually one bad experience worth understanding.',
    cause: 'switches',
  }
}

function classify(s: EngineSignals): EngineVerdict {
  const brandNew = s.ageDays < NEW_CLINIC_GRACE_DAYS
  const bothOff = !s.remindersOn && !s.reviewRequestsOn

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
        cause: null,
      }
    }
    // THE CAUSE IS ALREADY IN HAND (round-9 audit). Both engines off
    // EXPLAINS fourteen empty days exactly, and the switches sit right
    // there in the same signals — but the silence rule ran first and
    // reported an unexplained blackout, telling Dream Create to "check
    // their integrations and patient data" while the machine already knew
    // the answer. Worse, `silent` is not clinicActionable, so the one
    // finding the practice could have fixed in two clicks was withheld
    // from them at every audience setting. A watcher that owns the cause
    // must name it.
    if (bothOff) return blockedBySwitches(s)

    return {
      state: 'silent',
      headline: 'Nothing has run for two weeks',
      // Round-7 audit: `actions7` is WORK-only, so this branch is reachable
      // with one or two failures on record (the alarm pre-empts only at
      // three). Asserting "the ledger is empty" then contradicted the "What
      // it tried" list printed directly beneath it in the same email.
      //
      // ONE switch off does NOT explain fourteen empty days — the other
      // engine should still have produced something — so this stays
      // `silent` (and stays with Dream Create, since flipping that switch
      // would not fix it). But the fact is known, and a report that omits
      // a known fact sends the reader hunting for it (round-9 audit).
      why: (() => {
        const head =
          s.failures7 > 0
            ? 'No reminders, no review asks, no campaigns got through in 14 days — the only entries are the attempts that failed.'
            : 'No reminders, no review asks, no campaigns — the ledger is empty for 14 days straight.'
        if (!s.remindersOn) return `${head} Appointment reminders are also switched off, though that alone would not explain this.`
        if (!s.reviewRequestsOn)
          return `${head} Automatic review requests are also switched off, though that alone would not explain this.`
        return head
      })(),
      recommendation:
        'Check their integrations and patient data first. A clinic seeing nothing happen is the one most likely to leave.',
      cause: null,
    }
  }

  // BLOCKED — the machine is trying and failing, or has been switched off.
  // Failures outrank switches: a wired-wrong connection is our problem to
  // fix, a switched-off engine is a conversation.
  if (bothOff) return blockedBySwitches(s)

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
      cause: null,
    }
  }

  // QUIET vs HEALTHY — both fine; the difference is only whether there is
  // anything to celebrate. Neither goes on the owner's list.
  // BOTH OF THE CALM VERDICTS HEDGE ON FAILURES (round-9 sibling sweep).
  // `failures7` of 1 or 2 never reaches the alarm, so both of these are
  // reachable with the machine's own "I couldn't" rows in the same week —
  // and both asserted, flatly, that everything is running. Round 7 taught
  // the stall to hedge, round 8 taught the clinic-facing note, and these
  // two were the remaining siblings of the same sentence. A calm verdict
  // that has to ignore a failure to stay calm is the thing this phase
  // exists to stop.
  const alsoFailed = alsoFailedClause(s)

  if (s.actions7 === 0) {
    return {
      state: 'quiet',
      headline: 'A quiet week, engines on',
      why:
        'Nothing ran this week, but the engines are on and last week was normal — a calm week, not a broken one.' +
        alsoFailed,
      recommendation: null,
      cause: null,
    }
  }

  return {
    state: 'healthy',
    headline: `${s.actions7} ${s.actions7 === 1 ? 'thing' : 'things'} handled this week`,
    why:
      (s.seated30 > 0
        ? `${s.seated30} new ${s.seated30 === 1 ? 'patient' : 'patients'} seated in the last 30 days.`
        : 'The machine is running normally.') + alsoFailed,
    recommendation: null,
    cause: null,
  }
}

/**
 * The one line the owner reads before any names — the guardian's own
 * summary of its sweep. Plain counts; no exclamation marks; and silence is
 * reported as good news rather than as an empty state.
 */
export function summarizeSweep(states: EngineState[], withFailures = 0): string {
  const flagged = states.filter(needsAttention).length
  if (states.length === 0) return 'No clinics to watch yet.'
  // AN ALL-CLEAR THAT IGNORES A FAILURE IS NOT AN ALL-CLEAR (round-15 audit).
  // Round 9 taught the `quiet` and `healthy` verdicts to admit 1–2 failure
  // days — and BOTH of those `why` strings are discarded: the panel renders
  // only flagged rows, `shouldAlert` refuses non-attention states, and the
  // stand-down body prints the headline. So the clause was generated and
  // dropped, and the one line those clinics DO reach the owner through said
  // everything was running normally. This is where it belongs.
  if (flagged === 0) {
    const all = `All ${states.length} ${states.length === 1 ? 'practice is' : 'practices are'} running normally.`
    return withFailures > 0
      ? `${all} ${withFailures} had ${withFailures === 1 ? 'a job' : 'jobs'} of ours hit trouble — ours to fix.`
      : all
  }
  // …AND ON A BUSY MORNING TOO (round-16 in-phase gap). The round-15 fix
  // landed in the all-clear branch only, so these — Dream Create's OWN
  // breaks, the category this phase repeatedly rules "ours to fix, not
  // theirs to notice" — vanished from the summary on exactly the days the
  // owner is reading the panel. The flagged clinics are the message; this
  // rides alongside rather than competing with it.
  const need = `${flagged} of ${states.length} ${states.length === 1 ? 'practice needs' : 'practices need'} you.`
  return withFailures > 0
    ? `${need} ${withFailures} otherwise-fine ${withFailures === 1 ? 'practice' : 'practices'} had ${withFailures === 1 ? 'a job' : 'jobs'} of ours hit trouble — ours to fix.`
    : need
}

/**
 * ALERTING POLICY. A guardian that emails the same problem every morning
 * gets muted, and a muted guardian is worse than none — so a persisting
 * problem is raised once and then only at this cadence.
 */
export const RE_ALERT_DAYS = 7

/**
 * How long a clinic-facing note stays on screen. STRICTLY LONGER than the
 * re-alert cadence, and that is the whole point (round-9 audit).
 *
 * Both bounds used to be RE_ALERT_DAYS, and both are measured from the
 * sweep's own `now` — so the read window closed at the exact instant the
 * re-write became due. EventBridge does not fire at the same millisecond
 * every day: a day-7 run starting a second earlier than day 0's failed
 * `shouldAlert` by a second, wrote no note, and the amber card — the note's
 * ONLY clinic surface — went dark for a day underneath a live problem. A
 * coin flip every cycle, in code whose comment promised the opposite.
 *
 * One extra day of overlap costs a stale-by-a-day sentence in the worst
 * case (and the blocked note is re-derived from live switches at render
 * anyway, so it cannot say anything untrue); the alternative costs the
 * practice a day of not being told at all.
 */
export const NOTE_VISIBLE_DAYS = RE_ALERT_DAYS + 1

/**
 * THE IDENTITY OF A PROBLEM — what "the same one" means to the cadence.
 *
 * Round-11 audit: this used to be the bare state word, and `blocked` covers
 * two different problems with different owners. The key is the state plus
 * its cause, so switch-blocked → failure-blocked reads as news (it is), and
 * a clinic never sits for a week under the wrong half of the truth.
 *
 * Legacy rows hold a bare 'blocked'; that simply differs from every new key
 * and alerts once on rollout, which is the safe direction.
 */
export function problemKey(verdict: Pick<EngineVerdict, 'state' | 'cause'>): string {
  return verdict.cause ? `${verdict.state}:${verdict.cause}` : verdict.state
}

const ENGINE_STATES = ['silent', 'blocked', 'stalled', 'quiet', 'healthy'] as const

/** The state half of a problem key. Unrecognised reads as null — a memory
 *  we cannot parse is a memory we do not act on. */
export function baseState(key: string | null): EngineState | null {
  if (!key) return null
  const head = key.split(':')[0] as EngineState
  return ENGINE_STATES.includes(head) ? head : null
}

/**
 * How long a recovery must HOLD before the owner is told it happened.
 *
 * Round-11 audit: the stand-down gave the Guardian a way to oscillate. The
 * stall is a strict inequality over two daily-sliding windows, so a practice
 * sitting on the threshold flips attention → fine → attention on alternating
 * days — and every flip was a state CHANGE, so it earned an alert one
 * morning and an all-clear the next, forever. That is the crying-wolf
 * failure this primitive is built to avoid, introduced by the fix that
 * closed the loop.
 *
 * Two days of quiet before we say it is over. And because the problem is not
 * stamped over until that stand-down actually lands, a re-break inside the
 * window is still "the same problem" and stays quiet too — one clock, both
 * halves of the flap.
 */
export const STAND_DOWN_DWELL_DAYS = 2

export interface AlertMemory {
  /** The PROBLEM KEY Dream Create last reported for this clinic. */
  state: string | null
  /** When it last reported it. */
  alertedAt: Date | null
  /** When the current problem was FIRST seen — chronicity, which is what
   *  makes "blocked since June 2" possible. Null when nothing is wrong. */
  firstSeenAt?: Date | null
  /** When this practice's current run of good days began. Null while
   *  something is wrong. */
  clearSince?: Date | null
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
export function shouldAlert(memory: AlertMemory, next: string, now: Date): boolean {
  const state = baseState(next)
  if (!state || !needsAttention(state)) return false
  if (memory.state !== next) return true
  if (!memory.alertedAt) return true
  return now.getTime() - memory.alertedAt.getTime() >= RE_ALERT_DAYS * 24 * 60 * 60 * 1000
}

/**
 * THE OTHER HALF OF AN INTERRUPT (round-9 in-phase gap): is this practice
 * back to normal after we told somebody it wasn't?
 *
 * The Guardian could only ever say bad news. `shouldAlert` refuses every
 * non-attention state, so a clinic that recovered simply stopped being
 * mentioned — and the owner, who was interrupted on Tuesday, had no way to
 * learn on Thursday that it was fixed except by opening the dashboard. The
 * whole reason the outbound half exists is that it reaches you WITHOUT a
 * dashboard; an alert with no matching stand-down hands that dependency
 * straight back, and trains the reader to hold every alert open forever.
 *
 * Only a remembered problem can be stood down: no memory means nothing was
 * ever raised, and an all-clear for a problem nobody heard about is noise.
 */
export function shouldStandDown(memory: AlertMemory, next: string, now: Date): boolean {
  const was = baseState(memory.state)
  const state = baseState(next)
  if (!was || !needsAttention(was)) return false
  if (!state || needsAttention(state)) return false
  // IT HAS TO HOLD (round-11 audit). Without the dwell clock a practice on
  // the stall threshold alerts and stands down on alternating days forever.
  if (!memory.clearSince) return false
  return now.getTime() - memory.clearSince.getTime() >= STAND_DOWN_DWELL_DAYS * 24 * 60 * 60 * 1000
}

/**
 * WHOSE LOOP IS BEING CLOSED — may the OWNER hear the all-clear for this?
 *
 * Round-10 audit: round 9 answered this by asking `clinicActionable` against
 * TODAY's signals, and that guard is INVERTED in its principal case. The
 * only clinic-actionable `blocked` shape `classify` emits is both-switches-
 * off; recovery means both switches are back ON, so today's signals say "not
 * clinic-actionable" and the owner was emailed an all-clear for an alarm
 * only the practice ever received.
 *
 * Asked without signals instead, because the memory records the STATE and
 * not the audience:
 *  - At 'platform' every finding went to the owner, so every recovery is
 *    theirs to hear.
 *  - At 'clinic', `stalled` is ALWAYS the practice's, and `blocked` may be
 *    either shape with nothing recorded to say which — so both are withheld.
 *    `silent` can never be clinic-actionable, so it is always ours.
 *
 * The cost is a missed all-clear for a failure-blocked clinic while the lock
 * is open; the alternative is telling the owner an alarm they never heard is
 * over. Erring toward silence is the right side of that trade for a
 * primitive whose whole design is "crying wolf is how a guardian gets
 * ignored". The exact answer needs a per-audience memory — the same backlog
 * item the "tell them once" rule is waiting on.
 */
export function standDownGoesToOwner(audience: GuardianAudience, was: string): boolean {
  if (audience === 'platform') return true
  return baseState(was) === 'silent'
}

/**
 * THE WATCHER'S OWN HEARTBEAT (round-9 in-phase gap).
 *
 * The panel renders live from `cachedEngineHealth`, so it looks alive
 * whether or not the daily cron has fired this month — a disabled
 * EventBridge rule, a 500ing route, or a platform with no platformAdmin row
 * all present as "everything is fine". That is this phase's own thesis
 * (idle and dead are indistinguishable without a watcher) aimed at the
 * watcher itself, and the shared brain's card already solved it for the
 * shared brain. `undelivered` is the count that matters most: a sweep that
 * ran and could not deliver is the one failure the panel could otherwise
 * never show.
 */
export interface GuardianHeartbeat {
  ranAt: string | null
  scanned: number
  flagged: number
  /** Reports that were due and did NOT land, this run. */
  undelivered: number
  /**
   * WHY the run could not do its job, in plain English, deduplicated
   * (round-14 in-phase gap).
   *
   * `GuardianRunResult.errors` was written in seven places and read by
   * NOBODY: the cron route returns it as a JSON body to an EventBridge
   * destination, which discards it. That is the same discarded-JSON channel
   * this phase built the heartbeat to escape — and the reasons stayed in
   * it. The owner could see "1 report couldn't be delivered" and had no way,
   * anywhere, to learn whether the mail provider was down, whether there was
   * nobody to email, or whether a clinic's memory was unreadable.
   *
   * Capped, because this is a heartbeat and not a log.
   */
  problems: string[]
  /** Which half the LAST run took, and who it actually reached — the
   *  receipt for the audience lock (round-16 in-phase gap). The control had
   *  a dry run and no confirmation, so the owner who opened it had to read
   *  individual clinics' ledgers to learn what their own machine had said
   *  in their name. */
  audience: GuardianAudience
  told: string[]
  emailed: string[]
  /**
   * Practices the run SKIPPED entirely — today, the half-provisioned ones
   * (an org row with no clinic_profile, reachable in production). They are
   * never emailed about and, before this, were counted in nothing: the
   * panel rendered them as flagged `silent` rows telling the owner to go
   * audit that practice's integrations, while the alerting half had quietly
   * given up on them forever.
   */
  skipped: number
  /** The LAST run could not read the ledger. Stored because it is written —
   *  a field collected and read by nothing is the defect slice 4 was pulled
   *  up for, and re-introducing it here would be worse than not storing it. */
  blind: boolean
}

/**
 * How long after its last completed run the daily watch counts as STOPPED.
 *
 * Round-10 in-phase gap: the heartbeat detected "never ran" and nothing
 * else — a stored instant rendered as quiet grey text forever, never
 * compared to now. But after the first run, "never ran" is no longer a
 * reachable failure; STOPPED is the only real one, and it is the failure
 * this repo has actually suffered (CLAUDE.md records the EventBridge drift
 * that left prospecting and four other jobs silently dead, which is why the
 * deploy re-runs the schedule script). A heartbeat that cannot notice its
 * own job dying is the magic number it exists to replace.
 *
 * Two days, not one: a single missed daily run is a blip (a deploy, a
 * throttle), two is a pattern.
 */
export const GUARDIAN_STALE_DAYS = 2

/** Has the daily watch stopped running? Unknown (`ranAt` null) is NOT
 *  stale — that is its own, louder state. */
export function guardianHeartbeatStale(beat: GuardianHeartbeat, now: Date): boolean {
  if (!beat.ranAt) return false
  const ran = new Date(beat.ranAt).getTime()
  if (Number.isNaN(ran)) return false
  return now.getTime() - ran > GUARDIAN_STALE_DAYS * 24 * 60 * 60 * 1000
}

export function resolveGuardianHeartbeat(stored: unknown): GuardianHeartbeat {
  const empty: GuardianHeartbeat = {
    ranAt: null,
    scanned: 0,
    flagged: 0,
    undelivered: 0,
    blind: false,
    problems: [],
    skipped: 0,
    audience: 'platform',
    told: [],
    emailed: [],
  }
  if (!stored || typeof stored !== 'object') return empty
  const h = (stored as Record<string, unknown>).guardian
  if (!h || typeof h !== 'object') return empty
  const g = h as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  const names = (v: unknown) =>
    Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string' && !!n).slice(0, 5) : []
  return {
    // A malformed instant reads as "never ran" — the honest floor, and the
    // one that makes the panel say so out loud rather than print junk.
    ranAt: typeof g.ranAt === 'string' && g.ranAt ? g.ranAt : null,
    scanned: num(g.scanned),
    flagged: num(g.flagged),
    undelivered: num(g.undelivered),
    blind: g.blind === true,
    audience: g.audience === 'clinic' ? 'clinic' : 'platform',
    told: names(g.told),
    emailed: names(g.emailed),
    problems: Array.isArray(g.problems)
      ? g.problems.filter((p): p is string => typeof p === 'string' && p.length > 0).slice(0, 5)
      : [],
    skipped: num(g.skipped),
  }
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
  // ENGINE breaks only — see `engineFailures7`. A hand-back is not something
  // to promise to "get working": the machine has already given up on it and
  // handed it back, and it is in their inbox right now.
  if (s.engineFailures7 > 0) {
    return `${opening} Some of my own jobs also hit trouble this week, so let me get those working before we read too much into the numbers. I’ll keep you posted.`
  }
  return `${opening} Nothing is broken on my side — everything is still running. It’s worth a look at where new patients usually find you, and whether anything changed there.`
}
