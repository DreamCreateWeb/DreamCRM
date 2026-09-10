import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { seedSystemTemplates, SYSTEM_TEMPLATES } from '@/lib/services/marketing-templates'

// The recall/reactivation outreach history behind the Growth funnels.

/**
 * Seed Recall & Outreach (Phase A) demo content. Lays down 4 patient-source
 * audiences + 3 campaigns covering every status state (sent / scheduled /
 * draft) so the /marketing dashboard never looks empty on a fresh demo.
 *
 * Idempotency: checks existing audience + campaign names per org; only
 * inserts those that are missing. Events for the "sent" campaign are only
 * inserted when the campaign itself was newly created — re-running on a
 * topped-up demo doesn't duplicate them.
 *
 * Used by both the new-clinic-seed path AND the self-heal path on legacy
 * demos (existingAudienceNames + existingCampaignNames passed in from the
 * caller's per-org lookup).
 */
export async function seedRecallOutreachForOrg(
  orgId: string,
  now: Date,
  patientIds: Array<string | null>,
  existingAudiencesByName: Map<string, number>,
  existingCampaignsByName: Map<string, number>,
): Promise<{ audiencesAdded: number; campaignsAdded: number; eventsAdded: number }> {
  // Make sure the 3 system templates are in the DB. One select + 0..3
  // inserts; cheap when already-seeded.
  await seedSystemTemplates()

  const dayMs = 24 * 60 * 60 * 1000

  // Look up the system template ids by name so seeded campaigns can attach
  // a templateId for "Created from template X" provenance.
  const tplRows = await db
    .select({ id: schema.campaignTemplates.id, name: schema.campaignTemplates.name })
    .from(schema.campaignTemplates)
    .where(eq(schema.campaignTemplates.kind, 'system'))
  const tplIdByName = new Map(tplRows.map((r) => [r.name, r.id]))

  // ── Audiences ────────────────────────────────────────────────────────
  // 4 dental segments matching the patient-flag glyphs. Each audience
  // stores a `patientFilter` JSON that resolveAudience knows how to
  // materialize. recipientSource='patients' is the discriminator.
  interface AudienceSeed {
    name: string
    description: string
    patientFilter: Record<string, unknown>
  }
  const AUDIENCE_SEEDS: AudienceSeed[] = [
    {
      name: 'Recall due (6+ months)',
      description: 'Patients whose last cleaning was over 6 months ago without a future booking. Drives the Reactivation campaign.',
      patientFilter: {
        recallStatuses: ['due', 'overdue'],
        requireEmailOptIn: true,
        requireSmsOptIn: false,
        includeArchived: false,
      },
    },
    {
      name: 'Lapsed (lifecycle = lapsed)',
      description: 'Lifecycle stage flipped to lapsed — last visit >9 months ago. Tighter than "Recall due" — these are the cold ones.',
      patientFilter: {
        lifecycles: ['lapsed', 'at_risk'],
        requireEmailOptIn: true,
        requireSmsOptIn: false,
        includeArchived: false,
      },
    },
    {
      name: 'New patients (past 60 days)',
      description: 'Recently joined — for new-patient welcome sequences and check-in surveys.',
      patientFilter: {
        lifecycles: ['new'],
        requireEmailOptIn: true,
        requireSmsOptIn: false,
        includeArchived: false,
      },
    },
    {
      name: 'Birthday this month',
      description: 'Patients celebrating a birthday this calendar month — for the warm-monthly outreach.',
      patientFilter: {
        birthdayThisMonth: true,
        requireEmailOptIn: true,
        requireSmsOptIn: false,
        includeArchived: false,
      },
    },
  ]

  const audienceIdByName = new Map(existingAudiencesByName)
  let audiencesAdded = 0
  for (const seed of AUDIENCE_SEEDS) {
    if (audienceIdByName.has(seed.name)) continue
    const [row] = await db
      .insert(schema.audiences)
      .values({
        organizationId: orgId,
        name: seed.name,
        description: seed.description,
        recipientSource: 'patients',
        filter: {},
        patientFilter: seed.patientFilter,
      })
      .returning({ id: schema.audiences.id })
    audienceIdByName.set(seed.name, row.id)
    audiencesAdded++
  }

  // ── Campaigns ────────────────────────────────────────────────────────
  // 3 campaigns showcasing every lifecycle state. The sent campaign also
  // gets seeded events so the analytics panel shows real numbers.
  interface CampaignSeed {
    name: string
    templateName: string
    audienceName: string
    status: 'draft' | 'scheduled' | 'completed'
    sentDaysAgo?: number
    scheduledDaysAhead?: number
    seedEvents?: boolean
  }
  const CAMPAIGN_SEEDS: CampaignSeed[] = [
    {
      name: 'March Reactivation — come back for a cleaning',
      templateName: SYSTEM_TEMPLATES[0].name, // Reactivation
      audienceName: 'Lapsed (lifecycle = lapsed)',
      status: 'completed',
      sentDaysAgo: 5,
      seedEvents: true,
    },
    {
      name: 'May Birthday wishes',
      templateName: SYSTEM_TEMPLATES[1].name, // Birthday
      audienceName: 'Birthday this month',
      status: 'scheduled',
      // Far-future so the scheduled-campaign cron never actually blasts demo
      // email on a deploy resync — this row exists only to showcase the
      // "Scheduled" pill + the editor's "Send later" state, not to send.
      scheduledDaysAhead: 3650,
    },
    {
      name: 'New patient welcome — week 1 follow-up',
      templateName: SYSTEM_TEMPLATES[2].name, // Welcome
      audienceName: 'New patients (past 60 days)',
      status: 'draft',
    },
  ]

  let campaignsAdded = 0
  let eventsAdded = 0
  for (const seed of CAMPAIGN_SEEDS) {
    if (existingCampaignsByName.has(seed.name)) continue
    const tpl = tplIdByName.get(seed.templateName)
    const tplRow = SYSTEM_TEMPLATES.find((t) => t.name === seed.templateName)
    if (!tpl || !tplRow) continue
    const audienceId = audienceIdByName.get(seed.audienceName) ?? null
    const sentAt = seed.status === 'completed' && seed.sentDaysAgo
      ? new Date(now.getTime() - seed.sentDaysAgo * dayMs)
      : null
    const scheduledAt = seed.status === 'scheduled' && seed.scheduledDaysAhead
      ? new Date(now.getTime() + seed.scheduledDaysAhead * dayMs)
      : null

    const [campaign] = await db
      .insert(schema.campaigns)
      .values({
        organizationId: orgId,
        name: seed.name,
        description: tplRow.description,
        status: seed.status,
        subject: tplRow.subject,
        previewText: tplRow.previewText,
        bodyHtml: tplRow.bodyHtml,
        audienceId,
        sendChannel: 'resend',
        recipientSource: 'patients',
        templateId: tpl,
        scheduledAt,
        sentAt,
        sendStats: seed.seedEvents ? { attempted: 2, sent: 2, failed: 0 } : {},
      })
      .returning({ id: schema.campaigns.id })
    campaignsAdded++

    // Seed realistic events for the "Sent" campaign so the analytics
    // panel shows numbers. We pick Aiden (persona 5 — lapsed-returning,
    // his recall_campaign appointment becomes the 'booked' outcome) and
    // Emma (persona 6 — at_risk → opened but didn't click). The Sent
    // event predates the Open event by a few minutes; Click predates
    // Booked by an hour or so to read as a real conversion funnel.
    if (seed.seedEvents && patientIds.length > 5 && sentAt) {
      const aidenId = patientIds[5] ?? null
      const emmaId = patientIds[6] ?? null
      const aidenEmail = 'aiden.k@example.com'
      const emmaEmail = 'emma.l@example.com'
      // Sent events (one per recipient).
      if (aidenId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: aidenEmail,
          patientId: aidenId,
          type: 'sent',
          occurredAt: sentAt,
          meta: { channel: 'resend' },
        })
        eventsAdded++
      }
      if (emmaId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: emmaEmail,
          patientId: emmaId,
          type: 'sent',
          occurredAt: sentAt,
          meta: { channel: 'resend' },
        })
        eventsAdded++
      }
      // Both open (Aiden + Emma)
      const openAt = new Date(sentAt.getTime() + 2 * 60 * 60 * 1000)
      if (aidenId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: aidenEmail,
          patientId: aidenId,
          type: 'open',
          occurredAt: openAt,
          meta: {},
        })
        eventsAdded++
      }
      if (emmaId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: emmaEmail,
          patientId: emmaId,
          type: 'open',
          occurredAt: openAt,
          meta: {},
        })
        eventsAdded++
      }
      // Aiden clicks (Emma didn't).
      const clickAt = new Date(sentAt.getTime() + 3 * 60 * 60 * 1000)
      if (aidenId) {
        await db.insert(schema.campaignEvents).values({
          campaignId: campaign.id,
          recipientEmail: aidenEmail,
          patientId: aidenId,
          type: 'click',
          occurredAt: clickAt,
          meta: { url: 'https://acme-dental.dreamcreatestudio.com/book' },
        })
        eventsAdded++
        // Aiden booked the recall_campaign appointment that's seeded earlier.
        // Look it up + record a 'booked' event tying back to the campaign.
        const [aidenRecallAppt] = await db
          .select({ id: schema.appointment.id })
          .from(schema.appointment)
          .where(
            and(
              eq(schema.appointment.organizationId, orgId),
              eq(schema.appointment.patientId, aidenId),
              eq(schema.appointment.source, 'recall_campaign'),
            ),
          )
          .limit(1)
        if (aidenRecallAppt) {
          const bookedAt = new Date(sentAt.getTime() + 4 * 60 * 60 * 1000)
          await db.insert(schema.campaignEvents).values({
            campaignId: campaign.id,
            recipientEmail: aidenEmail,
            patientId: aidenId,
            bookedAppointmentId: aidenRecallAppt.id,
            bookedAt,
            type: 'booked',
            occurredAt: bookedAt,
            meta: {},
          })
          eventsAdded++
        }
      }
    }
  }

  return { audiencesAdded, campaignsAdded, eventsAdded }
}
