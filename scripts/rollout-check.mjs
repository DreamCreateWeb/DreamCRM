/**
 * A GREEN DEPLOY MUST MEAN THE NEW VERSION IS SERVING (DREAMCRM-86).
 *
 * THE DEFECT (docs/RELEASE.md Part 5, found 2026-09-21). DREAMCRM-83's
 * changelog merge reported green on `test`, `e2e`, the deploy job's own gate,
 * `migration-check` and post-merge E2E, and production went on serving the
 * 2026-09-17 build for 2h 40m after its own rollout was requested — measured by
 * etag, not inferred. The cause is structural rather than incidental:
 * `deploy.yml`'s build step polls `codebuild batch-get-builds` and exits the
 * moment the BUILD reports SUCCEEDED, while the App Runner rollout is fired
 * from the buildspec's POST_BUILD after that point. Nothing downstream watched
 * it, so the pipeline's green meant "the image built and App Runner accepted a
 * request", never "the new version is serving" — and a rollout that is accepted
 * and then does not land was indistinguishable from one that did in every
 * signal we collected.
 *
 * WHAT THIS DOES. After the build step, find the rollout the buildspec started,
 * poll it until it leaves IN_PROGRESS, and fail the job on anything but
 * SUCCEEDED. Then ask the service itself whether it is RUNNING, which is the
 * half that turns "the rollout finished" into "the new version is serving".
 *
 * THE FALSE GREEN THIS HAS TO AVOID IS ITS OWN. A check that latches onto the
 * wrong operation reports SUCCEEDED about somebody else's deploy, which is the
 * defect above wearing a green tick it now has evidence for. So:
 *
 *   - the operation must have STARTED AFTER this run's own build did
 *     (`ROLLOUT_SINCE`), and a missing or unparseable baseline is a FAILURE
 *     rather than a wildcard — see `parseSince`;
 *   - the operation is latched by Id on first sighting and tracked by that Id,
 *     so a later run's rollout can never be mistaken for this one's;
 *   - `ROLLBACK_SUCCEEDED` is a FAILURE. It is the word SUCCEEDED attached to
 *     the exact harm this check exists for: App Runner reverted, and production
 *     is serving the previous commit. Statuses are looked up by exact key for
 *     that reason, never by substring;
 *   - a status this file does not recognise is a failure, not a shrug. An
 *     unrecognised status is not evidence that anything is serving.
 *
 * NO ROLLOUT AT ALL IS ALSO A FAILURE. If the build succeeded and no
 * START_DEPLOYMENT appears, the buildspec's `start-deployment` did not run or
 * did not take — which is precisely the invisibility this check closes, so it
 * is reported rather than waited out in silence.
 *
 * THE ONE DEGRADED PATH, AND WHY IT IS KEYED AS NARROWLY AS IT IS.
 * `apprunner:ListOperations` / `ListServices` / `DescribeService` on the deploy
 * role are an owner-side IAM grant (Dustin's DREAMCRM-65 checklist). Until it
 * lands every call here answers AccessDenied, and hard-failing on that would
 * turn every merge to `main` red for a reason nobody in CI can fix. So an
 * AUTHORIZATION error — and only an authorization error — degrades to a loud
 * `::warning::` saying the rollout is UNVERIFIED, and the job stays green.
 *
 * That escape hatch is the one thing in this file that could recreate the
 * defect, so it is deliberately not a catch-all: a throttle, a timeout, a
 * missing service, a bad ARN or a JSON parse failure are all hard failures.
 * `isAuthorizationError` is a narrow match and `tests/guards/rollout-check.test.ts`
 * pins it from both sides. It also clears itself — the day the grant lands the
 * call succeeds and the real check runs, with no code change.
 *
 * Node builtins only, and no `pnpm install` in the step that runs it: an alarm
 * that needs the dependency tree installed before it can fire is an alarm with
 * a second way to fail. Same rule as `scripts/migration-check.mjs` next door.
 *
 * NO SHEBANG, for the reason `scripts/migration-check.mjs` records: git hands a
 * Windows working tree CRLF endings, and vitest's SSR transform leaves the
 * carriage return behind when it strips a `#!` line — so every test in the guard
 * beside this file would die at column 1, on Windows only, while CI stayed
 * green. The workflow invokes it as `node scripts/rollout-check.mjs` anyway, so
 * nothing here needs one.
 */

import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const CHECK_ID = 'rollout-check'

export const EXIT_CODE = { ok: 0, failed: 1 }

/** The App Runner operation type the buildspec's `start-deployment` creates. */
export const ROLLOUT_OPERATION_TYPE = 'START_DEPLOYMENT'

export const DEFAULT_SERVICE_NAME = 'dreamcrm'

/** Bounds, in seconds. Each is validated and capped — see `positiveSeconds`. */
export const DEFAULTS = {
  /** How long to keep polling a rollout that is still going. */
  timeoutSeconds: 900,
  timeoutCapSeconds: 1800,
  /** How long to wait for the rollout to show up in `list-operations` at all. */
  appearanceSeconds: 180,
  appearanceCapSeconds: 900,
  pollSeconds: 15,
  pollCapSeconds: 60,
  /** How many times a RETRYABLE AWS error is retried before it is a failure. */
  awsAttempts: 4,
}

/**
 * Every OperationStatus App Runner documents, with the verdict this check gives
 * it. `terminal` means "stop polling"; `ok` means "the new version is serving".
 *
 * Read the two rollback rows together: ROLLBACK_IN_PROGRESS is called terminal
 * even though App Runner is still working, because the answer is already known
 * — the new version failed its health check and will not serve. Waiting for
 * ROLLBACK_SUCCEEDED would add minutes to a verdict that cannot change.
 */
export const OPERATION_VERDICTS = {
  PENDING: { terminal: false, ok: false, why: 'App Runner has accepted the rollout and not started it yet' },
  IN_PROGRESS: { terminal: false, ok: false, why: 'the rollout is running' },
  SUCCEEDED: { terminal: true, ok: true, why: 'the rollout completed' },
  FAILED: {
    terminal: true,
    ok: false,
    why: 'the rollout FAILED — production is still serving the previous commit',
  },
  ROLLBACK_IN_PROGRESS: {
    terminal: true,
    ok: false,
    why: 'the rollout failed its health check and App Runner is REVERTING — the new version will not serve',
  },
  ROLLBACK_SUCCEEDED: {
    terminal: true,
    ok: false,
    why:
      'the rollout was REVERTED and the revert succeeded — production is serving the PREVIOUS commit. ' +
      'This is the 2026-09-21 shape: everything else in the pipeline is green and the merge did not ship.',
  },
  ROLLBACK_FAILED: {
    terminal: true,
    ok: false,
    why: 'the rollout failed AND the revert failed — the service needs a human, not a re-run',
  },
}

/**
 * Every ServiceStatus App Runner documents. Only RUNNING is serving.
 * OPERATION_IN_PROGRESS is the one transient worth waiting on: the service
 * reports it for a few seconds either side of an operation settling.
 */
export const SERVICE_VERDICTS = {
  RUNNING: { settled: true, ok: true, why: 'the service is serving' },
  OPERATION_IN_PROGRESS: { settled: false, ok: false, why: 'the service is still settling' },
  PAUSED: { settled: true, ok: false, why: 'the service is PAUSED — it is serving nothing' },
  CREATE_FAILED: { settled: true, ok: false, why: 'the service is in CREATE_FAILED' },
  DELETE_FAILED: { settled: true, ok: false, why: 'the service is in DELETE_FAILED' },
  DELETED: { settled: true, ok: false, why: 'the service has been DELETED' },
}

/**
 * Looked up by EXACT KEY, never by substring or prefix. `ROLLBACK_SUCCEEDED`
 * contains `SUCCEEDED`, and the whole point of this check is that those two are
 * opposite answers.
 */
export function classifyOperation(status) {
  const known = Object.prototype.hasOwnProperty.call(OPERATION_VERDICTS, status) ? OPERATION_VERDICTS[status] : null
  if (known) return { status, unknown: false, ...known }
  return {
    status,
    unknown: true,
    terminal: true,
    ok: false,
    why:
      `App Runner reported an operation status this check does not know (${String(status)}). ` +
      'An unrecognised status is not evidence that the new version is serving, so it is a failure. ' +
      'If AWS has added a status, add it to OPERATION_VERDICTS in scripts/rollout-check.mjs.',
  }
}

export function classifyService(status) {
  const known = Object.prototype.hasOwnProperty.call(SERVICE_VERDICTS, status) ? SERVICE_VERDICTS[status] : null
  if (known) return { status, unknown: false, ...known }
  return {
    status,
    unknown: true,
    settled: true,
    ok: false,
    why:
      `App Runner reported a service status this check does not know (${String(status)}). ` +
      'Add it to SERVICE_VERDICTS in scripts/rollout-check.mjs.',
  }
}

/**
 * AN AUTHORIZATION ERROR IS THE ONLY THING THAT MAY DEGRADE THIS CHECK, so this
 * is deliberately narrow. Everything else — a throttle, an endpoint that will
 * not connect, a service that does not exist, a malformed ARN — is a hard
 * failure, because each of those means the rollout is unverified for a reason
 * somebody in CI can and should fix.
 *
 * `(?![\w$])` rather than `\b`: a `\b` after an identifier matches inside
 * `AccessDeniedExceptionV2`, and a prefix is not a name (dreamcrm-conventions
 * §2d, the `_V2` family).
 */
export function isAuthorizationError(text) {
  if (typeof text !== 'string') return false
  return (
    /AccessDenied(?:Exception)?(?![\w$])/.test(text) ||
    /UnauthorizedException(?![\w$])/.test(text) ||
    /is not authorized to perform/.test(text)
  )
}

/** Transient AWS conditions worth one more attempt. Never a reason to degrade. */
export function isRetryableAwsError(text) {
  if (typeof text !== 'string') return false
  if (isAuthorizationError(text)) return false
  return (
    /ThrottlingException(?![\w$])/.test(text) ||
    /TooManyRequestsException(?![\w$])/.test(text) ||
    /RequestTimeout(?:Exception)?(?![\w$])/.test(text) ||
    /ServiceUnavailable(?:Exception)?(?![\w$])/.test(text) ||
    /InternalFailure(?![\w$])/.test(text) ||
    /InternalServerErrorException(?![\w$])/.test(text) ||
    /EndpointConnectionError(?![\w$])/.test(text) ||
    /Could not connect to the endpoint URL/.test(text)
  )
}

/**
 * Milliseconds for an App Runner timestamp. `--output json` gives ISO-8601; the
 * SDK shape gives epoch seconds as a number. Anything else is `null`, which the
 * selector treats as "cannot be shown to be ours" and skips.
 */
export function toMillis(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // App Runner's own JSON renders these as epoch SECONDS.
    return value > 1e11 ? value : value * 1000
  }
  if (typeof value !== 'string' || value.trim() === '') return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * THE BASELINE, AND WHY A MISSING ONE IS FATAL. Without it the newest
 * START_DEPLOYMENT on the service passes for this run's rollout — including one
 * that SUCCEEDED an hour ago, for a commit that is not this one. That is a
 * green tick with evidence attached to it, which is strictly worse than the
 * defect this file was written for. So this throws rather than defaulting.
 */
export function parseSince(raw) {
  const millis = toMillis(typeof raw === 'string' ? raw.trim() : raw)
  if (millis === null) {
    throw new Error(
      `ROLLOUT_SINCE is missing or unparseable (${JSON.stringify(raw)}). It is the timestamp taken ` +
        'immediately before `codebuild start-build`, and without it this check cannot tell this run\'s ' +
        'rollout from a previous one. Refusing to certify anything.',
    )
  }
  return millis
}

/**
 * The rollout this run is responsible for: the NEWEST START_DEPLOYMENT that
 * started at or after `sinceMs`.
 *
 * Newest rather than oldest because a service with auto-deploy on ECR push can
 * produce a second START_DEPLOYMENT for the same image, and the last one is the
 * one that decides what finally serves. The `deploy` job's `deploy-main`
 * concurrency group is what makes that safe: the next merge's rollout cannot
 * begin until this job has exited, so a newer operation here is still ours.
 */
export function selectRolloutOperation(operations, sinceMs) {
  if (!Number.isFinite(sinceMs)) throw new Error('selectRolloutOperation needs a numeric baseline')
  const candidates = []
  for (const op of Array.isArray(operations) ? operations : []) {
    if (!op || op.Type !== ROLLOUT_OPERATION_TYPE) continue
    if (typeof op.Id !== 'string' || op.Id === '') continue
    const startedMs = toMillis(op.StartedAt)
    if (startedMs === null || startedMs < sinceMs) continue
    candidates.push({ op, startedMs })
  }
  candidates.sort((a, b) => b.startedMs - a.startedMs)
  return candidates.length > 0 ? candidates[0].op : null
}

export function findOperationById(operations, id) {
  for (const op of Array.isArray(operations) ? operations : []) {
    if (op && op.Id === id) return op
  }
  return null
}

/**
 * A bounded, validated number of seconds; anything unusable takes the default.
 *
 * `Number('5m')` is NaN, every `now() >= NaN` is false, and a loop bounded by
 * one polls App Runner until the job's own ceiling — the trap
 * `scripts/migration-check.mjs` carries next door, and the reason this falls
 * back rather than trusting the value.
 *
 * NOTE THE CONTRAST WITH `parseSince`, which throws on exactly the same kind of
 * garbage. These are tuning knobs and the default is safe; the baseline is
 * EVIDENCE and has no safe default, because every value it could fall back to
 * certifies a rollout this run did not start.
 */
export function positiveSeconds(raw, fallback, cap) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback
  const value = Number(String(raw).trim())
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(value, cap)
}

export const OUTCOME = {
  served: 'served',
  notServed: 'not-served',
  degraded: 'degraded',
}

/**
 * One AWS CLI call returning parsed JSON, with the retry/degrade policy applied.
 *
 * Returns `{ ok: true, json }`, `{ ok: false, degraded: true, detail }` for an
 * authorization error, or `{ ok: false, degraded: false, detail }` for anything
 * else. It never throws for an AWS-side condition — the caller decides what a
 * failed call means at that point in the sequence.
 */
async function awsJson(args, { aws, sleep, attempts = DEFAULTS.awsAttempts, pollMs, log }) {
  let lastDetail = `aws ${args.join(' ')} produced no result`
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await aws(args)
    const stderr = String(result?.stderr ?? '')
    const stdout = String(result?.stdout ?? '')
    if (result?.status === 0) {
      try {
        return { ok: true, json: JSON.parse(stdout) }
      } catch {
        // A zero exit with unparseable output is a hard failure, never a shrug:
        // "we could not read the answer" is not "the rollout is fine".
        return {
          ok: false,
          degraded: false,
          detail: `aws ${args[0]} ${args[1]} returned output this check could not parse as JSON`,
        }
      }
    }
    const message = stderr.trim() || stdout.trim() || `exit ${String(result?.status)}`
    if (isAuthorizationError(message)) return { ok: false, degraded: true, detail: message }
    lastDetail = message
    if (!isRetryableAwsError(message) || attempt === attempts) break
    log(`transient AWS error (attempt ${attempt}/${attempts}), retrying: ${message}`)
    await sleep(pollMs)
  }
  return { ok: false, degraded: false, detail: lastDetail }
}

function degraded(detail) {
  return {
    outcome: OUTCOME.degraded,
    message:
      'rollout UNVERIFIED: the deploy role is missing the App Runner read grant, so this check could ' +
      'not look at the rollout. The image built and App Runner was asked to roll it out; whether it ' +
      'actually served is unknown. Grant apprunner:ListOperations, apprunner:ListServices and ' +
      'apprunner:DescribeService to the deploy role (DREAMCRM-65) and this check starts working with ' +
      'no code change.',
    detail,
  }
}

/**
 * The whole check, with every side effect injected so the shapes below can be
 * exercised without AWS: a rollout that serves, one that is reverted, one that
 * never appears, an older rollout that is not ours, and the missing grant.
 */
export async function verifyRollout({ aws, sleep, now = () => Date.now(), env = {}, log = () => {} }) {
  let sinceMs
  let timeoutMs
  let appearanceMs
  let pollMs
  try {
    sinceMs = parseSince(env.ROLLOUT_SINCE)
    timeoutMs = positiveSeconds(env.ROLLOUT_CHECK_TIMEOUT_SECONDS, DEFAULTS.timeoutSeconds, DEFAULTS.timeoutCapSeconds) * 1000
    appearanceMs =
      positiveSeconds(env.ROLLOUT_CHECK_APPEARANCE_TIMEOUT_SECONDS, DEFAULTS.appearanceSeconds, DEFAULTS.appearanceCapSeconds) * 1000
    pollMs = positiveSeconds(env.ROLLOUT_CHECK_POLL_SECONDS, DEFAULTS.pollSeconds, DEFAULTS.pollCapSeconds) * 1000
  } catch (error) {
    return { outcome: OUTCOME.notServed, message: error instanceof Error ? error.message : String(error) }
  }

  const region = String(env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? '').trim()
  const regionArgs = region ? ['--region', region] : []

  // ── 1. The service ARN ────────────────────────────────────────────────────
  let serviceArn = String(env.APP_RUNNER_SERVICE_ARN ?? '').trim()
  if (!serviceArn) {
    const serviceName = String(env.APP_RUNNER_SERVICE_NAME ?? '').trim() || DEFAULT_SERVICE_NAME
    const listed = await awsJson(['apprunner', 'list-services', ...regionArgs, '--output', 'json'], {
      aws,
      sleep,
      pollMs,
      log,
    })
    if (!listed.ok) {
      if (listed.degraded) return degraded(listed.detail)
      return {
        outcome: OUTCOME.notServed,
        message: `could not list App Runner services to find "${serviceName}": ${listed.detail}`,
      }
    }
    const match = (listed.json?.ServiceSummaryList ?? []).find((s) => s?.ServiceName === serviceName)
    if (!match?.ServiceArn) {
      return {
        outcome: OUTCOME.notServed,
        message:
          `no App Runner service named "${serviceName}" in ${region || 'the default region'}. Set ` +
          'APP_RUNNER_SERVICE_ARN on the step, or fix APP_RUNNER_SERVICE_NAME.',
      }
    }
    serviceArn = match.ServiceArn
  }
  log(`service: ${serviceArn}`)
  log(`looking for a ${ROLLOUT_OPERATION_TYPE} started at or after ${new Date(sinceMs).toISOString()}`)

  const listOperations = () =>
    awsJson(['apprunner', 'list-operations', '--service-arn', serviceArn, '--max-results', '20', ...regionArgs, '--output', 'json'], {
      aws,
      sleep,
      pollMs,
      log,
    })

  // ── 2. Find OUR rollout, and latch it by Id ───────────────────────────────
  const appearanceDeadline = now() + appearanceMs
  let operation = null
  for (;;) {
    const listed = await listOperations()
    if (!listed.ok) {
      if (listed.degraded) return degraded(listed.detail)
      return { outcome: OUTCOME.notServed, message: `could not read the App Runner operation log: ${listed.detail}` }
    }
    operation = selectRolloutOperation(listed.json?.OperationSummaryList, sinceMs)
    if (operation) break
    if (now() >= appearanceDeadline) {
      return {
        outcome: OUTCOME.notServed,
        message:
          `CodeBuild reported SUCCEEDED but no ${ROLLOUT_OPERATION_TYPE} started on ${serviceArn} after ` +
          `${new Date(sinceMs).toISOString()} (waited ${Math.round(appearanceMs / 1000)}s). The buildspec's ` +
          'POST_BUILD start-deployment either did not run or did not take, so this commit is NOT serving.',
      }
    }
    await sleep(pollMs)
  }

  const operationId = operation.Id
  log(`rollout ${operationId} started ${String(operation.StartedAt)}`)

  // ── 3. Poll it to a terminal status ───────────────────────────────────────
  const deadline = now() + timeoutMs
  let verdict = classifyOperation(operation.Status)
  while (!verdict.terminal) {
    if (now() >= deadline) {
      return {
        outcome: OUTCOME.notServed,
        message:
          `rollout ${operationId} was still ${verdict.status} after ${Math.round(timeoutMs / 1000)}s. ` +
          'Unfinished is not served — check the App Runner service event log.',
        operationId,
      }
    }
    await sleep(pollMs)
    const listed = await listOperations()
    if (!listed.ok) {
      if (listed.degraded) return degraded(listed.detail)
      return { outcome: OUTCOME.notServed, message: `could not read the App Runner operation log: ${listed.detail}`, operationId }
    }
    const fresh = findOperationById(listed.json?.OperationSummaryList, operationId)
    if (!fresh) {
      // The operation log holds the last 20 operations. Ours falling off it
      // mid-poll means we can no longer answer, and "cannot answer" is not
      // "served".
      return {
        outcome: OUTCOME.notServed,
        message: `rollout ${operationId} disappeared from the App Runner operation log before it finished`,
        operationId,
      }
    }
    verdict = classifyOperation(fresh.Status)
    log(`rollout status: ${verdict.status}`)
  }

  if (!verdict.ok) {
    return {
      outcome: OUTCOME.notServed,
      message: `rollout ${operationId} ended ${verdict.status} — ${verdict.why}`,
      operationId,
    }
  }

  // ── 4. "SUCCEEDED" is not "serving" until the service says RUNNING ────────
  for (;;) {
    const described = await awsJson(['apprunner', 'describe-service', '--service-arn', serviceArn, ...regionArgs, '--output', 'json'], {
      aws,
      sleep,
      pollMs,
      log,
    })
    if (!described.ok) {
      if (described.degraded) return degraded(described.detail)
      return { outcome: OUTCOME.notServed, message: `could not describe the App Runner service: ${described.detail}`, operationId }
    }
    const service = classifyService(described.json?.Service?.Status)
    if (service.ok) {
      return {
        outcome: OUTCOME.served,
        message: `rollout ${operationId} SUCCEEDED and the service is RUNNING — this commit is serving`,
        operationId,
      }
    }
    if (service.settled) {
      return {
        outcome: OUTCOME.notServed,
        message: `rollout ${operationId} SUCCEEDED but the service is ${service.status} — ${service.why}`,
        operationId,
      }
    }
    if (now() >= deadline) {
      return {
        outcome: OUTCOME.notServed,
        message: `rollout ${operationId} SUCCEEDED but the service never left ${service.status}`,
        operationId,
      }
    }
    await sleep(pollMs)
  }
}

export function renderSummary(result) {
  if (result.outcome === OUTCOME.served) {
    return `### Rollout verified\n\n${result.message}\n`
  }
  if (result.outcome === OUTCOME.degraded) {
    return `### Rollout UNVERIFIED\n\n${result.message}\n\nAWS said: \`${String(result.detail ?? '').slice(0, 500)}\`\n`
  }
  return `### Rollout did NOT serve\n\n${result.message}\n`
}

function realAws(args) {
  const result = spawnSync('aws', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.error) return { status: 1, stdout: '', stderr: String(result.error.message) }
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const result = await verifyRollout({
    aws: realAws,
    sleep: realSleep,
    env: process.env,
    log: (line) => console.log(`[${CHECK_ID}] ${line}`),
  })

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, renderSummary(result))
    } catch {
      // A summary that cannot be written must not decide the verdict.
    }
  }

  if (result.outcome === OUTCOME.served) {
    console.log(`[${CHECK_ID}] ${result.message}`)
    process.exit(EXIT_CODE.ok)
  }
  if (result.outcome === OUTCOME.degraded) {
    console.log(`::warning title=Rollout unverified::${result.message}`)
    console.log(`[${CHECK_ID}] AWS said: ${String(result.detail ?? '')}`)
    process.exit(EXIT_CODE.ok)
  }
  console.log(`::error title=The deploy did not serve::${result.message}`)
  process.exit(EXIT_CODE.failed)
}

// `import.meta.main` is Node 24+; `pathToFileURL` is what works on 22 too, and
// unlike a hand-built `file://` string it is correct on Windows, where the
// guard test imports this module.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.log(`::error title=The rollout check itself failed::${error instanceof Error ? error.message : String(error)}`)
    process.exit(EXIT_CODE.failed)
  })
}
