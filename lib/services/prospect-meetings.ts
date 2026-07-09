import 'server-only'
import { and, asc, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { deliver } from '@/lib/email'
import { getPlatformOrgId } from './gsc'
import { notifyOrgMembers } from './notifications'
import { getProspectingConfig } from './prospecting'
import {
  generateDemoSlots,
  isSlotAvailable,
  googleCalendarLink,
  type DemoSlotConfig,
} from '@/lib/prospect-booking'

/**
 * Prospect demo self-booking — the close accelerator. An interested prospect
 * lands on /d/<token>, picks a slot from the owner's availability (shown in
 * their own timezone), and both sides get a confirmation with an add-to-
 * calendar link. No double-booking: booked slots are subtracted from
 * availability owner-wide. All gated by config.booking.enabled.
 */

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'https://www.dreamcreatestudio.com'
const OUTREACH_FROM = process.env.OUTREACH_EMAIL_FROM?.trim() || undefined
const OUTREACH_REPLY_TO = process.env.OUTREACH_REPLY_TO?.trim() || OUTREACH_FROM
const DEMO_TITLE = 'Dream Create demo'

function slotCfg(booking: Awaited<ReturnType<typeof getProspectingConfig>>['booking']): DemoSlotConfig {
  return {
    hostTimeZone: booking.hostTimeZone,
    days: booking.days,
    startHour: booking.startHour,
    endHour: booking.endHour,
    slotMinutes: booking.slotMinutes,
    leadHours: booking.leadHours,
    durationMin: booking.durationMin,
  }
}

/** "Tue, Jul 8 at 2:00 PM EDT" in the given timezone. */
export function formatMeetingTime(at: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone, weekday: 'short', month: 'short', day: 'numeric',
  }).format(at)
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(at)
  return `${day} at ${time}`
}

/** Booked demo instants owner-wide from now on — subtracted from availability. */
async function bookedSlotsAhead(now: Date): Promise<Date[]> {
  const rows = await db
    .select({ scheduledAt: schema.prospectMeeting.scheduledAt })
    .from(schema.prospectMeeting)
    .where(and(eq(schema.prospectMeeting.status, 'booked'), gte(schema.prospectMeeting.scheduledAt, now)))
  return rows.map((r) => r.scheduledAt).filter((d): d is Date => d != null)
}

/** Generate the owner's currently-bookable slots. */
export async function listAvailableSlots(now: Date = new Date()): Promise<{ enabled: boolean; slots: Date[]; hostTimeZone: string; durationMin: number }> {
  const config = await getProspectingConfig()
  const cfg = slotCfg(config.booking)
  if (!config.booking.enabled) return { enabled: false, slots: [], hostTimeZone: cfg.hostTimeZone, durationMin: cfg.durationMin }
  const booked = await bookedSlotsAhead(now)
  return { enabled: true, slots: generateDemoSlots(now, cfg, booked), hostTimeZone: cfg.hostTimeZone, durationMin: cfg.durationMin }
}

/**
 * The link the owner sends — reuses an open (proposed/booked) meeting for the
 * prospect so the URL is stable, else mints one. Returns null when booking is
 * disabled.
 */
export async function getOrCreateBookingLink(
  prospectId: string,
  createdByUserId?: string | null,
): Promise<{ token: string; url: string } | null> {
  const config = await getProspectingConfig()
  if (!config.booking.enabled) return null

  const [existing] = await db
    .select({ token: schema.prospectMeeting.token })
    .from(schema.prospectMeeting)
    .where(
      and(
        eq(schema.prospectMeeting.prospectId, prospectId),
        inArray(schema.prospectMeeting.status, ['proposed', 'booked']),
      ),
    )
    .orderBy(desc(schema.prospectMeeting.createdAt))
    .limit(1)
  if (existing) return { token: existing.token, url: `${APP_URL}/d/${existing.token}` }

  const token = randomUUID().replace(/-/g, '')
  await db.insert(schema.prospectMeeting).values({
    id: newId('pmtg'),
    prospectId,
    token,
    status: 'proposed',
    durationMin: config.booking.durationMin,
    hostTimeZone: config.booking.hostTimeZone,
    createdByUserId: createdByUserId ?? null,
  })
  return { token, url: `${APP_URL}/d/${token}` }
}

/**
 * Log a demo the OWNER booked directly (e.g. on the cold call that closed it),
 * rather than the prospect self-booking via /d/<token>. Inserts a 'booked'
 * meeting with a real time + createdByUserId, so it flows through
 * getUpcomingMeetings, the demo reminders cron, and the owner bell exactly like
 * a self-booked one. Not gated by config.booking.enabled — that switch governs
 * the public self-serve page, not the owner logging their own call outcome.
 */
export async function logBookedDemo(input: {
  prospectId: string
  scheduledAt: Date
  attendeeName?: string | null
  attendeeEmail?: string | null
  note?: string | null
  durationMin?: number
  createdByUserId?: string | null
}): Promise<{ id: string; token: string }> {
  const config = await getProspectingConfig()
  const token = randomUUID().replace(/-/g, '')
  const id = newId('pmtg')
  const now = new Date()
  await db.insert(schema.prospectMeeting).values({
    id,
    prospectId: input.prospectId,
    token,
    status: 'booked',
    scheduledAt: input.scheduledAt,
    durationMin: input.durationMin ?? config.booking.durationMin,
    hostTimeZone: config.booking.hostTimeZone,
    attendeeName: input.attendeeName?.trim() || null,
    attendeeEmail: input.attendeeEmail?.trim().toLowerCase() || null,
    note: input.note?.trim() || null,
    createdByUserId: input.createdByUserId ?? null,
    bookedAt: now,
  })
  return { id, token }
}

export interface BookingView {
  meeting: typeof schema.prospectMeeting.$inferSelect
  prospectName: string
  prospectTimeZone: string
}

export async function getMeetingByToken(token: string): Promise<BookingView | null> {
  const [row] = await db
    .select({
      meeting: schema.prospectMeeting,
      name: schema.prospect.name,
      tz: schema.prospect.timezone,
    })
    .from(schema.prospectMeeting)
    .innerJoin(schema.prospect, eq(schema.prospect.id, schema.prospectMeeting.prospectId))
    .where(eq(schema.prospectMeeting.token, token))
    .limit(1)
  if (!row) return null
  return { meeting: row.meeting, prospectName: row.name, prospectTimeZone: row.tz || 'America/New_York' }
}

/** Book (or reschedule) a slot. Validates it's still on offer + unbooked. */
export async function bookMeeting(
  token: string,
  input: { slotIso: string; name?: string | null; email?: string | null; note?: string | null },
  now: Date = new Date(),
): Promise<{ ok: true; scheduledAt: Date } | { ok: false; reason: string }> {
  const config = await getProspectingConfig()
  if (!config.booking.enabled) return { ok: false, reason: 'disabled' }

  const view = await getMeetingByToken(token)
  if (!view) return { ok: false, reason: 'not_found' }
  if (['canceled', 'completed', 'no_show'].includes(view.meeting.status)) return { ok: false, reason: 'closed' }

  const slot = new Date(input.slotIso)
  if (Number.isNaN(slot.getTime())) return { ok: false, reason: 'bad_slot' }
  const booked = await bookedSlotsAhead(now)
  // A reschedule of THIS meeting shouldn't collide with its own current time.
  const others = booked.filter((b) => b.getTime() !== view.meeting.scheduledAt?.getTime())
  if (!isSlotAvailable(slot, now, slotCfg(config.booking), others)) return { ok: false, reason: 'slot_taken' }

  await db
    .update(schema.prospectMeeting)
    .set({
      status: 'booked',
      scheduledAt: slot,
      attendeeName: input.name?.trim() || view.meeting.attendeeName || null,
      attendeeEmail: input.email?.trim()?.toLowerCase() || view.meeting.attendeeEmail || null,
      note: input.note?.trim() || view.meeting.note || null,
      bookedAt: now,
      canceledAt: null,
      remindedAt: null,
      updatedAt: now,
    })
    .where(eq(schema.prospectMeeting.id, view.meeting.id))

  await sendBookingEmails(view, slot, input.email?.trim()?.toLowerCase() || view.meeting.attendeeEmail || null)
  return { ok: true, scheduledAt: slot }
}

export async function cancelMeeting(token: string, now: Date = new Date()): Promise<{ ok: boolean }> {
  const view = await getMeetingByToken(token)
  if (!view) return { ok: false }
  await db
    .update(schema.prospectMeeting)
    .set({ status: 'canceled', canceledAt: now, updatedAt: now })
    .where(eq(schema.prospectMeeting.id, view.meeting.id))
  return { ok: true }
}

async function sendBookingEmails(view: BookingView, slot: Date, attendeeEmail: string | null): Promise<void> {
  const config = await getProspectingConfig()
  const durationMin = config.booking.durationMin
  const cal = googleCalendarLink({
    title: `${DEMO_TITLE} — ${view.prospectName}`,
    start: slot,
    durationMin,
    details: `Your Dream Create demo. Reschedule or cancel: ${APP_URL}/d/${view.meeting.token}`,
  })
  const whenForProspect = formatMeetingTime(slot, view.prospectTimeZone)

  // Prospect confirmation (best-effort).
  if (attendeeEmail) {
    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111">
        <h2 style="margin:0 0 8px">You're booked 🎉</h2>
        <p>Your Dream Create demo is set for <strong>${whenForProspect}</strong> (${durationMin} min).</p>
        <p style="margin:16px 0">
          <a href="${cal}" style="background:#0d9488;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Add to calendar</a>
        </p>
        <p style="color:#666;font-size:14px">Need a different time? <a href="${APP_URL}/d/${view.meeting.token}">Reschedule or cancel</a>.</p>
      </div>`
    try {
      await deliver({
        to: attendeeEmail,
        subject: `Your Dream Create demo — ${whenForProspect}`,
        html,
        from: OUTREACH_FROM,
        replyTo: OUTREACH_REPLY_TO,
      })
    } catch (err) {
      console.warn('[prospect-meetings] prospect confirmation failed', err instanceof Error ? err.message : err)
    }
  }

  // Owner alert (bell + forced email) in the host's own timezone.
  try {
    const orgId = await getPlatformOrgId()
    if (orgId) {
      const whenForHost = formatMeetingTime(slot, config.booking.hostTimeZone)
      await notifyOrgMembers(
        orgId,
        {
          bucket: 'comments',
          type: 'prospect_demo_booked',
          title: `📅 ${view.prospectName} booked a demo`,
          body: `${whenForHost}${attendeeEmail ? ` · ${attendeeEmail}` : ''}\nAdd to your calendar: ${cal}`,
          linkPath: '/platform/prospecting/call-list',
          forceEmail: true,
        },
        { roles: ['owner', 'admin'] },
      )
    }
  } catch (err) {
    console.warn('[prospect-meetings] owner alert failed', err instanceof Error ? err.message : err)
  }
}

export interface UpcomingMeeting {
  id: string
  prospectId: string
  prospectName: string
  scheduledAt: Date
  hostTimeZone: string
  attendeeEmail: string | null
}

export async function getUpcomingMeetings(limit = 20, now: Date = new Date()): Promise<UpcomingMeeting[]> {
  const rows = await db
    .select({
      id: schema.prospectMeeting.id,
      prospectId: schema.prospectMeeting.prospectId,
      name: schema.prospect.name,
      scheduledAt: schema.prospectMeeting.scheduledAt,
      hostTimeZone: schema.prospectMeeting.hostTimeZone,
      attendeeEmail: schema.prospectMeeting.attendeeEmail,
    })
    .from(schema.prospectMeeting)
    .innerJoin(schema.prospect, eq(schema.prospect.id, schema.prospectMeeting.prospectId))
    .where(and(eq(schema.prospectMeeting.status, 'booked'), gte(schema.prospectMeeting.scheduledAt, now)))
    .orderBy(asc(schema.prospectMeeting.scheduledAt))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    prospectId: r.prospectId,
    prospectName: r.name,
    scheduledAt: r.scheduledAt as Date,
    hostTimeZone: r.hostTimeZone,
    attendeeEmail: r.attendeeEmail,
  }))
}

/**
 * Reminder for demos ~24h out (window now+22h..now+26h) not yet reminded.
 * Bounded; called from the outreach cron. Best-effort per meeting.
 */
export async function runDemoReminders(now: Date = new Date()): Promise<{ sent: number }> {
  const from = new Date(now.getTime() + 22 * 60 * 60 * 1000)
  const to = new Date(now.getTime() + 26 * 60 * 60 * 1000)
  const rows = await db
    .select({
      meeting: schema.prospectMeeting,
      name: schema.prospect.name,
      tz: schema.prospect.timezone,
    })
    .from(schema.prospectMeeting)
    .innerJoin(schema.prospect, eq(schema.prospect.id, schema.prospectMeeting.prospectId))
    .where(
      and(
        eq(schema.prospectMeeting.status, 'booked'),
        isNull(schema.prospectMeeting.remindedAt),
        gte(schema.prospectMeeting.scheduledAt, from),
        lte(schema.prospectMeeting.scheduledAt, to),
      ),
    )
    .limit(50)

  let sent = 0
  for (const r of rows) {
    const slot = r.meeting.scheduledAt as Date
    const when = formatMeetingTime(slot, r.tz || 'America/New_York')
    if (r.meeting.attendeeEmail) {
      const html = `
        <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111">
          <p>Just a reminder — your Dream Create demo is tomorrow, <strong>${when}</strong>.</p>
          <p style="color:#666;font-size:14px">Need to change it? <a href="${APP_URL}/d/${r.meeting.token}">Reschedule or cancel</a>.</p>
        </div>`
      try {
        await deliver({
          to: r.meeting.attendeeEmail,
          subject: `Reminder: your Dream Create demo tomorrow — ${when}`,
          html,
          from: OUTREACH_FROM,
          replyTo: OUTREACH_FROM,
        })
      } catch {
        /* best-effort */
      }
    }
    await db
      .update(schema.prospectMeeting)
      .set({ remindedAt: now, updatedAt: now })
      .where(eq(schema.prospectMeeting.id, r.meeting.id))
    sent++
  }
  return { sent }
}
