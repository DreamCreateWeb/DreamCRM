import 'server-only'
import { and, asc, eq, inArray } from 'drizzle-orm'
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

async function insertProspects(results: NppesOrgResult[]): Promise<number> {
  if (results.length === 0) return 0
  let imported = 0
  for (const r of results) {
    // Two-layer dedupe: NPI unique catches re-discovery; the phone+address
    // hash collapses multi-NPI practices sharing one front desk. Both are
    // ON CONFLICT DO NOTHING — first writer wins, re-runs are no-ops.
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
async function splitTask(task: { id: string; state: string; zipPrefix: string }): Promise<number> {
  const children = Array.from({ length: 10 }, (_, i) => ({
    id: newId('pdt'),
    state: task.state,
    zipPrefix: `${task.zipPrefix}${i}`,
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
      let finished = false

      for (let page = 0; page < PAGES_PER_TASK; page++) {
        const { results, resultCount } = await searchNppesOrgs({
          state: task.state,
          zipPrefix: task.zipPrefix,
          skip,
        })
        found += resultCount
        imported += await insertProspects(results)
        skip += NPPES_PAGE_SIZE

        if (resultCount < NPPES_PAGE_SIZE) {
          finished = true // short page = the well is dry
          break
        }
        if (skip > NPPES_MAX_SKIP) {
          // Can't page further — split into zip5-prefix children (only
          // meaningful for zip3 tasks; a capped child just stops, which at
          // 1,400 dental orgs per zip4 prefix would be unheard of).
          if (task.zipPrefix.length === 3) out.split += await splitTask(task)
          finished = true
          break
        }
      }

      await db
        .update(schema.prospectDiscoveryTask)
        .set({
          skip,
          found,
          imported,
          status: finished ? 'done' : 'in_progress',
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

  // Errored tasks re-queue after the healthy backlog drains.
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
  }

  return out
}
