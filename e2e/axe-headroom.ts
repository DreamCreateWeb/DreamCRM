import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import { appendFileSync } from 'node:fs'

/**
 * ONE TABLE, AT THE END OF THE RUN, NAMING EVERY AXE CEILING WITH ROOM LEFT IN IT.
 *
 * WHY THIS EXISTS. `e2e/axe.ts` already prints a `::warning title=Shrink the
 * a11y baseline::` when a ceiling is clearly dead weight, and that annotation
 * is deliberately conservative: some counts wobble by an element depending on
 * what is on screen (the agenda stops reported 8 nested-interactive on one run
 * and 7 on the next; the booking confirmation went 2 then 1), so it fires only
 * when a rule reaches ZERO or drops by more than the wobble. An annotation
 * that is usually wrong is one people stop reading, and that reasoning is
 * still right.
 *
 * The cost of it is exact and it has been paid: **a ceiling that is now
 * exactly one too high prints no annotation at all.** Four ceilings stood a
 * batch longer than they needed to for that reason, and the only evidence they
 * were stale sat in the run log's `carried by the baseline` counts — a line
 * per stop, interleaved with everything else Playwright prints, which nobody
 * reads unless they already suspect something. The convention that came out of
 * it ("after you fix something at a stop, go and read the count rather than
 * waiting to be told") asks a person to remember to go looking. This prints it.
 *
 * THE SECOND TABLE, SINCE DREAMCRM-107: what axe could not DECIDE. A node
 * whose background is a gradient comes back under `incomplete` rather than
 * `violations`, so no ceiling in the suite is about it and no stop is red for
 * it — the gate does not receive that category at all. It is not a violation
 * and it is deliberately not treated as one; it is the other thing this file
 * already exists to refuse, a measurement nobody can see. Same annotation
 * channel, same powerlessness, its own fold and its own table.
 *
 * WHAT IT IS NOT. It is reporting, not a gate. This reporter never fails a
 * run, never sets an exit code, and never changes which rules are over their
 * ceiling — that is `rulesOverBaseline` in `e2e/axe.ts` and nothing here
 * touches it. Everything it knows arrives as test annotations, so a bug in
 * here can lose a table; it cannot turn a green run red or a red run green.
 * `tests/guards/axe-headroom-table.test.ts` pins that direction.
 *
 * WHY A REPORTER AND NOT A WORKFLOW STEP. `scripts/e2e-flaky-summary.mjs` is a
 * step in three workflow files, which is the right shape for it — it reads the
 * json report after Playwright has exited. This needs per-(stop, rule)
 * measurements that never reach the json report, and a reporter's `onEnd` runs
 * in the main process with every worker's annotations already collected. It
 * also means the table arrives with zero `.github/workflows/**` in the diff,
 * which keeps a reporting change out of the review gate that guards what can
 * merge.
 */

/**
 * The annotation type `e2e/axe.ts` emits and this reporter reads.
 *
 * Exported and imported rather than spelled twice, for the same reason
 * `playwright.config.ts` exports its json path to `e2e-flaky-summary.mjs`: two
 * copies of a string that must agree is a rename away from a reporter that
 * silently finds nothing, says nothing, and leaves every run looking like it
 * had no headroom to report. `tests/guards/axe-headroom-table.test.ts` fails
 * if the emitter stops importing this.
 */
export const A11Y_HEADROOM_ANNOTATION = 'a11y-headroom'

/** One (stop, rule) measurement, as `e2e/axe.ts` takes it. */
export type HeadroomSample = {
  /** The stop name — page AND state, the baseline's key. */
  stop: string
  /** The axe rule id. */
  rule: string
  /** What `e2e/axe-baseline.ts` allows at this (stop, rule). */
  ceiling: number
  /** How many nodes axe actually reported at this attempt. */
  observed: number
}

/** One row of the table: a (stop, rule) that measured under its ceiling all run. */
export type HeadroomRow = HeadroomSample & {
  /** ceiling − observed. Always ≥ 1, or the row would not be here. */
  headroom: number
  /**
   * How many measurements this row is built from, retries included.
   *
   * LOAD-BEARING, not decoration. The counts wobble, so one sample is weak
   * evidence that a ceiling is too high and five agreeing samples are strong
   * evidence. A reader deciding whether to shrink needs to know which they are
   * looking at, and the difference is invisible in the number itself.
   */
  attempts: number
}

/**
 * Fold every measurement in a run into the rows worth printing.
 *
 * TAKES THE MAXIMUM OBSERVED, never the last and never the minimum, and that
 * is the whole safety argument for the table. A ceiling can only honestly come
 * down to the worst count the run actually saw: shrink to a lucky low sample
 * and the next run fails a required check on a page nobody changed. So a
 * (stop, rule) measured at 7 and then 8 reports 8 — and if any single
 * measurement reached the ceiling, the row is dropped entirely rather than
 * averaged into looking safe.
 *
 * Pure, and exported separately from the reporter, so the guard can pin the
 * direction against its own literals instead of against today's real numbers.
 */
export function foldHeadroom(samples: HeadroomSample[]): HeadroomRow[] {
  const byKey = new Map<string, HeadroomRow>()
  for (const s of samples) {
    const key = `${s.stop} :: ${s.rule}`
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, { ...s, headroom: s.ceiling - s.observed, attempts: 1 })
      continue
    }
    const observed = Math.max(prev.observed, s.observed)
    // A ceiling that disagrees with itself across a run means the baseline was
    // edited mid-run, which cannot happen — but taking the lower one keeps the
    // headroom figure conservative if it ever does.
    const ceiling = Math.min(prev.ceiling, s.ceiling)
    byKey.set(key, { ...prev, observed, ceiling, headroom: ceiling - observed, attempts: prev.attempts + 1 })
  }
  // `Array.from` rather than spreading the map iterator: tsconfig targets
  // below es2015 refuse to iterate one without `--downlevelIteration`.
  return Array.from(byKey.values())
    .filter((r) => r.headroom > 0)
    .sort((a, b) => b.headroom - a.headroom || a.stop.localeCompare(b.stop) || a.rule.localeCompare(b.rule))
}

/**
 * Pull this run's measurements out of whatever annotations the tests carried.
 *
 * Tolerant on purpose: an annotation of another type, a missing description,
 * or a body that is not the shape we wrote is skipped rather than thrown on.
 * This runs in a reporter, and a reporter that throws takes the run's output
 * with it.
 */
export function samplesFromAnnotations(
  annotations: ReadonlyArray<{ type: string; description?: string }>,
): HeadroomSample[] {
  const out: HeadroomSample[] = []
  for (const a of annotations) {
    if (a.type !== A11Y_HEADROOM_ANNOTATION || !a.description) continue
    try {
      const parsed = JSON.parse(a.description) as Partial<HeadroomSample>
      if (
        typeof parsed.stop === 'string' &&
        typeof parsed.rule === 'string' &&
        typeof parsed.ceiling === 'number' &&
        typeof parsed.observed === 'number'
      ) {
        out.push({ stop: parsed.stop, rule: parsed.rule, ceiling: parsed.ceiling, observed: parsed.observed })
      }
    } catch {
      // Not ours, or corrupted. Either way it is not worth a word.
    }
  }
  return out
}

/** The markdown the reporter prints, or `null` when there is nothing to say. */
export function formatHeadroomTable(rows: HeadroomRow[]): string | null {
  if (rows.length === 0) return null
  const total = rows.reduce((n, r) => n + r.headroom, 0)
  const lines = [
    '### Axe ceilings with room left in them',
    '',
    `${rows.length} (stop, rule) ${rows.length === 1 ? 'pair' : 'pairs'} measured under ` +
      `${rows.length === 1 ? 'its' : 'their'} ceiling in this run — ${total} violation${total === 1 ? '' : 's'} ` +
      'of room a regression could land in without failing a check.',
    '',
    '| Stop | Rule | Ceiling | Worst seen | Room | Samples |',
    '| --- | --- | ---: | ---: | ---: | ---: |',
    ...rows.map(
      (r) => `| ${r.stop} | \`${r.rule}\` | ${r.ceiling} | ${r.observed} | **${r.headroom}** | ${r.attempts} |`,
    ),
    '',
    '**Worst seen** is the highest count any attempt reported, never an average and never the last ' +
      'one — the counts wobble by an element, so that is the lowest a ceiling can honestly go. ' +
      'Shrink it in `e2e/axe-baseline.ts` (delete the entry at 0) in the same PR as the fix that ' +
      'earned it; a ceiling is room a defect can hide in, not a defect count. A pair measured only ' +
      'once is one sample, not a trend.',
    '',
    'Only stops this run actually visited can appear here. A ceiling for a stop no spec reached is ' +
      'invisible to this table, and so is a rule that never fired.',
  ]
  return lines.join('\n')
}

/* ── WHAT AXE COULD NOT DECIDE (DREAMCRM-107) ────────────────────────────── */

/**
 * The annotation type `e2e/axe.ts` emits for the NEEDS-REVIEW class, and this
 * reporter reads.
 *
 * Separate from `A11Y_HEADROOM_ANNOTATION` rather than folded into it, because
 * the two carry different questions and a reader of either has to know which
 * one they are looking at. Headroom is *this ceiling has room in it*. This one
 * is *axe declined to answer*, which is not a count under a ceiling at all.
 * `tests/guards/axe-headroom-table.test.ts` pins both wires.
 */
export const A11Y_NEEDS_REVIEW_ANNOTATION = 'a11y-needs-review'

/**
 * One rule axe returned under `incomplete` at a stop.
 *
 * `nodes` is the true count; `targets` is capped (see `NEEDS_REVIEW_TARGET_CAP`)
 * because this travels as a JSON annotation and a stop with sixty undecidable
 * nodes should still produce a readable row rather than a wall.
 */
export type NeedsReviewRule = {
  /** The axe rule id — `color-contrast`, `aria-hidden-focus`, … */
  rule: string
  /** How many nodes axe could not decide about. */
  nodes: number
  /** Up to `NEEDS_REVIEW_TARGET_CAP` of their selectors, for the table. */
  targets: string[]
}

/** How many selectors one (stop, rule) row carries. */
export const NEEDS_REVIEW_TARGET_CAP = 3

/**
 * One stop's needs-review status, as `e2e/axe.ts` takes it.
 *
 * EMITTED FOR EVERY STOP, INCLUDING THE ONES WITH NOTHING TO SAY — `rules` is
 * empty in the ordinary case and the annotation goes out anyway. That is the
 * whole reason this is a sample per stop rather than a sample per finding: a
 * run where axe decided everything and a run where the emit side has come
 * unhooked are otherwise the same silence, and the second is the likelier bug.
 * §2a of the conventions: every alarm ships with the thing that notices it
 * stopped.
 */
export type NeedsReviewSample = {
  /** The stop name — page AND state, the same key the baseline uses. */
  stop: string
  /** Every rule axe returned under `incomplete` here. Empty is ordinary. */
  rules: NeedsReviewRule[]
}

/** One row of the table: a (stop, rule) axe could not grade. */
export type NeedsReviewRow = NeedsReviewRule & {
  stop: string
  /** How many attempts reported it, retries included. */
  attempts: number
}

/**
 * Fold every needs-review sample in a run into the rows worth printing.
 *
 * TAKES THE MAXIMUM NODE COUNT, for the same reason `foldHeadroom` takes the
 * worst count: a retry that happened to land before a gradient painted would
 * otherwise erase what the first attempt saw. Targets are unioned across
 * attempts and then capped, so a row names as many distinct elements as it can
 * rather than whichever attempt came last.
 *
 * Pure, and exported separately from the reporter, so the guard can pin it
 * against its own literals.
 */
export function foldNeedsReview(samples: NeedsReviewSample[]): NeedsReviewRow[] {
  const byKey = new Map<string, NeedsReviewRow & { seen: Set<string> }>()
  for (const sample of samples) {
    for (const r of sample.rules) {
      const key = `${sample.stop} :: ${r.rule}`
      const prev = byKey.get(key)
      if (!prev) {
        byKey.set(key, {
          stop: sample.stop,
          rule: r.rule,
          nodes: r.nodes,
          targets: [],
          attempts: 1,
          seen: new Set(r.targets),
        })
        continue
      }
      prev.nodes = Math.max(prev.nodes, r.nodes)
      prev.attempts += 1
      for (const t of r.targets) prev.seen.add(t)
    }
  }
  return Array.from(byKey.values())
    .map(({ seen, ...row }) => ({ ...row, targets: Array.from(seen).slice(0, NEEDS_REVIEW_TARGET_CAP) }))
    .sort((a, b) => b.nodes - a.nodes || a.stop.localeCompare(b.stop) || a.rule.localeCompare(b.rule))
}

/**
 * Pull this run's needs-review samples out of whatever annotations the tests
 * carried. Tolerant for the same reason `samplesFromAnnotations` is.
 */
export function needsReviewFromAnnotations(
  annotations: ReadonlyArray<{ type: string; description?: string }>,
): NeedsReviewSample[] {
  const out: NeedsReviewSample[] = []
  for (const a of annotations) {
    if (a.type !== A11Y_NEEDS_REVIEW_ANNOTATION || !a.description) continue
    try {
      const parsed = JSON.parse(a.description) as Partial<NeedsReviewSample>
      if (typeof parsed.stop !== 'string' || !Array.isArray(parsed.rules)) continue
      const rules: NeedsReviewRule[] = []
      for (const r of parsed.rules as Partial<NeedsReviewRule>[]) {
        if (typeof r?.rule !== 'string' || typeof r.nodes !== 'number') continue
        rules.push({
          rule: r.rule,
          nodes: r.nodes,
          targets: Array.isArray(r.targets) ? r.targets.filter((t): t is string => typeof t === 'string') : [],
        })
      }
      out.push({ stop: parsed.stop, rules })
    } catch {
      // Not ours, or corrupted. Either way it is not worth a word.
    }
  }
  return out
}

/** The markdown the reporter prints, or `null` when axe decided everything. */
export function formatNeedsReviewTable(rows: NeedsReviewRow[]): string | null {
  if (rows.length === 0) return null
  const total = rows.reduce((n, r) => n + r.nodes, 0)
  const lines = [
    '### Axe could not decide — needs a human',
    '',
    `${total} node${total === 1 ? '' : 's'} across ${rows.length} (stop, rule) ` +
      `${rows.length === 1 ? 'pair' : 'pairs'} came back \`incomplete\` rather than pass or fail. ` +
      'Every stop in this suite is silent about these in its violation count, by construction.',
    '',
    '| Stop | Rule | Nodes | Where | Samples |',
    '| --- | --- | ---: | --- | ---: |',
    ...rows.map(
      (r) =>
        `| ${r.stop} | \`${r.rule}\` | ${r.nodes} | ${
          r.targets.length ? r.targets.map((t) => `\`${t}\``).join(', ') : '—'
        } | ${r.attempts} |`,
    ),
    '',
    '`incomplete` is axe saying it could not resolve the question, not that the element is fine and ' +
      'not that it is broken — text over a gradient or an image is the common case, because there is ' +
      'no single background colour to compute a ratio against. **This table gates nothing**: an ' +
      'undecidable result is not a violation, and failing a required check on one would be a gate ' +
      'people have to interpret. Read the row, measure the element by hand at the stop it names, and ' +
      'either fix it or leave it — but do not read a green run as a claim about anything listed here.',
  ]
  return lines.join('\n')
}

/**
 * Print the tables once, at the end of the run, to the log and to the GitHub
 * job summary when there is one.
 *
 * Nothing here is allowed to be load-bearing, so everything is wrapped: a
 * failed summary write is a warning, not an error, and never an exit code.
 */
export default class AxeHeadroomReporter implements Reporter {
  private samples: HeadroomSample[] = []
  private needsReview: NeedsReviewSample[] = []

  onTestEnd(_test: TestCase, result: TestResult): void {
    try {
      this.samples.push(...samplesFromAnnotations(result.annotations ?? []))
      this.needsReview.push(...needsReviewFromAnnotations(result.annotations ?? []))
    } catch {
      // See the class doc: losing the table is acceptable, breaking the run is not.
    }
  }

  onEnd(): void {
    // TWO INDEPENDENT REPORTS, EACH IN ITS OWN TRY. They answer different
    // questions and one falling over must not take the other's table with it —
    // that is the same "silence that could mean either" failure this file is
    // built around, just arriving through an exception instead of a bad wire.
    this.reportHeadroom()
    this.reportNeedsReview()
  }

  private reportHeadroom(): void {
    try {
      const table = formatHeadroomTable(foldHeadroom(this.samples))
      if (!table) {
        // SAYING NOTHING WOULD BE THE ONE FAILURE THIS FILE ARGUES AGAINST.
        //
        // A tight ratchet and a reporter that never ran produce identical
        // silence, and the second is the likelier bug — the first CI run of
        // this reporter printed no table because every measured ceiling
        // really was tight, and there was no way to tell that from the log.
        // "A tool that answers 'can't tell' has not answered 'fine'."
        //
        // Zero samples is the louder of the two lines on purpose: it means
        // either no spec loaded a page, or the emit side has come unhooked.
        console.log(
          this.samples.length === 0
            ? '[a11y] no axe ceilings were measured in this run — either no spec reached a ' +
                'baselined stop, or e2e/axe.ts has stopped emitting. Not the same as "nothing to shrink".'
            : `[a11y] every measured ceiling is tight (${this.samples.length} measurement` +
                `${this.samples.length === 1 ? '' : 's'}) — nothing to shrink.`,
        )
        return
      }
      console.log(`\n${table}\n`)
      const summaryPath = process.env.GITHUB_STEP_SUMMARY
      if (summaryPath) appendFileSync(summaryPath, `\n${table}\n`)
    } catch (err) {
      console.log(`[a11y] could not print the ceiling-headroom table: ${String(err)}`)
    }
  }

  /**
   * The other half of the run's a11y picture: what axe DECLINED to grade.
   *
   * Same silence argument as the headroom table above and one notch sharper,
   * because the emit side here fires at every stop whether or not it has
   * anything to report. Zero samples therefore cannot mean "everything was
   * decidable" — it means no stop was scanned, or `e2e/axe.ts` has stopped
   * emitting. That distinction is the whole reason a sample goes out on a
   * clean stop.
   */
  private reportNeedsReview(): void {
    try {
      const table = formatNeedsReviewTable(foldNeedsReview(this.needsReview))
      if (!table) {
        console.log(
          this.needsReview.length === 0
            ? '[a11y] no stop reported whether axe could decide — either no spec reached an ' +
                'a11y stop, or e2e/axe.ts has stopped emitting. Not the same as "axe decided everything".'
            : `[a11y] axe decided every node it saw, at all ${this.needsReview.length} scanned stop` +
                `${this.needsReview.length === 1 ? '' : 's'} — nothing needs a human.`,
        )
        return
      }
      console.log(`\n${table}\n`)
      const summaryPath = process.env.GITHUB_STEP_SUMMARY
      if (summaryPath) appendFileSync(summaryPath, `\n${table}\n`)
    } catch (err) {
      console.log(`[a11y] could not print the needs-review table: ${String(err)}`)
    }
  }

  /**
   * This reporter does write to stdout — one table, after the last test.
   *
   * Answered honestly rather than left to default: Playwright adds its own
   * fallback output when NO configured reporter claims stdio, and a reporter
   * that under-reports what it prints is how a suite ends up with two
   * progress streams.
   */
  printsToStdio(): boolean {
    return true
  }
}
