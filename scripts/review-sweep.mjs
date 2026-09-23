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
 * **And a THIRD, which has no label at all** (DREAMCRM-105): §3's first bullet,
 * the `DREAMCRM-<n>` key in the PR title. That one is upstream of the other
 * two — #659 merged owing an intake nobody could record, because no issue owned
 * the work and so there was nobody the label could be about. See
 * `KEY_SWEPT_SINCE` for the three ways it differs from the halves above and why
 * each difference is deliberate.
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
 * each.
 *
 * **BOTH INSTRUCTIONS NOW ARRIVE ON THE RUN, and the asymmetry that used to
 * sit here was this half's one real weakness** (closed by DREAMCRM-94). Each
 * is rendered by the review-gate summary itself — `renderReviewSection` and
 * `renderIntakeSection` in `scripts/review-gate.mjs` — so the obligation turns
 * up attached to the label, on the run, in front of the person about to merge,
 * printing the exact one-line command this file grades.
 *
 * Until that landed, `renderIntakeSection` told an author to mention Forge on
 * their issue and said nothing about leaving a record on the PR, so this half
 * graded a record the gate never asked anyone for — the #575/#579/#580 shape
 * pointed at the future instead of the past, an author doing everything the
 * summary asked and still being named here. It is also why
 * `INTAKE_SWEPT_SINCE` opens where it does rather than earlier, and why the
 * one entry that predates the fix (#644, merged 09:01Z on 2026-09-22, tracked
 * on DREAMCRM-93) reads as "nobody was told from here" rather than as
 * "somebody ignored the instruction". Findings dated after it do not get that
 * excuse.
 *
 * The care it needed, kept because it is now what holds the fix in place: the
 * gate's intake section already contains the words `§2`, so printing a literal
 * `Forge intake: §2b` example there would make the summary itself satisfy
 * `intakeRecord`, and if that summary ever gained a comment channel every
 * intake-labelled PR in the repo would read as routed. The guard in
 * `tests/guards/review-sweep.test.ts` catches exactly that. Two ways through
 * were open — a placeholder with no section digit, or matching the marker and
 * the section reference on ONE line — and the second is what shipped, because
 * the first is unsound on its own: `§2` in the intake section's own prose
 * completes a whole-body match the moment the marker appears anywhere, so a
 * placeholder would have worked only while nobody ever cited a section number
 * in that section again. `carriesIntake` carries the full argument.
 *
 * WHAT IT THEREFORE CANNOT SEE, stated rather than implied — a blind-spot list
 * that omits a known blind spot spends the credibility it exists for:
 *
 *   * A PR whose label step hiccuped. `review-gate.yml`'s labelling is
 *     `continue-on-error` on purpose, so a GitHub flake can leave a gated PR
 *     unlabelled and this sweep never looks at it.
 *   * A PR that merged during the same run of `review-gate.yml` that would
 *     have labelled it.
 *   * A GATE LABEL A PERSON TOOK OFF BY HAND. Both halves here read the label
 *     as it stands on the MERGED PR, which makes a mutable sticker the record
 *     of an obligation: anyone with write access can end the obligation by
 *     removing it, and this sweep never learns there was one.
 *     Until DREAMCRM-130 the gate did that BY ITSELF and without anyone
 *     choosing to. `review-gate.yml` re-derived both labels from the changed
 *     paths on every push and its `false` branch removed them unconditionally,
 *     so a HAND-ADDED label did not survive the author's next push — observed
 *     on #710, `labeled needs-sentinel-review` by `DreamCreateWeb` at
 *     11:51:35Z and `unlabeled` by `github-actions[bot]` at 12:02:43Z on the
 *     `198b981b` push. That was the sharp version of this hole, because the
 *     classifier cannot tell "the risk went away" from "I never saw the risk",
 *     so the sweep went blind in exactly the category the path rule had
 *     already missed: the judgement call a person made and the machine did
 *     not, which is the category this net is most needed for. The gate now
 *     removes a label only when GitHub's append-only issue-events timeline
 *     says this classifier applied it, and fails closed on anything it cannot
 *     attribute — `labelRemovalDecision` in `scripts/review-gate.mjs`, pinned
 *     by `tests/guards/review-gate.test.ts`.
 *     WHAT REMAINS, and remains on purpose: the deliberate act. A person
 *     removing the label is invisible from here, and it should stay that way
 *     until somebody can tell "removed because the classifier was wrong" from
 *     "removed to duck the question" — from this side the two are the same
 *     API call, and an alarm that guesses between them spends the credibility
 *     it is here to hold.
 *     AND ITS QUIETER TWIN, which is a consequence of the fix rather than a
 *     leftover of the defect (Sentinel, reviewing #716): A PERSON WHO AGREES
 *     WITH A BOT-APPLIED LABEL HAS NO WAY TO SAY SO. The rule above reads the
 *     last `labeled` event, and agreement leaves no event to read — the label
 *     is already on, so there is nothing to re-apply, and a later push that
 *     drops the risky file takes it off under the fix's own rule. The human
 *     judgement that the review is owed ANYWAY, for a reason the paths never
 *     carried, is the one position this machinery still cannot record. The
 *     answer is not a cleverer reading of the timeline: say it in a comment on
 *     the PR and in the mention, which are the channels a push cannot rewrite.
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
 *     narrowing the verdict patterns instead.
 *   * THE SAME EDGE ON THE INTAKE HALF, WHICH NO LONGER MERELY INHERITS IT
 *     (DREAMCRM-94). Since that PR the gate's intake section prints
 *     `Forge intake:` ON PURPOSE — it is where an author is told to leave the
 *     record — so "that summary happens not to say the words" stopped being
 *     the margin. TWO specific things keep it from reading as a record, and
 *     both are load-bearing rather than incidental:
 *       1. `carriesIntake` matches the marker and a section reference on ONE
 *          LINE. The intake section cites `§2` in its own prose and always
 *          will; under the old whole-body matching, printing the marker
 *          anywhere completed the match and the summary read as a record.
 *          Measured on #648's branch, canary red — not a worry, an observed
 *          failure.
 *       2. The printed command's placeholder carries NO SECTION DIGIT
 *          (`<sections>`). A literal `§2b, §6` in the template completes a
 *          record on one line and defeats (1).
 *     So the rule for anyone editing that text: never write the marker and a
 *     section number on the same rendered line. The comment-channel bullet
 *     above is still the outer wall; this is the inner one, and both are
 *     pinned in `tests/guards/review-sweep.test.ts`. If it ever does go blind,
 *     the fix is a scoped exclusion for that comment's marker, NOT a narrower
 *     record pattern.
 *   * A HARD-WRAPPED INTAKE RECORD — the one false alarm this file knowingly
 *     accepts, and it is named here because whoever meets it will be triaging
 *     a finding from this list rather than reading the classifier. A genuine
 *     record split across two source lines (`Forge intake — routed, landed
 *     in` / `§2b and §6`) does not count, because of the one-line rule above.
 *     Nothing in the documented form is affected: the gate prints the
 *     one-liner to paste, and all 528 comment and review bodies across the
 *     500 merged PRs this sweep reads classify identically under the old rule
 *     and the new one. **If a finding ever turns out to be this, widen to the
 *     enclosing PARAGRAPH — never back to the whole body**, which would
 *     re-open the edge above and the accidental-match class `carriesIntake`
 *     describes.
 *
 * Usage:
 *   node scripts/review-sweep.mjs --prs prs.json --limit 500
 *   node scripts/review-sweep.mjs --prs prs.json --limit 500 --last-green runs.json
 *   node scripts/review-sweep.mjs --prs prs.json --limit 500 --since 2026-09-20T00:00:00Z
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
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
 * **IT IS NOT NUDGED PAST WHATEVER MERGED WHILE THIS PR WAS IN REVIEW, and
 * that is a deliberate refusal rather than an oversight.** #644 merged at
 * 09:01Z on the day this landed, carrying the label and no record, and it is
 * in window. Moving the cut-off an hour to the right would have made the
 * first run green — which is precisely the axe-ceiling mistake `SWEPT_SINCE`
 * names, special-pleading for the one PR that happens to be red today. The
 * precedent runs the other way too: `SWEPT_SINCE` is 16:00 and #593, the PR
 * that introduced it, merged at 18:09 and graded ITSELF. An entry the gate
 * never prompted for is still a real unpaid obligation; it belongs on the
 * standing issue with an owner, not hidden behind a constant. See the
 * asymmetry note under "the conventions that make (2) work" for why such an
 * entry means "nobody was told from here" rather than "somebody ignored it".
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
 * THE THIRD OBLIGATION: the PR title carries its issue key (DREAMCRM-105).
 *
 * §3's first bullet — `DREAMCRM-<n>: <what changed>` — and it is the only link
 * from a merged commit back to somebody who can answer for it. Everything else
 * in this file is downstream of it: the review gate labels a diff, this sweep
 * reads merged PRs, the planning meeting reads the board. Work that never
 * reaches any of them is not lightly tracked, it is UNTRACKED, and it still
 * ships to production.
 *
 * **The rule's review half has a machine and its key half did not.** #659
 * merged carrying `needs-forge-intake` and nobody recorded the intake for a
 * reason the label could not fix: no issue owned it, so there was nobody the
 * label could be ABOUT. Then #674 merged unkeyed a few hours after §3's rule
 * landed — the third in one day (#636 01:24Z, #659 17:54Z, #674 22:19Z, all
 * from `claude/*`). A rule that has been broken three times on the day it was
 * written is not going to be fixed by asking harder.
 *
 * **IT IS ONE PREDICATE AND A THIRD BUCKET.** This file already fetches every
 * merged PR in the window WITH ITS TITLE and already owns the bucketing, so the
 * whole check is "does the title carry a key". That cheapness is the argument:
 * a separate workflow for this would be a second thing to keep alive.
 *
 * ---------------------------------------------------------------------------
 * HOW THIS HALF DIFFERS FROM THE OTHER TWO, because the differences are where a
 * copied-in obligation goes quietly wrong:
 *
 *   * **THERE IS NO LABEL.** The other two halves wait for `review-gate.yml` to
 *     mark a PR in scope; this one is in scope for EVERY merged PR, because the
 *     rule is universal and because a label is exactly what an untracked change
 *     has nobody to receive. So `ungated` is meaningless here and is not
 *     printed.
 *   * **THE RECORD IS IN THE SUBJECT ITSELF**, not in a comment somebody has to
 *     remember to leave. Which makes this the one half that is genuinely
 *     self-clearing: `gh pr edit <n> --title` on a merged PR fixes the finding
 *     at its source rather than mirroring a fact from somewhere else. It is
 *     also the one half that cannot be satisfied by forgetting to do the work
 *     and typing the record anyway.
 *   * **THE BULK OF WHAT IT SEES IS FINE**, where the other two examine a
 *     handful of labelled PRs. Hundreds of keyed merges sit in `satisfied` and
 *     `outOfWindow`, so those two lists are capped in the summary (see
 *     `MAX_ENUMERATED`). Findings are never capped.
 */
export const ISSUE_KEY = /\bDREAMCRM-\d+\b/i

/**
 * Where the key half opens, and it is the day the rule landed.
 *
 * §3's "work that never reaches the board at all" is dated **2026-09-22**
 * (DREAMCRM-96/100), and the three PRs that generated it all merged that day.
 * So this cut-off opens the half with exactly the queue the rule exists for —
 * which is the OPPOSITE choice from `INTAKE_SWEPT_SINCE`, and deliberately.
 *
 * That cut-off was pushed LATE because judging thirty labelled PRs would have
 * opened the intake half with thirty mostly-wrong findings, against a record
 * nobody had been keeping. Here the record is the PR title, it has always been
 * there, and every merge before 2026-09-22 already carries a key with three
 * exceptions on one day. There is no archaeology to do and nothing to be wrong
 * about: the queue is three, all three are genuinely unrepaired, and §3 names
 * them by number.
 *
 * Earlier than this would be the mistake. `#483`–`#485` (2026-09-09) and the
 * whole pre-program June tail are unkeyed because the convention did not exist
 * yet, and a sweep whose first run reports ninety findings against a rule that
 * post-dates them is the "note in a drawer" failure wearing an alarm's uniform.
 *
 * MUST NOT BE EARLIER THAN `SWEPT_SINCE` — `windowGap` grades the truncation
 * window against the earliest cut-off of the three, and it names `SWEPT_SINCE`.
 * `tests/guards/review-sweep.test.ts` pins the ordering.
 */
export const KEY_SWEPT_SINCE = '2026-09-22T00:00:00Z'

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
 *
 * The two are matched ON ONE LINE rather than anywhere in the body — see
 * `carriesIntake` for why that is a deliberate tightening and not the narrowing
 * this file refuses everywhere else.
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

/**
 * THE MARKER AND THE SECTION REFERENCE MUST MEET ON ONE LINE (DREAMCRM-94).
 *
 * This used to test both patterns over the whole body, independently. It is
 * the one place in this file where a pattern got NARROWER, so it owes the
 * argument — the standing rule two hundred lines up is that the answer to a
 * blinding hazard is a scoped exclusion, never a stingier pattern, because
 * narrowing takes back the false-alarm risk this instrument exists to refuse.
 *
 * Three reasons that rule does not cover this edit:
 *
 *   1. IT IS NOT A REACTION TO A LIVE BLINDING. Nothing has gone blind. This
 *      lands in the same change that teaches `renderIntakeSection` to PRINT
 *      the record — the ask and the grade arrive together, in one shape, on
 *      the run in front of the author. Narrowing is dangerous when the shape
 *      is graded but never asked for; that was the DREAMCRM-94 defect and it
 *      is what this PR removes.
 *   2. ONE LINE IS THE DOCUMENTED SHAPE, and the cost of the narrowing is
 *      MEASURED rather than argued. §2 writes the record as a single
 *      `gh pr comment --body` one-liner, and all three spellings this file
 *      already accepts — `§2b, §6`, `§§2, 2a`, `sections 2b and 6` — are
 *      one-liners. Run over the real population this sweep reads — all 500
 *      merged PRs from `gh pr list --json comments,reviews`, 528 comment and
 *      review bodies — **not one body changes classification** between the
 *      old whole-body rule and this one; the same 3 satisfy under both.
 *      (Measured independently twice: Sentinel reviewing #648, and again on
 *      the branch before this was written down.) That is the strongest answer
 *      available to the never-a-narrower-pattern rule, and it is the number
 *      the next person to reopen this will want — re-run it rather than
 *      trusting it if the record shape moves again.
 *   3. IT DROPS AN ACCIDENTAL-SATISFACTION CLASS. Whole-body matching counted
 *      a comment that mentioned a Forge intake in one paragraph and cited a
 *      section in another — a long issue-mirroring comment, for instance —
 *      as a record. Those are MISSED MISSES: the sweep read an unrecorded PR
 *      as routed. Removing them makes the alarm see more real misses, which is
 *      the direction this half was short of.
 *
 * WHAT IT REFUSES THAT THE OLD TEST ACCEPTED, stated rather than discovered:
 * a genuine record hard-wrapped across two source lines (`Forge intake —
 * routed, landed in` / `§2b and §6`) no longer counts, and that is a FALSE
 * ALARM, the bad direction. It is accepted because the gate now prints the
 * one-line command to paste, so the wrapped spelling is one nobody is told to
 * write; if one ever shows up in a finding, widen to the enclosing PARAGRAPH
 * rather than back to the whole body — a paragraph still refuses the class in
 * (3), and the whole body does not.
 *
 * Why it could not simply stay whole-body: the gate's intake section carries
 * `§2` in its own prose, so the moment it prints the marker the summary
 * satisfies a whole-body test — measured, not assumed. That is the hazard in
 * the blind-spot list above, and `tests/guards/review-sweep.test.ts` refuses
 * it in both directions.
 */
const carriesIntake = (body) =>
  (body ?? '').split('\n').some((line) => INTAKE_MARKER.test(line) && SECTION_REF.test(line))

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
function bucket(prs, { label, since, record, obligation, gate = (pr) => labelled(pr, label) }) {
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
    if (!gate(pr)) {
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

/** Does this merged PR's title carry the issue key §3 asks for? */
export function issueKeyRecord(pr) {
  const found = ISSUE_KEY.exec(pr.title ?? '')
  if (!found) return null
  return {
    kind: 'key',
    by: pr.author?.login ?? 'unknown',
    detail: `\`${found[0].toUpperCase()}\` in the title`,
  }
}

/**
 * The key half: merged PRs whose title carries no issue key (DREAMCRM-105).
 *
 * `gate: () => true` is the whole difference from the other two — there is no
 * label to wait for, because a change nobody opened an issue for is precisely
 * the change no label has anybody to be about.
 */
export function keySweep(prs, since = KEY_SWEPT_SINCE) {
  return bucket(prs, {
    label: null,
    since,
    record: issueKeyRecord,
    obligation: 'key',
    gate: () => true,
  })
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
  key: {
    recordNoun: 'an issue key',
    heading: (n) =>
      `${n} merged ${n === 1 ? 'PR carries' : 'PRs carry'} no issue key — nobody can be asked about ${n === 1 ? 'it' : 'them'}`,
    blurb:
      'Each of these merged with no `DREAMCRM-<n>` in its title, so there is no link from the ' +
      'commit back to an issue, an owner, or a planning meeting. The review gate still read the ' +
      'diff and the label still went on — but a label has nobody to be about when no issue owns ' +
      'the work, which is exactly how #659 merged owing an intake that reached no one.',
    remedy: [
      'What to do, in order — §3, "work that never reaches the board at all":',
      '',
      '1. **Open the issue after the fact**, carrying the PR link, with `--project` set so the ops ' +
        'sweep can see it. A note on a thread is not the repair; the issue is.',
      '',
      '2. **Then put the key in the title**, which is what clears this finding at its source — ' +
        'unlike the two obligations above, the record here IS the subject, so there is nothing to ' +
        'mirror:',
      '',
      '   ```bash',
      '   gh pr edit <n> --title "DREAMCRM-<n>: <the existing title>"',
      '   ```',
      '',
      '   Editing a merged PR\'s title is allowed and changes no commit. It is the only way the ' +
        'link exists in both directions.',
    ],
    annotationTitle: (pr) => `PR #${pr.number} merged with no issue key`,
    annotation: (pr) =>
      `"${pr.title}" merged ${pr.mergedAt} with no DREAMCRM-<n> in its title, so nothing links it ` +
      `to an issue, an owner or a planning meeting. Open the issue, then \`gh pr edit ${pr.number} ` +
      `--title\`. ${pr.url}`,
  },
}

/**
 * How many non-findings a list enumerates before it starts counting instead.
 *
 * "Counted and named, never silently dropped" is this file's discipline and it
 * stays true for FINDINGS, which are never capped. It cannot stay true for the
 * key half's other two lists: every keyed merge in the window lands in
 * `satisfied` and every merge before the cut-off lands in `outOfWindow`, so a
 * faithful enumeration is three hundred `#nnn`s in a job summary somebody has to
 * scroll past to reach the three entries that matter. The count is still exact
 * and the cap is announced, which is the part that was ever load-bearing.
 */
const MAX_ENUMERATED = 20

const enumerate = (numbers) => {
  const shown = numbers.slice(0, MAX_ENUMERATED)
  const rest = numbers.length - shown.length
  return shown.join(', ') + (rest > 0 ? `, and ${rest} more` : '')
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
    label
      ? `Examined **${looked}** merged ${looked === 1 ? 'PR' : 'PRs'} carrying \`${label}\` and ` +
          `merged since ${since}.`
      : // The key half has no label: every merged PR in the window is in scope,
        // because a change nobody opened an issue for is precisely the change
        // no label has anybody to be about.
        `Examined **${looked}** merged ${looked === 1 ? 'PR' : 'PRs'} merged since ${since} — ` +
          'every one of them, since this obligation has no label to wait for.',
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
    for (const { pr, record } of satisfied.slice(0, MAX_ENUMERATED)) {
      lines.push(`- #${pr.number} — ${record.detail}, by \`${record.by}\``)
    }
    if (satisfied.length > MAX_ENUMERATED) {
      lines.push(`- _…and ${satisfied.length - MAX_ENUMERATED} more, all carrying ${copy.recordNoun}._`)
    }
    lines.push('')
  }

  // Counted and named, never silently dropped. See SWEPT_SINCE. The COUNT is
  // always exact; the enumeration caps at MAX_ENUMERATED and says so, because
  // the key half puts every pre-cut-off merge in this bucket.
  if (outOfWindow.length) {
    lines.push(
      `#### ${outOfWindow.length} ${label ? `\`${label}\` ` : ''}${outOfWindow.length === 1 ? 'PR is' : 'PRs are'} older than the cut-off — not judged`,
      '',
      `Merged before ${since}, when a PR that paid this obligation and one that did not were ` +
        'indistinguishable from GitHub. Skipped, not passed: ' +
        enumerate(outOfWindow.map((p) => `#${p.number}`)) +
        '.',
      '',
    )
  }

  if (unreadable.length) {
    lines.push(
      `#### ${unreadable.length} ${unreadable.length === 1 ? 'row carries' : 'rows carry'} no readable merge time — not judged`,
      '',
      'Named rather than dropped: ' +
        enumerate(unreadable.map((p) => `#${p.number ?? '?'}`)) +
        '. Unreachable under `--state merged`, so this appearing at all means the input changed shape.',
      '',
    )
  }

  // Only a LABELLED obligation has an ungated population. Printing "0 merged
  // PRs with no `null` label" for the key half would be a sentence that is
  // true, meaningless and wrong-looking all at once.
  if (label) {
    lines.push(
      `_Also seen and not judged: ${ungated} merged ${ungated === 1 ? 'PR' : 'PRs'} with no ` +
        `\`${label}\` label. This alarm gates nothing — the merges it names have already ` +
        'shipped._',
      '',
    )
  } else {
    lines.push(
      '_This alarm gates nothing — the merges it names have already shipped. What it buys is that ' +
        'the NEXT one is visible the following morning instead of at whichever planning meeting ' +
        'happens to open._',
      '',
    )
  }

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
  const key = extra.key ?? null
  const fresh = new Set(
    [result, intake, key]
      .filter(Boolean)
      .flatMap((half) => newSince(half.unsatisfied, lastGreen).fresh.map((p) => p.number)),
  )

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
  if (key) lines.push('#### The issue-key obligation', '', ...renderObligation(key, fresh))

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

/**
 * DOES THIS RUN WAKE FORGE? (DREAMCRM-99 deliverable 3.)
 *
 * THE GAP, and it is a pattern rather than an incident. The gate applies
 * `needs-forge-intake` correctly and this sweep grades it correctly. What was
 * never owned by anything that RUNS is the hop after the label: somebody has to
 * notice the red and route the rule into the rulebook. #534's shape cost three
 * days. #658 and #659 both merged with the label unsatisfied and sat until a
 * planning meeting happened to open — the only reason the wait was minutes
 * rather than days. §2 records a third instance. Asking authors to remember
 * harder has now failed three times; this is wiring, not diligence.
 *
 * GITHUB CANNOT DISPATCH ANYBODY — §3 says so in as many words about the verdict
 * mention, and it is just as true here. A red run is a notification to one
 * inbox. So the run POSTs to a Multica autopilot webhook, and the autopilot
 * opens an issue assigned to Forge. That is the same shape §3 gives a verdict:
 * the record lives on GitHub where the sweep can see it, and the WAKE rides
 * Multica, where an agent's next run actually starts. Two artefacts, two jobs.
 *
 * ------------------------------------------------------------------------
 * IT IS SCOPED HARDER THAN THE EXIT STATUS, AND THE ASYMMETRY IS THE POINT.
 *
 * A wake enqueues a PAID RUN. §3 scopes the author mention to the verdict
 * itself for exactly that reason — right for "your PR is clear to merge", wrong
 * for a discussion reply. So:
 *
 *   1. **The INTAKE half only.** The review half already has an owner: §2a's
 *      standing issue, DREAMCRM-93, assigned to Sentinel. Waking a second agent
 *      for it would be two owners for one queue.
 *   2. **Fresh entries only — measured against the PREVIOUS RUN, not against
 *      the last green one.** This is the correction from Sentinel's review of
 *      #671 and it is the difference between waking Forge once and waking him
 *      every morning forever, so it is worth the paragraph.
 *
 *      The exit status is keyed on `lastGreen` for a good reason: it is what
 *      makes a clean morning a positive claim. But **a red run does not advance
 *      the last-green instant** — the docblock above says so in as many words —
 *      and an unrouted intake is exactly what keeps the run red. So an entry
 *      measured against `lastGreen` is fresh on the day it lands and *still
 *      fresh* every morning after, until somebody routes it. Simulated over
 *      five consecutive mornings with one unrouted PR and nothing clearing it,
 *      that is five paid Forge runs for one finding — precisely the "paid
 *      version of an alarm nobody reads" this narrowing exists to prevent.
 *
 *      So the wake gets **its own anchor**: the `createdAt` of the most recent
 *      previous run **whose `Wake Forge` step concluded `success`**. Two
 *      anchors for two different questions — "is anything outstanding" (green)
 *      and "is anything NEW since Forge was last told" (this one) — which is
 *      the same asymmetry narrowing 3 argues for, applied to the clock instead
 *      of the failure mode.
 *
 *      WHY THE STEP AND NOT SIMPLY THE PREVIOUS RUN, which is what the first
 *      version of this narrowing used (Sentinel, second pass on #671). A run
 *      that SUPPRESSED a due wake — narrowing 3 below — is still a run, so it
 *      would advance a plain previous-run anchor and the entry it declined to
 *      wake for would read as standing forever after. One throttled
 *      `gh run list`, or one failed POST, on the single morning an entry is
 *      new, and Forge is never dispatched for it at all. Back to a red run in
 *      one inbox, which is the state #658 and #659 sat in.
 *
 *      The `Wake Forge` step therefore FAILS when a wake was due and did not
 *      happen — suppressed, unconfigured, or rejected by the endpoint — and
 *      succeeds both when it woke him and when there was nothing to wake him
 *      about. Both of those are "Forge is up to date as of this run", which is
 *      exactly what the anchor has to mean. Failing that step costs the job
 *      nothing it was not already paying: a suppressed wake only happens when
 *      there are unsatisfied entries, and those redden the run anyway.
 *
 *      It is the same shape `didScan` uses in `scripts/error-scan.mjs` — ask
 *      the run's own STEP rather than inferring from its conclusion — and it
 *      arrived there first, for the same reason.
 *   3. **NOT AT ALL WHEN THE ANCHOR LOOKUP FAILED**, which is the one place
 *      this deliberately diverges from the exit status. The run still fails
 *      CLOSED and goes red — that is free. The wake fails QUIET, because with
 *      no anchor every entry reads as fresh and a throttled API call would
 *      dispatch Forge over a queue he has already seen. The costs are not
 *      symmetric: a spurious wake costs a paid run and, repeated, the
 *      credibility of the wire; a missed wake costs ONE DAY, because the
 *      suppressing run does not advance the anchor (see above) and the next
 *      run's answer is the one it would have given today.
 *      A SUPPRESSED WAKE IS ANNOUNCED — `::error` plus a line in the summary —
 *      because a wake that silently never fires is this file's own failure mode
 *      wearing a different hat.
 *
 *   4. **A HAND-DISPATCHED PING ON `main` WOULD MOVE THE ANCHOR.** The lookup
 *      is `--branch main` with no `--status`, so a ping run on the default
 *      branch becomes the next run's anchor and could mark a genuinely new
 *      entry as standing. Run the ping from a feature branch; the input's own
 *      description says so. Named here rather than guarded, because the whole
 *      point of a ping is that a person runs it by hand and no check stands
 *      between them and that choice.
 *
 * `--ping` is the fourth reason it can fire, and it is not test scaffolding: it
 * is the thing that notices the wire has stopped. Nothing else here can tell a
 * healthy wake from an endpoint whose token was rotated, because the healthy
 * state is silence. Dispatch the workflow with it by hand after touching the
 * secret or the autopilot.
 *
 * THE PAYLOAD DOES NOT REACH FORGE, and that is measured rather than assumed —
 * the first ping through the live wire (run `35776171759`, HTTP 200) produced
 * an autopilot run whose `trigger_payload` is `null`. So the POST body is a
 * DEBUGGING ARTEFACT: it says in the run log why the wake fired and about what.
 * What Forge actually receives is the issue the autopilot opens, whose prompt
 * is the autopilot's own description — which is therefore written to stand
 * alone and send him to this sweep's latest run for the entries. Do not move
 * information a reader needs into the payload; it lands nowhere.
 */
/**
 * @param {{
 *   intake?: { unsatisfied?: any[] } | null,
 *   wakeAnchor?: { at: number | null, run: number | null, why: string | null } | null,
 *   lastGreen?: { at: number | null, run: number | null, why: string | null } | null,
 *   ping?: boolean,
 *   bootstrapSince?: string,
 * }} args
 */
export function wakeDecision({ intake, wakeAnchor, lastGreen = null, ping = false, bootstrapSince = INTAKE_SWEPT_SINCE }) {
  if (ping) {
    return {
      wake: true,
      reason: 'ping',
      prs: [],
      why: 'a hand-dispatched ping: this proves the wire from the run to Forge is live, which is ' +
        'otherwise indistinguishable from a quiet week.',
      suppressed: null,
    }
  }

  const unsatisfied = intake?.unsatisfied ?? []
  if (!unsatisfied.length) {
    return { wake: false, reason: 'clean', prs: [], why: 'the intake half is clear.', suppressed: null }
  }

  // THE LAST GREEN RUN IS A LOWER BOUND ON THE WAKE ANCHOR, and checking it
  // FIRST is what stops a failed anchor lookup suppressing — and so reddening
  // the `Wake Forge` step — on a morning when nothing was owed anyway.
  //
  // The reasoning, because it is not obvious: a GREEN run had nothing
  // unsatisfied, so it owed no wake, so its `Wake Forge` step concluded
  // `success`, so it is itself a candidate for the anchor. The anchor is
  // therefore never OLDER than the last green run. An entry older than the
  // last green run is consequently older than the anchor too — standing, no
  // wake owed — and that is knowable without the anchor lookup succeeding.
  const candidates = Number.isFinite(lastGreen?.at) ? newSince(unsatisfied, lastGreen).fresh : unsatisfied
  if (!candidates.length) {
    return {
      wake: false,
      reason: 'standing-only',
      prs: [],
      why:
        `${unsatisfied.length} unrouted intake(s) merged before this sweep last went green, so ` +
        'they cannot be newer than the last run that told Forge anything either.',
      suppressed: null,
    }
  }

  // THE BOOTSTRAP, CLOSED DELIBERATELY (DREAMCRM-115).
  //
  // THE DEADLOCK, because it is circular and therefore easy to read past. A
  // run becomes the anchor by concluding its `Wake Forge` step `success`. On a
  // morning with unsatisfied entries and no anchor, the step SUPPRESSES and
  // exits non-zero — so the run does not become the anchor, and tomorrow is
  // identical. The only escape is the intake queue going clean, which is the
  // thing the wake exists to cause. **The wake cannot fire until the queue is
  // clean, and the queue gets cleaned because the wake fired.**
  //
  // That is not theory. On 2026-09-23 this sweep held FOUR unsatisfied entries
  // (#673, #677, #694, #697), no run in the history had a `Wake Forge` step at
  // all — the step merged with #671 at 22:06Z, after the newest run — and
  // Forge would never have been woken for any of them. The colour half had the
  // same shape and escaped it by accident: a hand-dispatched ping on `main`
  // (run `35776664807`, 19:53Z) happened to be green and became the last-green
  // anchor. An instrument that needs an accident to start working is one that
  // will need another one.
  //
  // THE CLOSURE, and why it is not "assume green". The `undated` suppression
  // below is right when the lookup FAILED: with no anchor every entry reads as
  // fresh, and one throttled API call would dispatch Forge over a queue he has
  // already seen. It is wrong when the lookup SUCCEEDED and honestly found
  // nothing, because that state has a knowable date — the obligation's own
  // cut-off. No wake can be owed for a PR that merged before the label this
  // half grades was being read, which is exactly what `INTAKE_SWEPT_SINCE`
  // already says, argued in its own docblock.
  //
  // ITS BLAST RADIUS IS BOUNDED BY THE CHECK ABOVE, which is what makes
  // reusing that constant safe rather than merely convenient. The
  // `standing-only` branch has already dropped every entry older than the last
  // GREEN run, so a bootstrap fallback arriving later in life — GitHub ages
  // run history out after 90 days — can only ever wake for entries inside the
  // last-green window. It cannot re-wake for a year of them.
  //
  // WHAT IT IS NOT: a way to be quiet. The bootstrap wake DELIVERS, and the
  // run is red either way.
  const bootstrapped =
    !Number.isFinite(wakeAnchor?.at) && wakeAnchor?.bootstrap === true
      ? { at: Date.parse(bootstrapSince), run: null, why: null }
      : null

  const anchor = Number.isFinite(wakeAnchor?.at) ? wakeAnchor : bootstrapped

  if (!Number.isFinite(anchor?.at)) {
    return {
      wake: false,
      reason: 'undated',
      prs: [],
      why: 'the intake half has findings, but nothing dates what Forge has already been shown.',
      suppressed:
        `${candidates.length} unrouted intake(s) are in the summary and Forge was NOT woken: ` +
        `${wakeAnchor?.why ?? 'no run history was supplied'}. Without the instant he was last ` +
        'told, every entry reads as new, and waking him over a queue he has already seen is how ' +
        'this wire loses the credibility it needs. THIS RUN DOES NOT ADVANCE THE ANCHOR, so the ' +
        'entry is still new tomorrow and the next working lookup wakes him. The run is red and ' +
        'names them meanwhile.',
    }
  }

  const fresh = newSince(candidates, anchor).fresh
  if (!fresh.length) {
    return {
      wake: false,
      reason: 'standing-only',
      prs: [],
      why:
        `${candidates.length} unrouted intake(s) merged before the last run that told Forge ` +
        'anything, which already woke him for them. Waking him again every morning is the paid ' +
        'version of an alarm nobody reads.',
      suppressed: null,
    }
  }

  return {
    wake: true,
    reason: bootstrapped ? 'intake-bootstrap' : 'intake',
    prs: fresh.map((p) => ({ number: p.number, title: p.title, url: p.url, mergedAt: p.mergedAt })),
    why: bootstrapped
      ? `${fresh.length} PR(s) merged owing an intake since \`INTAKE_SWEPT_SINCE\` (${bootstrapSince}). ` +
        'This is the FIRST wake: no previous run of this sweep is recorded as having told Forge ' +
        'anything, and the lookup that established that came back complete. Measuring against the ' +
        "obligation's own cut-off is exactly true — no wake can be owed for a PR that merged " +
        'before the label was being read — and it is what stops this wire needing a clean queue ' +
        'in order to ever fire. This run DOES advance the anchor, so tomorrow measures against it.'
      : `${fresh.length} PR(s) merged owing an intake since the last run that told Forge anything.`,
    suppressed: null,
  }
}

/**
 * The step whose conclusion answers "was Forge up to date as of that run".
 *
 * Exported and pinned by `tests/guards/review-sweep.test.ts` against the
 * workflow file, because the wake's whole anchor hangs off this string matching
 * a step that exists. Rename the step without renaming this and every run reads
 * as "Forge was not told" — which fails SAFE (he gets woken again) but would go
 * on doing so quietly, so the guard refuses the drift rather than relying on
 * the direction.
 */
export const WAKE_STEP_NAME = 'Wake Forge'

/**
 * WAS FORGE UP TO DATE AS OF THIS RUN?
 *
 * Fed a `gh api repos/{repo}/actions/runs/{id}/jobs` payload. True when a step
 * named `WAKE_STEP_NAME` concluded `success` — which covers both "it woke him"
 * and "there was nothing to wake him about", because those are the same fact
 * from the anchor's point of view.
 *
 * It is FALSE for the case the anchor exists to survive: a run that had a due
 * wake and did not deliver it. The `Wake Forge` step fails in exactly those
 * states — suppressed on an undated window, unconfigured secret, rejected POST
 * — so the step's own conclusion is the signal, and no run that failed to tell
 * him can claim he was told.
 *
 * Same shape as `didScan` in `scripts/error-scan.mjs`: ask the run's STEP
 * rather than infer from its conclusion. Unreadable input returns false, which
 * widens the next wake rather than skipping one.
 */
export function wokeForge(jobsPayload) {
  const jobs = Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : []
  for (const job of jobs) {
    for (const step of Array.isArray(job?.steps) ? job.steps : []) {
      if (step?.name === WAKE_STEP_NAME && step?.conclusion === 'success') return true
    }
  }
  return false
}

/**
 * WHEN WAS FORGE LAST UP TO DATE?
 *
 * The wake's anchor, and deliberately NOT `lastGreenAt`. Fed the rows the
 * workflow selected — runs it has already established delivered or owed no
 * wake, via `wokeForge` against each candidate's jobs payload — plus this run's
 * own id so it can exclude itself: `gh run list` returns the in-progress run
 * that is asking.
 *
 * WHY NOT REUSE `lastGreenAt`. A red run does not advance the last-green
 * instant, and an unrouted intake is what keeps this sweep red — so an entry
 * measured against green is fresh every morning until somebody routes it, and
 * every one of those mornings is a paid Forge run. Measured against the last
 * run that actually told him, it is fresh exactly once.
 *
 * WHY NOT SIMPLY THE PREVIOUS RUN, which is what the first version used: a run
 * that SUPPRESSED a due wake is still a run, so it would advance a plain
 * anchor and the entry would read as standing from then on — never woken at
 * all. The step-level filter is what makes "one missed wake costs one day"
 * true rather than aspirational.
 *
 * Fails with a `why` rather than a guess, because `wakeDecision` suppresses the
 * wake on a failed lookup and announces the suppression.
 *
 * @param {unknown} runs
 * @param {string | number | null} [selfRunId]
 */
export function previousRunAt(runs, selfRunId = null) {
  if (!Array.isArray(runs)) {
    return {
      at: null,
      run: null,
      empty: false,
      why: 'the run history was not a JSON array, so the lookup returned nothing usable',
    }
  }
  const self = selfRunId == null ? null : String(selfRunId)
  const others = runs
    .filter((r) => r && (self == null || String(r.databaseId ?? '') !== self))
    .map((r) => ({ at: Date.parse(r.createdAt ?? ''), id: r.databaseId ?? null }))
    .filter((r) => Number.isFinite(r.at))

  if (!others.length) {
    return {
      at: null,
      run: null,
      // EMPTY, which is a neutral FACT and deliberately not a verdict. An
      // empty history means "no candidate this run examined woke Forge" and
      // nothing more; whether that is the BOOTSTRAP or a lookup that came back
      // short is a question this function cannot answer, because it never saw
      // the lookup. `readPreviousRun` promotes `empty` to `bootstrap` only
      // after the shell's own claim that the search was complete, so a caller
      // holding a bare `previousRunAt` result can never bootstrap off it.
      empty: true,
      why:
        'no previous run of this sweep, other than this one, is recorded as having told Forge ' +
        'anything — so there is nothing to measure "new since he was last told" against',
    }
  }
  const newest = others.reduce((a, b) => (b.at > a.at ? b : a))
  return { at: newest.at, run: newest.id, empty: false, why: null }
}

/**
 * Read the unfiltered `gh run list` output for the WAKE's anchor.
 *
 * Sibling of `readLastGreen` and deliberately not folded into it: they answer
 * different questions off different queries, and the one thing that must not
 * happen is somebody noticing they look alike and passing the same file to
 * both. That would silently restore the every-morning wake `previousRunAt`
 * exists to stop.
 */
function readPreviousRun(path, searchPath = null) {
  if (!path) {
    return { at: null, run: null, why: 'no previous-run history was supplied to this invocation' }
  }
  if (!existsSync(path)) {
    return {
      at: null,
      run: null,
      why: `the previous-run file \`${path}\` was not written — the \`gh run list\` step produced nothing`,
    }
  }
  let anchor
  try {
    anchor = previousRunAt(JSON.parse(readFileSync(path, 'utf8')), process.env.GITHUB_RUN_ID ?? null)
  } catch (err) {
    return { at: null, run: null, why: `the previous-run file \`${path}\` is not JSON (${err.message})` }
  }
  if (!anchor.empty) return anchor

  // AN EMPTY `last-run.json` HAS THREE CAUSES AND ONLY ONE OF THEM IS THE
  // BOOTSTRAP. The workflow's loop writes nothing when no candidate woke — but
  // it also writes nothing when `gh run list` failed, and it SKIPS a candidate
  // whose `gh api …/jobs` lookup failed. A skipped candidate might have been
  // the anchor, so "we looked at all of them and none woke" is a claim the
  // shell has to make; this file may not infer it from an empty file.
  //
  // The claim arrives as `wake-anchor-search.json`. Anything less than a
  // COMPLETE search demotes back to the undated suppression, which is what the
  // whole of reason 3 above argues for.
  const search = readJsonFile(searchPath)
  if (!search.value || search.value.complete !== true) {
    return {
      at: null,
      run: null,
      why:
        'no previous run is recorded as having told Forge anything, and this run could not ' +
        `establish that it looked at all of them — ${search.why ?? 'the anchor search reported an incomplete lookup'}. ` +
        'An incomplete search cannot be told apart from a bootstrap, so it is treated as the lookup failing.',
    }
  }
  return { ...anchor, bootstrap: true, searched: search.value.searched ?? null }
}

/**
 * `woke` — exit 0 if the run whose jobs payload this is left Forge up to date.
 *
 * A separate command rather than a flag, because the workflow has to ask it
 * once per candidate inside a loop, before it knows which run to anchor on.
 * Sibling of `scripts/error-scan.mjs scanned`, same shape, same reason.
 */
function cmdWoke() {
  const jobs = readJsonFile(argValue('--jobs'))
  if (!jobs.value) {
    console.log(`[review-sweep] ${jobs.why} — treating this run as one that did not tell Forge anything`)
    process.exitCode = 2
    return
  }
  const woke = wokeForge(jobs.value)
  console.log(`[review-sweep] ${woke ? 'up to date' : 'NOT up to date'} (looking for step "${WAKE_STEP_NAME}")`)
  process.exitCode = woke ? 0 : 1
}

/** Read a JSON file, saying which way it failed rather than pretending it was empty. */
function readJsonFile(path) {
  if (!path || !existsSync(path)) return { value: null, why: `the file \`${path}\` was not written` }
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), why: null }
  } catch (err) {
    return { value: null, why: `the file \`${path}\` is not JSON (${err.message})` }
  }
}

function main() {
  if (process.argv[2] === 'woke') return cmdWoke()

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
  const keySince = argValue('--key-since', KEY_SWEPT_SINCE)
  const limit = Number(argValue('--limit', '0'))
  const lastGreen = readLastGreen(argValue('--last-green'))

  const result = sweep(prs, since)
  const intake = intakeSweep(prs, intakeSince)
  const key = keySweep(prs, keySince)
  const gap = limit ? windowGap(prs, limit, since) : null
  const summary = renderSummary(result, gap, { intake, key, lastGreen })

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
  for (const half of [result, intake, key]) {
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

  // DOES THIS RUN WAKE FORGE? See `wakeDecision` for why it is scoped harder
  // than the exit status. The decision is written to a file and to
  // `GITHUB_OUTPUT`; the workflow owns the POST, so this file stays a pure
  // comparator the guard test can drive with fixtures, offline.
  // The wake's own anchor — the previous RUN, not the last GREEN one. See
  // `previousRunAt` for why these are two questions and not one.
  const wakeAnchor = readPreviousRun(argValue('--last-run'), argValue('--anchor-search'))

  const wake = wakeDecision({ intake, wakeAnchor, lastGreen, ping: process.argv.includes('--ping') })
  const wakePath = argValue('--wake-out')
  if (wakePath) {
    writeFileSync(
      wakePath,
      JSON.stringify(
        {
          ...wake,
          repository: process.env.GITHUB_REPOSITORY ?? null,
          run: process.env.GITHUB_RUN_ID ?? null,
          runUrl:
            process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
              ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
              : null,
        },
        null,
        2,
      ),
    )
  }
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `wake=${wake.wake ? 'true' : 'false'}\nwake-reason=${wake.reason}\n`)
  }
  console.log(`[review-sweep] wake=${wake.wake} (${wake.reason}) — ${wake.why}`)
  if (wake.suppressed) {
    console.log(`::error title=Forge was NOT woken for an unrouted intake::${wake.suppressed}`)
  }

  process.exitCode = fresh || gap ? 1 : 0
}

// Direct invocation only, so the guard test can import the classifier.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
