// NO SHEBANG, DELIBERATELY — the same lesson `scripts/review-gate.mjs`,
// `scripts/rulebook-drift.mjs`, `scripts/review-sweep.mjs`,
// `scripts/error-scan.mjs` and `scripts/schedule-heartbeat.mjs` all carry. The
// workflow runs `node scripts/push-alarm.mjs`, so it was never load-bearing,
// and git hands this file to a Windows working tree with CRLF endings:
// vitest's SSR transform leaves the `\r` behind when it strips `#!…` and every
// test importing this module dies with a parse error at column 1.
/**
 * DID A PUSH-TRIGGERED WORKFLOW ON `main` GO RED, AND DOES ANYBODY KNOW?
 *
 * TWO PRODUCERS, ONE ALARM. `main` auto-deploys to production (§4), and two
 * workflows fire on every push to it: `deploy.yml`, whose red means production
 * is serving an older commit than `main`, and `post-merge-e2e.yml`, whose red
 * means a patient-facing journey broke on a commit that is ALREADY LIVE.
 *
 * Until this file existed neither had an addressee. On 2026-09-23 a red
 * `deploy.yml` went unnoticed for 21 minutes and production shipped nothing for
 * 77: three consecutive runs failed on `test` between 03:40Z and 04:03Z and the
 * only surfaces carrying that fact were the Actions tab and GitHub's default
 * failed-run email to one account. `post-merge-e2e.yml` has the same hole and
 * says so in its own header.
 *
 * WHY ONE ALARM AND NOT TWO. The question is identical for both and so is the
 * machinery — routing, the edge rule, the wake. Two files would be two copies
 * of it drifting apart. What genuinely differs is the CONSEQUENCE, and that is
 * `PRODUCER_DETAIL` below: one sentence, chosen by the upstream's own file
 * name, in the first line a woken reader sees. What is also per-producer is the
 * red STREAK — a broken deploy and a broken browser journey are independent
 * facts, so each gets its own edge, which is why the workflow looks the history
 * up from `workflow_run.path` rather than from a name written here.
 *
 * The gap was structural rather than bad luck, and it is worth stating exactly
 * because it is the reason this is a new workflow rather than a step somewhere:
 *
 *   * NO WORKFLOW IN `.github/workflows/**` USED A `workflow_run` TRIGGER. A
 *     failed push-triggered workflow had nowhere to route to, because nothing
 *     was listening for one.
 *   * `schedule-heartbeat.yml` CANNOT SEE EITHER OF THEM BY CONSTRUCTION. It
 *     derives its list from `cron:` entries and grades the AGE of each
 *     schedule's newest run. Neither has a cron; both fire on merges, which
 *     arrive whenever somebody merges — there is no window to be late
 *     against. It is not a hole in that check; it is outside its subject.
 *   * A RED POST-MERGE RUN IS NOT A RED PR. The merge that caused it is already
 *     on `main` and already green on its own PR page. Nothing on the board moves.
 *
 * So: one workflow that runs on every completion of either, goes red when the
 * upstream did, and POSTs to a Multica autopilot webhook that opens an issue
 * assigned to Quinn. GitHub cannot dispatch anybody — §3 says exactly that
 * about the verdict mention and `review-sweep.yml` says it about the intake
 * wake — so the record is the red run and the WAKE is the POST. Two artefacts,
 * two jobs.
 *
 * ------------------------------------------------------------------------
 * WHICH CONCLUSIONS ARE RED, AND WHY `cancelled` IS NOT ONE OF THEM.
 *
 * This is the part most likely to be got wrong by reading GitHub's docs rather
 * than this repository's `deploy.yml`.
 *
 * `failure`, `timed_out` and `startup_failure` are red: the run did not
 * finish, which for the deploy means production is serving an older commit
 * than `main` and for the browser suite means nobody graded the tree that
 * shipped.
 * `startup_failure` especially — `review-sweep.yml`'s header records
 * `rulebook-drift.yml` shipping a draft with an invalid `permissions:` scope
 * and publishing NO check at all, twice, in 0 seconds. That is a deploy that
 * never ran wearing the same silence as a deploy that never failed.
 *
 * `cancelled` is NOT red, and the reason is mechanical rather than a
 * judgement call. `deploy.yml`'s `deploy` job carries
 * `concurrency: { group: deploy-main, cancel-in-progress: false }`. That flag
 * protects the RUNNING rollout; GitHub still keeps at most one PENDING run per
 * group and cancels any further pending ones. So three merges landing inside
 * one rollout produce a cancellation as routine behaviour, on a run whose work
 * a later run is about to do anyway. Reddening on that would give this alarm a
 * false positive on the busiest hour of any given day, which is the hour it
 * most needs to be believed.
 *
 * ANY OTHER CONCLUSION IS RED. `neutral`, `stale`, `action_required` and
 * anything GitHub adds after this was written are graded as findings and named
 * in the summary. An alarm that silently passes a value it does not recognise
 * is asserting something about a state nobody has looked at — and the
 * direction of that mistake is the one that makes this check blind.
 *
 * ------------------------------------------------------------------------
 * THE WAKE FIRES ON THE EDGE, AND IT FAILS OPEN — THE OPPOSITE OF THE SWEEP.
 *
 * `scripts/review-sweep.mjs` scopes its wake HARDER than its exit status,
 * because a wake enqueues a paid run and an intake queue somebody has already
 * seen is not news. The same reasoning lands in the opposite place here, and
 * the difference is worth reading rather than assuming this file is
 * inconsistent with that one:
 *
 *   * ON THE EDGE, PER PRODUCER. A red streak wakes ONCE, on the transition
 *     from a not-red previous run OF THE SAME WORKFLOW. 2026-09-23 was three red runs in 23 minutes over
 *     ONE broken `main`; three issues would have been two pieces of noise and
 *     a worse signal-to-noise ratio for the next one. Every run still goes red
 *     — the colour is free, the run is not.
 *   * BUT A FAILED LOOKUP WAKES ANYWAY. If the history lookup did not come
 *     back, this file cannot tell an edge from a continuation, and the two
 *     mistakes are not the same size: a duplicate issue costs one agent run and
 *     a sentence saying "already handled"; a missed one costs the thing this
 *     alarm exists for. The sweep's `undated` case suppresses for the mirror
 *     reason — there, the expensive mistake is the dispatch.
 *
 * ------------------------------------------------------------------------
 * WHAT NOTICES THIS ALARM STOPPED (§2a's standing convention, obligation 3).
 *
 * `scripts/schedule-heartbeat.mjs` was widened for this and now watches two
 * kinds of alarm rather than one: those with a `cron:`, and those triggered by
 * another workflow's completion. For the second kind the question is not age —
 * a `workflow_run` alarm is exactly as punctual as its upstream — it is
 * PAIRING: is there an alarm run at or after the newest settled run of the
 * workflows it watches? If this file is deleted, disabled, or its
 * `workflows:` list stops naming a producer's `name:`, the heartbeat says so
 * the next morning.
 *
 * The third of those is also pinned at merge time, and DERIVED rather than
 * typed. `tests/guards/push-alarm.test.ts` finds every workflow whose `on:`
 * block declares `push:` to `main`, reads each one's `name:` off disk, and
 * requires the trigger's `workflows:` list to equal that set exactly — because
 * `workflow_run` matches on the DISPLAY NAME and not the filename, so a rename
 * would disconnect this alarm with nothing else noticing, and a THIRD
 * push-triggered workflow would simply never be watched.
 *
 * Usage:
 *   node scripts/push-alarm.mjs --event event.json --history runs.json --wake-out wake.json
 *
 *   --event    the `github.event.workflow_run` object, as JSON
 *   --history  `gh run list --workflow <the upstream's own file>` output,
 *              newest first — per producer, never a fixed workflow
 *   --wake-out where to write the wake decision the workflow's POST step reads
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Conclusions that mean the run finished without doing its job. See the
 * docblock for why `cancelled` is absent and why this list is not exhaustive by
 * design.
 */
export const RED_CONCLUSIONS = ['failure', 'timed_out', 'startup_failure']

/**
 * Conclusions that are genuinely not a failure.
 *
 * `skipped` and `neutral` cannot be produced by either upstream as they stand
 * — they are here so an unrecognised value is unrecognised because GitHub
 * added one, not because this list forgot an ordinary one.
 */
export const BENIGN_CONCLUSIONS = ['success', 'cancelled', 'skipped']

/* ------------------------------------------------------------- producers -- */

/**
 * WHAT THE RUN FAILED AT, in words that mean different things.
 *
 * Two workflows push to `main` and this alarm watches both. The QUESTION is
 * identical — a push-triggered workflow finished red and nobody is looking —
 * which is why one alarm covers them; the CONSEQUENCE is not, and a reader
 * woken at the wrong hour needs that difference in the first sentence rather
 * than after opening two tabs.
 *
 * Keyed on the workflow FILE, taken from the event's own `path`, because the
 * display name is the thing that can be renamed out from under us — that is
 * the hazard the trigger's own comment is about. An unrecognised producer is
 * reported as unrecognised rather than described as one of these.
 */
export const PRODUCER_DETAIL = {
  'deploy.yml':
    'This is the DEPLOY, so production is serving an older commit than `main` and will keep doing ' +
    'so until a green run lands. Read which job went red — `test` means `main` itself is broken ' +
    'and nothing will ship at all; `deploy` means the rollout or `scripts/rollout-check.mjs` ' +
    'failed; `migration-check` means the container booted on a journal that does not match the ' +
    'commit.',
  'post-merge-e2e.yml':
    'This is the POST-MERGE BROWSER SUITE, and the difference from a red deploy is the part to ' +
    'read first: it holds nothing back, so the commit that broke a patient-facing journey IS ' +
    'ALREADY LIVE. The PR `e2e` job ran against a stale merge — `main` as it stood when that run ' +
    'started — so two PRs green against yesterday\'s tree can merge into one neither was tested ' +
    'on. That is the case this job exists for. Open the run\'s Playwright report for the trace ' +
    'and screenshot before re-running anything.',
  unknown:
    'This alarm does not recognise the workflow that produced this run, which means its ' +
    '`workflows:` trigger list and `PRODUCER_DETAIL` in `scripts/push-alarm.mjs` have come apart. ' +
    'Grade it by hand and reconcile the two.',
}

/**
 * WHY `cancelled` IS BENIGN — PER PRODUCER, because the mechanism is not the
 * same one (Sentinel, reviewing #700, note 3).
 *
 * The VERDICT is producer-independent: a cancelled run is not a failure. The
 * JUSTIFICATION is not, and the first version of this file printed
 * `deploy.yml`'s for both. That is §2d's predicate-right/sentence-wrong family
 * exactly — no mutation finds it, because the code does the right thing and
 * only the explanation is false. A reader woken at 04:00 would have been
 * handed a reason citing the wrong file AND the wrong concurrency setting:
 *
 *   * `deploy.yml`   `group: deploy-main`, `cancel-in-progress: FALSE`
 *   * `post-merge-e2e.yml`   `group: post-merge-e2e-${{ github.ref }}`,
 *     `cancel-in-progress: TRUE`
 *
 * Opposite flags, and the verdict is MORE justified on the second, not less:
 * `cancel-in-progress: true` means superseding is the designed behaviour
 * rather than a side effect of queue depth.
 *
 * AND IT IS ALSO BENIGN FOR A HUMAN CANCELLATION, which was deliberate and
 * unstated. Somebody pressing Cancel on a deploy leaves production on the old
 * commit — a state somebody already knows about, by construction, because they
 * caused it. Waking them to report their own click is the kind of false
 * positive that gets an alarm muted.
 */
export const CANCELLED_DETAIL = {
  'deploy.yml':
    'cancelled, which `deploy.yml`\'s `deploy` job produces as routine behaviour when merges ' +
    'arrive inside a rollout: `concurrency: { group: deploy-main, cancel-in-progress: false }` ' +
    'keeps one pending run and cancels the rest, so a later run does this one\'s work. It is also ' +
    'what a human pressing Cancel looks like — production stays on the old commit, and whoever ' +
    'clicked already knows.',
  'post-merge-e2e.yml':
    'cancelled, which `post-merge-e2e.yml` produces by design rather than by accident: its ' +
    '`concurrency: { group: post-merge-e2e-<ref>, cancel-in-progress: true }` supersedes an ' +
    'in-flight run the moment a newer commit lands on the same ref. The newer run grades the ' +
    'tree that is actually live, which is the one worth grading. Note the flag is the OPPOSITE of ' +
    '`deploy.yml`\'s — same verdict, different mechanism.',
  unknown:
    'cancelled. This alarm does not recognise the workflow that produced the run, so it cannot say ' +
    'which concurrency rule cancelled it — but a cancelled run is not a failure either way. ' +
    'Reconcile the `workflows:` trigger list with `CANCELLED_DETAIL` in `scripts/push-alarm.mjs`.',
}

/** The sentence about the CONCLUSION, which is producer-independent. */
export const CONCLUSION_DETAIL = {
  failure: 'The run FAILED.',
  timed_out:
    'The run TIMED OUT, and unlike a failure there is no error to read — start from which job was ' +
    'still running when the clock ran out.',
  startup_failure:
    'The run NEVER STARTED. GitHub refused the workflow file itself, which it does for an invalid ' +
    '`permissions:` scope among other things, and it publishes no check when it does — a 0-second ' +
    'run that looks from every list exactly like one that has not begun.',
}

/** The upstream workflow file, from the event's `path`. */
export function producerOf(run) {
  const path = String(run?.path ?? '')
  const file = path.split('/').pop()
  return file && file in PRODUCER_DETAIL && file !== 'unknown' ? file : 'unknown'
}

/* -------------------------------------------------------------- verdict -- */

/**
 * Grade one upstream `deploy.yml` run.
 *
 * `run` is `github.event.workflow_run`. `previous` is the newest SETTLED run
 * of the same workflow that started before this one, or null when the lookup
 * failed or there is no earlier run — the two are distinguished by
 * `historyRead`, because "no earlier run" is a fact and "could not ask" is not.
 */
export function assess({ run, previous, historyRead = true }) {
  const conclusion = run?.conclusion ?? null
  const red = conclusion == null || !BENIGN_CONCLUSIONS.includes(conclusion)
  const known = conclusion != null && [...RED_CONCLUSIONS, ...BENIGN_CONCLUSIONS].includes(conclusion)

  const verdict = {
    red,
    conclusion,
    known,
    runId: run?.id ?? null,
    url: run?.html_url ?? null,
    branch: run?.head_branch ?? null,
    sha: run?.head_sha ?? null,
    title: run?.display_title ?? null,
    event: run?.event ?? null,
    /** The upstream workflow FILE, so the reader knows which alarm this is. */
    producer: /** @type {string} */ ('unknown'),
    /** Its display name, which is what the trigger actually matched on. */
    workflowName: run?.name ?? null,
    detail: '',
    // `new` | `continuing` | `unknown`, set below only when the run is red. It
    // is declared here rather than assigned late so the shape of a verdict is
    // one object literal — a reader (and a type checker) should not have to
    // find three assignment sites to know what a verdict carries.
    streak: /** @type {'new' | 'continuing' | 'unknown' | null} */ (null),
    previous: /** @type {any} */ (null),
  }

  verdict.producer = producerOf(run)

  if (!red) {
    verdict.detail =
      conclusion === 'cancelled'
        ? (CANCELLED_DETAIL[verdict.producer] ?? CANCELLED_DETAIL.unknown)
        : `\`${conclusion}\` — the run did not fail.`
    return verdict
  }

  verdict.detail = known
    ? `${CONCLUSION_DETAIL[conclusion]} ${PRODUCER_DETAIL[verdict.producer] ?? PRODUCER_DETAIL.unknown}`
    : `GitHub reported \`${conclusion}\`, which this alarm does not recognise. It is graded RED on ` +
      'purpose: a value nobody has looked at is not a value this check may pass. Decide what it ' +
      'means and add it to `RED_CONCLUSIONS` or `BENIGN_CONCLUSIONS` in `scripts/push-alarm.mjs`. ' +
      (PRODUCER_DETAIL[verdict.producer] ?? PRODUCER_DETAIL.unknown)

  if (!historyRead) {
    verdict.streak = 'unknown'
  } else if (previous && !BENIGN_CONCLUSIONS.includes(previous.conclusion)) {
    verdict.streak = 'continuing'
    verdict.previous = previous
  } else {
    verdict.streak = 'new'
    verdict.previous = previous ?? null
  }

  return verdict
}

/**
 * The newest SETTLED run of `deploy.yml` that started strictly before this one.
 *
 * `status === 'completed'` is load-bearing: a run still in progress has
 * `conclusion: null`, and reading that as "not red" would turn every deploy
 * that lands while another is mid-rollout into a fresh edge — which on a busy
 * afternoon is exactly the storm the edge rule exists to prevent.
 */
export function previousSettled(history, run) {
  const startedAt = Date.parse(run?.created_at ?? run?.createdAt ?? '')
  if (!Array.isArray(history) || !Number.isFinite(startedAt)) return null
  const earlier = history
    .filter((r) => r && r.status === 'completed' && r.databaseId !== run?.id)
    .filter((r) => {
      const at = Date.parse(r.createdAt ?? '')
      return Number.isFinite(at) && at < startedAt
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return earlier[0] ?? null
}

/**
 * Should this run POST?
 *
 * Green never wakes. Red wakes on the edge, and red with no readable history
 * wakes too — see "THE WAKE FIRES ON THE EDGE, AND IT FAILS OPEN" above for
 * why this is the opposite default from `scripts/review-sweep.mjs` rather than
 * an inconsistency with it.
 */
export function wakeDecision(verdict) {
  if (!verdict.red) return { wake: false, reason: 'green' }
  if (verdict.streak === 'unknown') {
    return { wake: true, reason: 'undated' }
  }
  if (verdict.streak === 'continuing') {
    return { wake: false, reason: 'still-red' }
  }
  return { wake: true, reason: 'new-red' }
}

/* --------------------------------------------------------------- report -- */

/**
 * The job summary.
 *
 * LEADS WITH WHAT IT GRADED, never with a tick — the same shape
 * `renderSummary` in `scripts/schedule-heartbeat.mjs` and `renderObligation` in
 * `scripts/review-sweep.mjs` use. A run that could not read its own event and
 * printed "deploy OK" would be this file's failure mode wearing its uniform.
 */
export function renderSummary(verdict, wake, { lookupFailures = [] } = {}) {
  const lines = ['### Push-triggered alarm', '']

  if (!verdict.runId && !verdict.conclusion) {
    lines.push(
      '#### This run graded nothing',
      '',
      'The `workflow_run` event payload was missing or unreadable, so this alarm does not know ' +
        'which workflow ran or what it did. That is a finding, not a quiet morning.',
      '',
    )
  } else {
    lines.push(
      `Graded \`${verdict.producer}\` run [${verdict.runId}](${verdict.url}) — ` +
        `\`${verdict.conclusion}\` on \`${verdict.branch}\` at ` +
        `\`${String(verdict.sha ?? '').slice(0, 8)}\`` +
        (verdict.title ? ` (${verdict.title})` : ''),
      '',
    )
  }

  if (lookupFailures.length) {
    lines.push(
      '#### Some lookups did not come back',
      '',
      ...lookupFailures.map((f) => `- ${f}`),
      '',
      'Counted and named rather than dropped.',
      '',
    )
  }

  if (verdict.red) {
    lines.push(
      `#### ${verdict.workflowName ?? 'A push-triggered workflow'} finished red on \`${verdict.branch}\``,
      '',
      verdict.detail,
      '',
    )
    if (verdict.streak === 'continuing') {
      lines.push(
        `This is a CONTINUATION: run \`${verdict.previous.databaseId}\` of the same workflow was ` +
          `already \`${verdict.previous.conclusion}\`, so the wake fired then and does not fire ` +
          'again. The run is still red — the colour is free and the issue is not. The streak is ' +
          'per PRODUCER: a red deploy does not silence the first red post-merge run, or the other ' +
          'way round.',
        '',
      )
    }
    if (verdict.producer === 'deploy.yml') {
      lines.push(
        '`main` auto-deploys to production, so until `deploy.yml` is green again production is ' +
          'serving an older commit than `main`.',
        '',
      )
    }
  } else {
    lines.push(`_Not a finding: ${verdict.detail}_`, '')
  }

  lines.push(
    wake.wake
      ? `Waking Quinn (\`${wake.reason}\`).`
      : `Nobody was woken (\`${wake.reason}\`).`,
    '',
  )

  return lines.join('\n')
}

/* ----------------------------------------------------------------- main -- */

function argValue(flag, fallback = null) {
  const i = process.argv.indexOf(flag)
  return i === -1 ? fallback : process.argv[i + 1]
}

function readJson(path) {
  if (!path || !existsSync(path)) return { value: null, why: `the file \`${path}\` was not written` }
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), why: null }
  } catch (err) {
    return { value: null, why: `the file \`${path}\` is not JSON (${err.message})` }
  }
}

function main() {
  const eventFile = readJson(argValue('--event'))
  const historyFile = readJson(argValue('--history'))

  const lookupFailures = []
  if (eventFile.why) lookupFailures.push(`the \`workflow_run\` payload was not readable — ${eventFile.why}`)
  if (historyFile.why) {
    lookupFailures.push(
      `the deploy run history produced nothing usable — ${historyFile.why}. This run cannot tell a ` +
        'new red from a continuing one, so it wakes rather than risking silence.',
    )
  }

  const run = eventFile.value ?? null
  const history = Array.isArray(historyFile.value) ? historyFile.value : null
  const verdict = assess({
    run,
    previous: history ? previousSettled(history, run) : null,
    historyRead: history != null,
  })
  const wake = wakeDecision(verdict)

  const summary = renderSummary(verdict, wake, { lookupFailures })
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n')

  const wakeOut = argValue('--wake-out')
  if (wakeOut) {
    writeFileSync(
      wakeOut,
      JSON.stringify(
        {
          wake: wake.wake,
          reason: wake.reason,
          source: 'push-alarm',
          producer: verdict.producer,
          workflow: verdict.workflowName,
          conclusion: verdict.conclusion,
          run_id: verdict.runId,
          run_url: verdict.url,
          branch: verdict.branch,
          sha: verdict.sha,
          title: verdict.title,
          detail: verdict.detail,
        },
        null,
        2,
      ) + '\n',
    )
  }

  if (verdict.red) {
    console.log(
      `::error title=${verdict.workflowName ?? 'A push-triggered workflow'} finished red on main::` +
        `${verdict.detail} See ${verdict.url ?? 'the upstream run'}.`,
    )
  }
  for (const f of lookupFailures) {
    console.log(`::error title=The deploy alarm could not ask its question::${f}`)
  }

  // RED IS THE RIGHT SIGNAL HERE, and unlike `review-sweep.yml` there is no
  // queue behind it: each run grades exactly one deploy, and the next deploy
  // grades itself. A red run here clears the moment a green deploy lands, so
  // the §2a "permanently red alarm is a disabled alarm" argument does not
  // apply and exit 0 would make this the thing it was written to detect.
  //
  // A FAILED LOOKUP ALSO REDDENS. Fail closed on the colour even though the
  // WAKE fails open — they are different costs and they get different defaults.
  process.exitCode = verdict.red || lookupFailures.length ? 1 : 0
}

// Direct invocation only, so the guard test can import the pure halves.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
