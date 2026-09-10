import 'server-only'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'

// ── Shared lead seeds (used by both new-clinic-seed + self-heal) ─────
// Single source of truth so both code paths produce the same 6 curated
// leads covering every lifecycle state. Updates here flow to both
// freshly-seeded demos AND legacy demos on next self-heal entry.
//
// Contact-form leads for the triage board.

interface LeadSeed {
  name: string
  phone: string
  email: string | null
  preferredDate: string | null
  message: string | null
  sourcePage: string | null
  referrer: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  status: 'new' | 'contacted' | 'converted' | 'archived'
  hoursAgo: number
  contactedHoursAgo?: number
  convertedHoursAgo?: number
  /** true → link to Emma Lopez patient when present in the org. */
  linkToEmmaPatient?: boolean
  archivedHoursAgo?: number
  archivedReason?: string
}

const DEMO_LEAD_SEEDS: LeadSeed[] = [
  // Fresh new lead — under an hour, triggers "call within the hour" CTA
  { name: 'Olivia Chen', phone: '(415) 555-0188', email: 'olivia.c@example.com', preferredDate: null,
    message: "Looking for a family dentist for me and my two kids (5 + 8). Saw your website — love that you're warm-fuzzies about anxiety.",
    sourcePage: '/', referrer: 'https://www.google.com/', utmSource: 'google', utmMedium: 'organic', utmCampaign: null,
    status: 'new', hoursAgo: 0.5 },
  // Aging new lead — 18h, amber tint
  { name: 'Daniel Park', phone: '(415) 555-0119', email: null, preferredDate: '2026-06-15',
    message: 'Need a cleaning. Last one was probably 18 months ago. No insurance, what would the cash price be?',
    sourcePage: '/services', referrer: null, utmSource: null, utmMedium: null, utmCampaign: null,
    status: 'new', hoursAgo: 18 },
  // Stale new lead — 3 days, red border, embarrassing
  { name: 'Rachel Williams', phone: '(415) 555-0123', email: 'rachel.w@example.com', preferredDate: null,
    message: 'Hi! Wisdom tooth pain on the upper right, getting worse. Can I come in this week?',
    sourcePage: '/', referrer: 'https://www.instagram.com/', utmSource: 'instagram', utmMedium: 'social', utmCampaign: 'fall_recall',
    status: 'new', hoursAgo: 72 },
  // Contacted — staff called, waiting for follow-up
  { name: 'Marcus Johnson', phone: '(415) 555-0156', email: 'marcus.j@example.com', preferredDate: '2026-06-22',
    message: 'Need crown work, had a temporary fall out yesterday. Will need a same-week appointment if possible.',
    sourcePage: '/services', referrer: null, utmSource: null, utmMedium: null, utmCampaign: null,
    status: 'contacted', hoursAgo: 36, contactedHoursAgo: 30 },
  // Converted — became Emma Lopez (persona 6)
  { name: 'Emma Lopez', phone: '(415) 555-0234', email: 'emma.l@example.com', preferredDate: null,
    message: "Hi! New to the area, looking for a regular cleaning. Heard great things from a coworker.",
    sourcePage: '/', referrer: 'https://www.google.com/', utmSource: 'google', utmMedium: 'organic', utmCampaign: null,
    status: 'converted', hoursAgo: 14 * 24, contactedHoursAgo: 13 * 24, convertedHoursAgo: 12 * 24, linkToEmmaPatient: true },
  // Archived — spam example
  { name: 'aaaaa zzzzzz', phone: '(000) 000-0000', email: 'spam@spam.test', preferredDate: null,
    message: 'BUY MY SEO SERVICES CHEAP!!! Click here for amazing rankings!!! https://spamlink.example/seo',
    sourcePage: '/', referrer: null, utmSource: null, utmMedium: null, utmCampaign: null,
    status: 'archived', hoursAgo: 96, archivedHoursAgo: 95, archivedReason: 'spam' },
]

/**
 * Seed any lead from DEMO_LEAD_SEEDS that isn't already present (by
 * exact name match). Idempotent — safe to call repeatedly. Used in
 * both the new-clinic-seed path (passes `existingNames = new Set()`)
 * and the self-heal path on legacy demos.
 */
export async function seedLeadsForOrg(
  orgId: string,
  now: Date,
  emmaPatientId: string | null,
  existingNames: Set<string>,
): Promise<number> {
  const hourMs = 60 * 60 * 1000
  const missing = DEMO_LEAD_SEEDS.filter((s) => !existingNames.has(s.name))
  if (missing.length === 0) return 0
  for (const l of missing) {
    await db.insert(schema.lead).values({
      id: newId('lead'),
      organizationId: orgId,
      name: l.name,
      phone: l.phone,
      email: l.email,
      preferredDate: l.preferredDate,
      message: l.message,
      sourcePage: l.sourcePage,
      referrer: l.referrer,
      utmSource: l.utmSource,
      utmMedium: l.utmMedium,
      utmCampaign: l.utmCampaign,
      status: l.status,
      convertedToPatientId: l.linkToEmmaPatient ? emmaPatientId : null,
      contactedAt: l.contactedHoursAgo !== undefined ? new Date(now.getTime() - l.contactedHoursAgo * hourMs) : null,
      convertedAt: l.convertedHoursAgo !== undefined ? new Date(now.getTime() - l.convertedHoursAgo * hourMs) : null,
      archivedAt: l.archivedHoursAgo !== undefined ? new Date(now.getTime() - l.archivedHoursAgo * hourMs) : null,
      archivedReason: l.archivedReason ?? null,
      createdAt: new Date(now.getTime() - l.hoursAgo * hourMs),
    })
  }
  return missing.length
}
