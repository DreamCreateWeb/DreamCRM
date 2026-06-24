import 'server-only'
import { and, desc, eq, gte } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/**
 * Retention attribution — the "proof" layer under the Recall & Outreach
 * operations. Answers "how many patients did our outreach actually bring back,
 * and what brought each one back?" by reading the `booked` campaign events we
 * already record (each ties a patient + the resulting appointment to the
 * campaign that triggered it). Honest: this is ONLY the patients a campaign
 * provably rebooked — not a guess at organic returns.
 *
 * Buckets a campaign by the kind of outreach it was:
 *   - automationKey `birthday:…` / `reactivation:…` → those automations
 *   - else the linked template's category (recall / reactivation / birthday /
 *     welcome) → that kind
 *   - else → a generic "Other campaigns" bucket.
 *
 * A patient is counted ONCE (most-recent booked event wins), so the buckets
 * sum to the number of distinct patients won back.
 */

export interface WonBackPatient {
  patientId: string
  name: string
  appointmentId: string | null
  occurredAt: Date
}

export interface RetentionBucket {
  key: 'recall' | 'reactivation' | 'birthday' | 'welcome' | 'other'
  label: string
  count: number
  /** Capped sample for the UI; `count` is the true total. */
  patients: WonBackPatient[]
}

export interface RetentionAttribution {
  windowDays: number
  totalWonBack: number
  /** Non-empty buckets only, in a stable display order. */
  buckets: RetentionBucket[]
}

const BUCKET_ORDER: RetentionBucket['key'][] = ['recall', 'reactivation', 'birthday', 'welcome', 'other']
const BUCKET_LABEL: Record<RetentionBucket['key'], string> = {
  recall: 'Recall reminders',
  reactivation: 'Reactivation nudges',
  birthday: 'Birthday messages',
  welcome: 'New-patient welcome',
  other: 'Other campaigns',
}
const SAMPLE_CAP = 8

/** Map a campaign's automationKey + linked template category to a bucket. */
export function bucketForCampaign(
  automationKey: string | null,
  templateCategory: string | null,
): RetentionBucket['key'] {
  if (automationKey?.startsWith('birthday')) return 'birthday'
  if (automationKey?.startsWith('reactivation')) return 'reactivation'
  switch (templateCategory) {
    case 'reactivation':
      return 'reactivation'
    case 'birthday':
      return 'birthday'
    case 'recall':
      return 'recall'
    case 'welcome':
      return 'welcome'
    default:
      return 'other'
  }
}

export async function getRetentionAttribution(
  organizationId: string,
  opts: { days?: number } = {},
): Promise<RetentionAttribution> {
  const windowDays = opts.days === 90 ? 90 : 30
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      patientId: schema.campaignEvents.patientId,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      appointmentId: schema.campaignEvents.bookedAppointmentId,
      occurredAt: schema.campaignEvents.occurredAt,
      automationKey: schema.campaigns.automationKey,
      templateCategory: schema.campaignTemplates.category,
    })
    .from(schema.campaignEvents)
    .innerJoin(schema.campaigns, eq(schema.campaignEvents.campaignId, schema.campaigns.id))
    .leftJoin(schema.campaignTemplates, eq(schema.campaigns.templateId, schema.campaignTemplates.id))
    .where(
      and(
        eq(schema.campaigns.organizationId, organizationId),
        eq(schema.campaignEvents.type, 'booked'),
        gte(schema.campaignEvents.occurredAt, since),
      ),
    )
    .orderBy(desc(schema.campaignEvents.occurredAt))

  // Dedupe by patient — most recent booked event wins (rows are desc by time).
  const seen = new Set<string>()
  const byBucket = new Map<RetentionBucket['key'], WonBackPatient[]>()
  for (const r of rows) {
    if (!r.patientId || seen.has(r.patientId)) continue
    seen.add(r.patientId)
    const key = bucketForCampaign(r.automationKey, r.templateCategory)
    const list = byBucket.get(key) ?? []
    list.push({
      patientId: r.patientId,
      name: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || 'Patient',
      appointmentId: r.appointmentId,
      occurredAt: r.occurredAt,
    })
    byBucket.set(key, list)
  }

  const buckets: RetentionBucket[] = []
  for (const key of BUCKET_ORDER) {
    const list = byBucket.get(key)
    if (!list || list.length === 0) continue
    buckets.push({ key, label: BUCKET_LABEL[key], count: list.length, patients: list.slice(0, SAMPLE_CAP) })
  }

  return { windowDays, totalWonBack: seen.size, buckets }
}
