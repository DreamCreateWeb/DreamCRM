import 'server-only'
import { and, eq, gte, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/**
 * The PMS API meter + circuit breaker (onboarding overhaul §2.7). NexHealth
 * charges $0.10/call past the free tier, so this is spend control, not
 * telemetry garnish: every outbound call increments the (org, day) counter
 * BEFORE the request goes out (a crashed run can never under-report), and
 * the breaker refuses further calls for an org whose day is over budget —
 * the sync fails LOUDLY (the cron's failure path alerts + the Guardian
 * sees a broken engine) instead of the bill saying it quietly.
 *
 * The default budget is sized to stop RUNAWAYS, not shave pennies: normal
 * tuned operation is ~3 calls per delta run (~36/day at the 2h cadence);
 * a stuck pagination loop is hundreds. At 60/day the absolute worst month
 * is ~1,800 calls ≈ $180 at list — bounded, visible, and only past the
 * 30k/mo free pool (which absorbs ~27 practices of steady-state traffic).
 * Webhooks are the planned real fix at scale. Override per instance via env.
 *
 * SANDBOX calls are metered (the counters are how we tune) but never
 * budget-limited — they're free, and the demo binding is the test bed.
 */

export const DEFAULT_DAILY_CALL_BUDGET = 60

export function dailyCallBudget(): number {
  const v = Number.parseInt(process.env.NEXHEALTH_DAILY_CALL_BUDGET ?? '', 10)
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_DAILY_CALL_BUDGET
}

export class PmsApiBudgetExceededError extends Error {
  constructor(orgId: string, calls: number, budget: number) {
    super(
      `PMS API budget reached for today (${calls}/${budget} calls) — sync paused until tomorrow to protect the bill. If this keeps happening, something is looping.`,
    )
    this.name = 'PmsApiBudgetExceededError'
  }
}

function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Count one outbound call. Never throws — metering must not break the
 *  request it measures (the breaker is the enforcement point, not this). */
export async function recordPmsApiCall(organizationId: string, now: Date = new Date()): Promise<void> {
  try {
    const day = utcDay(now)
    await db
      .insert(schema.pmsApiUsage)
      .values({ id: `pau_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`, organizationId, day, calls: 1 })
      .onConflictDoUpdate({
        target: [schema.pmsApiUsage.organizationId, schema.pmsApiUsage.day],
        set: { calls: sql`${schema.pmsApiUsage.calls} + 1`, updatedAt: new Date() },
      })
  } catch (e) {
    console.error('[pms-api-meter] count failed (call proceeds):', e)
  }
}

export async function getTodayCalls(organizationId: string, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ calls: schema.pmsApiUsage.calls })
    .from(schema.pmsApiUsage)
    .where(and(eq(schema.pmsApiUsage.organizationId, organizationId), eq(schema.pmsApiUsage.day, utcDay(now))))
    .limit(1)
  return row?.calls ?? 0
}

/** Calendar-month total (UTC) — the number the platform bind card shows. */
export async function getMonthCalls(organizationId: string, now: Date = new Date()): Promise<number> {
  const monthStart = `${now.toISOString().slice(0, 7)}-01`
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.pmsApiUsage.calls}), 0)` })
    .from(schema.pmsApiUsage)
    .where(and(eq(schema.pmsApiUsage.organizationId, organizationId), gte(schema.pmsApiUsage.day, monthStart)))
  return Number(row?.total ?? 0)
}

/**
 * The breaker. Throws PmsApiBudgetExceededError when today's spend is at
 * budget. An UNREADABLE meter never blocks a sync (fail-open): the meter is
 * spend protection, and a database blip must not also take the sync down —
 * the per-run MAX_PAGES backstop still bounds the damage of one run.
 */
export async function assertPmsApiBudget(organizationId: string, now: Date = new Date()): Promise<void> {
  let calls: number
  try {
    calls = await getTodayCalls(organizationId, now)
  } catch (e) {
    console.error('[pms-api-meter] budget read failed (fail-open):', e)
    return
  }
  const budget = dailyCallBudget()
  if (calls >= budget) throw new PmsApiBudgetExceededError(organizationId, calls, budget)
}
