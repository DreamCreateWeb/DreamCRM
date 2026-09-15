// NO SHEBANG, DELIBERATELY — the same lesson `scripts/review-gate.mjs` and
// `scripts/rulebook-drift.mjs` both carry. The workflow runs `node
// scripts/review-sweep.mjs`, so it was never load-bearing, and git hands this
// file to a Windows working tree with CRLF endings: vitest's SSR transform
// leaves the `\r` behind when it strips `#!…` and every test importing this
// module dies with a parse error at column 1.
/**
 * DID A PR THAT OWED SENTINEL A REVIEW MERGE WITHOUT ONE?
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
 * decision, re-argued from the other end, and it is still no.
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
 *   1. `SWEPT_SINCE`. Nothing merged before the record-keeping convention
 *      existed is judged by it. The skipped PRs are COUNTED AND NAMED in the
 *      summary rather than silently dropped — an alarm quietly narrowing its
 *      own window is the failure mode it exists to catch, aimed at itself.
 *   2. Generous satisfaction. Any plausible review record counts: a GitHub
 *      review carrying a verdict, or a PR comment carrying a verdict word,
 *      however it is phrased. Being loose here buys false NEGATIVES, which is
 *      the tolerable direction — a missed miss costs the manual sweep we
 *      already had; a false alarm costs the instrument.
 *   3. The label is the trigger, NOT a re-classification of the diff against
 *      today's `GATE_RULES`. That list has been widened four times in twelve
 *      days (#553, #559, #565, #569), and re-running it over merged history
 *      would retro-flag PRs that were correctly clean when they merged.
 *
 * The convention that makes (2) work: **whoever merges a gated PR records the
 * verdict on the PR before merging.** One `gh pr comment`. It is prompted by
 * the review-gate summary itself (`scripts/review-gate.mjs`), so the obligation
 * arrives with the review request rather than living only in a document.
 *
 * WHAT IT THEREFORE CANNOT SEE, stated rather than implied — a blind-spot list
 * that omits a known blind spot spends the credibility it exists for:
 *
 *   * A PR whose label step hiccuped. `review-gate.yml`'s labelling is
 *     `continue-on-error` on purpose, so a GitHub flake can leave a gated PR
 *     unlabelled and this sweep never looks at it.
 *   * A PR that merged during the same run of `review-gate.yml` that would
 *     have labelled it.
 *   * A verdict comment somebody typed without a review behind it.
 *   * The `needs-forge-intake` obligation, deliberately: that is an intake, it
 *     holds up nothing, and folding it in here would double this alarm's
 *     volume with findings of a different kind. Its own miss shape is worth an
 *     instrument; it is not worth blurring this one.
 *
 * Usage:
 *   node scripts/review-sweep.mjs --prs prs.json --limit 100
 *   node scripts/review-sweep.mjs --prs prs.json --limit 100 --since 2026-09-20T00:00:00Z
 */
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * THE CUT-OFF, and it is the single most important line in this file.
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

/** The label `review-gate.yml` puts on a PR that owes Sentinel a review. */
export const REVIEW_LABEL = 'needs-sentinel-review'

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

const gated = (pr) => (pr.labels ?? []).some((l) => l.name === REVIEW_LABEL)

/**
 * Sort every merged PR into one of four buckets.
 *
 * `outOfWindow` and `ungated` are not findings and never become findings. They
 * are reported as COUNTS so that a run which looked at nothing cannot be
 * mistaken for a run that found nothing — the `Graded N/8` lesson from
 * `scripts/rulebook-drift.mjs`, which is the same lesson `e2e/axe.ts` learned
 * about a headroom table that prints nothing.
 */
export function sweep(prs, since = SWEPT_SINCE) {
  const cutoff = Date.parse(since)
  const unsatisfied = []
  const satisfied = []
  const outOfWindow = []
  let ungated = 0

  for (const pr of prs) {
    const mergedAt = Date.parse(pr.mergedAt ?? '')
    if (!Number.isFinite(mergedAt)) continue
    if (!gated(pr)) {
      ungated++
      continue
    }
    if (mergedAt < cutoff) {
      outOfWindow.push(pr)
      continue
    }
    const record = reviewRecord(pr)
    if (record) satisfied.push({ pr, record })
    else unsatisfied.push(pr)
  }

  return { unsatisfied, satisfied, outOfWindow, ungated, since }
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

export function renderSummary(result, gap = null) {
  const { unsatisfied, satisfied, outOfWindow, ungated, since } = result
  const looked = unsatisfied.length + satisfied.length
  const lines = ['### Post-merge review sweep', '']

  // LEADS WITH WHAT IT LOOKED AT, never with a tick. A clean report from an
  // alarm that examined nothing is the shape this whole file distrusts.
  lines.push(
    `Examined **${looked}** merged ${looked === 1 ? 'PR' : 'PRs'} carrying \`${REVIEW_LABEL}\` and ` +
      `merged since ${since}.`,
    '',
  )

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

  if (unsatisfied.length) {
    lines.push(
      `#### ${unsatisfied.length} merged ${unsatisfied.length === 1 ? 'PR owes' : 'PRs owe'} a review that was never recorded`,
      '',
      'Each of these was labelled `needs-sentinel-review` by the gate, merged, and carries no ' +
        'review record on the PR at all — no GitHub review, no comment with a verdict in it.',
      '',
    )
    for (const pr of unsatisfied) {
      lines.push(`- **#${pr.number}** — ${pr.title}`)
      lines.push(`  - merged ${pr.mergedAt} by \`${pr.author?.login ?? 'unknown'}\` — ${pr.url}`)
    }
    lines.push(
      '',
      'What to do, in order:',
      '',
      '1. **If the review happened** and the verdict is on the Multica issue, mirror it onto the ' +
        'PR so the record exists where the sweep can see it:',
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
      '',
      'This run stays red until every PR above carries a record. That is deliberate — an ' +
        'unremediated miss is not less true tomorrow.',
      '',
    )
  }

  if (satisfied.length) {
    lines.push(`#### ${satisfied.length} in-window ${satisfied.length === 1 ? 'PR carries' : 'PRs carry'} a record`, '')
    for (const { pr, record } of satisfied) {
      lines.push(`- #${pr.number} — ${record.detail}, by \`${record.by}\``)
    }
    lines.push('')
  }

  // Counted and named, never silently dropped. See SWEPT_SINCE.
  if (outOfWindow.length) {
    lines.push(
      `#### ${outOfWindow.length} gated ${outOfWindow.length === 1 ? 'PR is' : 'PRs are'} older than the cut-off — not judged`,
      '',
      `Merged before ${since}, when a reviewed PR and an unreviewed one were indistinguishable ` +
        'from GitHub. Skipped, not passed: ' +
        outOfWindow.map((p) => `#${p.number}`).join(', ') + '.',
      '',
    )
  }

  lines.push(
    `_Also seen and not judged: ${ungated} merged ${ungated === 1 ? 'PR' : 'PRs'} with no ` +
      `\`${REVIEW_LABEL}\` label. This alarm gates nothing — the merges it names have already ` +
      'shipped._',
  )

  return lines.join('\n')
}

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : process.argv[i + 1]
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
  const limit = Number(argValue('--limit', '0'))
  const result = sweep(prs, since)
  const gap = limit ? windowGap(prs, limit, since) : null
  const summary = renderSummary(result, gap)

  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')
  }

  for (const pr of result.unsatisfied) {
    console.log(
      `::error title=PR #${pr.number} merged owing a review::"${pr.title}" was labelled ` +
        `${REVIEW_LABEL}, merged ${pr.mergedAt}, and carries no review record on the PR. ` +
        `Mirror the verdict onto the PR, or request the review now. ${pr.url}`,
    )
  }
  if (gap) console.log(`::error title=The review sweep could not see its whole window::${gap}`)

  process.exitCode = result.unsatisfied.length || gap ? 1 : 0
}

// Direct invocation only, so the guard test can import the classifier.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
