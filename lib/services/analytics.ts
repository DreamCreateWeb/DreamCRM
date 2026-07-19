import 'server-only'
import { and, eq, gte, inArray, isNotNull, lt, lte, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getReviewStats } from '@/lib/services/reviews'
import { listPatients } from '@/lib/services/patients'
import { getClinicSeoPerformance } from '@/lib/services/gsc'
import { getGbpLocalMetrics } from '@/lib/services/gbp-metrics'
import { tallyCampaignFunnel, emptyFunnel } from '@/lib/services/campaign-funnel'
import { countLeadChannels, type LeadChannel } from '@/lib/lead-channel'

/**
 * Clinic Analytics. The honest split: a CRM can measure the *relationship,
 * acquisition and schedule* funnel — the PMS owns clinical production
 * (production $, procedure mix, hygiene-reappt %, AR aging, case acceptance).
 * So we surface what we genuinely capture and name the PMS-owned KPIs as
 * such rather than faking them. Same stance as the morning-huddle Overview.
 *
 * Pure read-only aggregation over tables other modules already populate —
 * no new schema.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

// Industry reference points (labeled as benchmarks in the UI, not clinic data).
export const BENCHMARK_NO_SHOW_RATE = 0.135 // ~12-18% typical dental no-show

// The backfill-source set moved to its single import-light home in
// lib/patient-acquisition.ts (the patients service needs it without dragging
// this module's heavy import graph); re-exported here for existing importers.
import { BACKFILL_PATIENT_SOURCES } from '@/lib/patient-acquisition'
export { BACKFILL_PATIENT_SOURCES }

export interface TrendPoint {
  label: string
  count: number
}

export interface ClinicAnalytics {
  windowDays: number
  generatedAt: Date
  acquisition: {
    newPatients: number
    newPatientsPrev: number
    trend: TrendPoint[]
    sourceMix: { source: string; count: number }[]
    websiteFunnel: { clicks: number | null; leads: number; contacted: number; converted: number }
    /** Website leads bucketed by attribution channel (utm + referrer), ranked.
     *  Empty when there are no leads in the window. */
    leadChannels: { channel: LeadChannel; count: number }[]
    /** Google Business Profile local actions over the same window (null when no
     *  GBP is connected — the UI then shows a connect prompt instead of a tile).
     *  Pulled via the Zernio connection; demo-safe + best-effort. */
    gbp: { connected: boolean; impressions: number; calls: number; directions: number; bookings: number } | null
  }
  schedule: {
    total: number
    completed: number
    noShow: number
    cancelled: number
    confirmed: number
    attended: number // completed + noShow — the no-show-rate denominator
    noShowRate: number | null
    cancellationRate: number | null
    confirmationRate: number | null
    benchmarkNoShowRate: number
    /** The SAME metrics over the immediately-prior equal-length window, so the
     *  UI can show "vs previous" deltas. Rates are null on a thin prior sample. */
    prev: {
      total: number
      noShowRate: number | null
      cancellationRate: number | null
      confirmationRate: number | null
    }
    bySource: { source: string; count: number }[]
    byProvider: { provider: string; count: number }[]
    volumeTrend: TrendPoint[]
  }
  recall: {
    due: number
    outreach: { sent: number; opened: number; clicked: number; booked: number }
  }
  reputation: {
    sent: number
    /** Real measured count of requests whose review link was opened — NOT
     *  reconstructed from a rate. Null engagement tracking beyond this:
     *  there is no email-open signal on review_request, so the honest funnel
     *  is Sent → Opened (clicked) → Reviewed. */
    opened: number
    completed: number
    clickRate: number | null
    completionRate: number | null
    byPlatform: { google: number; healthgrades: number; facebook: number; yelp: number }
  }
  pmsOwned: { label: string; detail: string }[]
}

export function weeklyTrend(dates: Date[], windowDays: number, now: Date): TrendPoint[] {
  const nBuckets = Math.max(1, Math.ceil(windowDays / 7))
  const counts = new Array(nBuckets).fill(0)
  for (const d of dates) {
    const idx = Math.floor((now.getTime() - d.getTime()) / WEEK_MS)
    if (idx >= 0 && idx < nBuckets) counts[idx]++
  }
  // counts[0] = most recent week; reverse to oldest→newest for left-to-right reading.
  const out: TrendPoint[] = []
  for (let i = nBuckets - 1; i >= 0; i--) {
    const bucketStart = new Date(now.getTime() - (i + 1) * WEEK_MS)
    out.push({
      label: bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: counts[i],
    })
  }
  return out
}

/** Schedule rates over a set of appointment rows — shared by the current and
 *  prior window so the comparison can't drift from the headline computation. */
function scheduleRatesOf(rows: { status: string; confirmedAt: Date | null }[]): {
  total: number
  noShowRate: number | null
  cancellationRate: number | null
  confirmationRate: number | null
} {
  const noShow = rows.filter((a) => a.status === 'no_show').length
  const completed = rows.filter((a) => a.status === 'completed').length
  const cancelled = rows.filter((a) => a.status === 'cancelled').length
  // DECIDED (finishing pass): Analytics' "confirmed" = confirmedAt OR
  // completed — a kept visit was confirmed in the way that matters, even if
  // nobody clicked the button. The agenda's live counts use status alone
  // (operational "who still needs a text TODAY"); different questions,
  // intentionally different predicates.
  const confirmedOrDone = rows.filter((a) => a.confirmedAt || a.status === 'completed').length
  const attendedDenom = completed + noShow
  const confirmableDenom = rows.length - cancelled
  return {
    total: rows.length,
    noShowRate: attendedDenom > 0 ? noShow / attendedDenom : null,
    cancellationRate: rows.length > 0 ? cancelled / rows.length : null,
    confirmationRate: confirmableDenom > 0 ? confirmedOrDone / confirmableDenom : null,
  }
}

export async function getClinicAnalytics(organizationId: string, windowDays = 30): Promise<ClinicAnalytics> {
  const now = new Date()
  const since = new Date(now.getTime() - windowDays * DAY_MS)
  const prevSince = new Date(now.getTime() - 2 * windowDays * DAY_MS)

  // ── Acquisition: new patients (firstSeenAt is the spread/honest field) ──
  const newPatientRows = await db
    .select({ firstSeenAt: schema.patient.firstSeenAt, source: schema.patient.source })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        isNotNull(schema.patient.firstSeenAt),
        gte(schema.patient.firstSeenAt, since),
        ne(schema.patient.lifecycle, 'archived'),
      ),
    )

  const [prevNewPatients] = await db
    .select({ source: schema.patient.source })
    .from(schema.patient)
    .where(
      and(
        eq(schema.patient.organizationId, organizationId),
        isNotNull(schema.patient.firstSeenAt),
        gte(schema.patient.firstSeenAt, prevSince),
        lt(schema.patient.firstSeenAt, since),
        ne(schema.patient.lifecycle, 'archived'),
      ),
    )
    .then((rows) => [rows.filter((r) => !BACKFILL_PATIENT_SOURCES.has(r.source ?? '')).length])

  // Exclude bulk backfills (PMS/CSV import) — their firstSeenAt is the import
  // time, not a real acquisition date, so they'd otherwise inflate "new patients".
  const acquiredRows = newPatientRows.filter((r) => !BACKFILL_PATIENT_SOURCES.has(r.source ?? ''))

  const sourceCounts = new Map<string, number>()
  for (const r of acquiredRows) {
    const key = r.source ?? 'unknown'
    sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1)
  }

  // ── Website funnel: leads in window + GSC clicks (optional) ─────────────
  const leadRows = await db
    .select({
      status: schema.lead.status,
      contactedAt: schema.lead.contactedAt,
      convertedAt: schema.lead.convertedAt,
      utmSource: schema.lead.utmSource,
      utmMedium: schema.lead.utmMedium,
      referrer: schema.lead.referrer,
    })
    .from(schema.lead)
    .where(and(eq(schema.lead.organizationId, organizationId), gte(schema.lead.createdAt, since)))

  const leadsContacted = leadRows.filter((l) => l.contactedAt || l.status === 'contacted' || l.status === 'converted').length
  const leadsConverted = leadRows.filter((l) => l.status === 'converted' || l.convertedAt).length
  const leadChannels = countLeadChannels(leadRows)

  // Clinics read the platform's shared Search Console connection, scoped to
  // their own pages — they connect nothing. (Matches the SEO tab.)
  let gscClicks: number | null = null
  try {
    const res = await getClinicSeoPerformance(organizationId, windowDays)
    gscClicks = res.perf ? res.perf.clicks : null
  } catch {
    gscClicks = null
  }

  // Google Business local actions over the same window (calls/directions/
  // bookings + impressions), via the Zernio GBP connection. Best-effort +
  // demo-safe (never throws); null when no GBP is connected so the UI shows a
  // connect prompt rather than a row of zeros.
  const gbpMetrics = await getGbpLocalMetrics(organizationId, { days: windowDays })
  const gbp = gbpMetrics.connected
    ? {
        connected: true,
        impressions: gbpMetrics.impressions,
        calls: gbpMetrics.calls,
        directions: gbpMetrics.directions,
        bookings: gbpMetrics.bookings,
      }
    : null

  // ── Schedule health (appointments with startTime in window) ─────────────
  // Pull the current AND prior window in one query (startTime ≥ prevSince), then
  // split in JS so the schedule rates carry a "vs previous" comparison.
  const allApptRows = await db
    .select({
      status: schema.appointment.status,
      source: schema.appointment.source,
      providerId: schema.appointment.providerId,
      startTime: schema.appointment.startTime,
      confirmedAt: schema.appointment.confirmedAt,
    })
    .from(schema.appointment)
    .where(and(eq(schema.appointment.organizationId, organizationId), gte(schema.appointment.startTime, prevSince), lte(schema.appointment.startTime, now)))

  const apptRows = allApptRows.filter((a) => a.startTime >= since)
  const prevSchedule = scheduleRatesOf(allApptRows.filter((a) => a.startTime < since))

  const completed = apptRows.filter((a) => a.status === 'completed').length
  const noShow = apptRows.filter((a) => a.status === 'no_show').length
  const cancelled = apptRows.filter((a) => a.status === 'cancelled').length
  const confirmedOrDone = apptRows.filter((a) => a.confirmedAt || a.status === 'completed').length
  // No-show rate is over appointments that resolved to attended-or-not.
  const attendedDenom = completed + noShow
  // Confirmation rate is over appointments that weren't cancelled.
  const confirmableDenom = apptRows.length - cancelled

  const apptSourceCounts = new Map<string, number>()
  for (const a of apptRows) {
    const key = a.source ?? 'front_desk'
    apptSourceCounts.set(key, (apptSourceCounts.get(key) ?? 0) + 1)
  }

  // Provider labels
  const providerIds = Array.from(new Set(apptRows.map((a) => a.providerId).filter((x): x is string => !!x)))
  const providerNames = new Map<string, string>()
  if (providerIds.length > 0) {
    const provs = await db
      .select({ id: schema.clinicProvider.id, name: schema.clinicProvider.displayName })
      .from(schema.clinicProvider)
      // Defense-in-depth: scope to this org (the ids already come from this
      // org's appointments, but never look up a foreign provider by id).
      .where(and(eq(schema.clinicProvider.organizationId, organizationId), inArray(schema.clinicProvider.id, providerIds)))
    for (const p of provs) providerNames.set(p.id, p.name)
  }
  const providerCounts = new Map<string, number>()
  for (const a of apptRows) {
    if (!a.providerId) continue
    const name = providerNames.get(a.providerId) ?? 'Unassigned'
    providerCounts.set(name, (providerCounts.get(name) ?? 0) + 1)
  }

  // ── Recall (reuse the single source of truth for recall derivation) ─────
  const patients = await listPatients(organizationId)
  const recallDue = patients.filter((p) => p.recallStatus === 'due' || p.recallStatus === 'overdue').length

  // ── Outreach funnel: patient-source campaigns in window ─────────────────
  const patientCampaigns = await db
    .select({ id: schema.campaigns.id })
    .from(schema.campaigns)
    .where(and(eq(schema.campaigns.organizationId, organizationId), eq(schema.campaigns.recipientSource, 'patients')))
  const campaignIds = patientCampaigns.map((c) => c.id)

  let outreach = emptyFunnel()
  if (campaignIds.length > 0) {
    const eventRows = await db
      .select({ type: schema.campaignEvents.type })
      .from(schema.campaignEvents)
      .where(and(inArray(schema.campaignEvents.campaignId, campaignIds), gte(schema.campaignEvents.occurredAt, since)))
    outreach = tallyCampaignFunnel(eventRows)
  }

  // ── Reputation (reuse getReviewStats, scoped to the SAME window) ────────
  // Analytics never reads eligibleCount, so skip its eligible-patients scan.
  const reviews = await getReviewStats(organizationId, windowDays, { includeEligible: false })

  return {
    windowDays,
    generatedAt: now,
    acquisition: {
      newPatients: acquiredRows.length,
      newPatientsPrev: prevNewPatients ?? 0,
      trend: weeklyTrend(
        acquiredRows.map((r) => r.firstSeenAt!).filter(Boolean),
        windowDays,
        now,
      ),
      sourceMix: Array.from(sourceCounts.entries())
        .map(([source, c]) => ({ source, count: c }))
        .sort((a, b) => b.count - a.count),
      websiteFunnel: { clicks: gscClicks, leads: leadRows.length, contacted: leadsContacted, converted: leadsConverted },
      leadChannels,
      gbp,
    },
    schedule: {
      total: apptRows.length,
      completed,
      noShow,
      cancelled,
      confirmed: confirmedOrDone,
      attended: attendedDenom,
      noShowRate: attendedDenom > 0 ? noShow / attendedDenom : null,
      cancellationRate: apptRows.length > 0 ? cancelled / apptRows.length : null,
      confirmationRate: confirmableDenom > 0 ? confirmedOrDone / confirmableDenom : null,
      benchmarkNoShowRate: BENCHMARK_NO_SHOW_RATE,
      prev: prevSchedule,
      bySource: Array.from(apptSourceCounts.entries())
        .map(([source, c]) => ({ source, count: c }))
        .sort((a, b) => b.count - a.count),
      byProvider: Array.from(providerCounts.entries())
        .map(([provider, c]) => ({ provider, count: c }))
        .sort((a, b) => b.count - a.count),
      volumeTrend: weeklyTrend(
        apptRows.map((a) => a.startTime),
        windowDays,
        now,
      ),
    },
    recall: { due: recallDue, outreach },
    reputation: {
      sent: reviews.sent30d,
      opened: reviews.clicked30d,
      completed: reviews.completed30d,
      clickRate: reviews.clickRate30d != null ? reviews.clickRate30d / 100 : null,
      completionRate: reviews.completionRate30d != null ? reviews.completionRate30d / 100 : null,
      byPlatform: reviews.byPlatform,
    },
    pmsOwned: [
      { label: 'Production $', detail: 'Per-visit and monthly production lives in your practice-management system.' },
      { label: 'Procedure mix', detail: 'Procedure codes + treatment-plan acceptance are charted in the PMS.' },
      { label: 'Hygiene reappointment %', detail: 'Whether patients leave the chair pre-booked is a PMS clinical metric.' },
      { label: 'AR aging / collections', detail: 'Insurance claims, EOBs and clinical AR are owned by the PMS.' },
    ],
  }
}
