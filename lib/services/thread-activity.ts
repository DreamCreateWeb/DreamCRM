import 'server-only'
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { cancelActorLabel } from '@/lib/cancel-actor'
import { formatClinicDayTime } from '@/lib/format-datetime'
import { getClinicTimeZone } from '@/lib/services/clinic-timezone'

/**
 * Activity markers for the /messages thread view — every automated (or
 * out-of-band) touch the platform made on this patient, merged at READ time
 * from the send logs that already exist. No new write paths, no schema: the
 * moment this ships, months of history appear in every thread.
 *
 * The law (the thing that keeps the inbox usable): markers are CONTEXT, not
 * conversation. They never bump unreadCountForClinic, never reopen or
 * reorder a thread, and never render in the patient's portal view. Only the
 * staff detail panel interleaves them, as thin gray lines between bubbles —
 * so when Jason replies "Yeah that'd be great!", the reactivation email he's
 * answering is visible right above his message.
 */

export type ActivityMarkerKind =
  | 'appointment' // booked / confirmed / completed / cancelled / no-show
  | 'reminder' // appointment reminder send
  | 'review' // review request sent / completed
  | 'campaign' // campaign or automation email received (+ opened)
  | 'balance' // balance reminder sent / paid online
  | 'survey' // post-visit NPS survey sent / answered
  | 'form' // intake form completed

export interface ActivityMarker {
  /** Stable unique id across sources (prefixed per source). */
  id: string
  kind: ActivityMarkerKind
  occurredAt: Date
  /** One glyph, rendered ahead of the label. */
  icon: string
  /** The one-line story: "Reactivation email received". */
  label: string
  /** Quiet suffix: "opened ✓", "for Thu, Aug 6 · 2:00 PM". */
  detail: string | null
  /** Staff-side deep link (appointments drawer, campaign stats, …). */
  href: string | null
}

const APPT_TYPE_LABEL: Record<string, string> = {
  checkup: 'Checkup',
  cleaning: 'Cleaning',
  filling: 'Filling',
  extraction: 'Extraction',
  root_canal: 'Root canal',
  consultation: 'Consultation',
  other: 'Visit',
}

function apptLabel(type: string | null): string {
  return APPT_TYPE_LABEL[type ?? ''] ?? 'Visit'
}

function dollars(cents: number): string {
  const n = Number(cents) / 100
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`
}

/**
 * All automation/lifecycle markers for one patient, oldest→newest. Read-only
 * and best-effort by contract: the thread must render even if a marker
 * source query fails, so callers should treat [] as "no context", never an
 * error state.
 */
export async function listThreadActivity(
  organizationId: string,
  patientId: string,
): Promise<ActivityMarker[]> {
  const timeZone = await getClinicTimeZone(organizationId)

  const [appts, reminders, reviewRequests, campaignSends, balanceRequests, balancePayments, surveys, formSubs] =
    await Promise.all([
      db
        .select({
          id: schema.appointment.id,
          type: schema.appointment.type,
          status: schema.appointment.status,
          startTime: schema.appointment.startTime,
          createdAt: schema.appointment.createdAt,
          confirmedAt: schema.appointment.confirmedAt,
          cancelledAt: schema.appointment.cancelledAt,
          completedAt: schema.appointment.completedAt,
          noShowedAt: schema.appointment.noShowedAt,
          cancelledVia: schema.appointment.cancelledVia,
          cancelledByUserId: schema.appointment.cancelledByUserId,
          source: schema.appointment.source,
        })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, organizationId),
            eq(schema.appointment.patientId, patientId),
          ),
        )
        .orderBy(desc(schema.appointment.startTime))
        .limit(100),
      db
        .select({
          id: schema.appointmentReminderLog.id,
          channel: schema.appointmentReminderLog.channel,
          sentAt: schema.appointmentReminderLog.sentAt,
          appointmentId: schema.appointmentReminderLog.appointmentId,
          apptStart: schema.appointment.startTime,
          apptType: schema.appointment.type,
        })
        .from(schema.appointmentReminderLog)
        .innerJoin(
          schema.appointment,
          eq(schema.appointmentReminderLog.appointmentId, schema.appointment.id),
        )
        .where(
          and(
            eq(schema.appointmentReminderLog.organizationId, organizationId),
            eq(schema.appointment.patientId, patientId),
          ),
        )
        .orderBy(desc(schema.appointmentReminderLog.sentAt))
        .limit(100),
      db
        .select({
          id: schema.reviewRequest.id,
          status: schema.reviewRequest.status,
          sentAt: schema.reviewRequest.sentAt,
          completedAt: schema.reviewRequest.completedAt,
          rating: schema.reviewRequest.rating,
          selectedSite: schema.reviewRequest.selectedSite,
        })
        .from(schema.reviewRequest)
        .where(
          and(
            eq(schema.reviewRequest.organizationId, organizationId),
            eq(schema.reviewRequest.patientId, patientId),
            isNotNull(schema.reviewRequest.sentAt),
          ),
        )
        .orderBy(desc(schema.reviewRequest.sentAt))
        .limit(50),
      // campaign_events has no organizationId by design (patientId is itself
      // org-scoped) — same access pattern patient-timeline.ts already uses.
      db
        .select({
          id: schema.campaignEvents.id,
          type: schema.campaignEvents.type,
          occurredAt: schema.campaignEvents.occurredAt,
          campaignId: schema.campaignEvents.campaignId,
          campaignName: schema.campaigns.name,
        })
        .from(schema.campaignEvents)
        .leftJoin(schema.campaigns, eq(schema.campaignEvents.campaignId, schema.campaigns.id))
        .where(
          and(
            eq(schema.campaignEvents.patientId, patientId),
            inArray(schema.campaignEvents.type, ['sent', 'open']),
          ),
        )
        .orderBy(desc(schema.campaignEvents.occurredAt))
        .limit(150),
      db
        .select({
          id: schema.balancePaymentRequest.id,
          sentAt: schema.balancePaymentRequest.sentAt,
          balanceCentsAtSend: schema.balancePaymentRequest.balanceCentsAtSend,
          source: schema.balancePaymentRequest.source,
        })
        .from(schema.balancePaymentRequest)
        .where(
          and(
            eq(schema.balancePaymentRequest.organizationId, organizationId),
            eq(schema.balancePaymentRequest.patientId, patientId),
          ),
        )
        .orderBy(desc(schema.balancePaymentRequest.sentAt))
        .limit(50),
      db
        .select({
          id: schema.patientBalancePayment.id,
          amountCents: schema.patientBalancePayment.amountCents,
          paidAt: schema.patientBalancePayment.paidAt,
        })
        .from(schema.patientBalancePayment)
        .where(
          and(
            eq(schema.patientBalancePayment.organizationId, organizationId),
            eq(schema.patientBalancePayment.patientId, patientId),
            eq(schema.patientBalancePayment.status, 'paid'),
            isNotNull(schema.patientBalancePayment.paidAt),
          ),
        )
        .orderBy(desc(schema.patientBalancePayment.paidAt))
        .limit(50),
      db
        .select({
          id: schema.npsResponse.id,
          sentAt: schema.npsResponse.sentAt,
          respondedAt: schema.npsResponse.respondedAt,
          score: schema.npsResponse.score,
        })
        .from(schema.npsResponse)
        .where(
          and(
            eq(schema.npsResponse.organizationId, organizationId),
            eq(schema.npsResponse.patientId, patientId),
          ),
        )
        .orderBy(desc(schema.npsResponse.sentAt))
        .limit(50),
      db
        .select({
          id: schema.formSubmission.id,
          formTitle: schema.formTemplate.title,
          submittedAt: schema.formSubmission.submittedAt,
        })
        .from(schema.formSubmission)
        .innerJoin(schema.formTemplate, eq(schema.formSubmission.formTemplateId, schema.formTemplate.id))
        .where(
          and(
            eq(schema.formSubmission.organizationId, organizationId),
            eq(schema.formSubmission.patientId, patientId),
          ),
        )
        .orderBy(desc(schema.formSubmission.submittedAt))
        .limit(50),
    ])

  const markers: ActivityMarker[] = []

  // "Cancelled by whom" names, one query (usually 0–1 ids).
  const cancellerIds = Array.from(
    new Set(appts.filter((a) => a.cancelledByUserId).map((a) => a.cancelledByUserId as string)),
  )
  const cancellerName = new Map<string, string>()
  if (cancellerIds.length) {
    const rows = await db
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
      .where(inArray(schema.user.id, cancellerIds))
    for (const r of rows) cancellerName.set(r.id, r.name)
  }

  // ── Appointment lifecycle — each timestamped transition is its own marker
  for (const a of appts) {
    const when = formatClinicDayTime(a.startTime, timeZone)
    const href = `/appointments?appt=${a.id}`
    markers.push({
      id: `appt_booked_${a.id}`,
      kind: 'appointment',
      occurredAt: a.createdAt,
      icon: '📅',
      label: `${apptLabel(a.type)} booked`,
      detail: `for ${when}${a.source === 'booking_widget' ? ' · online' : a.source === 'recall_campaign' ? ' · from outreach' : ''}`,
      href,
    })
    if (a.confirmedAt) {
      markers.push({
        id: `appt_confirmed_${a.id}`,
        kind: 'appointment',
        occurredAt: a.confirmedAt,
        icon: '✅',
        label: `${apptLabel(a.type)} confirmed`,
        detail: `for ${when}`,
        href,
      })
    }
    if (a.status === 'completed') {
      markers.push({
        id: `appt_completed_${a.id}`,
        kind: 'appointment',
        occurredAt: a.completedAt ?? a.startTime,
        icon: '🦷',
        label: `${apptLabel(a.type)} completed`,
        detail: null,
        href,
      })
    }
    if (a.status === 'cancelled') {
      const actor = cancelActorLabel(
        a.cancelledVia,
        a.cancelledByUserId ? cancellerName.get(a.cancelledByUserId) : null,
      )
      markers.push({
        id: `appt_cancelled_${a.id}`,
        kind: 'appointment',
        occurredAt: a.cancelledAt ?? a.startTime,
        icon: '🚫',
        label: `${apptLabel(a.type)} cancelled`,
        detail: actor ? `was ${when} · ${actor}` : `was ${when}`,
        href,
      })
    }
    if (a.status === 'no_show') {
      markers.push({
        id: `appt_noshow_${a.id}`,
        kind: 'appointment',
        occurredAt: a.noShowedAt ?? a.startTime,
        icon: '👻',
        label: `Missed ${apptLabel(a.type).toLowerCase()}`,
        detail: `was ${when}`,
        href,
      })
    }
  }

  // ── Reminder sends
  for (const r of reminders) {
    markers.push({
      id: `rem_${r.id}`,
      kind: 'reminder',
      occurredAt: r.sentAt,
      icon: '⏰',
      label: `${apptLabel(r.apptType)} reminder sent`,
      detail: r.channel === 'sms' ? 'text' : 'email',
      href: `/appointments?appt=${r.appointmentId}`,
    })
  }

  // ── Review requests: the ask and (when it happened) the outcome
  for (const r of reviewRequests) {
    if (r.sentAt) {
      markers.push({
        id: `rr_sent_${r.id}`,
        kind: 'review',
        occurredAt: r.sentAt,
        icon: '⭐',
        label: 'Review request sent',
        detail: null,
        href: '/growth/reviews',
      })
    }
    if (r.status === 'completed' && r.completedAt) {
      markers.push({
        id: `rr_done_${r.id}`,
        kind: 'review',
        occurredAt: r.completedAt,
        icon: '🌟',
        label: `Left a ${r.rating ? `${r.rating}★ ` : ''}review`,
        detail: r.selectedSite ? `via ${r.selectedSite}` : null,
        href: '/growth/reviews/received',
      })
    }
  }

  // ── Campaign / automation sends, enriched with the opened signal — the
  //    marker that answers "what would be great?" when Jason replies.
  const openedByCampaign = new Set<number>()
  for (const e of campaignSends) {
    if (e.type === 'open' && e.campaignId != null) openedByCampaign.add(e.campaignId)
  }
  for (const e of campaignSends) {
    if (e.type !== 'sent') continue
    markers.push({
      id: `camp_${e.id}`,
      kind: 'campaign',
      occurredAt: e.occurredAt,
      icon: '📣',
      label: e.campaignName ? `Received “${e.campaignName}”` : 'Received an outreach email',
      detail: e.campaignId != null && openedByCampaign.has(e.campaignId) ? 'opened ✓' : null,
      href: e.campaignId != null ? `/growth/campaigns/${e.campaignId}` : null,
    })
  }

  // ── Balance: the nudge and the payment
  for (const b of balanceRequests) {
    markers.push({
      id: `bal_sent_${b.id}`,
      kind: 'balance',
      occurredAt: b.sentAt,
      icon: '💳',
      label: 'Balance reminder sent',
      detail: b.balanceCentsAtSend ? `${dollars(b.balanceCentsAtSend)}${b.source === 'auto' ? ' · auto' : ''}` : b.source === 'auto' ? 'auto' : null,
      href: '/payments/collections',
    })
  }
  for (const p of balancePayments) {
    markers.push({
      id: `bal_paid_${p.id}`,
      kind: 'balance',
      occurredAt: p.paidAt as Date,
      icon: '💚',
      label: `Paid ${dollars(p.amountCents)} online`,
      detail: null,
      href: '/payments/online',
    })
  }

  // ── Post-visit survey
  for (const s of surveys) {
    markers.push({
      id: `nps_sent_${s.id}`,
      kind: 'survey',
      occurredAt: s.sentAt,
      icon: '📋',
      label: 'Post-visit survey sent',
      detail: null,
      href: null,
    })
    if (s.respondedAt && s.score != null) {
      markers.push({
        id: `nps_done_${s.id}`,
        kind: 'survey',
        occurredAt: s.respondedAt,
        icon: '💬',
        label: `Survey answered · ${s.score}/10`,
        detail: null,
        href: null,
      })
    }
  }

  // ── Intake forms completed
  for (const f of formSubs) {
    markers.push({
      id: `form_${f.id}`,
      kind: 'form',
      occurredAt: f.submittedAt,
      icon: '📝',
      label: `Completed “${f.formTitle}”`,
      detail: null,
      href: `/intake-forms/submissions/${f.id}`,
    })
  }

  markers.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
  return markers
}
