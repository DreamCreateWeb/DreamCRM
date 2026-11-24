import 'server-only'
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  INDEXNOW_KEY_PATH,
  INDEXNOW_MAX_URLS,
  buildIndexNowBody,
  classifyIndexNowStatus,
  indexNowDelivered,
  indexNowTarget,
  isSendablePath,
  parseIndexNowState,
  planIndexNow,
  type IndexNowMap,
  type IndexNowRun,
  type IndexNowRunOutcome,
  type IndexNowState,
} from '@/lib/indexnow'
import { publicPages } from '@/lib/marketing/public-pages'
import { getMarketingPosts } from '@/lib/services/marketing-blog'
import { readPlatformConfig, readPlatformConfigStrict, writePlatformConfig } from '@/lib/services/platform-config'

/**
 * THE INDEXNOW PASS — once an hour, tell the search engines which public
 * pages of the marketing site were added, changed or removed since they were
 * last told. The protocol, the key and the reasons are in lib/indexnow.ts.
 *
 * IT IS A RECONCILE, NOT AN EVENT. Nothing in the blog editor, the publish
 * button or the deploy calls an engine. The pass compares two maps — what is
 * public now (path → content key, from the one list the sitemap also reads)
 * and what was last announced (kept in platform_config) — and sends the
 * difference. That shape is what makes the protocol's rules hold without
 * anyone remembering them:
 *
 *  - an UNCHANGED page is in neither map's difference, so it is never sent
 *    again — not on a deploy, not on a restart, not on a retry;
 *  - an editor that autosaves forty times produces ONE notice, at the next
 *    pass, because only the final content key is compared;
 *  - a page that stops being served is announced one last time (the engines
 *    ask for "deleted" too) and then forgotten;
 *  - the FIRST pass finds nothing on record and names every page once. The
 *    protocol allows that only when the whole site was recently updated,
 *    which is the change this shipped with (see lib/indexnow.ts) — and it is
 *    the introduction a site Bing had never indexed needs.
 *
 * THE THREE WAYS IT REFUSES TO GUESS.
 *
 *  1. If it cannot read the posts, or cannot read what was announced, it
 *     sends NOTHING and changes nothing. A failed posts read treated as "no
 *     posts" would announce every article as deleted; a failed state read
 *     treated as "nothing announced" would re-send the whole site. Both
 *     reads are the strict kind for that reason.
 *  2. A page is only remembered as announced when the engines took the
 *     notice (200 or 202). A refusal leaves the record untouched, so the next
 *     pass tries the same difference again.
 *  3. Before sending, it asks our own site for the key file. An engine that
 *     cannot read that file discards the notice without telling us, and we
 *     would have recorded every page as announced.
 *
 * Inert anywhere that is not the public site (`indexNowTarget`): local
 * development, the test suites and the browser harness make no request and
 * touch no row.
 */

/** The top-level key of platform_config this subsystem owns, passed WHOLE. */
export const INDEXNOW_CONFIG_KEY = 'indexNow'

/** How long this process must have been up before the FIRST notice ever
 *  sent. A rolling deploy takes a few minutes; ten covers it. Later notices
 *  do not wait — by then every running version serves the key file. */
export const FIRST_NOTICE_MIN_UPTIME_SECONDS = 600

export interface IndexNowPassResult {
  status: 'inert' | 'aborted' | 'nothing_to_send' | 'held' | 'delivered' | 'refused'
  outcome?: IndexNowRunOutcome
  httpStatus?: number | null
  changed: number
  removed: number
  /** Present when the pass stopped before sending. */
  reason?: string
}

export interface IndexNowPassOptions {
  now?: Date
  /** Defaults to `NEXT_PUBLIC_APP_URL`. Pass `null` to force inert. */
  appUrl?: string | null
  fetchImpl?: typeof fetch
  /** Seconds this process has been running. Defaults to `process.uptime()`. */
  uptimeSeconds?: number
}

/** What is public right now. THROWS if the posts cannot be read — see (1). */
export async function desiredIndexNowMap(): Promise<IndexNowMap> {
  const posts = await getMarketingPosts()
  const map: IndexNowMap = {}
  for (const page of publicPages(posts)) map[page.path] = page.contentKey
  return map
}

/** The stored state, floored to "nothing recorded" — for DISPLAY only. The
 *  pass itself uses the strict read. */
export async function getIndexNowState(): Promise<IndexNowState> {
  return parseIndexNowState((await readPlatformConfig())[INDEXNOW_CONFIG_KEY])
}

async function writeState(state: IndexNowState): Promise<void> {
  await writePlatformConfig({ [INDEXNOW_CONFIG_KEY]: state })
}

/** Does our own site hand back the key file? */
async function keyFileIsServed(origin: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${origin}${INDEXNOW_KEY_PATH}`, {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status !== 200) return false
    return (await res.text()).trim() === INDEXNOW_KEY
  } catch {
    return false
  }
}

export async function reconcileIndexNow(opts: IndexNowPassOptions = {}): Promise<IndexNowPassResult> {
  const target = indexNowTarget(opts.appUrl !== undefined ? opts.appUrl : process.env.NEXT_PUBLIC_APP_URL)
  if (!target) return { status: 'inert', changed: 0, removed: 0 }

  const fetchImpl = opts.fetchImpl ?? fetch
  const at = (opts.now ?? new Date()).toISOString()

  let desired: IndexNowMap
  let state: IndexNowState
  try {
    desired = await desiredIndexNowMap()
    state = parseIndexNowState((await readPlatformConfigStrict())[INDEXNOW_CONFIG_KEY])
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown'
    console.error('[indexnow] could not read what is public or what was announced — nothing sent', err)
    return { status: 'aborted', changed: 0, removed: 0, reason }
  }

  const plan = planIndexNow(desired, state.submitted)
  // One POST carries at most 10,000 URLs; anything beyond that simply stays
  // in the difference and goes at the next pass.
  const sendable = [...plan.changed, ...plan.removed].filter(isSendablePath).slice(0, INDEXNOW_MAX_URLS)
  const counts = { changed: plan.changed.length, removed: plan.removed.length }

  const finish = async (
    status: IndexNowPassResult['status'],
    run: IndexNowRun,
    next: Pick<IndexNowState, 'submitted' | 'lastDelivered'>,
    reason?: string,
  ): Promise<IndexNowPassResult> => {
    await writeState({ submitted: next.submitted, lastRun: run, lastDelivered: next.lastDelivered })
    return {
      status,
      outcome: run.outcome,
      httpStatus: run.status,
      ...counts,
      ...(reason ? { reason } : {}),
    }
  }
  const unchanged = { submitted: state.submitted, lastDelivered: state.lastDelivered }

  if (sendable.length === 0) {
    return finish('nothing_to_send', { at, outcome: 'nothing_to_send', status: null, urls: 0 }, unchanged)
  }

  // The first notice ever waits for the rollout to finish (see the header of
  // IndexNowRunOutcome). Once one has landed, every running version serves
  // the key file and there is nothing to wait for.
  const uptime = opts.uptimeSeconds ?? process.uptime()
  if (!state.lastDelivered && uptime < FIRST_NOTICE_MIN_UPTIME_SECONDS) {
    return finish(
      'held',
      { at, outcome: 'waiting_for_rollout', status: null, urls: sendable.length },
      unchanged,
      'first notice held until this version has finished going live',
    )
  }

  if (!(await keyFileIsServed(target.origin, fetchImpl))) {
    console.error(`[indexnow] ${target.origin}${INDEXNOW_KEY_PATH} did not return the key — nothing sent`)
    return finish(
      'refused',
      { at, outcome: 'key_not_served', status: null, urls: sendable.length },
      unchanged,
      'the site did not serve its own key file',
    )
  }

  let httpStatus = 0
  try {
    const res = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(buildIndexNowBody(target, sendable)),
      signal: AbortSignal.timeout(15_000),
    })
    httpStatus = res.status
  } catch (err) {
    console.error('[indexnow] the notice could not be sent', err)
    httpStatus = 0
  }

  const outcome = classifyIndexNowStatus(httpStatus)
  const run: IndexNowRun = { at, outcome, status: httpStatus, urls: sendable.length }

  if (!indexNowDelivered(outcome)) {
    console.error(`[indexnow] notice for ${sendable.length} URL(s) was not taken: ${outcome} (HTTP ${httpStatus})`)
    return finish('refused', run, unchanged)
  }

  // Remember exactly what was sent, and nothing that was not.
  const submitted: IndexNowMap = { ...state.submitted }
  for (const path of sendable) {
    if (path in desired) submitted[path] = desired[path]
    else delete submitted[path]
  }
  return finish('delivered', run, { submitted, lastDelivered: run })
}
