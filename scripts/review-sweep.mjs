// NO SHEBANG, DELIBERATELY — the same lesson `scripts/review-gate.mjs` and
// `scripts/rulebook-drift.mjs` both carry. The workflow runs `node
// scripts/review-sweep.mjs`, so it was never load-bearing, and git hands this
// file to a Windows working tree with CRLF endings: vitest's SSR transform
// leaves the `\r` behind when it strips `#!…` and every test importing this
// module dies with a parse error at column 1.
/**
 * DID A PR THAT OWED SOMETHING MERGE WITHOUT PAYING IT?
 *
 * `review-gate.yml` answers "is a review OWED" on every PR and says so on the
 * run and with the `needs-sentinel-review` label. It has never been able to
 * answer the second question — "did one HAPPEN" — and says so in its own
 * header. Nothing else asked it either. So the gate labelled a PR correctly,
 * the author forgot, and the merge went through green with no part of the
 * system aware a rule had been skipped.
 *
 * That is not hypothetical and it is not rare. **#573 and #582 both merged
 * carrying `needs-sentinel-review` with no review** — the gate was right twice,
 * author memory failed twice in the same batch, and the miss surfaced a day
 * later in a manual sweep somebody chose to run. This replaces the choosing.
 *
 * **It grades TWO obligations, not one** (DREAMCRM-92). The gate applies
 * `needs-forge-intake` with exactly the same care and, until now, nothing read
 * it: this file excluded it by design, it is never cleared at merge, and
 * THIRTY merged PRs wore it on the day that changed, most long since routed.
 * An obligation with no closing record is not a queue, it is a note in a
 * drawer — the same argument #593 made for the review half. Each obligation
 * keeps its own label, its own cut-off and its own idea of a record; they
 * share the window, the summary and the exit status.
 *
 * ========================= WHAT THIS IS, PRECISELY ==========================
 *
 * A POST-MERGE ALARM. It gates nothing, blocks nothing, and runs after the
 * merge commit is already on `main`. DREAMCRM-49's ruling that `review-gate`
 * stays advisory is untouched: the reason a blocking version was refused is
 * that every pass signal available can be minted by the single admin account
 * the whole agent fleet authenticates as, so a blocker would read as
 * enforcement while being weaker than an honest advisory.
 *
 * THAT ARGUMENT IS WHY A SWEEP WORKS WHERE A GATE DID NOT, and the distinction
 * is the whole design:
 *
 *   * A GATE has to survive an adversary. A signal the author can mint is
 *     worthless in front of a merge, because minting it is the cheapest way
 *     past the gate.
 *   * A SWEEP only has to survive FORGETTING. The failure this exists to catch
 *     is an author who meant to request a review and did not — #573 and #582,
 *     twice in one batch. Someone who deliberately types a fake verdict onto
 *     their own PR to dodge a reviewer has done something a check was never
 *     going to stop; someone who forgot leaves exactly the trace this reads.
 *
 * So a forgeable signal is the right instrument here and a disqualifying one
 * there. Do not "strengthen" this by making it block — that is the DREAMCRM-49
 * decision, re-argued from the other end, and it is still no. The intake
 * record is forgeable on identical terms and for identical reasons.
 *
 * ================== A PERMANENTLY-RED ALARM IS A DISABLED ONE ===============
 *
 * The first version kept the run red while ANY unremediated entry existed.
 * That is the right property for the TEXT and it was a disaster in the EXIT
 * STATUS: this sweep was red six consecutive days — `35094044453` (2026-09-16)
 * through `35605207003` (2026-09-21) — over four PRs, three of which had
 * genuinely been reviewed and never mirrored. After six mornings the red read
 * as wallpaper, and **PR #636 merged into that silence on 2026-09-22 carrying
 * `needs-sentinel-review`, editing `scripts/review-gate.mjs` — the gate's own
 * rule list — with no verdict anywhere.** A new miss produced no new signal,
 * because there was no signal left to produce.
 *
 * So the two halves are split (DREAMCRM-92, §2a):
 *
 *   * THE SUMMARY still prints every unremediated entry, every morning, with
 *     Sentinel's property intact — an unremediated miss is not less true
 *     tomorrow.
 *   * THE EXIT STATUS is keyed on the entries that are NEW SINCE THIS SWEEP
 *     LAST WENT GREEN.
 *
 * **WHAT THAT DOES AND DOES NOT BUY, because the first draft of this comment
 * claimed more than the code does and a maintainer who believes it will
 * misread a legitimately red week** (Sentinel, reviewing #643). A red run does
 * NOT advance the last-green instant. So an unremediated entry is still
 * `>= lastGreen` tomorrow, and the morning after, and every morning until
 * somebody clears it — the run stays red for as long as the queue is dirty,
 * exactly as it did before.
 *
 * The property this actually adds is narrower and still worth having: **once
 * the queue IS clear, a new miss is a NEW red rather than the continuation of
 * an old one**, and a green morning becomes a positive claim that nothing is
 * outstanding. Before this, a queue nobody cleared made every subsequent miss
 * invisible — which is the #636 story.
 *
 * Stated the other way, because this file's whole discipline is saying what it
 * cannot see: **this change alone would not have prevented #636.** Those six
 * red mornings were over four UNREMEDIATED entries; under this code the lookup
 * finds no green, fails closed, and all four are fresh — six red mornings
 * again. What prevents the recurrence is §2a's other half, the standing issue
 * that gives the red an owner, plus the queue being kept at zero. The two were
 * always meant to land together.
 *
 * The `standing` branch in `newSince` is therefore reached rarely in practice:
 * a record that DISAPPEARS after a green run (the deleted-verdict-comment
 * blind spot below), a label applied to an already-merged PR by hand, or a
 * cut-off moving. It is not the common path, and the summary — not the exit
 * code — is the channel that catches those.
 *
 * **The lookup is pinned to LAST GREEN and that is the load-bearing word.**
 * Degrade it to *last run* and every miss becomes a one-day alarm: red on the
 * morning it appears, green the morning after with the finding untouched,
 * which is strictly worse than the permanently-red version it replaced.
 * `lastGreenAt` therefore filters on `conclusion === 'success'` itself rather
 * than trusting the caller's `--status` flag, and
 * `tests/guards/review-sweep.test.ts` drives it with a history whose newest
 * run is a FAILURE to watch it reach past that to the last green one.
 *
 * WHEN THE LOOKUP FAILS — an empty run history, a rate-limited `gh`, a file
 * that is not JSON — it FAILS CLOSED: every entry counts as new and the run
 * stays red, with the reason printed in the summary. The opposite default
 * would turn one throttled API call into a silent green morning, which is the
 * failure this whole file exists to refuse.
 *
 * ===================== ZERO FALSE POSITIVES IS THE BAR ======================
 *
 * A sweep that cries wolf gets ignored, and this one has an unusually easy way
 * to cry wolf: **Sentinel's verdicts live on Multica issues, which GitHub
 * cannot see.** On the day this was written, not one PR in the repository
 * carried a GitHub review or a verdict comment — including #575, #579 and #580,
 * which were genuinely reviewed. Flagging "no review record on the PR" against
 * that history would have flagged three satisfied reviews out of five.
 *
 * Three mechanisms hold the false-positive rate at zero, and all three are
 * load-bearing:
 *
 *   1. A CUT-OFF PER OBLIGATION. Nothing merged before that obligation's
 *      record-keeping convention existed is judged by it. The skipped PRs are
 *      COUNTED AND NAMED in the summary rather than silently dropped — an
 *      alarm quietly narrowing its own window is the failure mode it exists to
 *      catch, aimed at itself.
 *   2. Generous satisfaction. Any plausible record counts: a GitHub review
 *      carrying a verdict, or a PR comment carrying a verdict word, however it
 *      is phrased. Being loose here buys false NEGATIVES, which is the
 *      tolerable direction — a missed miss costs the manual sweep we already
 *      had; a false alarm costs the instrument.
 *   3. The label is the trigger, NOT a re-classification of the diff against
 *      today's `GATE_RULES`. That list has been widened four times in twelve
 *      days (#553, #559, #565, #569), and re-running it over merged history
 *      would retro-flag PRs that were correctly clean when they merged.
 *
 * The conventions that make (2) work, one per obligation: **whoever merges a
 * gated PR records the verdict on the PR before merging**, and **whoever
 * routes an intake mirrors it onto the PR the same way**. One `gh pr comment`
 * each. Both are prompted by the review-gate summary itself
 * (`scripts/review-gate.mjs`), so the obligation arrives with the label rather
 * than living only in a document.
 *
 * WHAT IT THEREFORE CANNOT SEE, stated rather than implied — a blind-spot list
 * that omits a known blind spot spends the credibility it exists for:
 *
 *   * A PR whose label step hiccuped. `review-gate.yml`'s labelling is
 *     `continue-on-error` on purpose, so a GitHub flake can leave a gated PR
 *     unlabelled and this sweep never looks at it.
 *   * A PR that merged during the same run of `review-gate.yml` that would
 *     have labelled it.
 *   * A verdict or intake comment somebody typed without a review or a routing
 *     behind it.
 *   * A STANDING QUEUE LONGER THAN GITHUB WILL ANNOTATE. Every unremediated
 *     entry gets an annotation, and GitHub caps a step at 10 `::error` plus 10
 *     `::warning` — so a large queue truncates the annotation list silently.
 *     The summary still carries every entry, which is why that is an FYI
 *     rather than a hole; the annotations are the convenience channel and the
 *     summary is the record. (Sentinel, reviewing #643.)
 *   * AN ENTRY THAT GOES BACK TO UNSATISFIED WITHOUT A NEW MERGE. Newness is
 *     dated by `mergedAt`, because that is the only instant on a PR this sweep
 *     can trust. Delete a verdict comment off a PR that merged last week and
 *     the entry reappears in the summary — correctly — while reading as
 *     STANDING rather than new, so it does not redden the run on its own. The
 *     summary still names it every morning, and it still gets an annotation;
 *     that is the channel which catches this, not the exit code.
 *   * THE SHARPEST EDGE, named by Sentinel reviewing #593 and now pinned by
 *     `tests/guards/review-sweep.test.ts` rather than left to be rediscovered:
 *     `review-gate.yml`'s own summary contains the literal word `APPROVE` (it
 *     prints the instruction below). It is safe ONLY because that check writes
 *     to `GITHUB_STEP_SUMMARY` and `GITHUB_OUTPUT` and never to `gh pr
 *     comment`. Give it a comment channel and every gated PR in the repo reads
 *     as satisfied on the day that lands — this whole alarm goes blind, green
 *     and silent at once. The guard refuses that edit; do not work around it by
 *     narrowing the verdict patterns instead. The intake half inherits the
 *     hazard and the guard: that same summary must never read as an intake
 *     record either.
 *
 * Usage:
 *   node scripts/review-sweep.mjs --prs prs.json --limit 500
 *   node scripts/review-sweep.mjs --prs prs.json --limit 500 --last-green runs.json
 *   node scripts/review-sweep.mjs --prs prs.json --limit 500 --since 2026-09-20T00:00:00Z
 */
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * THE CUT-OFF FOR THE REVIEW HALF, and it is the single most important line in
 * this file.
 *
 * Verdicts live on Multica issues. Until the "record the verdict on the PR"
 * convention landed with this check, a reviewed PR and an unreviewed one were
 * INDISTINGUISHABLE from GitHub — #575, #579 and #580 were reviewed and carry
 * no more on-PR evidence than #573 and #582, which were not.
 *
 * So everything merged before this instant is out of scope. Not "probably
 * fine", not "assumed reviewed" — UNJUDGEABLE, and the summary says so with a
 * count. This is the same discipline `scripts/rulebook-drift.mjs` applies to a
 * claim it could not grade: a thing that was not checked is never reported as
 * a thing that passed.
 *
 * It is the instant this check was written (DREAMCRM-61), which is after every
 * merge that predates it and before the PR carrying it landed. That ordering is
 * the point and it is worth stating: a cut-off in the FUTURE silently exempts
 * whatever merges before it arrives, and
 * `tests/guards/review-sweep.test.ts` refuses one.
 *
 * Do not move it forward to quieten a red run — that is the axe-ceiling mistake
 * in a different costume, and a finding it hides is a review that never
 * happened. Moving it BACK is worse: it retro-judges merges against a
 * convention that did not exist, which is precisely the false-positive class
 * this constant exists to prevent.
 */
export const SWEPT_SINCE = '2026-09-15T16:00:00Z'

/**
 * THE CUT-OFF FOR THE INTAKE HALF, and it is a different date ON PURPOSE.
 *
 * Same argument as `SWEPT_SINCE`, run again from scratch for a record that did
 * not exist until DREAMCRM-91. `needs-forge-intake` has been applied since
 * #553 and read by nothing since: it is never cleared at merge, and **thirty
 * merged PRs carried it on 2026-09-22**, from #569 through #636, most of them
 * routed to Forge long ago with the routing recorded on a Multica issue that
 * GitHub cannot see. That is exactly the #575/#579/#580 situation one
 * obligation over — a routed PR and a forgotten one are indistinguishable from
 * here — and judging those thirty would open this half with thirty findings,
 * most of them wrong, on an instrument whose entire value is being believed.
 *
 * So this half opens looking forward. This is the hour DREAMCRM-92 was filed
 * (2026-09-22T08:03Z, rounded down), which is after #636 — the last merge
 * wearing the label — and before the PR carrying this code. The thirty are
 * counted and named as NOT JUDGED, never as passes.
 *
 * It is LATER than `SWEPT_SINCE` and must stay that way: `windowGap` grades the
 * `gh pr list` truncation against the review cut-off, which only covers both
 * halves while the review cut-off is the earlier one. The guard test pins that
 * ordering rather than leaving it to hold by luck.
 */
export const INTAKE_SWEPT_SINCE = '2026-09-22T08:00:00Z'

/** The label `review-gate.yml` puts on a PR that owes Sentinel a review. */
export const REVIEW_LABEL = 'needs-sentinel-review'

/** The label `review-gate.yml` puts on a PR that changes what can merge. */
export const INTAKE_LABEL = 'needs-forge-intake'

/**
 * What counts as a verdict written down.
 *
 * The four §3 verdicts plus the spellings a real sentence uses. Matched
 * case-insensitively on word boundaries, anywhere in the body, because the
 * goal is to recognise a review that HAPPENED rather than to police how it was
 * phrased. `APPROVE WITH NOTES` needs no entry of its own — `APPROVE` already
 * matches it — and that is the correct direction: over-matching costs a missed
 * miss, under-matching costs a false alarm against a real review.
 *
 * Deliberately NOT a required template. A fixed format would make this
 * check right about wording and wrong about reviews, and the day somebody
 * records a genuine verdict a shade differently the alarm fires at the one
 * person who did the work.
 */
export const VERDICT_PATTERNS = [
  /\bapproved?\b/i,
  /\brequest(?:ed|ing)?\s+changes\b/i,
  /\bchanges\s+requested\b/i,
]

/**
 * What counts as an intake written down.
 *
 * §2's shape, mirrored onto the PR where an instrument can see it:
 *
 *     Forge intake: §2b, §6 — <link to the issue comment>
 *
 * TWO parts, and the second one is the reason this is gradeable rather than
 * decorative: the marker, and a SECTION REFERENCE naming where the rule
 * actually landed. §2 asks for the sections by name — "name the sections it
 * landed in, not merely that it landed" — so a bare "routed to Forge" does not
 * satisfy this, and that is deliberate rather than pedantry. An intake's real
 * record lives in a skill document outside the repo; the section number is the
 * only part of it a reader standing at the PR can follow.
 *
 * Kept as loose as that rule allows for the same reason `VERDICT_PATTERNS` is
 * loose: `§2b`, `§§2, 6` and `sections 2b and 6` all count. It is forgeable,
 * like every other signal here, and §2a's argument applies unchanged — a sweep
 * only has to survive forgetting.
 */
export const INTAKE_MARKER = /\bforge\s+intake\b/i
export const SECTION_REF = /(?:§+\s*\d|\bsections?\s+\d)/i

/**
 * GitHub review states that are a verdict on their own terms.
 *
 * `COMMENTED` is not on this list and that is not an oversight: GitHub refuses
 * `--approve` and `--request-changes` on your OWN pull request, and every agent
 * here authenticates as the same account, so a real Sentinel verdict left as a
 * GitHub review arrives as `COMMENTED`. It is read for a verdict word like any
 * other comment body rather than counted on its state.
 *
 * `DISMISSED` is off the list for the opposite reason: a dismissed review is a
 * verdict that was taken back, and counting it would let the one action that
 * REMOVES a review record satisfy the check that looks for one.
 */
export const VERDICT_REVIEW_STATES = ['APPROVED', 'CHANGES_REQUESTED']

const carriesVerdict = (body) => VERDICT_PATTERNS.some((p) => p.test(body ?? ''))

const carriesIntake = (body) => INTAKE_MARKER.test(body ?? '') && SECTION_REF.test(body ?? '')

/** Does this merged PR carry a review record anyone could point at? */
export function reviewRecord(pr) {
  for (const review of pr.reviews ?? []) {
    if (VERDICT_REVIEW_STATES.includes(review.state)) {
      return { kind: 'review', by: review.author?.login ?? 'unknown', detail: review.state }
    }
    if (carriesVerdict(review.body)) {
      return { kind: 'review', by: review.author?.login ?? 'unknown', detail: 'a verdict in the review body' }
    }
  }
  for (const comment of pr.comments ?? []) {
    if (carriesVerdict(comment.body)) {
      return { kind: 'comment', by: comment.author?.login ?? 'unknown', detail: 'a verdict in a PR comment' }
    }
  }
  return null
}

/**
 * Does this merged PR carry an intake record anyone could point at?
 *
 * No equivalent of `VERDICT_REVIEW_STATES` here, and there should not be: a
 * GitHub review state says something about a review, never about whether a rule
 * reached the rulebook. Only a body that says so counts.
 */
export function intakeRecord(pr) {
  for (const review of pr.reviews ?? []) {
    if (carriesIntake(review.body)) {
      return { kind: 'review', by: review.author?.login ?? 'unknown', detail: 'an intake record in the review body' }
    }
  }
  for (const comment of pr.comments ?? []) {
    if (carriesIntake(comment.body)) {
      return {
        kind: 'comment',
        by: comment.author?.login ?? 'unknown',
        detail: 'an intake record naming the sections it landed in',
      }
    }
  }
  return null
}

const labelled = (pr, label) => (pr.labels ?? []).some((l) => l.name === label)

/**
 * Sort every merged PR into one of five buckets, for ONE obligation.
 *
 * `outOfWindow`, `ungated` and `unreadable` are not findings and never become
 * findings. They are reported as COUNTS so that a run which looked at nothing
 * cannot be mistaken for a run that found nothing — the `Graded N/8` lesson
 * from `scripts/rulebook-drift.mjs`, which is the same lesson `e2e/axe.ts`
 * learned about a headroom table that prints nothing.
 *
 * `unreadable` exists because the alternative was a bare `continue` — the one
 * place a PR could leave the count without being named, in a file whose whole
 * stated discipline is "counted and named, never silently dropped". `--state
 * merged` makes it unreachable today, and that is exactly the kind of
 * unreachable path that stops being unreachable without anyone deciding it
 * should. Found by Sentinel reviewing #593.
 */
function bucket(prs, { label, since, record, obligation }) {
  const cutoff = Date.parse(since)
  const unsatisfied = []
  const satisfied = []
  const outOfWindow = []
  const unreadable = []
  let ungated = 0

  for (const pr of prs) {
    const mergedAt = Date.parse(pr.mergedAt ?? '')
    if (!Number.isFinite(mergedAt)) {
      unreadable.push(pr)
      continue
    }
    if (!labelled(pr, label)) {
      ungated++
      continue
    }
    if (mergedAt < cutoff) {
      outOfWindow.push(pr)
      continue
    }
    const found = record(pr)
    if (found) satisfied.push({ pr, record: found })
    else unsatisfied.push(pr)
  }

  return { unsatisfied, satisfied, outOfWindow, unreadable, ungated, since, label, obligation }
}

/** The review half: PRs that merged carrying `needs-sentinel-review`. */
export function sweep(prs, since = SWEPT_SINCE) {
  return bucket(prs, { label: REVIEW_LABEL, since, record: reviewRecord, obligation: 'review' })
}

/** The intake half: PRs that merged carrying `needs-forge-intake` (DREAMCRM-92). */
export function intakeSweep(prs, since = INTAKE_SWEPT_SINCE) {
  return bucket(prs, { label: INTAKE_LABEL, since, record: intakeRecord, obligation: 'intake' })
}

/**
 * WHEN DID THIS SWEEP LAST GO GREEN?
 *
 * Fed the `gh run list --workflow review-sweep.yml --json
 * databaseId,conclusion,createdAt` array. Returns `{ at, run, why }` — `at` is
 * the epoch instant of the most recent SUCCESSFUL run, or `null` with a `why`
 * saying which way the lookup failed.
 *
 * **It filters on `conclusion === 'success'` here rather than trusting the
 * `--status success` flag the workflow passes.** The flag and the filter are
 * the same assertion written twice on purpose: dropping the flag is a one-token
 * edit to a YAML file, after which this function would read the last RUN
 * instead of the last GREEN one and every finding would become a one-day
 * alarm — red the morning it appears, green the morning after, finding
 * untouched. That is the specific degradation §2a names, and it is worse than
 * the permanently-red behaviour it replaced, because a green run is a positive
 * claim that there is nothing new.
 *
 * `createdAt` rather than the run's finish time, deliberately: it is the
 * conservative end. A PR that merged WHILE the green run was executing was
 * never examined by it, and dating the window from the start keeps that PR on
 * the new side.
 */
export function lastGreenAt(runs) {
  if (!Array.isArray(runs)) {
    return { at: null, run: null, why: 'the run history was not a JSON array, so the lookup returned nothing usable' }
  }
  const greens = runs
    .filter((r) => r && r.conclusion === 'success')
    .map((r) => ({ at: Date.parse(r.createdAt ?? ''), id: r.databaseId ?? null }))
    .filter((r) => Number.isFinite(r.at))

  if (!greens.length) {
    return {
      at: null,
      run: null,
      why:
        'no run of this sweep in the history GitHub returned concluded `success`, so there is no ' +
        'green to measure "new" against',
    }
  }
  const newest = greens.reduce((a, b) => (b.at > a.at ? b : a))
  return { at: newest.at, run: newest.id, why: null }
}

/**
 * Split findings into the ones that are NEW since the last green run and the
 * ones that have been standing there since before it.
 *
 * FAILS CLOSED. With no green instant — the lookup failed, the history is
 * empty, `gh` was throttled — every entry is new and the run stays red. The
 * other default would let one bad API call print a green morning over a real
 * miss, which is the whole failure this sweep exists to refuse.
 *
 * `>=` rather than `>` on the boundary for the same reason: a PR that merged on
 * the exact second the green run started lands on the new side.
 */
export function newSince(entries, lastGreen) {
  const at = typeof lastGreen === 'number' ? lastGreen : lastGreen?.at
  if (!Number.isFinite(at)) return { fresh: [...entries], standing: [] }

  const fresh = []
  const standing = []
  for (const pr of entries) {
    const mergedAt = Date.parse(pr.mergedAt ?? '')
    if (!Number.isFinite(mergedAt) || mergedAt >= at) fresh.push(pr)
    else standing.push(pr)
  }
  return { fresh, standing }
}

/**
 * DID THE SWEEP ACTUALLY REACH ITS OWN WINDOW?
 *
 * `gh pr list --limit N` truncates silently. A sweep that asked for 100 PRs,
 * got exactly 100, and never saw back as far as `SWEPT_SINCE` has a hole in it
 * that looks from the outside exactly like a clean result. This is the third
 * time this repo has had to write down the same rule — a check that could not
 * do its job must say so loudly rather than report nothing to report.
 *
 * Graded against the REVIEW cut-off, which covers the intake half too for one
 * reason only: `SWEPT_SINCE` is the earlier of the two. The guard test pins
 * that ordering, because the day somebody adds a third obligation with an older
 * cut-off this function starts grading the wrong number silently.
 *
 * Returns null when the window was covered, or a reason when it was not.
 */
export function windowGap(prs, limit, since = SWEPT_SINCE) {
  const merged = prs.map((p) => Date.parse(p.mergedAt ?? '')).filter(Number.isFinite)
  if (!merged.length) {
    return `no merged PR carried a \`mergedAt\`, so this run graded nothing. Check the \`gh pr list\` step.`
  }
  const oldest = Math.min(...merged)
  if (prs.length >= limit && oldest > Date.parse(since)) {
    return (
      `the sweep asked for ${limit} merged PRs and got ${prs.length}, the oldest merged ` +
      `${new Date(oldest).toISOString()} — still newer than SWEPT_SINCE (${since}). Merges older ` +
      `than that were never looked at. Raise \`--limit\` in .github/workflows/review-sweep.yml.`
    )
  }
  return null
}

/** The wording each obligation uses about itself, so the summary reads as a sentence. */
const OBLIGATION_COPY = {
  review: {
    recordNoun: 'a record',
    heading: (n) => `${n} merged ${n === 1 ? 'PR owes' : 'PRs owe'} a review that was never recorded`,
    blurb:
      'Each of these was labelled `needs-sentinel-review` by the gate, merged, and carries no ' +
      'review record on the PR at all — no GitHub review, no comment with a verdict in it.',
    remedy: [
      'What to do, in order:',
      '',
      '1. **If the review happened** and the verdict is on the Multica issue but not on the PR, ' +
        'mirror it across so the record exists where the sweep can see it — either of you can, ' +
        'and Sentinel records it at verdict time:',
      '',
      '   ```bash',
      '   gh pr comment <n> --body "Sentinel review: APPROVE — <link to the issue comment>"',
      '   ```',
      '',
      '2. **If it did not**, the change is already on `main` and already deployed. Post the review ' +
        'request on the issue now, with the PR link and the mention, and say in it that the PR has ' +
        'merged — a post-merge review that finds something becomes a fix, not a block:',
      '',
      '   ```markdown',
      '   [@Sentinel](mention://agent/030cc8a2-06a9-415d-a419-e8d5d7c01969)',
      '   ```',
    ],
    annotationTitle: (pr) => `PR #${pr.number} merged owing a review`,
    annotation: (pr) =>
      `"${pr.title}" was labelled ${REVIEW_LABEL}, merged ${pr.mergedAt}, and carries no review ` +
      `record on the PR. Mirror the verdict onto the PR, or request the review now. ${pr.url}`,
  },
  intake: {
    recordNoun: 'an intake record',
    heading: (n) => `${n} merged ${n === 1 ? 'PR owes' : 'PRs owe'} an intake that was never recorded`,
    blurb:
      'Each of these was labelled `needs-forge-intake` by the gate, merged, and carries no intake ' +
      'record on the PR — nothing naming the sections the rule landed in. The obligation is ' +
      'intake, not review: it never held the merge up and it does not now.',
    remedy: [
      'What to do, in order:',
      '',
      '1. **If it was routed** and the confirmation is on the Multica issue but not on the PR, ' +
        'mirror it across, naming the sections it landed in rather than only that it landed:',
      '',
      '   ```bash',
      '   gh pr comment <n> --body "Forge intake: §2b, §6 — <link to the issue comment>"',
      '   ```',
      '',
      '2. **If it was not**, say on the issue what new class of assertion the PR added — not just ' +
        'the one its title leads with — and mention Forge now:',
      '',
      '   ```markdown',
      '   [@Forge](mention://agent/187124c3-23a7-47f6-bdee-e90bfc3fa216)',
      '   ```',
      '',
      '   If it only added a CASE to a rule that already exists, say that instead and mirror that ' +
        'sentence. The gate reads paths and cannot tell the two apart; you can.',
    ],
    annotationTitle: (pr) => `PR #${pr.number} merged owing an intake`,
    annotation: (pr) =>
      `"${pr.title}" was labelled ${INTAKE_LABEL}, merged ${pr.mergedAt}, and carries no intake ` +
      `record on the PR. Mirror the routing onto the PR, or route it now. ${pr.url}`,
  },
}

/** The `--last-green` shape a caller that never looked up a run history should pass. */
const NO_LOOKUP = {
  at: null,
  run: null,
  why: 'no run history was supplied to this invocation, so nothing dates the window',
}

function renderWindow(lastGreen) {
  if (Number.isFinite(lastGreen?.at)) {
    return [
      "_This run's **colour** is keyed on what is new since the sweep last went green — run " +
        `\`${lastGreen.run ?? 'unknown'}\`, ${new Date(lastGreen.at).toISOString()}. Everything ` +
        'unremediated is still printed below, whether or not it reddens the run._',
      '',
    ]
  }
  return [
    `_**Failing closed**: ${lastGreen?.why ?? NO_LOOKUP.why}. Every finding below is therefore ` +
      'treated as new and this run goes red on any of them. That is the safe direction — the ' +
      'alternative lets one throttled API call print a green morning over a real miss._',
    '',
  ]
}

/** One obligation's findings, with each entry marked new or standing. */
function renderObligation(result, freshNumbers) {
  const copy = OBLIGATION_COPY[result.obligation]
  const { unsatisfied, satisfied, outOfWindow, unreadable = [], ungated, since, label } = result
  const looked = unsatisfied.length + satisfied.length
  const lines = []

  // LEADS WITH WHAT IT LOOKED AT, never with a tick. A clean report from an
  // alarm that examined nothing is the shape this whole file distrusts.
  lines.push(
    `Examined **${looked}** merged ${looked === 1 ? 'PR' : 'PRs'} carrying \`${label}\` and ` +
      `merged since ${since}.`,
    '',
  )

  if (unsatisfied.length) {
    lines.push(`#### ${copy.heading(unsatisfied.length)}`, '', copy.blurb, '')
    for (const pr of unsatisfied) {
      lines.push(`- **#${pr.number}** — ${pr.title}`)
      lines.push(`  - merged ${pr.mergedAt} by \`${pr.author?.login ?? 'unknown'}\` — ${pr.url}`)
      lines.push(
        freshNumbers.has(pr.number)
          ? '  - **new since the last green run** — this is what reddens today'
          : '  - standing from before the last green run — still printed, not what reddens today',
      )
    }
    lines.push('', ...copy.remedy, '')
    lines.push(
      'Every PR above stays on this list until it carries a record. That is deliberate — an ' +
        "unremediated miss is not less true tomorrow. What decides the run's COLOUR is narrower: " +
        'the entries marked **new** above. A permanently-red alarm is a disabled alarm, and this ' +
        'one was red for six days before #636 merged into the silence it had become.',
      '',
    )
  }

  if (satisfied.length) {
    lines.push(
      `#### ${satisfied.length} in-window ${satisfied.length === 1 ? 'PR carries' : 'PRs carry'} ${copy.recordNoun}`,
      '',
    )
    for (const { pr, record } of satisfied) {
      lines.push(`- #${pr.number} — ${record.detail}, by \`${record.by}\``)
    }
    lines.push('')
  }

  // Counted and named, never silently dropped. See SWEPT_SINCE.
  if (outOfWindow.length) {
    lines.push(
      `#### ${outOfWindow.length} \`${label}\` ${outOfWindow.length === 1 ? 'PR is' : 'PRs are'} older than the cut-off — not judged`,
      '',
      `Merged before ${since}, when a PR that paid this obligation and one that did not were ` +
        'indistinguishable from GitHub. Skipped, not passed: ' +
        outOfWindow.map((p) => `#${p.number}`).join(', ') +
        '.',
      '',
    )
  }

  if (unreadable.length) {
    lines.push(
      `#### ${unreadable.length} ${unreadable.length === 1 ? 'row carries' : 'rows carry'} no readable merge time — not judged`,
      '',
      'Named rather than dropped: ' +
        unreadable.map((p) => `#${p.number ?? '?'}`).join(', ') +
        '. Unreachable under `--state merged`, so this appearing at all means the input changed shape.',
      '',
    )
  }

  lines.push(
    `_Also seen and not judged: ${ungated} merged ${ungated === 1 ? 'PR' : 'PRs'} with no ` +
      `\`${label}\` label. This alarm gates nothing — the merges it names have already ` +
      'shipped._',
    '',
  )

  return lines
}

/**
 * The whole summary.
 *
 * `extra.intake` is optional so a caller grading only the review half still
 * renders, and `extra.lastGreen` defaults to the failing-closed shape — which
 * is also the honest thing to print when nobody looked the window up.
 */
export function renderSummary(result, gap = null, extra = {}) {
  const lastGreen = extra.lastGreen ?? NO_LOOKUP
  const intake = extra.intake ?? null
  const fresh = new Set([
    ...newSince(result.unsatisfied, lastGreen).fresh.map((p) => p.number),
    ...(intake ? newSince(intake.unsatisfied, lastGreen).fresh.map((p) => p.number) : []),
  ])

  const lines = ['### Post-merge review sweep', '', ...renderWindow(lastGreen)]

  if (gap) {
    lines.push(
      '#### The sweep could not see its whole window',
      '',
      gap,
      '',
      'This is a failure, not a clean result: a truncated sweep and a sweep that found nothing ' +
        'look identical from the outside.',
      '',
    )
  }

  lines.push('#### The review obligation', '', ...renderObligation(result, fresh))
  if (intake) lines.push('#### The intake obligation', '', ...renderObligation(intake, fresh))

  return lines.join('\n')
}

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : process.argv[i + 1]
}

/** Read the `gh run list` output, and say which way it failed rather than assuming green. */
function readLastGreen(path) {
  if (!path) return NO_LOOKUP
  if (!existsSync(path)) {
    return {
      at: null,
      run: null,
      why: `the run-history file \`${path}\` was not written — the \`gh run list\` step produced nothing`,
    }
  }
  try {
    return lastGreenAt(JSON.parse(readFileSync(path, 'utf8')))
  } catch (err) {
    return { at: null, run: null, why: `the run-history file \`${path}\` is not JSON (${err.message})` }
  }
}

function main() {
  const path = argValue('--prs')
  if (!path || !existsSync(path)) {
    console.log(`[review-sweep] no such file: ${path}`)
    process.exitCode = 1
    return
  }

  let prs
  try {
    prs = JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    console.log(`[review-sweep] ${path} is not JSON: ${err.message}`)
    process.exitCode = 1
    return
  }

  const since = argValue('--since', SWEPT_SINCE)
  const intakeSince = argValue('--intake-since', INTAKE_SWEPT_SINCE)
  const limit = Number(argValue('--limit', '0'))
  const lastGreen = readLastGreen(argValue('--last-green'))

  const result = sweep(prs, since)
  const intake = intakeSweep(prs, intakeSince)
  const gap = limit ? windowGap(prs, limit, since) : null
  const summary = renderSummary(result, gap, { intake, lastGreen })

  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')
  }

  // ANNOTATE EVERY UNREMEDIATED ENTRY, not only the ones that redden the run.
  // The annotation is half the channel — without it a reader has to open the
  // job summary to find out which PR the run is even about — and an entry
  // nobody has dealt with is worth naming on the run whether or not it is what
  // turned the run red. `::warning` for those, `::error` for the new ones, so
  // the distinction survives into the annotation list.
  let fresh = 0
  for (const half of [result, intake]) {
    const copy = OBLIGATION_COPY[half.obligation]
    const split = newSince(half.unsatisfied, lastGreen)
    fresh += split.fresh.length
    for (const pr of half.unsatisfied) {
      const isFresh = split.fresh.includes(pr)
      console.log(
        `::${isFresh ? 'error' : 'warning'} title=${copy.annotationTitle(pr)}::${copy.annotation(pr)}` +
          (isFresh ? '' : ' Standing from before the last green run, so it is not what reddens this run.'),
      )
    }
  }
  if (gap) console.log(`::error title=The review sweep could not see its whole window::${gap}`)

  process.exitCode = fresh || gap ? 1 : 0
}

// Direct invocation only, so the guard test can import the classifier.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
