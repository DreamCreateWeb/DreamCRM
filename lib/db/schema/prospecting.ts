import { pgTable, text, timestamp, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { organization } from './auth'

// ─────────────────────────────────────────────────────────────────────────────
// Prospecting — Dream Create's OWN outbound growth engine (platform tenant).
//
// These tables are PLATFORM-GLOBAL and deliberately carry no organization_id
// (precedent: service_library). Prospects are external dental clinics that
// exist BEFORE any org does; the platform org is a singleton; every access
// path is a requirePlatformAdmin() server action or a CRON_SECRET-gated cron.
// The one org linkage that matters is prospect.converted_organization_id —
// set when a won prospect becomes a real clinic via createManagedClinic().
//
// NAMING: always "prospect", never "lead" — `lead` is the clinic-scoped
// patient-lead table (a dental patient inquiring at a clinic's website).
// ─────────────────────────────────────────────────────────────────────────────

export const PROSPECT_STATUSES = [
  'discovered', // imported from NPPES, not yet enriched
  'enriching', // claimed by the enrich cron
  'enriched', // signals + score present
  'queued', // enrolled in a sequence, first touch not yet sent
  'contacted', // at least one outreach touch sent
  'engaged', // opened 3+ / clicked — warm but no reply yet
  'call_list', // intent signal! the owner calls these
  'converted', // became a real clinic org
  'not_interested', // said no (reply or call outcome)
  'suppressed', // unsubscribed / bounced / complained / manual
  'disqualified', // wrong person, closed practice, bad data
] as const
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number]

export const PROSPECT_SCORE_BANDS = ['hot', 'warm', 'cool', 'low'] as const
export type ProspectScoreBand = (typeof PROSPECT_SCORE_BANDS)[number]

export const PROSPECT_INTENT_SIGNALS = [
  'reply_interested',
  'reply_question',
  'clicked',
  'opens',
  'demo_request',
] as const
export type ProspectIntentSignal = (typeof PROSPECT_INTENT_SIGNALS)[number]

export const prospect = pgTable(
  'prospect',
  {
    id: text('id').primaryKey(), // pros_…
    // NPPES NPI (entity type 2, organizational provider). The natural upsert
    // key for discovery re-runs.
    npiNumber: text('npi_number'),
    name: text('name').notNull(),
    addressLine1: text('address_line1'),
    city: text('city'),
    state: text('state'), // 2-letter
    postalCode: text('postal_code'),
    phone: text('phone'), // normalized to digits
    // sha256(normalizedPhone + '|' + normalizedAddress) — second-pass dedupe
    // for multi-NPI practices sharing one front desk.
    dedupeHash: text('dedupe_hash'),
    taxonomyCode: text('taxonomy_code'), // 1223…X family
    // NPPES "authorized official" — usually the owner dentist. Gold for
    // personalization + the call itself.
    authorizedOfficialName: text('authorized_official_name'),
    authorizedOfficialTitle: text('authorized_official_title'),
    // IANA tz derived from state (send-window gating). Coarse but sufficient.
    timezone: text('timezone'),
    status: text('status').notNull().default('discovered'),

    // Contact discovery — email only ever comes from the clinic's own site
    // (mailto/contact page) or manual entry. We NEVER guess info@ addresses.
    email: text('email'),
    emailSource: text('email_source'), // 'crawl_mailto'|'crawl_contact'|'manual'

    // Enrichment: Google Places
    websiteUrl: text('website_url'),
    googlePlaceId: text('google_place_id'),
    googleRatingTenths: integer('google_rating_tenths'), // 4.7 → 47 (no float drift)
    reviewCount: integer('review_count'),
    businessStatus: text('business_status'), // OPERATIONAL / CLOSED_*
    googleMapsUri: text('google_maps_uri'),

    // Enrichment: website crawl signals. Shape: ProspectCrawlSignals in
    // lib/types/prospecting.ts (ssl, mobileViewport, copyrightYear, booking
    // widget, social links, builder fingerprint, pageWeightKb, fetchedAt).
    enrichment: jsonb('enrichment'),
    // AI verdict over the crawl+Places summary. Shape: ProspectAiVerdict —
    // { hasWebsite, websiteQuality 0-100, websiteReasons[], socialPresence
    //   0-100, onlineBooking, weaknesses[], summary }. The weaknesses feed
    // personalized outreach copy.
    aiVerdict: jsonb('ai_verdict'),
    // Deterministic composite (computeOpportunityScore — pure, unit-tested).
    // No website = hottest: Dream Create sells websites + CRM.
    opportunityScore: integer('opportunity_score'),
    scoreBand: text('score_band'), // hot|warm|cool|low
    scoreReasons: jsonb('score_reasons'), // string[]
    enrichedAt: timestamp('enriched_at', { withTimezone: true }),
    scoredAt: timestamp('scored_at', { withTimezone: true }),

    // Intent — what put this prospect on the call list.
    intentSignal: text('intent_signal'),
    intentAt: timestamp('intent_at', { withTimezone: true }), // call-list sort key
    intentSummary: text('intent_summary'), // AI summary of the reply
    talkingPoints: jsonb('talking_points'), // string[] for the call

    // AI-suggested reply for a 'question' classification — shown on the
    // call card with a copy button (the owner sends it from his own inbox;
    // we NEVER auto-send). Cleared when a call outcome is logged.
    // Migration 0118.
    replyDraft: text('reply_draft'),

    // Cached AI pre-demo brief (DemoBrief in lib/types/demo-brief.ts):
    // opening line, walk-up story, beat emphasis, objections + responses,
    // closing ask. Owner-initiated (sonnet), regenerate overwrites wholesale.
    // Distinct from talking_points (call-list reply intent) and ai_verdict
    // (scoring input). Migration 0117.
    demoBrief: jsonb('demo_brief'),

    // Never-drop-a-lead follow-up: a call outcome that isn't terminal
    // (callback/voicemail/no answer) schedules the next nudge here; it surfaces
    // as "due" in the briefing + call list and clears on the next outcome or a
    // conversion. Migration 0121.
    nextFollowUpAt: timestamp('next_follow_up_at', { withTimezone: true }),
    followUpReason: text('follow_up_reason'),

    suppressedReason: text('suppressed_reason'),
    suppressedAt: timestamp('suppressed_at', { withTimezone: true }),

    // Conversion linkage.
    convertedOrganizationId: text('converted_organization_id').references(
      () => organization.id,
      { onDelete: 'set null' },
    ),
    // Soft pointer into the agency_project pipeline (no FK — same pattern as
    // clinic_profile.referral_partner_id).
    agencyProjectId: text('agency_project_id'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    npi: uniqueIndex('idx_prospect_npi').on(t.npiNumber),
    dedupe: uniqueIndex('idx_prospect_dedupe').on(t.dedupeHash),
    state: index('idx_prospect_state').on(t.state),
    status: index('idx_prospect_status').on(t.status),
    band: index('idx_prospect_band').on(t.scoreBand),
    callList: index('idx_prospect_call_list').on(t.status, t.intentAt),
  }),
)
export type Prospect = typeof prospect.$inferSelect
export type NewProspect = typeof prospect.$inferInsert

// Multiple discovered/verified addresses per prospect — the reachability
// layer. A practice's site often exposes several (info@, drjane@, office@);
// we keep them ALL, classify the role, MX-verify deliverability, and rank so
// the engine reaches out on the most personal deliverable address (mirrored
// to prospect.email as the send target). The named owner's own inbox beats a
// shared desk; an address that fails MX is kept but never becomes primary.
// Migration 0119. Never fabricated — every row came from the crawl or a
// human (source), honoring the no-guessing doctrine.
export const prospectContact = pgTable(
  'prospect_contact',
  {
    id: text('id').primaryKey(), // pcon_…
    prospectId: text('prospect_id')
      .notNull()
      .references(() => prospect.id, { onDelete: 'cascade' }),
    email: text('email').notNull(), // lowercased
    name: text('name'), // person name when known
    // owner|personal|front_desk|billing|generic|unknown (contactRoleFor)
    role: text('role').notNull().default('unknown'),
    // crawl_mailto|crawl_text|crawl_contact|crawl_team|manual|nppes_official
    source: text('source').notNull().default('crawl_mailto'),
    // valid|risky|invalid|unknown — from the live MX check.
    verifyStatus: text('verify_status').notNull().default('unknown'),
    verifyReason: text('verify_reason'), // mx_ok|no_mx|role_address|disposable|syntax|dns_error
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    // Send-preference (rankContactEmail); higher = reach out here first.
    rank: integer('rank').notNull().default(0),
    // 1 = the chosen send target, mirrored to prospect.email. At most one.
    isPrimary: integer('is_primary').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    prospectEmail: uniqueIndex('idx_pcon_prospect_email').on(t.prospectId, t.email),
    prospect: index('idx_pcon_prospect').on(t.prospectId),
  }),
)
export type ProspectContact = typeof prospectContact.$inferSelect
export type NewProspectContact = typeof prospectContact.$inferInsert

// Resumable NPPES pagination cursor. NPPES caps skip at 1200 (max 1,400 rows
// per query at 200/page), so the unit of iteration is state × 3-digit ZIP
// prefix; a zip3 that still hits the cap splits into zip5 child tasks.
export const prospectDiscoveryTask = pgTable(
  'prospect_discovery_task',
  {
    id: text('id').primaryKey(), // pdt_…
    state: text('state').notNull(),
    // '300' = zip3 prefix task; '30030' = zip5 split child.
    zipPrefix: text('zip_prefix').notNull(),
    // Two-phase cursor: each task pages NPPES orgs (NPI-2) first, then flips
    // to 'individual' (NPI-1, solo dentists) with skip reset — 'done' only
    // after the individual pass exhausts. Migration 0118.
    entityPhase: text('entity_phase').notNull().default('org'), // org|individual
    skip: integer('skip').notNull().default(0),
    status: text('status').notNull().default('pending'), // pending|in_progress|done|error
    found: integer('found').notNull().default(0), // rows NPPES returned
    imported: integer('imported').notNull().default(0), // new prospects created
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    stateZip: uniqueIndex('idx_pdt_state_zip').on(t.state, t.zipPrefix),
    status: index('idx_pdt_status').on(t.status),
  }),
)
export type ProspectDiscoveryTask = typeof prospectDiscoveryTask.$inferSelect

export const outreachSequence = pgTable('outreach_sequence', {
  id: text('id').primaryKey(), // oseq_…
  name: text('name').notNull(),
  status: text('status').notNull().default('active'), // active|paused
  description: text('description'),
  // Which prospect segment this pitch targets — the auto-enroll router
  // matches segmentForProspect() to this. 'no_website'|'weak_website'|
  // 'weak_presence'; null = general/unsegmented. Migration 0118.
  segment: text('segment'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
export type OutreachSequence = typeof outreachSequence.$inferSelect

export const outreachTouchTemplate = pgTable(
  'outreach_touch_template',
  {
    id: text('id').primaryKey(), // otpl_…
    sequenceId: text('sequence_id')
      .notNull()
      .references(() => outreachSequence.id, { onDelete: 'cascade' }),
    stepNumber: integer('step_number').notNull(), // 1-based
    dayOffset: integer('day_offset').notNull(), // days after enrollment (0/3/8/15)
    // Merge tokens: {{firstName}} {{clinicName}} {{city}}. When aiPersonalize
    // is on, the template is the skeleton the AI writes around.
    subjectTemplate: text('subject_template').notNull(),
    bodyTemplate: text('body_template').notNull(),
    aiPersonalize: integer('ai_personalize').notNull().default(1), // 1|0
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    seqStep: uniqueIndex('idx_otpl_seq_step').on(t.sequenceId, t.stepNumber),
  }),
)
export type OutreachTouchTemplate = typeof outreachTouchTemplate.$inferSelect

export const OUTREACH_ENROLLMENT_STATUSES = [
  'active',
  'completed', // sequence exhausted, no reply
  'stopped_reply',
  'stopped_unsub',
  'stopped_bounce',
  'stopped_manual',
  'paused_ooo', // out-of-office — auto-resumes
] as const
export type OutreachEnrollmentStatus = (typeof OUTREACH_ENROLLMENT_STATUSES)[number]

export const outreachEnrollment = pgTable(
  'outreach_enrollment',
  {
    id: text('id').primaryKey(), // oenr_…
    prospectId: text('prospect_id')
      .notNull()
      .references(() => prospect.id, { onDelete: 'cascade' }),
    sequenceId: text('sequence_id')
      .notNull()
      .references(() => outreachSequence.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('active'),
    currentStep: integer('current_step').notNull().default(0), // last SENT step
    nextSendAt: timestamp('next_send_at', { withTimezone: true }),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
    stopReason: text('stop_reason'),
  },
  (t) => ({
    // One LIVE enrollment per prospect (history rows keep their stopped status).
    liveProspect: uniqueIndex('idx_oenr_live_prospect')
      .on(t.prospectId)
      .where(sql`${t.status} IN ('active', 'paused_ooo')`),
    due: index('idx_oenr_due').on(t.status, t.nextSendAt),
  }),
)
export type OutreachEnrollment = typeof outreachEnrollment.$inferSelect

// Per-touch idempotency + history. unique(enrollmentId, stepNumber) is the
// atomic send claim: INSERT … ON CONFLICT DO NOTHING — a concurrent/retried
// cron run can never double-send a touch (the appointment_reminder_log
// pattern).
export const outreachTouchLog = pgTable(
  'outreach_touch_log',
  {
    id: text('id').primaryKey(), // otch_…
    enrollmentId: text('enrollment_id')
      .notNull()
      .references(() => outreachEnrollment.id, { onDelete: 'cascade' }),
    prospectId: text('prospect_id').notNull(),
    stepNumber: integer('step_number').notNull(),
    templateId: text('template_id'),
    // The personalized render, kept for the history drawer.
    subject: text('subject').notNull(),
    bodyHtml: text('body_html').notNull(),
    channel: text('channel').notNull(), // resend|gmail|dry_run
    resendEmailId: text('resend_email_id'),
    status: text('status').notNull().default('sent'), // sent|failed
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    claim: uniqueIndex('idx_otch_claim').on(t.enrollmentId, t.stepNumber),
    prospect: index('idx_otch_prospect').on(t.prospectId),
  }),
)
export type OutreachTouchLog = typeof outreachTouchLog.$inferSelect

export const outreachEvent = pgTable(
  'outreach_event',
  {
    id: text('id').primaryKey(), // oevt_…
    prospectId: text('prospect_id')
      .notNull()
      .references(() => prospect.id, { onDelete: 'cascade' }),
    touchLogId: text('touch_log_id').references(() => outreachTouchLog.id, {
      onDelete: 'set null',
    }),
    // delivered|open|click|bounce|complaint|unsub|reply|failed
    type: text('type').notNull(),
    meta: jsonb('meta'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    prospectTime: index('idx_oevt_prospect_time').on(t.prospectId, t.occurredAt),
  }),
)
export type OutreachEvent = typeof outreachEvent.$inferSelect

// Honored FOREVER, checked at send time (not just enrollment).
export const prospectSuppression = pgTable(
  'prospect_suppression',
  {
    id: text('id').primaryKey(), // psup_…
    email: text('email').notNull(), // lowercased
    domain: text('domain'), // lowercased, for domain-level checks
    // unsub|bounce|complaint|manual|existing_customer|reply_not_interested
    reason: text('reason').notNull(),
    prospectId: text('prospect_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    email: uniqueIndex('idx_psup_email').on(t.email),
    domain: index('idx_psup_domain').on(t.domain),
  }),
)
export type ProspectSuppression = typeof prospectSuppression.$inferSelect

export const PROSPECT_CALL_OUTCOMES = [
  'no_answer',
  'voicemail',
  'callback',
  'demo_booked',
  'not_interested',
  'won',
] as const
export type ProspectCallOutcome = (typeof PROSPECT_CALL_OUTCOMES)[number]

export const prospectCallLog = pgTable(
  'prospect_call_log',
  {
    id: text('id').primaryKey(), // pcall_…
    prospectId: text('prospect_id')
      .notNull()
      .references(() => prospect.id, { onDelete: 'cascade' }),
    outcome: text('outcome').notNull(),
    note: text('note'),
    calledByUserId: text('called_by_user_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    prospect: index('idx_pcall_prospect').on(t.prospectId),
  }),
)
export type ProspectCallLog = typeof prospectCallLog.$inferSelect

export const PROSPECT_MEETING_STATUSES = [
  'proposed', // link generated, no time picked yet
  'booked', // prospect chose a slot
  'canceled',
  'completed',
  'no_show',
] as const
export type ProspectMeetingStatus = (typeof PROSPECT_MEETING_STATUSES)[number]

// Self-booked demos — the close accelerator. The owner generates a link; the
// prospect lands on /d/<token> (token IS the auth, the /r /w /c /b pattern)
// and picks a slot from the owner's availability, shown in the prospect's own
// timezone. Booking emails both sides an add-to-calendar link. Migration 0120.
export const prospectMeeting = pgTable(
  'prospect_meeting',
  {
    id: text('id').primaryKey(), // pmtg_…
    prospectId: text('prospect_id')
      .notNull()
      .references(() => prospect.id, { onDelete: 'cascade' }),
    token: text('token').notNull(), // opaque URL auth
    status: text('status').notNull().default('proposed'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }), // null until booked
    durationMin: integer('duration_min').notNull().default(30),
    hostTimeZone: text('host_time_zone').notNull(),
    attendeeName: text('attendee_name'),
    attendeeEmail: text('attendee_email'),
    note: text('note'),
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
    createdByUserId: text('created_by_user_id'),
    bookedAt: timestamp('booked_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    token: uniqueIndex('idx_pmtg_token').on(t.token),
    prospect: index('idx_pmtg_prospect').on(t.prospectId),
    schedule: index('idx_pmtg_schedule').on(t.status, t.scheduledAt),
  }),
)
export type ProspectMeeting = typeof prospectMeeting.$inferSelect
export type NewProspectMeeting = typeof prospectMeeting.$inferInsert

// Singleton config row (id='default'). Resolved with defaults by
// resolveProspectingConfig() in lib/types/prospecting.ts so new knobs never
// need a backfill. Ships with killSwitch=true + dryRun=true (system OFF).
export const prospectingConfig = pgTable('prospecting_config', {
  id: text('id').primaryKey(), // 'default'
  config: jsonb('config'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})
export type ProspectingConfigRow = typeof prospectingConfig.$inferSelect

// Platform-global metering (the ai_usage_counter shape minus org). period is
// 'YYYY-MM' for monthly budgets (places_lookup|crawl|ai_score|ai_email|
// ai_classify) and 'YYYY-MM-DD' for the daily send cap (outreach_send).
// unique(period, kind) → atomic INSERT … ON CONFLICT DO UPDATE count+1.
export const prospectingCounter = pgTable(
  'prospecting_counter',
  {
    id: text('id').primaryKey(), // pctr_…
    period: text('period').notNull(),
    kind: text('kind').notNull(),
    count: integer('count').notNull().default(0),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    periodKind: uniqueIndex('idx_pctr_period_kind').on(t.period, t.kind),
  }),
)
export type ProspectingCounter = typeof prospectingCounter.$inferSelect
