import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { DEMO_FEATURED_PATIENT_IDXS, buildDemoTestimonials } from './reviews-data'

// The /messages inbox: threads, bodies, attachments, packets, scheduled sends.

/**
 * Seed Patient Communications (Phase A) demo content. Lays down 5 patient
 * threads with mixed in-app + email channel messages covering every
 * thread-state combination: open with unread (red rot), open without
 * unread, snoozed, archived, and one with no unread (the happy path).
 *
 * Idempotency: checks existing thread patient ids per org; only inserts
 * threads for patients that don't already have one. Each newly-seeded
 * thread gets a curated message sequence. Re-running on a topped-up demo
 * doesn't duplicate.
 *
 * Used by both the new-clinic-seed path AND the self-heal path on legacy
 * demos.
 */
export async function seedPatientMessagesForOrg(
  orgId: string,
  now: Date,
  patientIds: Array<string | null>,
  existingThreadPatientIds: Set<string>,
): Promise<{ threadsAdded: number; messagesAdded: number }> {
  const hourMs = 60 * 60 * 1000

  // Reference personas (index-aligned to demo-clinic.ts buildPatientPersonas):
  //   [0] Mia Hayes      — happy-path, closed-loop appointment scheduling
  //   [3] Marcus Johnson — outstanding balance, unconfirmed appt (red rot)
  //   [4] Sophia Iverson — confirmed appt in 22h, closed exchange
  //   [5] Aiden Kim      — lapsed-returning, snoozed thread
  //   [6] Emma Lopez     — fresh-booked, single inbound email (open)
  //   [10] Mason Garza   — website appointment REQUEST (request-only booking)
  interface SeedThread {
    patientIdx: number
    status: 'open' | 'snoozed' | 'archived'
    snoozedInHours?: number
    starred?: boolean
    messages: Array<{
      direction: 'inbound' | 'outbound'
      channel: 'in_app' | 'email'
      body: string
      hoursAgo: number
      attachments?: Array<{ url: string; name: string; contentType: string }>
    }>
  }
  const THREAD_SEEDS: SeedThread[] = [
    // Mia — happy path, recently confirmed, closed
    {
      patientIdx: 0,
      status: 'open',
      messages: [
        { direction: 'outbound', channel: 'email', body: 'Hi Mia — just confirming your cleaning has been moved to next week per our chat. New time is on the calendar. Let us know if anything changes. — The team', hoursAgo: 72 },
        { direction: 'inbound', channel: 'email', body: 'Perfect, thank you! That works much better for me. See you then.', hoursAgo: 71 },
        { direction: 'outbound', channel: 'in_app', body: 'Got it. We\'ll send a reminder the day before.', hoursAgo: 70 },
      ],
    },
    // Marcus — RED ROT: inbound 3 days ago, no reply. Starred for priority
    // (showcases the star marker + Starred filter).
    {
      patientIdx: 3,
      status: 'open',
      starred: true,
      messages: [
        { direction: 'outbound', channel: 'in_app', body: 'Hi Marcus, your filling appointment is coming up. We\'ll see you Tuesday at 10am.', hoursAgo: 96 },
        { direction: 'inbound', channel: 'in_app', body: 'Hey, quick question about insurance pre-auth — did the request go through? My HR rep said she hadn\'t seen anything yet.', hoursAgo: 75 },
        { direction: 'inbound', channel: 'in_app', body: 'Also can I bring my partner along for the consultation? She had some questions about her own treatment.', hoursAgo: 74 },
      ],
    },
    // Sophia — confirmed appointment, recently closed.
    // Three+ historical inbound in-app messages so the composer
    // surfaces a "Sophia prefers in-app" preference label.
    {
      patientIdx: 4,
      status: 'open',
      messages: [
        { direction: 'outbound', channel: 'in_app', body: 'Hi Sophia — friendly reminder your cleaning is Friday at 3pm. Reply YES to confirm.', hoursAgo: 240 },
        { direction: 'inbound', channel: 'in_app', body: 'Yes, got it! See you Friday.', hoursAgo: 238 },
        { direction: 'inbound', channel: 'in_app', body: 'Quick question — should I avoid coffee that morning or just brush after?', hoursAgo: 168 },
        { direction: 'outbound', channel: 'in_app', body: 'Either is fine! Just no coffee in the chair 😄', hoursAgo: 167 },
        { direction: 'outbound', channel: 'in_app', body: 'Hi Sophia — confirming your cleaning tomorrow at 3pm with Maria. Reply YES to confirm or let us know if you need to reschedule.', hoursAgo: 6 },
        { direction: 'inbound', channel: 'in_app', body: 'Yes! See you tomorrow.', hoursAgo: 4 },
      ],
    },
    // Aiden — snoozed (post-rebooking, will resurface tomorrow)
    {
      patientIdx: 5,
      status: 'snoozed',
      snoozedInHours: 24,
      messages: [
        { direction: 'outbound', channel: 'email', body: 'Hi Aiden — so glad you\'re coming back in! Your appointment Wednesday at 1pm is on the books. A few first-visit-back things to know: please arrive 10 minutes early to update your medical history, and we\'ll do a quick exam alongside the cleaning since it\'s been a while.', hoursAgo: 18 },
        { direction: 'inbound', channel: 'email', body: 'Thanks, see you Wednesday!', hoursAgo: 14 },
      ],
    },
    // Emma — AMBER ROT: inbound this morning, no reply yet (high-priority unread)
    {
      patientIdx: 6,
      status: 'open',
      messages: [
        {
          direction: 'inbound',
          channel: 'email',
          body: 'Hi! Quick question — I booked through your website for next week but I forgot to mention I have a temporary crown on a back molar that\'s been bothering me. Could we look at that during the consult, or do I need a separate appointment? I snapped a photo so you can see what I mean.',
          hoursAgo: 16,
          // A patient attaching a photo of their concern — the headline use case.
          attachments: [
            {
              url: 'https://images.unsplash.com/photo-1606265752439-1f18756aa8ed?w=900&q=80',
              name: 'tooth-photo.jpg',
              contentType: 'image/jpeg',
            },
          ],
        },
      ],
    },
    // Mason — a website APPOINTMENT REQUEST: exactly what request-only booking
    // produces when a clinic turns self-scheduling off. A fresh inbound email
    // the front desk hasn't answered yet — showcases the /messages payoff of the
    // self-booking toggle (Settings → Practice).
    {
      patientIdx: 10,
      status: 'open',
      messages: [
        { direction: 'inbound', channel: 'email', body: 'New appointment request via the website.\nLooking for: New patient cleaning & exam\nPreferred times: Weekday mornings\n\nIt\'s been a couple of years since my last visit — hoping to get established with a dentist close by.', hoursAgo: 5 },
      ],
    },
  ]

  let threadsAdded = 0
  let messagesAdded = 0

  for (const seed of THREAD_SEEDS) {
    if (seed.patientIdx >= patientIds.length) continue
    const patientId = patientIds[seed.patientIdx]
    if (!patientId) continue // persona missing — never fall back to a real patient
    if (existingThreadPatientIds.has(patientId)) continue

    const threadId = newId('pthread')
    const sortedMessages = [...seed.messages].sort((a, b) => b.hoursAgo - a.hoursAgo)
    const lastMessage = sortedMessages[sortedMessages.length - 1]
    const inboundAfterLastOutbound = (() => {
      // Count inbound messages that came after the last outbound (the unread
      // count). Mirrors the real recordInboundMessage behavior.
      let count = 0
      for (let i = sortedMessages.length - 1; i >= 0; i--) {
        if (sortedMessages[i].direction === 'inbound') count++
        else break
      }
      return count
    })()

    await db.insert(schema.patientThread).values({
      id: threadId,
      organizationId: orgId,
      patientId,
      status: seed.status,
      snoozedUntil: seed.snoozedInHours ? new Date(now.getTime() + seed.snoozedInHours * hourMs) : null,
      lastMessageAt: new Date(now.getTime() - lastMessage.hoursAgo * hourMs),
      lastMessageDirection: lastMessage.direction,
      lastMessageChannel: lastMessage.channel,
      unreadCountForClinic: inboundAfterLastOutbound,
      starred: seed.starred ?? false,
      createdAt: new Date(now.getTime() - sortedMessages[0].hoursAgo * hourMs),
      updatedAt: new Date(now.getTime() - lastMessage.hoursAgo * hourMs),
    })
    threadsAdded++

    const newestHoursAgo = Math.min(...sortedMessages.map((x) => x.hoursAgo))
    for (const m of sortedMessages) {
      const sentAt = new Date(now.getTime() - m.hoursAgo * hourMs)
      const isOutboundInApp = m.direction === 'outbound' && m.channel === 'in_app'
      await db.insert(schema.patientMessage).values({
        id: newId('pmsg'),
        threadId,
        organizationId: orgId,
        patientId,
        channel: m.channel,
        direction: m.direction,
        body: m.body,
        sentByUserId: null, // demo seeder doesn't tie to a specific staff user
        sentAt,
        // Delivery receipts: in-app delivers on send; mark all but the newest
        // outbound as read so the demo shows both "Read ✓✓" and a fresh
        // "Delivered ✓".
        deliveredAt: isOutboundInApp ? new Date(sentAt.getTime() + 2_000) : null,
        readByPatientAt:
          isOutboundInApp && m.hoursAgo > newestHoursAgo
            ? new Date(sentAt.getTime() + 30 * 60_000)
            : null,
        ...(m.attachments && m.attachments.length > 0 ? { meta: { attachments: m.attachments } } : {}),
      })
      messagesAdded++
    }
  }

  return { threadsAdded, messagesAdded }
}

/**
 * Idempotent top-up: ensures Sophia's thread has at least 3 inbound
 * in-app messages so the composer's "prefers in-app" label demos in
 * legacy demos (the original seed only put 1 inbound on her thread,
 * below the preference threshold). Inserts the missing historicals
 * only — running this twice is a no-op.
 */
export async function topUpSophiaPreferenceMessages(
  orgId: string,
  patientIds: Array<string | null>,
  now: Date,
): Promise<void> {
  const hourMs = 60 * 60 * 1000
  const sophiaId = patientIds[4]
  if (!sophiaId) return

  const [thread] = await db
    .select({ id: schema.patientThread.id })
    .from(schema.patientThread)
    .where(
      and(
        eq(schema.patientThread.organizationId, orgId),
        eq(schema.patientThread.patientId, sophiaId),
      ),
    )
    .limit(1)
  if (!thread) return

  const existingMessages = await db
    .select({ direction: schema.patientMessage.direction, channel: schema.patientMessage.channel })
    .from(schema.patientMessage)
    .where(eq(schema.patientMessage.threadId, thread.id))
  const inboundInApp = existingMessages.filter(
    (m) => m.direction === 'inbound' && m.channel === 'in_app',
  ).length
  if (inboundInApp >= 3) return // already topped up

  const fills = [
    { direction: 'outbound' as const, body: 'Hi Sophia — friendly reminder your cleaning is Friday at 3pm. Reply YES to confirm.', hoursAgo: 240 },
    { direction: 'inbound' as const, body: 'Yes, got it! See you Friday.', hoursAgo: 238 },
    { direction: 'inbound' as const, body: 'Quick question — should I avoid coffee that morning or just brush after?', hoursAgo: 168 },
    { direction: 'outbound' as const, body: 'Either is fine! Just no coffee in the chair 😄', hoursAgo: 167 },
  ]
  for (const f of fills) {
    await db.insert(schema.patientMessage).values({
      id: newId('pmsg'),
      threadId: thread.id,
      organizationId: orgId,
      patientId: sophiaId,
      channel: 'in_app',
      direction: f.direction,
      body: f.body,
      sentByUserId: null,
      sentAt: new Date(now.getTime() - f.hoursAgo * hourMs),
    })
  }
}

/**
 * Idempotent self-heal: attach the demo "tooth photo" to Emma's most-recent
 * inbound message so legacy demos (seeded before attachments shipped) showcase
 * the photo-attachment render on /messages + the portal. Skips when any message
 * in her thread already has an attachment (so a hand-edited demo isn't touched).
 */
export async function topUpEmmaAttachment(orgId: string, patientIds: Array<string | null>): Promise<void> {
  const emmaId = patientIds[6]
  if (!emmaId) return

  const [thread] = await db
    .select({ id: schema.patientThread.id })
    .from(schema.patientThread)
    .where(and(eq(schema.patientThread.organizationId, orgId), eq(schema.patientThread.patientId, emmaId)))
    .limit(1)
  if (!thread) return

  const msgs = await db
    .select({
      id: schema.patientMessage.id,
      direction: schema.patientMessage.direction,
      sentAt: schema.patientMessage.sentAt,
      meta: schema.patientMessage.meta,
    })
    .from(schema.patientMessage)
    .where(eq(schema.patientMessage.threadId, thread.id))
  if (msgs.length === 0) return
  // Already has an attachment somewhere → nothing to do.
  if (msgs.some((m) => Array.isArray((m.meta as { attachments?: unknown } | null)?.attachments) && ((m.meta as { attachments?: unknown[] }).attachments?.length ?? 0) > 0)) {
    return
  }
  // Target the newest inbound message (her concern note).
  const inbound = msgs.filter((m) => m.direction === 'inbound').sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
  const target = inbound[0] ?? msgs.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())[0]
  await db
    .update(schema.patientMessage)
    .set({
      meta: {
        attachments: [
          {
            url: 'https://images.unsplash.com/photo-1606265752439-1f18756aa8ed?w=900&q=80',
            name: 'tooth-photo.jpg',
            contentType: 'image/jpeg',
          },
        ],
      },
    })
    .where(eq(schema.patientMessage.id, target.id))
}

/**
 * Idempotent seed of a pending "send later" message so the scheduled-send strip
 * demos on /messages. Marcus (the unanswered RED-ROT thread) gets a drafted
 * reply queued for ~2 days out — far enough that it stays "Scheduled" between
 * frequent deploys, and in_app so if the cron ever flushes it the result is a
 * harmless message row (no network). Skips when a pending row already exists.
 */
/** Idempotent self-heal: star Marcus's thread so legacy demos showcase the
 *  star marker + Starred filter. Skips when any thread is already starred (so a
 *  hand-curated demo isn't overridden). */
export async function topUpStarredThread(orgId: string, patientIds: Array<string | null>): Promise<void> {
  const marcusId = patientIds[3]
  if (!marcusId) return
  const [alreadyStarred] = await db
    .select({ id: schema.patientThread.id })
    .from(schema.patientThread)
    .where(and(eq(schema.patientThread.organizationId, orgId), eq(schema.patientThread.starred, true)))
    .limit(1)
  if (alreadyStarred) return
  await db
    .update(schema.patientThread)
    .set({ starred: true })
    .where(and(eq(schema.patientThread.organizationId, orgId), eq(schema.patientThread.patientId, marcusId)))
}

/** Idempotent: bundle the demo's two intake forms into a "New Patient Packet"
 *  so the packets manager + the public sequential flow showcase. No-op when a
 *  packet already exists or the forms aren't both present. */
export async function seedDemoPacket(orgId: string): Promise<void> {
  const [existingPacket] = await db
    .select({ id: schema.formPacket.id })
    .from(schema.formPacket)
    .where(eq(schema.formPacket.organizationId, orgId))
    .limit(1)
  if (existingPacket) return
  const forms = await db
    .select({ id: schema.formTemplate.id, slug: schema.formTemplate.slug })
    .from(schema.formTemplate)
    .where(eq(schema.formTemplate.organizationId, orgId))
  const intake = forms.find((f) => f.slug === 'new-patient-intake')
  const update = forms.find((f) => f.slug === 'returning-patient-update')
  if (!intake || !update) return
  await db.insert(schema.formPacket).values({
    id: newId('pkt'),
    organizationId: orgId,
    title: 'New Patient Packet',
    slug: 'new-patient-packet',
    formIds: [intake.id, update.id],
  })
}

export async function seedDemoScheduledMessage(orgId: string, patientIds: Array<string | null>, now: Date): Promise<void> {
  const marcusId = patientIds[3]
  if (!marcusId) return
  const [existing] = await db
    .select({ id: schema.scheduledMessage.id })
    .from(schema.scheduledMessage)
    .where(
      and(
        eq(schema.scheduledMessage.organizationId, orgId),
        eq(schema.scheduledMessage.status, 'pending'),
      ),
    )
    .limit(1)
  if (existing) return
  await db.insert(schema.scheduledMessage).values({
    id: newId('smsg'),
    organizationId: orgId,
    patientId: marcusId,
    channel: 'in_app',
    body: "Hi Marcus — good news: your insurance pre-auth came through. You're all set for Tuesday, and yes, your partner is welcome to join the consultation.",
    attachments: [],
    scheduledFor: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
    status: 'pending',
    createdByUserId: null,
  })
}

/**
 * Idempotent self-heal for legacy demos whose `clinic_profile.testimonials`
 * still hold the original free-text "Sarah K. / Marcus T. / Jen R." shapes
 * (no `patientId` link). Reads the seeded patient personas, rebuilds the
 * testimonial array via `buildDemoTestimonials`, and writes only when no
 * existing testimonial is patient-linked yet. Skips when the clinic has
 * already promoted any review (so a hand-curated set isn't clobbered).
 */
export async function topUpLinkedDemoTestimonials(
  orgId: string,
  patientIds: Array<string | null>,
): Promise<void> {
  if (patientIds.length === 0) return
  const [profile] = await db
    .select({ testimonials: schema.clinicProfile.testimonials })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, orgId))
    .limit(1)
  if (!profile) return
  const current = (profile.testimonials ?? []) as Array<{ patientId?: string | null; quote?: string }>
  const expectedLinked = DEMO_FEATURED_PATIENT_IDXS.length
  const currentLinked = current.filter((t) => !!t.patientId).length
  // one-time (2026-06): Acme→Dream Dental — a stored testimonial quote that
  // still names "Acme" predates the rename and must be rebuilt even when the
  // demo is already fully linked. buildDemoTestimonials sources fresh quotes
  // from DEMO_REVIEW_TEXTS (now Dream Dental copy). Remove with the rename.
  const hasAcmeQuote = current.some(
    (t) => typeof t.quote === 'string' && t.quote.includes('Acme'),
  )
  // Skip when the demo is already up to date OR when a real clinic has
  // curated more linked testimonials than the seed defines (don't clobber) —
  // unless a stale Acme quote forces a rebuild.
  if (currentLinked >= expectedLinked && !hasAcmeQuote) return

  // Re-fetch the seeded patients by their canonical name so we can build the
  // "First L." + city display labels. We match by (firstName, lastName)
  // rather than insertion order — the personas at indices 0/1/2/3/4/5/6/7
  // are the well-known seeded shapes (Mia Hayes, Liam Brooks, …).
  const rows = await db
    .select({
      id: schema.patient.id,
      firstName: schema.patient.firstName,
      lastName: schema.patient.lastName,
      city: schema.patient.city,
      state: schema.patient.state,
    })
    .from(schema.patient)
    .where(eq(schema.patient.organizationId, orgId))
  // Index-aligned to DEMO_FEATURED_PATIENT_IDXS — keep this in sync
  // when adding new linked seeds. Slots that aren't referenced by any seed
  // can stay null-filled; buildDemoTestimonials guards on a missing match.
  const personaTargets: Array<{ firstName: string; lastName: string } | null> = [
    { firstName: 'Mia', lastName: 'Hayes' },          // [0]
    { firstName: 'Liam', lastName: 'Brooks' },        // [1]
    { firstName: 'Charlotte', lastName: 'Diaz' },     // [2]
    { firstName: 'Marcus', lastName: 'Johnson' },     // [3]
    { firstName: 'Sophia', lastName: 'Iverson' },     // [4]
    { firstName: 'Aiden', lastName: 'Kim' },          // [5]
    { firstName: 'Emma', lastName: 'Lopez' },         // [6]
    { firstName: 'Noah', lastName: 'Mitchell' },      // [7]
    null,                                             // [8]  Olivia Anderson — unused by seeds
    null,                                             // [9]  Ethan Carter   — unused
    null,                                             // [10] Isabella Evans — unused
    { firstName: 'Mason', lastName: 'Garza' },        // [11]
  ]
  const matched = personaTargets.map((t) =>
    t ? rows.find((r) => r.firstName === t.firstName && r.lastName === t.lastName) ?? null : null,
  )
  const orderedIds = matched.map((m) => m?.id ?? '')
  const orderedPersonas = matched.map((m) => ({
    firstName: m?.firstName ?? '',
    lastName: m?.lastName ?? '',
    city: m?.city ?? null,
    state: m?.state ?? null,
  }))

  await db
    .update(schema.clinicProfile)
    .set({
      testimonials: buildDemoTestimonials(orderedIds, orderedPersonas),
      updatedAt: new Date(),
    })
    .where(eq(schema.clinicProfile.organizationId, orgId))
}
