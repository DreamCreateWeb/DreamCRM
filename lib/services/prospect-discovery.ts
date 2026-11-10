import 'server-only'
import { and, asc, eq, inArray, lt, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import {
  searchNppesOrgs,
  prospectDedupeHash,
  NPPES_MAX_SKIP,
  NPPES_PAGE_SIZE,
  type NppesOrgResult,
} from '@/lib/nppes'
import { stateTimeZone } from '@/lib/types/us-geo'
import { findDuplicateGroups, type DedupeRow } from '@/lib/prospect-dedupe'
import type { ProspectingConfig } from '@/lib/types/prospecting'
import { getProspectingConfig } from './prospecting'

/**
 * NPPES discovery engine — works the state × zip3 task grid the settings
 * page seeds when a state is enabled. Each cron run claims a handful of
 * pending tasks and pages NPPES until the page comes back short or the
 * skip cap looms; a zip3 that would blow past NPPES's skip=1200 ceiling
 * splits into zip5 child tasks and finishes there.
 *
 * Everything is resumable: the task row carries the cursor (skip), a
 * failure marks the task 'error' with the message and the next run retries
 * it, and prospect inserts are ON CONFLICT DO NOTHING on the NPI unique.
 */

const TASKS_PER_RUN = 10
/** Stay well under App Runner request budgets: pages per task per run. */
const PAGES_PER_TASK = 6

export interface DiscoveryRunResult {
  tasksWorked: number
  found: number
  imported: number
  split: number
  errors: number
  skipped?: string
}

/**
 * THE MATCHER AT THE DOOR (P-03). The NPI unique and the dedupe hash only
 * catch an exact re-discovery; the matcher (lib/prospect-dedupe.ts) also
 * sees the same phone under a different name, the same name at the same
 * ZIP under a different suite — so a registry row that is a practice we
 * already hold never becomes a second row. Rows already in the table are
 * fetched by the batch's phones and by its ZIPs (two indexed reads a
 * page), then any candidate that groups with an existing row — or with an
 * earlier candidate in the same page — is dropped. Merged rows count as
 * existing: their practice is in the pipeline under the survivor.
 */
export async function filterAlreadyHeld(
  results: NppesOrgResult[],
  now: Date,
): Promise<{ fresh: NppesOrgResult[]; held: number }> {
  if (results.length === 0) return { fresh: [], held: 0 }
  const phones = Array.from(new Set(results.map((r) => r.phone).filter((v): v is string => Boolean(v))))
  const zips = Array.from(new Set(results.map((r) => r.postalCode).filter((v): v is string => Boolean(v))))
  const cols = {
    id: schema.prospect.id,
    name: schema.prospect.name,
    phone: schema.prospect.phone,
    googlePlaceId: schema.prospect.googlePlaceId,
    postalCode: schema.prospect.postalCode,
    qualityScore: schema.prospect.qualityScore,
    verifiedAt: schema.prospect.verifiedAt,
    createdAt: schema.prospect.createdAt,
  }
  const existing: DedupeRow[] = []
  if (phones.length > 0) {
    existing.push(...(await db.select(cols).from(schema.prospect).where(inArray(schema.prospect.phone, phones)).limit(2000)))
  }
  if (zips.length > 0) {
    const seen = new Set(existing.map((e) => e.id))
    const byZip = await db.select(cols).from(schema.prospect).where(inArray(schema.prospect.postalCode, zips)).limit(2000)
    for (const e of byZip) if (!seen.has(e.id)) existing.push(e)
  }
  const existingIds = new Set(existing.map((e) => e.id))
  const candidates: DedupeRow[] = results.map((r) => ({
    id: `nppes:${r.npiNumber}`,
    name: r.name,
    phone: r.phone,
    googlePlaceId: null,
    postalCode: r.postalCode,
    qualityScore: null,
    verifiedAt: null,
    createdAt: now,
  }))
  const drop = new Set<string>()
  for (const group of findDuplicateGroups([...existing, ...candidates])) {
    let kept = group.members.some((m) => existingIds.has(m.id))
    for (const m of group.members) {
      if (existingIds.has(m.id)) continue
      if (kept) drop.add(m.id)
      else kept = true // the first new practice in a group with no existing row enters
    }
  }
  const fresh = results.filter((r) => !drop.has(`nppes:${r.npiNumber}`))
  return { fresh, held: results.length - fresh.length }
}

async function insertProspects(results: NppesOrgResult[], now: Date = new Date()): Promise<number> {
  if (results.length === 0) return 0
  const { fresh } = await filterAlreadyHeld(results, now)
  let imported = 0
  for (const r of fresh) {
    // Three-layer dedupe: NPI unique catches re-discovery; the phone+address
    // hash collapses multi-NPI practices sharing one front desk (both ON
    // CONFLICT DO NOTHING — first writer wins, re-runs are no-ops); the
    // matcher above caught everything softer before this insert.
    const inserted = await db
      .insert(schema.prospect)
      .values({
        id: newId('pros'),
        npiNumber: r.npiNumber,
        name: r.name,
        addressLine1: r.addressLine1,
        city: r.city,
        state: r.state,
        postalCode: r.postalCode,
        phone: r.phone,
        dedupeHash: prospectDedupeHash(r.phone, r.addressLine1, r.postalCode),
        taxonomyCode: r.taxonomyCode,
        authorizedOfficialName: r.authorizedOfficialName,
        authorizedOfficialTitle: r.authorizedOfficialTitle,
        timezone: stateTimeZone(r.state),
        status: 'discovered',
      })
      .onConflictDoNothing()
      .returning({ id: schema.prospect.id })
    imported += inserted.length
  }
  return imported
}

/** Split a capped zip3 task into its ten zip5-prefix children (e.g. '303' →
 *  '3030x' tasks are still prefixes: '30300'…'30309' would be full zip5s, so
 *  we use 4-digit prefixes '3030'…'3039' — NPPES wildcards allow any ≥2-char
 *  prefix). */
async function splitTask(task: {
  id: string
  state: string
  zipPrefix: string
  entityPhase: string
}): Promise<number> {
  const children = Array.from({ length: 10 }, (_, i) => ({
    id: newId('pdt'),
    state: task.state,
    zipPrefix: `${task.zipPrefix}${i}`,
    // Children inherit the CURRENT phase — a zip3 split mid-org-pass gives
    // org children (which then run their own org→individual cycle); a split
    // during the individual pass gives individual children (that zip space
    // already finished its org pass at the parent level).
    entityPhase: task.entityPhase,
    status: 'pending' as const,
  }))
  await db.insert(schema.prospectDiscoveryTask).values(children).onConflictDoNothing()
  return children.length
}

export async function runDiscovery(opts?: { maxTasks?: number }): Promise<DiscoveryRunResult> {
  const config = await getProspectingConfig()
  if (config.killSwitch) {
    return { tasksWorked: 0, found: 0, imported: 0, split: 0, errors: 0, skipped: 'kill_switch' }
  }
  if (config.enabledStates.length === 0) {
    return { tasksWorked: 0, found: 0, imported: 0, split: 0, errors: 0, skipped: 'no_states' }
  }

  const tasks = await db
    .select()
    .from(schema.prospectDiscoveryTask)
    .where(
      and(
        inArray(schema.prospectDiscoveryTask.status, ['pending', 'in_progress']),
        inArray(schema.prospectDiscoveryTask.state, config.enabledStates),
      ),
    )
    .orderBy(asc(schema.prospectDiscoveryTask.updatedAt))
    .limit(opts?.maxTasks ?? TASKS_PER_RUN)

  const out: DiscoveryRunResult = { tasksWorked: 0, found: 0, imported: 0, split: 0, errors: 0 }

  for (const task of tasks) {
    out.tasksWorked++
    try {
      await db
        .update(schema.prospectDiscoveryTask)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(schema.prospectDiscoveryTask.id, task.id))

      let skip = task.skip
      let found = task.found
      let imported = task.imported
      let phaseExhausted = false // this phase's well is dry
      const enumerationType = task.entityPhase === 'individual' ? 'NPI-1' : 'NPI-2'

      for (let page = 0; page < PAGES_PER_TASK; page++) {
        const { results, resultCount } = await searchNppesOrgs({
          state: task.state,
          zipPrefix: task.zipPrefix,
          skip,
          enumerationType,
        })
        found += resultCount
        imported += await insertProspects(results, new Date())
        skip += NPPES_PAGE_SIZE

        if (resultCount < NPPES_PAGE_SIZE) {
          phaseExhausted = true // short page = this phase is dry
          break
        }
        if (skip > NPPES_MAX_SKIP) {
          // Can't page further — split into zip5-prefix children (only
          // meaningful for zip3 tasks; a capped child just stops, which at
          // 1,400 dental providers per zip4 prefix would be unheard of).
          if (task.zipPrefix.length === 3) out.split += await splitTask(task)
          phaseExhausted = true
          break
        }
      }

      // Phase transition: org exhausted → flip to the individual (solo
      // dentist) pass with a fresh cursor; individual exhausted → done.
      let nextPhase = task.entityPhase
      let nextStatus: 'in_progress' | 'done' = 'in_progress'
      let nextSkip = skip
      if (phaseExhausted) {
        if (task.entityPhase === 'org') {
          nextPhase = 'individual'
          nextSkip = 0
        } else {
          nextStatus = 'done'
        }
      }

      await db
        .update(schema.prospectDiscoveryTask)
        .set({
          skip: nextSkip,
          found,
          imported,
          entityPhase: nextPhase,
          status: nextStatus,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.prospectDiscoveryTask.id, task.id))
      out.found += found - task.found
      out.imported += imported - task.imported
    } catch (err) {
      out.errors++
      await db
        .update(schema.prospectDiscoveryTask)
        .set({
          status: 'error',
          error: err instanceof Error ? err.message.slice(0, 500) : 'unknown',
          updatedAt: new Date(),
        })
        .where(eq(schema.prospectDiscoveryTask.id, task.id))
    }
  }

  // Idle run (no workable tasks): re-queue errored tasks, and backfill the
  // solo-dentist pass on states discovered before NPI-1 existed — flip any
  // org-phase 'done' task back to a pending individual pass. Idempotent
  // (flipped rows are 'individual' and never re-match).
  if (out.tasksWorked === 0) {
    await db
      .update(schema.prospectDiscoveryTask)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(
        and(
          eq(schema.prospectDiscoveryTask.status, 'error'),
          inArray(schema.prospectDiscoveryTask.state, config.enabledStates),
        ),
      )
    await db
      .update(schema.prospectDiscoveryTask)
      .set({ status: 'pending', entityPhase: 'individual', skip: 0, updatedAt: new Date() })
      .where(
        and(
          eq(schema.prospectDiscoveryTask.status, 'done'),
          eq(schema.prospectDiscoveryTask.entityPhase, 'org'),
          inArray(schema.prospectDiscoveryTask.state, config.enabledStates),
        ),
      )
  }

  return out
}

// ── The discovery REFRESH (P-03) ────────────────────────────────────────────

/** NPPES requests one refresh may spend — the same politeness as P-01's
 *  verification cap. A zip3's two phases at 200 a page fit comfortably. */
export const REFRESH_NPPES_PER_RUN = 50

export interface TerritoryRefreshResult {
  taskId: string
  state: string
  zipPrefix: string
  found: number
  imported: number
  requests: number
  /** True when the request cap stopped the sweep before NPPES ran dry —
   *  the next refresh of this territory starts over and may finish. */
  capped: boolean
}

/** The stamp a territory is ordered and aged by: its last refresh, else
 *  the end of its first sweep. Exported for the boundary test. */
export function territorySweptAtSql() {
  return sql`COALESCE(${schema.prospectDiscoveryTask.lastRefreshedAt}, ${schema.prospectDiscoveryTask.updatedAt})`
}

/**
 * Re-sweep ONE finished territory whose last sweep is older than
 * `config.hygiene.discoveryRefreshDays`: the same state × zip prefix, both
 * entity phases from skip 0, every page through the same door as
 * discovery — so only NEW NPIs enter (the NPI unique, the dedupe hash and
 * the matcher all stand). Stamps `last_refreshed_at`; the oldest-swept
 * territory goes first, so every territory gets its turn.
 */
export async function refreshStaleTerritory(opts: {
  now?: Date
  config?: ProspectingConfig
  nppesBudget?: number
}): Promise<TerritoryRefreshResult | null> {
  const now = opts.now ?? new Date()
  const config = opts.config ?? (await getProspectingConfig())
  if (config.killSwitch || config.enabledStates.length === 0) return null
  const cutoff = new Date(now.getTime() - config.hygiene.discoveryRefreshDays * 24 * 60 * 60 * 1000)
  const sweptAt = territorySweptAtSql()
  const [task] = await db
    .select()
    .from(schema.prospectDiscoveryTask)
    .where(
      and(
        eq(schema.prospectDiscoveryTask.status, 'done'),
        inArray(schema.prospectDiscoveryTask.state, config.enabledStates),
        lt(sweptAt, cutoff),
      ),
    )
    .orderBy(asc(sweptAt))
    .limit(1)
  if (!task) return null

  const budget = opts.nppesBudget ?? REFRESH_NPPES_PER_RUN
  let requests = 0
  let found = 0
  let imported = 0
  let capped = false
  for (const enumerationType of ['NPI-2', 'NPI-1'] as const) {
    let skip = 0
    for (;;) {
      if (requests >= budget) {
        capped = true
        break
      }
      requests++
      const { results, resultCount } = await searchNppesOrgs({
        state: task.state,
        zipPrefix: task.zipPrefix,
        skip,
        enumerationType,
      })
      found += resultCount
      imported += await insertProspects(results, now)
      skip += NPPES_PAGE_SIZE
      if (resultCount < NPPES_PAGE_SIZE || skip > NPPES_MAX_SKIP) break
    }
    if (capped) break
  }
  await db
    .update(schema.prospectDiscoveryTask)
    .set({
      lastRefreshedAt: now,
      found: task.found + found,
      imported: task.imported + imported,
      error: null,
      updatedAt: now,
    })
    .where(eq(schema.prospectDiscoveryTask.id, task.id))
  return { taskId: task.id, state: task.state, zipPrefix: task.zipPrefix, found, imported, requests, capped }
}
