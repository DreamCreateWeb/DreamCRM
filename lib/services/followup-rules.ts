import 'server-only'
import { randomBytes } from 'crypto'
import { and, eq, gte, inArray, lte } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { listPatients } from '@/lib/services/patients'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'
import { clinicDayKey } from '@/lib/format-datetime'
import { addDaysYmd } from '@/lib/types/followups'
import {
  resolveFollowupRules,
  type FollowupRuleConfig,
  type FollowupRuleId,
} from '@/lib/types/followup-rules'

/**
 * Smart follow-up rules — auto-create patient follow-ups from live conditions
 * (an outstanding balance, an overdue recall, an unconfirmed visit), so the
 * clinic's call list builds itself. Each rule is opt-in per clinic and
 * idempotent via patient_followup.rule_key (monthly-keyed for the recurring
 * ones, per-appointment for confirmations) so the engine can run hourly without
 * ever creating a duplicate. Demo clinics are skipped (their follow-ups are
 * hand-curated).
 */

function newId(): string {
  return `pfu_${randomBytes(10).toString('hex')}`
}
function ym(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
function money(cents: number): string {
  return `$${Math.round(cents / 100)}`
}

export async function getFollowupRuleConfig(organizationId: string): Promise<FollowupRuleConfig> {
  const [row] = await db
    .select({ cfg: schema.clinicProfile.followupAutomation })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  return resolveFollowupRules(row?.cfg)
}

export async function setFollowupRule(
  organizationId: string,
  rule: FollowupRuleId,
  enabled: boolean,
): Promise<FollowupRuleConfig> {
  const current = await getFollowupRuleConfig(organizationId)
  const next: FollowupRuleConfig = { ...current, [rule]: enabled }
  await db
    .update(schema.clinicProfile)
    .set({ followupAutomation: next, updatedAt: new Date() })
    .where(eq(schema.clinicProfile.organizationId, organizationId))
  return next
}

interface Candidate {
  ruleKey: string
  patientId: string
  title: string
  dueDate: string
}

export interface FollowupRulesResult {
  scanned: number
  created: number
  errors: Array<{ organizationId: string; error: string }>
}

/**
 * Build the candidate follow-ups for one org from its enabled rules. Exported
 * (without the persistence) so the logic is unit-testable.
 */
export async function buildRuleCandidates(
  organizationId: string,
  config: FollowupRuleConfig,
  now: Date = new Date(),
): Promise<Candidate[]> {
  const candidates: Candidate[] = []
  const period = ym(now)
  // This runs in cron context (UTC server) — due dates and date labels must
  // anchor to the CLINIC's calendar, or an evening run stamps "today"/"Wed"
  // one day off for US clinics.
  const timeZone = await getClinicTimeZone(organizationId)
  const todayKey = clinicDayKey(now, timeZone)

  if (config.balance || config.recall) {
    const patients = await listPatients(organizationId)
    for (const p of patients) {
      if (config.balance && (p.outstandingBalanceCents ?? 0) > 0) {
        candidates.push({
          ruleKey: `balance:${p.id}:${period}`,
          patientId: p.id,
          title: `Collect ${money(p.outstandingBalanceCents!)} balance from ${p.fullName}`,
          dueDate: addDaysYmd(todayKey, 2),
        })
      }
      if (config.recall && p.recallStatus === 'overdue') {
        candidates.push({
          ruleKey: `recall:${p.id}:${period}`,
          patientId: p.id,
          title: `Reach out to ${p.fullName} — overdue for a checkup`,
          dueDate: addDaysYmd(todayKey, 3),
        })
      }
    }
  }

  if (config.unconfirmed) {
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
    const rows = await db
      .select({
        id: schema.appointment.id,
        patientId: schema.appointment.patientId,
        firstName: schema.patient.firstName,
        lastName: schema.patient.lastName,
        type: schema.appointment.type,
        startTime: schema.appointment.startTime,
      })
      .from(schema.appointment)
      .innerJoin(schema.patient, eq(schema.patient.id, schema.appointment.patientId))
      .where(
        and(
          eq(schema.appointment.organizationId, organizationId),
          eq(schema.appointment.status, 'scheduled'),
          gte(schema.appointment.startTime, now),
          lte(schema.appointment.startTime, in48h),
        ),
      )
    for (const a of rows) {
      const dateLabel = a.startTime.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', timeZone,
      })
      candidates.push({
        ruleKey: `confirm:${a.id}`,
        patientId: a.patientId,
        title: `Confirm ${a.firstName} ${a.lastName}'s ${a.type.replace(/_/g, ' ')} (${dateLabel})`,
        dueDate: todayKey,
      })
    }
  }

  return candidates
}

/** Insert the candidates that don't already exist (by org + ruleKey). Returns
 *  how many were newly created. */
async function persistCandidates(organizationId: string, candidates: Candidate[]): Promise<number> {
  if (candidates.length === 0) return 0
  const keys = candidates.map((c) => c.ruleKey)
  const existing = await db
    .select({ ruleKey: schema.patientFollowup.ruleKey })
    .from(schema.patientFollowup)
    .where(
      and(
        eq(schema.patientFollowup.organizationId, organizationId),
        inArray(schema.patientFollowup.ruleKey, keys),
      ),
    )
  const have = new Set(existing.map((r) => r.ruleKey))
  const toCreate = candidates.filter((c) => !have.has(c.ruleKey))
  if (toCreate.length === 0) return 0
  await db.insert(schema.patientFollowup).values(
    toCreate.map((c) => ({
      id: newId(),
      organizationId,
      patientId: c.patientId,
      title: c.title,
      dueDate: c.dueDate,
      status: 'open',
      createdBy: null,
      ruleKey: c.ruleKey,
    })),
  )
  return toCreate.length
}

/**
 * Sweep every clinic with at least one rule enabled and create any due
 * follow-ups. Idempotent; demo clinics skipped. Best-effort per org (one org's
 * failure doesn't abort the sweep).
 */
export async function runFollowupRules(opts?: { now?: Date }): Promise<FollowupRulesResult> {
  const now = opts?.now ?? new Date()
  const result: FollowupRulesResult = {
    scanned: 0,
    created: 0,
    errors: [],
  }

  const clinics = await db
    .select({
      organizationId: schema.clinicProfile.organizationId,
      cfg: schema.clinicProfile.followupAutomation,
      isDemo: schema.organization.isDemo,
    })
    .from(schema.clinicProfile)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.clinicProfile.organizationId))

  for (const clinic of clinics) {
    if (!clinic.organizationId || clinic.isDemo) continue
    const config = resolveFollowupRules(clinic.cfg)
    if (!config.balance && !config.recall && !config.unconfirmed) continue
    result.scanned++
    try {
      const candidates = await buildRuleCandidates(clinic.organizationId, config, now)
      result.created += await persistCandidates(clinic.organizationId, candidates)
    } catch (err) {
      result.errors.push({
        organizationId: clinic.organizationId,
        error: err instanceof Error ? err.message : 'unknown',
      })
    }
  }
  return result
}
