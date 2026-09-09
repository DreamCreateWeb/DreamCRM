import 'server-only'
import { randomBytes } from 'crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { parseEmail, isJunkEmail } from '@/lib/prospect-email'
import { parsePracticeGradeResult } from '@/lib/practice-grade'
import {
  captureStatusOf,
  consentFootnote,
  deliverySubject,
  eventTaggedUrl,
  headshotObjectPath,
  isEventSlug,
  scanLine,
  HEADSHOT_MAX_BYTES,
  type CaptureInput,
  type CaptureRole,
  type CaptureStatus,
} from '@/lib/event-capture'
import { GRADER_UTM_SOURCE } from '@/lib/marketing-attribution'

/**
 * The conference capture kit's server side (docs/marketing-engine.md Part
 * 10.8, M1 slice 1). Two doors: the owner's phone on the floor (/e/<token>,
 * the event's capture token IS the auth) and the attendee's delivery page
 * (/h/<token>). The platform's Events tab manages events + attaches the
 * camera's headshots after the floor.
 *
 * The laws this file keeps:
 *  - The headshot email is TRANSACTIONAL and goes to everyone who asked for
 *    one. Nothing else goes to anyone who didn't tick the opt-in — enforced
 *    by a suppression row (the same table every automated sender checks)
 *    and resolved nurture stamps, not by a person remembering.
 *  - The Practice Scan pre-runs QUIETLY: no courtesy email (the delivery
 *    email carries the report link) and no Hunter alert (hundreds of
 *    "X graded their practice" notes in one afternoon is noise about people
 *    the owner just shook hands with). The prospect link is made here,
 *    with the honest 'event_met' signal.
 *  - Delivery fires the moment a photo is durable — at capture when the
 *    phone took it, or later when the owner attaches the camera's file —
 *    and is stamped so a retry can't send twice.
 */

const BASE_URL = () =>
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || 'https://www.dreamcreatestudio.com'

// ── Events ──────────────────────────────────────────────────────────────────

export interface EventRow {
  id: string
  slug: string
  name: string
  organizer: string | null
  state: string | null
  startsOn: string | null
  endsOn: string | null
  captureToken: string
  active: boolean
  createdAt: Date
}

function toEventRow(r: typeof schema.marketingEvent.$inferSelect): EventRow {
  return { ...r, active: r.active === 1 }
}

export type CreateEventOutcome = { ok: true; id: string } | { ok: false; error: string }

export async function createEvent(input: {
  name: string
  slug: string
  organizer?: string | null
  state?: string | null
  startsOn?: string | null
  endsOn?: string | null
}): Promise<CreateEventOutcome> {
  const name = input.name.trim().slice(0, 120)
  const slug = input.slug.trim().toLowerCase()
  if (!name) return { ok: false, error: 'Name the event.' }
  if (!isEventSlug(slug)) return { ok: false, error: 'The slug needs to look like asda-2026 (lowercase letters, numbers, dashes).' }
  const dateOk = (v: string | null | undefined) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (!dateOk(input.startsOn) || !dateOk(input.endsOn)) return { ok: false, error: 'Dates need to be YYYY-MM-DD.' }
  const [dupe] = await db
    .select({ id: schema.marketingEvent.id })
    .from(schema.marketingEvent)
    .where(eq(schema.marketingEvent.slug, slug))
    .limit(1)
  if (dupe) return { ok: false, error: `An event already uses the slug ${slug}.` }
  const id = newId('mevt')
  await db.insert(schema.marketingEvent).values({
    id,
    slug,
    name,
    organizer: input.organizer?.trim().slice(0, 160) || null,
    state: input.state?.trim().toUpperCase().slice(0, 2) || null,
    startsOn: input.startsOn || null,
    endsOn: input.endsOn || null,
    captureToken: randomBytes(16).toString('hex'),
    active: 1,
  })
  return { ok: true, id }
}

export async function setEventActive(id: string, active: boolean): Promise<void> {
  await db.update(schema.marketingEvent).set({ active: active ? 1 : 0 }).where(eq(schema.marketingEvent.id, id))
}

export async function listEvents(): Promise<EventRow[]> {
  const rows = await db.select().from(schema.marketingEvent).orderBy(desc(schema.marketingEvent.createdAt))
  return rows.map(toEventRow)
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const [row] = await db.select().from(schema.marketingEvent).where(eq(schema.marketingEvent.id, id)).limit(1)
  return row ? toEventRow(row) : null
}

/** The capture page's gate: an ACTIVE event whose token matches. */
export async function getEventByCaptureToken(token: string): Promise<EventRow | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  const [row] = await db
    .select()
    .from(schema.marketingEvent)
    .where(and(eq(schema.marketingEvent.captureToken, token), eq(schema.marketingEvent.active, 1)))
    .limit(1)
  return row ? toEventRow(row) : null
}

export interface EventStats {
  captures: number
  awaitingPhoto: number
  delivered: number
  optedIn: number
  scanned: number
}

export async function getEventStats(eventId: string): Promise<EventStats> {
  const [r] = await db
    .select({
      captures: sql<number>`count(*)::int`,
      awaitingPhoto: sql<number>`count(*) filter (where ${schema.eventCapture.photoUrl} is null or ${schema.eventCapture.deliveredAt} is null)::int`,
      delivered: sql<number>`count(*) filter (where ${schema.eventCapture.deliveredAt} is not null)::int`,
      optedIn: sql<number>`count(*) filter (where ${schema.eventCapture.optIn} = 1)::int`,
      scanned: sql<number>`count(*) filter (where ${schema.eventCapture.gradeId} is not null)::int`,
    })
    .from(schema.eventCapture)
    .where(eq(schema.eventCapture.eventId, eventId))
  return {
    captures: r?.captures ?? 0,
    awaitingPhoto: r?.awaitingPhoto ?? 0,
    delivered: r?.delivered ?? 0,
    optedIn: r?.optedIn ?? 0,
    scanned: r?.scanned ?? 0,
  }
}

// ── Captures ────────────────────────────────────────────────────────────────

export interface CaptureRow {
  id: string
  token: string
  firstName: string
  lastName: string
  email: string
  practiceName: string
  role: CaptureRole
  city: string | null
  photoUrl: string | null
  optIn: boolean
  gradeId: string | null
  gradeToken: string | null
  gradeLetter: string | null
  gradeOverall: number | null
  prospectId: string | null
  deliveredAt: Date | null
  createdAt: Date
  status: CaptureStatus
}

async function gradeSummaryFor(gradeId: string | null): Promise<{ token: string; letter: string | null; overall: number | null } | null> {
  if (!gradeId) return null
  const [g] = await db
    .select({ token: schema.practiceGrade.token, result: schema.practiceGrade.result })
    .from(schema.practiceGrade)
    .where(eq(schema.practiceGrade.id, gradeId))
    .limit(1)
  if (!g) return null
  const parsed = parsePracticeGradeResult(g.result)
  return { token: g.token, letter: parsed?.letter ?? null, overall: parsed?.overall ?? null }
}

export async function listCaptures(eventId: string): Promise<CaptureRow[]> {
  const rows = await db
    .select()
    .from(schema.eventCapture)
    .where(eq(schema.eventCapture.eventId, eventId))
    .orderBy(desc(schema.eventCapture.createdAt))
  const gradeIds = rows.map((r) => r.gradeId).filter((v): v is string => Boolean(v))
  const grades = gradeIds.length
    ? await db
        .select({ id: schema.practiceGrade.id, token: schema.practiceGrade.token, result: schema.practiceGrade.result })
        .from(schema.practiceGrade)
        .where(inArray(schema.practiceGrade.id, gradeIds))
    : []
  const byId = new Map(grades.map((g) => [g.id, g]))
  return rows.map((r) => {
    const g = r.gradeId ? byId.get(r.gradeId) : undefined
    const parsed = g ? parsePracticeGradeResult(g.result) : null
    return {
      id: r.id,
      token: r.token,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      practiceName: r.practiceName,
      role: r.role as CaptureRole,
      city: r.city,
      photoUrl: r.photoUrl,
      optIn: r.optIn === 1,
      gradeId: r.gradeId,
      gradeToken: g?.token ?? null,
      gradeLetter: parsed?.letter ?? null,
      gradeOverall: parsed?.overall ?? null,
      prospectId: r.prospectId,
      deliveredAt: r.deliveredAt,
      createdAt: r.createdAt,
      status: captureStatusOf(r),
    }
  })
}

export type CreateCaptureOutcome =
  | { ok: true; id: string; delivered: boolean; scanned: boolean }
  | { ok: false; error: string }

/** A photo handed to the capture as bytes + a SNIFFED content type (the
 *  action sniffs; the service trusts nothing else about the upload). */
export interface CapturePhoto {
  bytes: Buffer
  contentType: 'image/jpeg' | 'image/png' | 'image/webp'
}

/**
 * One attendee, captured. Order matters for crash-consistency: the row is
 * durable BEFORE the scan (a scan that dies mid-way must not lose the
 * person), the photo before delivery, and delivery stamps itself.
 */
export async function createCapture(
  event: EventRow,
  input: CaptureInput,
  photo: CapturePhoto | null,
): Promise<CreateCaptureOutcome> {
  const parsed = parseEmail(input.email)
  if (!parsed || isJunkEmail(parsed.email)) {
    return { ok: false, error: 'That email doesn’t look deliverable — check it, it’s where the headshot goes.' }
  }
  const email = parsed.email
  const id = newId('mcap')
  const token = randomBytes(16).toString('hex')
  const now = new Date()

  await db.insert(schema.eventCapture).values({
    id,
    eventId: event.id,
    token,
    firstName: input.firstName,
    lastName: input.lastName,
    email,
    practiceName: input.practiceName,
    role: input.role,
    city: input.city,
    photoReleaseAt: now,
    optIn: input.optIn ? 1 : 0,
    optInAt: input.optIn ? now : null,
  })

  // Consent, at the machine level. "No" = a suppression row every automated
  // sender already honors; "yes" in person is a fresh consent that clears a
  // prior unsubscribe (never a bounce or complaint — those are facts about
  // the address, not choices).
  try {
    if (input.optIn) {
      await db
        .delete(schema.prospectSuppression)
        .where(and(eq(schema.prospectSuppression.email, email), inArray(schema.prospectSuppression.reason, ['unsub', 'no_consent'])))
    } else {
      await db
        .insert(schema.prospectSuppression)
        .values({ id: newId('psup'), email, domain: parsed.domain ?? null, reason: 'no_consent' })
        .onConflictDoNothing()
    }
  } catch (err) {
    console.warn('[event-capture] consent write failed', err)
  }

  // The Practice Scan — quiet (no courtesy email, no Hunter alert). Best-
  // effort: a scan that fails still leaves a person with a headshot coming.
  let gradeId: string | null = null
  let scanned = false
  try {
    const { runPracticeGrade } = await import('./practice-grader')
    const res = await runPracticeGrade({
      practiceName: input.practiceName,
      email,
      city: input.city,
      state: event.state,
      quiet: true,
      hunter: false,
    })
    if (res.ok) {
      const [g] = await db
        .select({ id: schema.practiceGrade.id })
        .from(schema.practiceGrade)
        .where(eq(schema.practiceGrade.token, res.token))
        .limit(1)
      gradeId = g?.id ?? null
      scanned = Boolean(gradeId)
      // No opt-in → the nurture never touches this report: resolve both
      // stamps now (the daily cron treats a stamp as "handled").
      if (gradeId && !input.optIn) {
        await db
          .update(schema.practiceGrade)
          .set({ nurtureReportAt: now, nurtureRegradeAt: now })
          .where(eq(schema.practiceGrade.id, gradeId))
      }
    }
  } catch (err) {
    console.warn('[event-capture] scan failed', err)
  }

  // The Hunter link, with the honest signal: an existing prospect by email
  // is promoted to the call list quietly; a name+state match is linked; a
  // stranger is minted as an event-sourced prospect.
  let prospectId: string | null = null
  try {
    prospectId = await linkProspect({
      email,
      practiceName: input.practiceName,
      city: input.city,
      state: event.state,
      eventName: event.name,
      gradeLetter: null,
    })
  } catch (err) {
    console.warn('[event-capture] prospect link failed', err)
  }
  if (gradeId && prospectId) {
    try {
      await db.update(schema.practiceGrade).set({ prospectId }).where(eq(schema.practiceGrade.id, gradeId))
    } catch {
      /* best-effort */
    }
  }

  await db
    .update(schema.eventCapture)
    .set({ gradeId, prospectId })
    .where(eq(schema.eventCapture.id, id))

  // The photo, when the phone took one — then delivery.
  let delivered = false
  if (photo) {
    const attached = await attachHeadshot(id, photo)
    delivered = attached.ok && attached.delivered
  }
  return { ok: true, id, delivered, scanned }
}

async function linkProspect(i: {
  email: string
  practiceName: string
  city: string | null
  state: string | null
  eventName: string
  gradeLetter: string | null
}): Promise<string | null> {
  const summary = `Met in person at ${i.eventName} — took a free headshot.`
  const [byEmail] = await db
    .select({ id: schema.prospect.id, status: schema.prospect.status })
    .from(schema.prospect)
    .where(sql`lower(${schema.prospect.email}) = ${i.email}`)
    .limit(1)
  if (byEmail) {
    if (!['converted', 'suppressed', 'not_interested', 'disqualified'].includes(byEmail.status)) {
      await db
        .update(schema.prospect)
        .set({ status: 'call_list', intentSignal: 'event_met', intentAt: new Date(), intentSummary: summary, updatedAt: new Date() })
        .where(eq(schema.prospect.id, byEmail.id))
    }
    return byEmail.id
  }
  const { findExistingProspect, addGraderProspect } = await import('./prospecting')
  const existing = await findExistingProspect({ name: i.practiceName, state: i.state })
  if (existing) return existing.id
  const created = await addGraderProspect({
    name: i.practiceName,
    email: i.email,
    city: i.city,
    state: i.state,
    gradeSummary: summary,
    intent: { emailSource: 'event', signal: 'event_met' },
  })
  return created.id
}

export type AttachOutcome = { ok: true; delivered: boolean } | { ok: false; error: string }

/**
 * Attach the headshot bytes to a capture and deliver. Idempotent on
 * delivery: a capture already delivered gets its photo REPLACED (the owner
 * re-edited it) but no second email — the attendee's page shows the new
 * file. An undelivered one gets the email, stamped only after it went out.
 */
export async function attachHeadshot(captureId: string, photo: CapturePhoto): Promise<AttachOutcome> {
  if (photo.bytes.length === 0) return { ok: false, error: 'That file is empty.' }
  if (photo.bytes.length > HEADSHOT_MAX_BYTES) return { ok: false, error: 'That photo is too large — export it under 8 MB.' }
  const [row] = await db
    .select()
    .from(schema.eventCapture)
    .where(eq(schema.eventCapture.id, captureId))
    .limit(1)
  if (!row) return { ok: false, error: 'That capture no longer exists.' }
  const event = await getEvent(row.eventId)
  if (!event) return { ok: false, error: 'That event no longer exists.' }

  const { uploadBlob } = await import('@/lib/blob')
  const stored = await uploadBlob(headshotObjectPath(event.slug, captureId, photo.contentType), photo.bytes, {
    contentType: photo.contentType,
  })
  await db.update(schema.eventCapture).set({ photoUrl: stored.url }).where(eq(schema.eventCapture.id, captureId))
  if (row.deliveredAt) return { ok: true, delivered: false }

  const delivered = await deliverHeadshot({ ...row, photoUrl: stored.url }, event)
  return { ok: true, delivered }
}

async function deliverHeadshot(row: typeof schema.eventCapture.$inferSelect, event: EventRow): Promise<boolean> {
  if (!row.photoUrl) return false
  const grade = await gradeSummaryFor(row.gradeId)
  const base = BASE_URL()
  const pageUrl = eventTaggedUrl(base, `/h/${row.token}`, event.slug)
  const reportUrl = grade
    ? `${base}/g/${grade.token}?utm_source=${GRADER_UTM_SOURCE}&utm_medium=email&utm_campaign=${encodeURIComponent(event.slug)}`
    : null
  const copy = {
    firstName: row.firstName,
    eventName: event.name,
    organizer: event.organizer,
    practiceName: row.practiceName,
    grade: grade ? { letter: grade.letter, overall: grade.overall } : null,
    optIn: row.optIn === 1,
  }
  const scan = scanLine(copy)
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const introHtml =
    `<p>Hi ${esc(row.firstName)} — great meeting you at ${esc(event.name)}. Here’s your headshot; it’s yours to use anywhere.</p>` +
    `<p style="margin:16px 0"><a href="${esc(pageUrl)}"><img src="${esc(row.photoUrl)}" alt="Your headshot" width="320" style="display:block;width:320px;max-width:100%;height:auto;border-radius:12px" /></a></p>` +
    (scan
      ? `<p>${esc(scan)}${reportUrl ? ` <a href="${esc(reportUrl)}">See the report →</a>` : ''}</p>`
      : '')
  try {
    const { deliver, authEmailShell } = await import('@/lib/email')
    await deliver({
      to: row.email,
      subject: deliverySubject({ eventName: event.name }),
      html: authEmailShell({
        heading: 'Your headshot is ready',
        introHtml,
        buttonUrl: pageUrl,
        buttonLabel: 'Download the full-size photo',
        footnoteHtml: esc(consentFootnote({ optIn: row.optIn === 1, organizer: event.organizer })),
      }),
      tags: [
        { name: 'kind', value: 'event-headshot' },
        { name: 'event', value: event.slug },
      ],
    })
  } catch (err) {
    console.warn('[event-capture] delivery failed', err)
    return false
  }
  await db.update(schema.eventCapture).set({ deliveredAt: new Date() }).where(eq(schema.eventCapture.id, row.id))
  return true
}

/** Re-send for a delivered capture the owner asks to resend (a typo'd
 *  address fixed by hand, say). Delivers only when a photo exists. */
export async function resendHeadshot(captureId: string): Promise<boolean> {
  const [row] = await db.select().from(schema.eventCapture).where(eq(schema.eventCapture.id, captureId)).limit(1)
  if (!row?.photoUrl) return false
  const event = await getEvent(row.eventId)
  if (!event) return false
  return deliverHeadshot(row, event)
}

// ── The attendee's page ─────────────────────────────────────────────────────

export interface PublicCaptureView {
  firstName: string
  practiceName: string
  eventName: string
  organizer: string | null
  eventSlug: string
  photoUrl: string | null
  grade: { token: string; letter: string | null; overall: number | null } | null
}

export async function getCaptureByToken(token: string): Promise<PublicCaptureView | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  const [row] = await db.select().from(schema.eventCapture).where(eq(schema.eventCapture.token, token)).limit(1)
  if (!row) return null
  const event = await getEvent(row.eventId)
  if (!event) return null
  const grade = await gradeSummaryFor(row.gradeId)
  return {
    firstName: row.firstName,
    practiceName: row.practiceName,
    eventName: event.name,
    organizer: event.organizer,
    eventSlug: event.slug,
    photoUrl: row.photoUrl,
    grade,
  }
}
