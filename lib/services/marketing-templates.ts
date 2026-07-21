import 'server-only'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'

/**
 * Marketing template service. Templates are reusable starter copy for
 * campaigns. Two kinds:
 *
 *   - **System** (kind='system', organizationId=null) — ships with the
 *     product. Three are seeded idempotently on first read:
 *     Reactivation (lapsed > 6 months → come back), Birthday (warm
 *     monthly outreach), New-patient welcome (first-visit follow-up).
 *     Every clinic sees these in the "Choose a template" picker.
 *
 *   - **Custom** (kind='custom', organizationId set) — per-org templates.
 *     Both kinds surface in the new-campaign "Start from" picker (wired
 *     2026-07-21) and seed subject/preview/body + templateId at creation.
 *     Custom ones are created via the demo seeder today; a "Save as
 *     template" affordance in the campaign editor is the planned creator.
 *
 * Body content uses warm-neutral, anti-shame voice consistent with the
 * modern clinic template (DESIGN.md principle 8). Unsubscribe footer is
 * appended by render-email.ts so we don't include it inline here.
 */

export interface TemplateRow {
  id: number
  organizationId: string | null
  kind: 'system' | 'custom'
  category: 'reactivation' | 'birthday' | 'welcome' | 'recall' | 'general'
  name: string
  description: string | null
  subject: string
  previewText: string | null
  bodyHtml: string
  bodyJson: unknown | null
  defaultChannel: 'resend' | 'gmail' | 'twilio_sms'
  defaultAudienceSlug: string | null
  createdAt: Date
  updatedAt: Date
}

// ---------- System templates (seeded idempotently) ----------

interface SystemTemplate {
  name: string
  category: TemplateRow['category']
  description: string
  subject: string
  previewText: string
  bodyHtml: string
  defaultAudienceSlug: string
}

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    name: 'Reactivation — come back for a cleaning',
    category: 'reactivation',
    description: 'For patients who haven\'t been in for 6+ months. Warm, no shame, easy next step.',
    subject: 'Has it been a minute? Let\'s get you scheduled.',
    previewText: 'A friendly nudge — no judgment, just an open door.',
    bodyHtml: `<p>Hi {{firstName}},</p>
<p>It\'s been a while since we last saw you, and we wanted to say hi.</p>
<p>If life has been busy (it always is) and a cleaning slipped off the list — no judgment. We just wanted to make it easy to get back on the schedule whenever you\'re ready.</p>
<p>Most adults benefit from a checkup and cleaning every six months. If it\'s been longer, that\'s okay too — we\'ll just take a look, clean things up, and give you an honest read on how everything looks.</p>
<p><strong><a href="{{bookingUrl}}">Book a visit →</a></strong></p>
<p>If now\'s not the right time, no worries. Hit reply with a date that works better and we\'ll save you a slot.</p>
<p>Talk soon,<br/>The team</p>`,
    defaultAudienceSlug: 'lapsed_180d',
  },
  {
    name: 'Birthday — warm monthly check-in',
    category: 'birthday',
    description: 'Sent in the month of the patient\'s birthday. Low-key, no birthday hard-sell.',
    subject: 'Happy birthday from your dental team',
    previewText: 'A little note — and a small reminder.',
    bodyHtml: `<p>Hi {{firstName}},</p>
<p>It\'s your birthday month, and we just wanted to say happy birthday from all of us.</p>
<p>While we\'re here: if you\'re due for a checkup, or you\'ve been meaning to ask about anything (whitening, that crown that\'s been bugging you, a kid\'s first visit) — this is a good month to take care of it.</p>
<p><strong><a href="{{bookingUrl}}">Book a visit →</a></strong></p>
<p>And if you\'re all set, just enjoy the cake. We\'ll see you when it\'s time.</p>
<p>Cheers,<br/>The team</p>`,
    defaultAudienceSlug: 'birthday_month',
  },
  {
    name: 'Use your benefits — they reset January 1',
    category: 'recall',
    description:
      'The year-end revenue driver: insured patients with no upcoming visit, reminded their dental benefits expire Dec 31. Runs Oct–Dec via the automation.',
    subject: 'Your dental benefits reset January 1 — don\'t leave them behind',
    previewText: 'Most plans don\'t roll over. A quick visit now uses what you\'ve already paid for.',
    bodyHtml: `<p>Hi {{firstName}},</p>
<p>A quick heads-up worth real money: most dental insurance benefits <strong>reset on January 1</strong> — whatever's unused doesn't roll over, it just disappears.</p>
<p>If you've been putting off a cleaning, a checkup, or that treatment we talked about, the next few weeks are the smart time to come in: your plan helps cover it now, and starts from zero in January.</p>
<p>Year-end books up fast (everyone has the same idea), so grabbing a time early is the move.</p>
<p><strong><a href="{{bookingUrl}}">Book before the year ends →</a></strong></p>
<p>Not sure what your plan still covers? Reply to this email and we'll happily check for you — no obligation.</p>
<p>See you soon,<br/>The team</p>`,
    defaultAudienceSlug: 'insured_no_upcoming',
  },
  {
    name: 'New-patient welcome',
    category: 'welcome',
    description: 'Sent 1-3 days after a first visit. Sets expectations + invites questions.',
    subject: 'Welcome — a few things you might want to know',
    previewText: 'Now that we\'ve met, here\'s what comes next.',
    bodyHtml: `<p>Hi {{firstName}},</p>
<p>Welcome to the practice — we\'re glad you came in.</p>
<p>A few quick things while it\'s fresh:</p>
<ul>
<li><strong>Questions are always welcome.</strong> If anything from your visit didn\'t make sense — a recommendation, a price, a next-step — hit reply. We\'d rather you ask than wonder.</li>
<li><strong>Recall reminder.</strong> Most adults do well with a cleaning every six months. We\'ll send you a quiet reminder when you\'re due — you can book directly from that email.</li>
<li><strong>Emergencies.</strong> If something hurts in a way that worries you, call us first thing — we keep a few slots open every day for urgent visits.</li>
</ul>
<p>If you have a moment, a quick Google review helps us a lot — but only if it\'s honest. We\'d rather hear what didn\'t land than read a five-star out of obligation.</p>
<p><a href="{{bookingUrl}}">Schedule your next visit →</a></p>
<p>Thanks for trusting us,<br/>The team</p>`,
    defaultAudienceSlug: 'new_patient_60d',
  },
]

const SYSTEM_TEMPLATE_NAMES = new Set(SYSTEM_TEMPLATES.map((t) => t.name))

/**
 * Insert system templates that don't yet exist. Idempotent — looks up the
 * existing system-template names in one query, then only inserts the
 * missing ones. Safe to call multiple times per process.
 */
export async function seedSystemTemplates(): Promise<void> {
  const existing = await db
    .select({ name: schema.campaignTemplates.name })
    .from(schema.campaignTemplates)
    .where(eq(schema.campaignTemplates.kind, 'system'))
  const existingNames = new Set(existing.map((r) => r.name))
  const missing = SYSTEM_TEMPLATES.filter((t) => !existingNames.has(t.name))
  if (missing.length === 0) return
  for (const tpl of missing) {
    try {
      await db.insert(schema.campaignTemplates).values({
        organizationId: null,
        kind: 'system',
        category: tpl.category,
        name: tpl.name,
        description: tpl.description,
        subject: tpl.subject,
        previewText: tpl.previewText,
        bodyHtml: tpl.bodyHtml,
        defaultChannel: 'resend',
        defaultAudienceSlug: tpl.defaultAudienceSlug,
      })
    } catch (err) {
      console.warn('[seedSystemTemplates]', tpl.name, err)
    }
  }
}

/**
 * List templates a tenant can choose from: all system templates + their
 * own custom templates. Seeds system templates on first call.
 */
export async function listTemplates(organizationId: string): Promise<TemplateRow[]> {
  await seedSystemTemplates()
  const rows = await db
    .select()
    .from(schema.campaignTemplates)
    .where(
      or(
        eq(schema.campaignTemplates.kind, 'system'),
        eq(schema.campaignTemplates.organizationId, organizationId),
      )!,
    )
    .orderBy(desc(schema.campaignTemplates.kind), schema.campaignTemplates.category, schema.campaignTemplates.name)
  return rows.map(toTemplateRow)
}

export async function getTemplate(
  organizationId: string,
  id: number,
): Promise<TemplateRow | null> {
  const [row] = await db
    .select()
    .from(schema.campaignTemplates)
    .where(
      and(
        eq(schema.campaignTemplates.id, id),
        or(
          eq(schema.campaignTemplates.kind, 'system'),
          eq(schema.campaignTemplates.organizationId, organizationId),
        )!,
      ),
    )
    .limit(1)
  return row ? toTemplateRow(row) : null
}

export async function createCustomTemplate(
  organizationId: string,
  input: {
    name: string
    description?: string | null
    category?: TemplateRow['category']
    subject: string
    previewText?: string | null
    bodyHtml: string
    bodyJson?: unknown
    defaultChannel?: 'resend' | 'gmail' | 'twilio_sms'
    defaultAudienceSlug?: string | null
  },
  userId: string,
): Promise<TemplateRow> {
  if (SYSTEM_TEMPLATE_NAMES.has(input.name)) {
    throw new Error(`Cannot create a custom template with the same name as a system template ("${input.name}")`)
  }
  const [row] = await db
    .insert(schema.campaignTemplates)
    .values({
      organizationId,
      kind: 'custom',
      category: input.category ?? 'general',
      name: input.name,
      description: input.description ?? null,
      subject: input.subject,
      previewText: input.previewText ?? null,
      bodyHtml: input.bodyHtml,
      bodyJson: input.bodyJson ?? null,
      defaultChannel: input.defaultChannel ?? 'resend',
      defaultAudienceSlug: input.defaultAudienceSlug ?? null,
      createdBy: userId,
    })
    .returning()
  return toTemplateRow(row)
}

export async function deleteCustomTemplate(organizationId: string, id: number): Promise<{ deleted: number }> {
  const rows = await db
    .delete(schema.campaignTemplates)
    .where(
      and(
        eq(schema.campaignTemplates.id, id),
        eq(schema.campaignTemplates.organizationId, organizationId),
        eq(schema.campaignTemplates.kind, 'custom'),
      ),
    )
    .returning({ id: schema.campaignTemplates.id })
  return { deleted: rows.length }
}

function toTemplateRow(r: typeof schema.campaignTemplates.$inferSelect): TemplateRow {
  return {
    id: r.id,
    organizationId: r.organizationId,
    kind: r.kind as 'system' | 'custom',
    category: r.category as TemplateRow['category'],
    name: r.name,
    description: r.description,
    subject: r.subject,
    previewText: r.previewText,
    bodyHtml: r.bodyHtml,
    bodyJson: r.bodyJson,
    defaultChannel: r.defaultChannel,
    defaultAudienceSlug: r.defaultAudienceSlug,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}
