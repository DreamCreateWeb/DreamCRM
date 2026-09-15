// NO SHEBANG, DELIBERATELY — same reason as scripts/review-gate.mjs. The
// workflow runs `node scripts/migration-check.mjs`, so it was never
// load-bearing, and on a Windows checkout git hands this file to the working
// tree with CRLF endings: vitest's SSR transform leaves the `\r` behind when it
// strips `#!…`, producing a parse error at column 1 in every test that imports
// this module.
/**
 * DID PRODUCTION ACTUALLY APPLY THIS COMMIT'S MIGRATIONS?
 *
 * The defect this exists for (DREAMCRM-46): a failed migration deploys GREEN.
 * `Dockerfile` starts the server and then runs
 * `(node scripts/db-migrate.mjs && node scripts/resync-demo.mjs) || true`
 * AFTER App Runner has already marked the container healthy; `deploy.yml` has
 * no migration step at all; and `/api/admin/migrate` answers a 500 that nothing
 * reads. Every one of those is individually defensible — the server should not
 * fall over because a migration did — and together they mean the deploy shows a
 * green tick while the schema is stuck.
 *
 * It is worse than one bad deploy, because of how drizzle decides what to
 * apply. `PgDialect.migrate` reads the single most recent row in the ledger and
 * applies every journal entry whose `when` is GREATER than that row's
 * `created_at`, all inside one transaction. So:
 *
 *   - a migration that throws rolls the whole boot's batch back, leaving the
 *     ledger exactly where the previous deploy left it, and
 *   - a journal entry whose `when` is at or below the newest applied row is
 *     skipped SILENTLY, FOREVER — which is what a rebase or a merge that
 *     reorders two generated migrations produces.
 *
 * Neither leaves a mark anywhere a person looks. Hence this: an assertion,
 * after the deploy, that the applied-migration ledger in production matches the
 * journal of the commit that just shipped.
 *
 * HOW IT ASKS. Through the DREAMCRM-42 read path (`lib/read-checks.ts` entry
 * `migrations-applied` → `/api/admin/read-check` → the `SELECT`-only role), so
 * no runner and no agent machine holds a database credential. See
 * `docs/PROD-READ-ACCESS.md`.
 *
 * THE INVARIANT, stated exactly, because a looser one would be wrong in a way
 * that costs a false alarm on every busy day:
 *
 *   EVERY journal entry in THIS commit must be present in the ledger.
 *   Ledger rows the journal does not know about are NOT a failure — production
 *   being AHEAD of this commit is what a newer merge deploying mid-check looks
 *   like, and it is normal. Only MISSING is a defect.
 *
 * WHAT IT DELIBERATELY DOES NOT COMPARE: the migration file hashes drizzle also
 * stores. Comparing them would catch a different defect — an already-applied
 * migration file edited after the fact — and it is a different defect, so it
 * gets its own entry if it is ever worth one (repo conventions §1, "split on
 * contact"). It would also need a line-ending decision the `when` comparison
 * does not: drizzle hashes the file bytes, and a CRLF checkout hashes
 * differently from the LF tree CodeBuild ships. `when` is what drizzle itself
 * keys on, so it is the honest thing to assert about.
 *
 * FIVE OUTCOMES, and keeping them apart is most of the point:
 *
 *   VERIFIED     — a real answer, and it matches. Exit 0.
 *   MISMATCH     — a real answer, and a journal entry is missing. Exit 1, loud.
 *   UNANSWERED   — the route never gave a usable answer inside the window. Exit
 *                  1: after a deploy that most likely means the new container
 *                  never went live, so the migrations did not run either.
 *   BROKEN       — the alarm cannot run (production rejected the secret). Exit
 *                  1. Deliberately NOT worded as the one below: "this run is
 *                  green because the check could not run" would be false on a
 *                  run that exits 1, and sharing that sentence is exactly the
 *                  drift a single render function is supposed to stop. It
 *                  shipped in the first draft and a stub answering 401 found it.
 *   NOT VERIFIED — the read path is not configured yet (no secret, or the route
 *                  answers 503 because DATABASE_URL_READONLY is unset). Exit 0
 *                  with a warning that says NOTHING WAS CHECKED.
 *
 * The last one is the honesty requirement, and it is why the summary never
 * says "verified" unless it was. Until the owner finishes the DREAMCRM-42
 * setup, EVERY run is that last kind — so a green tick here is not evidence
 * that this check ran, exactly as `read-check.yml` and `error-scan.yml` already
 * warn about themselves. A quiet alarm trained in before it can ever fire is
 * worse than no alarm, because the next person reads the tick.
 *
 * Usage:  node scripts/migration-check.mjs
 *         (ADMIN_READ_SECRET, BASE_URL from the environment)
 */
import { readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The journal drizzle reads, and the folder the migrate route points at. */
export const MIGRATIONS_DIR = 'lib/db/migrations'

/** The catalog id this asks for. Must exist in lib/read-checks.ts. */
export const CHECK_ID = 'migrations-applied'

/** Production. Overridable so a dispatch can aim at a staging host. */
const DEFAULT_BASE_URL = 'https://www.dreamcreatestudio.com'

/**
 * How long to keep asking before calling it a failure.
 *
 * `deploy.yml` returns as soon as CodeBuild succeeds — the App Runner rollout
 * it triggers is still in flight at that moment, and the migrations run on the
 * NEW container's boot. So a check that asked once would be asking the OLD
 * container. Polling is not politeness here; it is the only way the question
 * is answerable at all from where the deploy ends.
 *
 * 12 minutes because a rollout plus a boot is minutes, not seconds, and the
 * whole window is only spent when something is actually wrong — a healthy
 * deploy answers as soon as the new container has migrated and the job ends
 * there.
 */
const DEFAULT_TIMEOUT_SECONDS = 12 * 60

/**
 * 30s between polls: 10 requests per 5 minutes, well under the route's own
 * `rateLimitPublicAction('admin-read-check', { limit: 30, windowMs: 5min })`
 * even with a scheduled run and a post-deploy run overlapping, which is why
 * this workflow deliberately takes no concurrency group — a read-only check
 * queued behind another one would put a 12-minute wait in front of the deploy
 * signal it exists to give.
 */
const DEFAULT_INTERVAL_SECONDS = 30

/** One journal entry, reduced to the two fields that decide anything. */
export function readJournal(dir = MIGRATIONS_DIR) {
  const journal = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8'))
  // `when` is compared as a STRING on both sides. The ledger column is
  // `bigint`, node-postgres returns int8 as a string rather than risk a
  // silently lossy Number, and an epoch-ms value is well inside Number range
  // anyway — so string equality is exact, free, and does not invite a
  // precision argument later.
  return journal.entries.map((e) => ({ tag: e.tag, when: String(e.when) }))
}

/**
 * The comparison. Pure, so `tests/guards/migration-check.test.ts` can show it
 * every shape the real thing has.
 *
 * `appliedAt` is the `applied_at` column of the catalog entry's single row:
 * every `created_at` in `drizzle.__drizzle_migrations`, ascending.
 */
export function compareLedger(journal, appliedAt) {
  const applied = new Set((appliedAt ?? []).map((v) => String(v)))
  const known = new Set(journal.map((e) => e.when))

  const missing = journal.filter((e) => !applied.has(e.when))
  // Rows the journal does not know about. NOT a failure — see the header.
  const ahead = [...applied].filter((v) => !known.has(v))

  return {
    ok: missing.length === 0,
    journalCount: journal.length,
    appliedCount: applied.size,
    missing,
    ahead,
  }
}

export const STATES = {
  VERIFIED: 'verified',
  MISMATCH: 'mismatch',
  UNANSWERED: 'unanswered',
  BROKEN: 'broken',
  NOT_VERIFIED: 'not-verified',
}

/**
 * The job summary. One function for all three outcomes so the wording cannot
 * drift apart, and so the guard can assert the property that matters: a
 * NOT VERIFIED run must never read like a passing one.
 */
export function renderSummary(state, detail = {}) {
  const lines = []

  if (state === STATES.VERIFIED) {
    const { result, url } = detail
    lines.push(
      '### ✅ VERIFIED — production has applied every migration in this commit',
      '',
      `${result.journalCount} of ${result.journalCount} journal entries are in the applied-migration ` +
        `ledger at \`${url}\`.`,
      '',
    )
    if (result.ahead.length > 0) {
      lines.push(
        `Production is also carrying ${result.ahead.length} migration(s) this commit's journal does ` +
          'not know about. That is what a newer deploy landing mid-check looks like, and it is not a ' +
          'failure — only a MISSING entry is.',
        '',
      )
    }
    return lines.join('\n')
  }

  if (state === STATES.MISMATCH) {
    const { result, url, waitedSeconds } = detail
    const first = result.missing[0]
    lines.push(
      '### ❌ MISMATCH — production is missing a migration from this commit',
      '',
      `The applied-migration ledger at \`${url}\` still disagrees with ` +
        `\`${MIGRATIONS_DIR}/meta/_journal.json\` after ${waitedSeconds}s of asking. ` +
        `${result.appliedCount} of ${result.journalCount} journal entries are applied.`,
      '',
      `**First missing entry: \`${first.tag}\`** (\`when\` = ${first.when}).`,
      '',
    )
    if (result.missing.length > 1) {
      lines.push(
        `<details><summary>${result.missing.length} missing in total</summary>`,
        '',
        ...result.missing.map((e) => `- \`${e.tag}\` (\`when\` = ${e.when})`),
        '',
        '</details>',
        '',
      )
    }
    lines.push(
      '**What this means.** drizzle applies a boot\'s pending migrations in ONE transaction, ordered ' +
        'by `when`, and then only ever considers entries newer than the most recent ledger row. So ' +
        'either the batch threw and rolled back — the App Runner application log has the reason, ' +
        'search it for `[migrate]` — or the entry above carries a `when` at or below an ' +
        'already-applied row, in which case drizzle will skip it silently on every future boot and ' +
        'redeploying will not help.',
      '',
      '**Every later migration is blocked behind it either way.** This does not self-heal.',
      '',
      '**If the deploy was merely slow**, re-run this workflow (`gh workflow run ' +
        'migration-check.yml`) — and note the daily scheduled run is the timing-free reading of the ' +
        'same question.',
      '',
    )
    return lines.join('\n')
  }

  if (state === STATES.BROKEN) {
    // Distinct from NOT VERIFIED, and the distinction is the whole reason this
    // state exists: NOT VERIFIED's body says "this run is green", which would be
    // a lie here — the alarm being broken exits 1. Sharing that wording is
    // exactly the drift the one-render-function rule is meant to prevent, and it
    // shipped in the first draft.
    const { why } = detail
    lines.push(
      '### ❌ THE CHECK ITSELF IS BROKEN',
      '',
      `${why}`,
      '',
      'Not a skipped check and not a stuck migration: the alarm cannot run at all, so it could not ' +
        'fire even if a migration had failed. Fix the configuration before reading any later green ' +
        'run of this workflow as evidence.',
      '',
      'Setup and the secret it needs: `docs/PROD-READ-ACCESS.md`.',
      '',
    )
    return lines.join('\n')
  }

  if (state === STATES.UNANSWERED) {
    const { url, waitedSeconds, why, journalCount } = detail
    lines.push(
      '### ❌ UNANSWERED — production never told us what it has applied',
      '',
      `\`${url}\` gave no usable answer in ${waitedSeconds}s. Last attempt: ${why}.`,
      '',
      'This is a finding, not a skipped check. The most likely cause after a deploy is that the new ' +
        'container never became the live one — App Runner rolled back, or the rollout is still ' +
        'stuck — and in that case this commit\'s ' +
        `${journalCount} migrations have not run either. The other cause is that the running ` +
        'container predates the `migrations-applied` catalog entry, which says the same thing: ' +
        'production is not running this commit.',
      '',
      'Check the App Runner service and its application log, then re-run this workflow.',
      '',
    )
    return lines.join('\n')
  }

  // NOT VERIFIED. Deliberately written so no part of it can be skim-read as a
  // pass: the heading says nothing was checked, and the word "verified" appears
  // only inside "NOT VERIFIED".
  const { reason } = detail
  lines.push(
    '### ⚠️ NOT VERIFIED — nothing was checked',
    '',
    reason,
    '',
    '**This run is green because the check could not run, not because the migrations are in ' +
      'place.** The production read path (DREAMCRM-42) needs owner-side setup before this question ' +
      'is answerable at all; until then every run of this workflow lands here. Do not read the tick.',
    '',
    'Setup: `docs/PROD-READ-ACCESS.md`. It is a `::warning::` and an `exit 0` rather than a failure ' +
      'on purpose — an alarm that has been red for a fortnight for an unrelated reason is one ' +
      'nobody opens on the day it finally means something.',
    '',
  )
  return lines.join('\n')
}

/**
 * STATE -> PROCESS EXIT CODE. One table, because the pairing is the thing this
 * file got wrong once: the broken-alarm path exited 1 while printing the body
 * that says "this run is green". A branch that picks its summary and its exit
 * code independently can always disagree; deriving one from the other makes
 * that impossible, and lets the guard assert the pairing without running main().
 */
export const EXIT_CODE = {
  [STATES.VERIFIED]: 0,
  [STATES.NOT_VERIFIED]: 0,
  [STATES.MISMATCH]: 1,
  [STATES.UNANSWERED]: 1,
  [STATES.BROKEN]: 1,
}

/**
 * The two non-answers a poll can end on, and the verdict each produces.
 *
 * A table rather than two literals inside main() so the mapping is reachable
 * from a test. The first draft had this as two branches and the 401 branch
 * rendered NOT VERIFIED's body -- a bug a pure renderSummary test could not
 * see, because renderSummary was right the whole time. The call site was wrong.
 */
export const NON_ANSWER_VERDICTS = {
  'not-configured': STATES.NOT_VERIFIED,
  fatal: STATES.BROKEN,
}

function emit(summary) {
  console.log(summary)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
}

/** Print the verdict and answer with the exit code that state always carries. */
function finish(state, detail) {
  emit(renderSummary(state, detail))
  return EXIT_CODE[state]
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** One request to the read-check route. Never throws; classifies instead. */
async function askProduction(url, secret) {
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ check: CHECK_ID }),
    })
  } catch (err) {
    return { kind: 'retry', why: `network: ${err instanceof Error ? err.message : String(err)}` }
  }

  if (res.status === 503) return { kind: 'not-configured', why: 'the route answered 503' }
  if (res.status === 401) return { kind: 'fatal', why: 'HTTP 401 — ADMIN_READ_SECRET does not match production' }
  // 400 is `unknown check`, which is what a container running an OLDER commit
  // answers for a catalog entry that does not exist there yet. During a rollout
  // that is expected and transient; if it lasts the whole window it is its own
  // finding — see the timeout branch in main().
  if (res.status === 400) return { kind: 'retry', why: 'HTTP 400 — the running container does not know this check yet' }
  if (res.status === 429) return { kind: 'retry', why: 'HTTP 429 — rate limited' }
  if (!res.ok) return { kind: 'retry', why: `HTTP ${res.status}` }

  const body = await res.json().catch(() => null)
  if (!body?.ok || !Array.isArray(body.rows) || body.rows.length !== 1) {
    return { kind: 'retry', why: 'the route answered 200 with an unexpected body' }
  }
  return { kind: 'answer', appliedAt: body.rows[0].applied_at }
}

async function main() {
  const secret = process.env.ADMIN_READ_SECRET
  const baseUrl = (process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const url = `${baseUrl}/api/admin/read-check`
  const timeoutSeconds = Number(process.env.MIGRATION_CHECK_TIMEOUT_SECONDS || DEFAULT_TIMEOUT_SECONDS)
  const intervalSeconds = Number(process.env.MIGRATION_CHECK_INTERVAL_SECONDS || DEFAULT_INTERVAL_SECONDS)

  if (!secret) {
    console.log('::warning::ADMIN_READ_SECRET is not set — the applied-migration ledger was NOT checked. Setup: docs/PROD-READ-ACCESS.md.')
    return finish(NON_ANSWER_VERDICTS['not-configured'], {
      reason: '`ADMIN_READ_SECRET` is not set in this repository, so there was nothing to ask production with.',
    })
  }

  const journal = readJournal()
  console.log(`[migration-check] ${journal.length} journal entries in this commit; asking ${url}`)

  const startedAt = Date.now()
  const deadline = startedAt + timeoutSeconds * 1000
  let lastResult = null
  let lastWhy = 'no answer'

  for (;;) {
    const attempt = await askProduction(url, secret)

    if (attempt.kind === 'not-configured') {
      console.log(`::warning::The read-only database is not configured yet — the applied-migration ledger was NOT checked. Setup: docs/PROD-READ-ACCESS.md.`)
      return finish(NON_ANSWER_VERDICTS['not-configured'], {
        reason: `\`DATABASE_URL_READONLY\` is not set on the running container — ${attempt.why}.`,
      })
    }

    if (attempt.kind === 'fatal') {
      console.log(`::error::migration-check could not reach the read path: ${attempt.why}`)
      return finish(NON_ANSWER_VERDICTS.fatal, {
        why:
          `${attempt.why}. The secret exists in this repository but production rejected it, so ` +
          'this alarm cannot fire even when it should.',
      })
    }

    if (attempt.kind === 'answer') {
      lastResult = compareLedger(journal, attempt.appliedAt)
      lastWhy = `${lastResult.appliedCount}/${lastResult.journalCount} applied`
      if (lastResult.ok) {
        return finish(STATES.VERIFIED, { result: lastResult, url })
      }
    } else {
      lastWhy = attempt.why
    }

    if (Date.now() + intervalSeconds * 1000 > deadline) break
    console.log(`[migration-check] not settled yet (${lastWhy}) — retrying in ${intervalSeconds}s`)
    await sleep(intervalSeconds * 1000)
  }

  const waitedSeconds = Math.round((Date.now() - startedAt) / 1000)

  if (!lastResult) {
    console.log(`::error::migration-check never got an answer from production in ${waitedSeconds}s (${lastWhy}).`)
    return finish(STATES.UNANSWERED, { url, waitedSeconds, why: lastWhy, journalCount: journal.length })
  }

  console.log(
    `::error::Production is missing ${lastResult.missing.length} migration(s) from this commit — first: ` +
      `${lastResult.missing[0].tag}. Every later migration is blocked behind it. See the job summary.`,
  )
  return finish(STATES.MISMATCH, { result: lastResult, url, waitedSeconds })
}

// Direct invocation only, so the guard test can import the pure functions.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main()
}
