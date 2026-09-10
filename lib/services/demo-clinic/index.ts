import 'server-only'
import { and, eq, gte, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newId } from '@/lib/utils'
import { seedDefaultIntakeForm } from '@/lib/services/forms'
import { seedServiceLibrary } from '@/lib/services/service-library'
import { seedDemoPms } from '@/lib/services/pms'
import { seedDemoZernio } from '@/lib/services/zernio'
import { seedDemoGoogleReviews } from '@/lib/services/google-reviews'
import { seedDemoFacebookReviews } from '@/lib/services/facebook-reviews'
import { seedDemoGbpSync } from '@/lib/services/gbp-sync'
import { seedDemoGbpMetrics } from '@/lib/services/gbp-metrics'
import { seedDemoSocialMetrics } from '@/lib/services/social-metrics'
import { seedDemoSocialPosts } from '@/lib/services/social-posts'
import { seedDemoVoice } from '@/lib/services/demo-voice'
import { seedDemoSocialAddon } from '@/lib/services/social-billing'
import {
  DEFAULT_FAQ_ITEMS,
  type ClinicStat,
  type ClinicService,
  type ClinicStaff,
} from '@/lib/types/clinic-content'
import { DEMO_CLINIC_SLUG } from '@/lib/services/demo-constants'
import { cleanupMisattributedDemoArtifacts, getPersonaAlignedPatientIds } from './cleanup'
import {
  DEMO_CANCELLATION_POLICY,
  DEMO_CHAIR_COUNT,
  DEMO_CONTACT_LEAD_FORM,
  DEMO_COPY_OVERRIDES,
  DEMO_EMAIL_AUTOMATIONS,
  DEMO_FINANCING_PARTNERS,
  DEMO_FORM_ES,
  DEMO_INSURANCE_CARRIERS,
  DEMO_INTAKE_FILE_DATA,
  DEMO_INTAKE_SUMMARY,
  DEMO_PAYMENT_METHODS,
  DEMO_PORTAL_SETTINGS,
  DEMO_RECALL_DEFAULT_MONTHS,
  DEMO_VISIT_TYPES,
} from './clinic-config'
import { phoneNumber, pick, snapToHalfHour } from './helpers'
import {
  DEMO_CALENDAR_FEED_TOKEN,
  DEMO_COLORING_PAGES,
  DEMO_DIFFERENCE_VIDEO_URL,
  DEMO_HERO_IMAGE_2_URL,
  DEMO_HERO_IMAGE_URL,
  DEMO_LOGO_URL,
  DEMO_OFFICE_PHOTOS,
} from './media'
import { APPT_TYPES, CITIES, FIRST_NAMES, LAST_NAMES, buildPatientPersonas } from './personas'
import { buildDemoTestimonials } from './reviews-data'
import { seedDemoSiteAnalytics } from './seed-analytics'
import { seedBlogPostsForOrg } from './seed-blog'
import { seedDemoCareers } from './seed-careers'
import { seedDemoMemberships, seedDemoShop } from './seed-commerce'
import {
  backfillDemoBookingAttribution,
  seedDemoAiUsage,
  seedDemoFollowups,
  seedDemoGoal,
  seedDemoMessageTemplates,
  seedDemoPatientDocuments,
  seedDemoPatientTags,
  seedDemoPatientViews,
  seedSecondDemoIntakeForm,
  upgradeDemoIntakeForm,
} from './seed-core'
import { renameDemoAcmeArtifacts, seedDemoFamilyForOrg, topUpDemoReviewText } from './seed-family'
import { seedLeadsForOrg } from './seed-leads'
import {
  seedDemoPacket,
  seedDemoScheduledMessage,
  seedPatientMessagesForOrg,
  topUpEmmaAttachment,
  topUpLinkedDemoTestimonials,
  topUpSophiaPreferenceMessages,
  topUpStarredThread,
} from './seed-messaging'
import {
  seedDemoBalanceOutreach,
  seedDemoBookingDeposit,
  seedDemoLoyalty,
  seedDemoNpsResponses,
  seedDemoPaymentPlan,
  seedDemoPreferredLanguage,
  seedDemoReferral,
  seedDemoWaitlist,
} from './seed-money'
import { seedRecallOutreachForOrg } from './seed-outreach'
import { seedDemoMoneyCoherence, seedDemoReferralPartner } from './seed-partners'
import { seedReviewsForOrg } from './seed-reviews'
import {
  DEMO_CUSTOMIZED,
  DEMO_SERVICES,
  DEMO_STATS,
  upgradeLegacyDemoStats,
} from './services-catalog'
import { DEMO_STAFF } from './staff'
import type { DemoClinicResult } from './types'

/**
 * Demo-clinic seeder. Creates a fully-populated clinic org so platform
 * admins can flip into the clinic dashboard via the demo-mode cookie
 * and see real-looking data — patients with insurance, an appointment
 * book, a few tasks.
 *
 * Idempotent by display name: if a clinic with the resolved slug
 * already exists we return that instead of creating a duplicate.
 *
 * Not seeded yet (will be filled in as the matching modules ship):
 * treatment plans, procedures, charts, claims, recall.
 *
 * ── Layout ────────────────────────────────────────────────────────────
 * This module was one 6,535-line file. Every new feature added seed code
 * to it, so it dwarfed everything else in lib/services and a change to,
 * say, the shop catalog meant scrolling past the whole patient book.
 *
 * It is now a directory. `createDemoClinic` — the one long orchestration
 * that mints the org and calls everything in order — stays here; the data
 * it seeds lives in the sibling files named for what they hold, and this
 * file re-exports everything the single file used to export, so no import
 * site had to change.
 */
export async function createDemoClinic(): Promise<DemoClinicResult> {
  // Org NAME is decoupled from the SLUG (2026-06 Acme→Dream Dental rename): the
  // public name became "Dream Dental Demo" but the slug stays the stable,
  // already-deployed `acme-dental-demo` (DEMO_CLINIC_SLUG) so the demo's live
  // subdomain + every self-heal key never moves. slugify(name) would have
  // produced `dream-dental-demo` — explicitly NOT what we want.
  const name = 'Dream Dental Demo'
  const slug = DEMO_CLINIC_SLUG

  // Seed the platform-owned canonical service library (idempotent — upserts
  // by slug). the demo's services + every clinic's /services pages read from it,
  // so it must exist before we wire the demo's library-linked services below.
  await seedServiceLibrary()

  // Idempotent: bail early if the slug already exists.
  const [existing] = await db
    .select({ id: schema.organization.id, name: schema.organization.name, slug: schema.organization.slug })
    .from(schema.organization)
    .where(eq(schema.organization.slug, slug))
    .limit(1)
  if (existing) {
    // Self-heal: flag legacy demos (seeded before the is_demo column
    // existed) so they're excluded from platform business metrics.
    // one-time (2026-06): Acme→Dream Dental — also rename the org row when it
    // still carries the old 'Acme…' name (the slug stays acme-dental-demo). The
    // org-switcher label + any name-based UI then read "Dream Dental Demo".
    // Scoped to this single isDemo org. Remove with the rename branches.
    await db
      .update(schema.organization)
      .set({
        isDemo: true,
        ...(existing.name?.startsWith('Acme') ? { name } : {}),
      })
      .where(eq(schema.organization.id, existing.id))

    // Keep the demo on the current template defaults so it always
    // showcases the latest visual direction. Runs every time the
    // "Create demo clinic" button is hit on an already-seeded demo.
    //
    // - bump sky-blue brand to sage if still on the pre-warm-neutral default
    // - backfill stats / testimonials / officePhotos when columns are null
    //   (e.g. demo seeded before those fields existed)
    const [profile] = await db
      .select({
        brandColor: schema.clinicProfile.brandColor,
        displayName: schema.clinicProfile.displayName,
        legalName: schema.clinicProfile.legalName,
        email: schema.clinicProfile.email,
        about: schema.clinicProfile.about,
        tagline: schema.clinicProfile.tagline,
        services: schema.clinicProfile.services,
        staff: schema.clinicProfile.staff,
        stats: schema.clinicProfile.stats,
        testimonials: schema.clinicProfile.testimonials,
        officePhotos: schema.clinicProfile.officePhotos,
        coloringPages: schema.clinicProfile.coloringPages,
        calendarFeedToken: schema.clinicProfile.calendarFeedToken,
        birthdayAutoSendEnabled: schema.clinicProfile.birthdayAutoSendEnabled,
        lapsedReactivationEnabled: schema.clinicProfile.lapsedReactivationEnabled,
        followupAutomation: schema.clinicProfile.followupAutomation,
        dailyDigestEnabled: schema.clinicProfile.dailyDigestEnabled,
        logoUrl: schema.clinicProfile.logoUrl,
        heroImageUrl: schema.clinicProfile.heroImageUrl,
        heroImageUrl2: schema.clinicProfile.heroImageUrl2,
        differenceVideoUrl: schema.clinicProfile.differenceVideoUrl,
        faq: schema.clinicProfile.faq,
        acceptedInsuranceCarriers: schema.clinicProfile.acceptedInsuranceCarriers,
        paymentMethods: schema.clinicProfile.paymentMethods,
        financingPartners: schema.clinicProfile.financingPartners,
        cancellationPolicy: schema.clinicProfile.cancellationPolicy,
        announcement: schema.clinicProfile.announcement,
        timezone: schema.clinicProfile.timezone,
        portalSettings: schema.clinicProfile.portalSettings,
        emailAutomations: schema.clinicProfile.emailAutomations,
        chairCount: schema.clinicProfile.chairCount,
        visitTypeSettings: schema.clinicProfile.visitTypeSettings,
        recallDefaultMonths: schema.clinicProfile.recallDefaultMonths,
        onboardingInterviewCompletedAt: schema.clinicProfile.onboardingInterviewCompletedAt,
        siteLiveAt: schema.clinicProfile.siteLiveAt,
        leadForms: schema.clinicProfile.leadForms,
        copyOverrides: schema.clinicProfile.copyOverrides,
        websiteDraft: schema.clinicProfile.websiteDraft,
      })
      .from(schema.clinicProfile)
      .where(eq(schema.clinicProfile.organizationId, existing.id))
      .limit(1)

    const patch: Partial<typeof schema.clinicProfile.$inferInsert> = {}
    if (profile?.brandColor === '#0ea5e9') patch.brandColor = '#9CAF9F'
    // Backfill the clinic timezone on legacy demos (seeded before the column).
    if (!profile?.timezone) patch.timezone = 'America/Chicago'
    // Backfill the interview stamp on legacy demos (seeded before the hub's
    // go-live checklist read it) — the demo site was always "personalized".
    if (!profile?.onboardingInterviewCompletedAt) patch.onboardingInterviewCompletedAt = new Date()
    // The demo site is always LIVE — a freshly-minted demo org (new env, or
    // a from-scratch resync) must never sit behind the go-live lever showing
    // "Coming soon" to a prospect mid-pitch.
    if (!profile?.siteLiveAt) patch.siteLiveAt = new Date()
    // Backfill the site announcement bar on legacy demos (migration 0134) so
    // the live demo site shows the strip. Only-when-unset — a clinic-authored
    // (or cleared) bar is never clobbered.
    if (profile?.announcement == null) {
      patch.announcement = {
        message: 'Now welcoming new patients — same-week visits available.',
        endsAt: null,
        href: '/book',
      }
    }
    // Backfill a customized contact form (only-when-unset) — the Website →
    // Forms surface then shows a real "Customized" state next to the default
    // insurance-check form. The fields mirror the defaults plus one select.
    if (!profile?.leadForms) patch.leadForms = DEMO_CONTACT_LEAD_FORM
    // Backfill a couple of copy overrides (only-when-unset) — the Pages
    // manager then shows real "customized" copy next to template defaults.
    if (!profile?.copyOverrides) patch.copyOverrides = DEMO_COPY_OVERRIDES
    // Reset any lingering website draft: the demo's content is seeded as
    // PUBLISHED, and a stray staged edit left by a demo session would
    // otherwise pin an "unpublished changes" card on the hub forever.
    if (profile?.websiteDraft) patch.websiteDraft = null

    // one-time (2026-06): Acme→Dream Dental — force-refresh the clinic identity
    // on existing demos. backfill-when-null never fires here (these fields were
    // always populated), so detect the OLD Acme literals and replace. Safe:
    // every write in this block is scoped to the isDemo org. Remove this branch
    // once all live demos have been re-seeded past the rename.
    if (profile?.displayName === 'Acme Dental') patch.displayName = 'Dream Dental'
    if (profile?.legalName === 'Acme Dental, PLLC') patch.legalName = 'Dream Dental, PLLC'
    if (profile?.email === 'hello@acme-dental.example') patch.email = 'hello@dream-dental.example'

    // About + tagline upgrade: legacy demos shipped with a meta-disclosure
    // "this is a demonstration clinic seeded by..." paragraph that broke the
    // public-site immersion. Replace it with real warm copy so the demo looks
    // like a real clinic site. Skips when the demo has been hand-edited.
    // one-time (2026-06): Acme→Dream Dental — also detect the prior warm
    // "We started Acme…" literal so the rename reaches demos seeded after the
    // disclosure was already replaced but before the rename.
    if (
      !profile?.about ||
      profile.about.startsWith('Acme Dental is a demonstration clinic') ||
      profile.about.startsWith('We started Acme to make going to the dentist')
    ) {
      patch.about =
        'We started Dream Dental to make going to the dentist feel like going to any other thoughtful, modern place. Calm rooms, plain-English explanations, no judgment about how long it\'s been. Whether it\'s your first cleaning in years or a routine check-up, you\'ll be in good hands — and out the door knowing exactly what happened and why.'
    }
    if (!profile?.tagline || profile.tagline === 'Bright smiles, gentle care') {
      patch.tagline = 'Dental care that finally feels human.'
    }
    if (!profile?.stats) {
      patch.stats = DEMO_STATS
    } else {
      // Stats backfill: legacy demos seeded the static "8,000+ five-star
      // reviews" stat before the dynamic-stat pattern existed. Swap it for
      // the live `review_count` stat so the demo shows real data and
      // exercises the dynamic substitution path. Skips when stats have
      // been hand-edited away from the demo defaults.
      const upgraded = upgradeLegacyDemoStats(profile.stats as ClinicStat[] | null)
      if (upgraded) patch.stats = upgraded
    }
    // Services self-heal: legacy demos seeded free-text services (no
    // librarySlug) before the service-library checkpoint. Replace them with
    // the curated library-linked set so the /services index grouping +
    // Core/Special nav dropdowns + detail pages all light up. Idempotent —
    // skips when the services already reference library slugs (so a demo a
    // platform admin re-themed past the defaults isn't clobbered).
    //
    // Two-stage backfill: if services are already library-linked but missing
    // the 1B `customized` blobs (i.e. seeded BEFORE 1B), top them up with
    // the hand-written demo blobs from DEMO_CUSTOMIZED so the public site
    // detail pages exercise the customized path on next render.
    {
      const storedServices = Array.isArray(profile?.services)
        ? (profile!.services as ClinicService[])
        : null
      const alreadyLibraryLinked =
        storedServices !== null &&
        storedServices.some((s) => typeof s?.librarySlug === 'string' && s.librarySlug)
      // one-time (2026-06): Acme→Dream Dental — a stored customized blob whose
      // body still names "Acme" predates the rename and must be force-replaced
      // (backfill-when-missing below never touches an existing blob). The
      // DEMO_CUSTOMIZED constants now carry Dream Dental copy and only ever
      // write the isDemo org, so this is safe. Remove with the rename branches.
      const needsRename = (s: ClinicService): boolean =>
        typeof s?.librarySlug === 'string' &&
        Boolean(DEMO_CUSTOMIZED[s.librarySlug]) &&
        typeof s.customized?.body === 'string' &&
        s.customized.body.includes('Acme')
      if (!alreadyLibraryLinked) {
        patch.services = DEMO_SERVICES
      } else if (storedServices) {
        const missingCustomized = storedServices.some(
          (s) =>
            typeof s?.librarySlug === 'string' &&
            DEMO_CUSTOMIZED[s.librarySlug] &&
            (!s.customized || needsRename(s)),
        )
        if (missingCustomized) {
          patch.services = storedServices.map((s) => {
            if (
              typeof s?.librarySlug === 'string' &&
              DEMO_CUSTOMIZED[s.librarySlug] &&
              (!s.customized || needsRename(s))
            ) {
              return { ...s, customized: DEMO_CUSTOMIZED[s.librarySlug] }
            }
            return s
          })
        }
      }
    }
    // testimonials are handled by the dedicated self-heal below — it needs
    // existingPatientIds (only available later in this block) so each
    // seeded testimonial can link to a real CRM patient.
    if (!profile?.officePhotos) patch.officePhotos = DEMO_OFFICE_PHOTOS
    // Coloring corner backfill: legacy demos predate migration 0126.
    if (!profile?.coloringPages) patch.coloringPages = DEMO_COLORING_PAGES
    if (!profile?.logoUrl) patch.logoUrl = DEMO_LOGO_URL
    if (!profile?.heroImageUrl) patch.heroImageUrl = DEMO_HERO_IMAGE_URL
    if (!profile?.heroImageUrl2) patch.heroImageUrl2 = DEMO_HERO_IMAGE_2_URL
    // Difference-video backfill: legacy demos predate migration 0037 + the
    // ambient autoplay loop in the "Why us?" section. Also overwrite the
    // first-pass Pexels URL — Pexels hotlink-blocked the mp4 endpoint with
    // a 403, so the section was rendering a blank card. The S3-hosted
    // mirror is reliable; force-replace the broken Pexels URL on next entry.
    if (
      !profile?.differenceVideoUrl ||
      profile.differenceVideoUrl.includes('videos.pexels.com')
    ) {
      patch.differenceVideoUrl = DEMO_DIFFERENCE_VIDEO_URL
    }
    // Calendar-feed token backfill: legacy demos seeded before the feed shipped
    // have null here, so the "Calendar feed" card shows Off. Seed the fixed
    // demo token so it showcases the live On state (idempotent; never clobbers a
    // real token).
    if (!profile?.calendarFeedToken) {
      patch.calendarFeedToken = DEMO_CALENDAR_FEED_TOKEN
    }
    // Retention-automation toggles: legacy demos default to 0, so the
    // Recall & Outreach "Automations" card shows Off. Flip them on (idempotent)
    // so the demo showcases the live state. The cron skips demo clinics, so this
    // never sends a real email.
    if (profile?.birthdayAutoSendEnabled !== 1) {
      patch.birthdayAutoSendEnabled = 1
    }
    if (profile?.lapsedReactivationEnabled !== 1) {
      patch.lapsedReactivationEnabled = 1
    }
    // Smart follow-up rules: flip on (balance + recall) so the /followups rules
    // card showcases the live state on legacy demos. Idempotent; cron skips demo.
    if (!profile?.followupAutomation) {
      patch.followupAutomation = { balance: true, recall: true, unconfirmed: false }
    }
    // Morning digest: flip on so the /followups card showcases it. Cron skips demo.
    if (profile?.dailyDigestEnabled !== 1) {
      patch.dailyDigestEnabled = 1
    }
    // FAQ backfill: legacy demos seeded before migration 0036 added the
    // faq column have null here, so the public /faq page falls back to the
    // universal DEFAULT_FAQ_ITEMS but the demo is missing its "edited"
    // state. Seed the defaults so the editor + render-from-DB path both
    // exercise the column. Skips when the demo has been hand-edited.
    if (!profile?.faq) patch.faq = DEFAULT_FAQ_ITEMS
    // Insurance carriers backfill: migration 0038 added the column. Seed
    // the universal PPO list so the public site's Insurance section + the
    // carrier dropdown on the verifier form both render with realistic
    // content on legacy demos. Also tops up demos that were seeded
    // BEFORE the list grew to the current default — we detect "stale
    // demo defaults" by comparing against the size of the current full
    // list and overwriting when the stored array is smaller. A clinic
    // that has CURATED a shorter list still wins by virtue of the
    // typical clinic-edited array containing names outside our default
    // set; we only overwrite when every stored entry is also in the
    // current default (i.e. a pure subset of stale demo seed data).
    const currentSet = new Set(DEMO_INSURANCE_CARRIERS)
    const stored = Array.isArray(profile?.acceptedInsuranceCarriers)
      ? (profile!.acceptedInsuranceCarriers as unknown[]).filter(
          (c): c is string => typeof c === 'string',
        )
      : null
    const isStaleDemoSubset =
      stored !== null &&
      stored.length < DEMO_INSURANCE_CARRIERS.length &&
      stored.every((c) => currentSet.has(c))
    if (stored === null || isStaleDemoSubset) {
      patch.acceptedInsuranceCarriers = DEMO_INSURANCE_CARRIERS
    }
    // Patients dropdown backfill (migration 0041 — Checkpoint 2). Legacy
    // demos predate the /insurance + /payment-financing + /dental-plans
    // pages and have null for paymentMethods / financingPartners /
    // cancellationPolicy. Seed all three so the demo exercises the full
    // Patients dropdown render path. Each column only backfills when
    // null — a real clinic that hand-edited any of these stays untouched.
    if (!profile?.paymentMethods) patch.paymentMethods = DEMO_PAYMENT_METHODS
    if (!profile?.financingPartners) {
      patch.financingPartners = DEMO_FINANCING_PARTNERS
    }
    if (!profile?.cancellationPolicy) {
      patch.cancellationPolicy = DEMO_CANCELLATION_POLICY
    }
    // Patient-portal settings backfill — partial blob merges over defaults at
    // read time, so seeding just the demo copy is enough. Skips when the demo
    // has any saved portal settings (hand-edited = clinic-owned).
    if (!profile?.portalSettings) {
      patch.portalSettings = DEMO_PORTAL_SETTINGS
    }
    // Automated-email copy backfill (Settings → Automations → Emails). Only
    // seeds the demo overrides when null so a hand-edited demo stays untouched;
    // partial blob merges over the registry defaults at read time.
    if (!profile?.emailAutomations) {
      patch.emailAutomations = DEMO_EMAIL_AUTOMATIONS
    }
    // Clinic-ops backfill (migration 0054 — Practice setup). Legacy demos
    // predate chair_count / visit_type_settings / recall_default_months. Each
    // only backfills when null so a hand-edited demo stays untouched.
    if (profile?.chairCount == null) patch.chairCount = DEMO_CHAIR_COUNT
    if (!profile?.visitTypeSettings) patch.visitTypeSettings = DEMO_VISIT_TYPES
    if (profile?.recallDefaultMonths == null) patch.recallDefaultMonths = DEMO_RECALL_DEFAULT_MONTHS
    // Staff self-heal (Checkpoint 3 — /team page + about-dropdown). Legacy
    // demos seeded the 3-entry minimal staff array before this PR. Two-stage
    // backfill:
    //   (1) If `staff` is null OR ALL stored entries match the legacy 3-entry
    //       shape exactly (only id/name/title/bio set, none of the new
    //       slug/credentials/specialties/funFact/bookHref fields populated),
    //       replace with the curated DEMO_STAFF set so the demo exercises
    //       the full 5-card grid + every detail-page field branch.
    //   (2) Otherwise, top up any matching legacy entry IN PLACE — keep the
    //       clinic's edits (name/title/bio/photoUrl) but backfill the new
    //       optional fields from DEMO_STAFF by id. Skips entries that already
    //       have ANY of the new fields set (real clinic edits stay untouched).
    {
      const storedStaff = Array.isArray(profile?.staff)
        ? (profile!.staff as ClinicStaff[])
        : null
      const isLegacyMinimal = (s: ClinicStaff): boolean =>
        !s.slug && !s.credentials && !s.specialties && !s.funFact && !s.bookHref
      const allLegacy =
        storedStaff !== null &&
        storedStaff.length > 0 &&
        storedStaff.every(isLegacyMinimal)
      if (storedStaff === null || storedStaff.length === 0 || allLegacy) {
        patch.staff = DEMO_STAFF
      } else {
        // Targeted in-place backfill — only touches rows whose new optional
        // fields are ALL still null/absent (legacy-shaped within a hand-edited
        // array). A clinic that hand-edited any new field stays untouched.
        const byId = new Map(DEMO_STAFF.map((s) => [s.id, s]))
        const upgraded = storedStaff.map((s) => {
          const template = byId.get(s.id)
          let next = s
          // Backfill the Checkpoint-3 optional fields on legacy-minimal rows.
          if (isLegacyMinimal(s) && template) {
            next = {
              ...next,
              slug: template.slug ?? null,
              credentials: template.credentials ?? null,
              specialties: template.specialties ?? null,
              funFact: template.funFact ?? null,
              bookHref: template.bookHref ?? null,
            }
          }
          // Backfill a demo headshot + focal point when the row still has none
          // (demos seeded before staff photos existed). Only touches rows still
          // matching the demo persona by name — never injects a stock photo onto
          // a renamed/clinic-edited entry, and never overwrites an uploaded one.
          if (template?.photoUrl && !next.photoUrl && next.name === template.name) {
            next = {
              ...next,
              photoUrl: template.photoUrl,
              photoPosition: template.photoPosition ?? null,
            }
          }
          // one-time (2026-06): Acme→Dream Dental — a demo persona's bio that
          // still names "Acme" predates the rename. Restore the template bio
          // (Dream Dental copy) for that persona only, by id + matching name, so
          // a clinic-renamed entry is never clobbered. Remove with the rename.
          if (
            template &&
            next.name === template.name &&
            typeof next.bio === 'string' &&
            next.bio.includes('Acme') &&
            template.bio
          ) {
            next = { ...next, bio: template.bio }
          }
          return next
        })
        if (upgraded.some((s, i) => s !== storedStaff[i])) {
          patch.staff = upgraded
        }
      }
    }
    if (Object.keys(patch).length > 0) {
      await db
        .update(schema.clinicProfile)
        .set(patch)
        .where(eq(schema.clinicProfile.organizationId, existing.id))
    }
    // Per-patient recall override backfill (migration 0054). Give Charlotte
    // Diaz the 3-month perio recall on legacy demos so the patient Edit modal's
    // recall select + the recall pill have a populated non-default example.
    // Only touches her row when she has no override yet (clinic-edited = kept).
    await db
      .update(schema.patient)
      .set({ recallIntervalMonths: 3, updatedAt: new Date() })
      .where(
        and(
          eq(schema.patient.organizationId, existing.id),
          eq(schema.patient.firstName, 'Charlotte'),
          eq(schema.patient.lastName, 'Diaz'),
          isNull(schema.patient.recallIntervalMonths),
        ),
      )
    // Seed the default intake form if the demo predates the forms feature.
    await seedDefaultIntakeForm(existing.id)
    await seedSecondDemoIntakeForm(existing.id)

    // Self-heal patient_note + form_submission rows when missing. We can't
    // re-pick the original persona indices (those IDs are gone), so we
    // just attach a few generic samples to the first patients we find.
    // A full reset still requires the "Create demo clinic" flow on a wiped
    // demo — but this at least makes the Notes + Forms tabs non-empty.
    const existingPatientsForHeal = await db
      .select({ id: schema.patient.id, email: schema.patient.email, firstName: schema.patient.firstName, lastName: schema.patient.lastName })
      .from(schema.patient)
      .where(eq(schema.patient.organizationId, existing.id))
      .limit(8)
    if (existingPatientsForHeal.length > 0) {
      const [noteFound] = await db
        .select({ id: schema.patientNote.id })
        .from(schema.patientNote)
        .where(eq(schema.patientNote.organizationId, existing.id))
        .limit(1)
      if (!noteFound) {
        const noteBodies = [
          'Prefers Dr. Patel for cleanings. Loves the warm towels.',
          'Tried to reach in 2024-09 — left voicemail. Try again next quarter.',
          'Highly anxious. Always pre-medicate with halcion + use nitrous.',
        ]
        for (let i = 0; i < Math.min(3, existingPatientsForHeal.length); i++) {
          await db.insert(schema.patientNote).values({
            id: newId('pnote'),
            organizationId: existing.id,
            patientId: existingPatientsForHeal[i].id,
            authorId: null,
            body: noteBodies[i],
          })
        }
      }

      const [subFound] = await db
        .select({ id: schema.formSubmission.id })
        .from(schema.formSubmission)
        .where(eq(schema.formSubmission.organizationId, existing.id))
        .limit(1)
      if (!subFound) {
        const [defaultForm] = await db
          .select({ id: schema.formTemplate.id })
          .from(schema.formTemplate)
          .where(eq(schema.formTemplate.organizationId, existing.id))
          .limit(1)
        if (defaultForm) {
          for (let i = 0; i < Math.min(3, existingPatientsForHeal.length); i++) {
            const p = existingPatientsForHeal[i]
            await db.insert(schema.formSubmission).values({
              id: newId('sub'),
              organizationId: existing.id,
              formTemplateId: defaultForm.id,
              patientId: p.id,
              appointmentId: null,
              data: { intake: 'sample' },
              submitterName: `${p.firstName} ${p.lastName}`,
              submitterEmail: p.email,
              submitterPhone: null,
              submittedAt: new Date(Date.now() - (60 + i * 30) * 24 * 60 * 60 * 1000),
            })
          }
        }
      }
    }

    // Appointments module v1 self-heal: clinic_provider + reminder log +
    // appointment.source + appointment.providerId backfill. Existing
    // demos predate these columns.
    const [providerFound] = await db
      .select({ id: schema.clinicProvider.id })
      .from(schema.clinicProvider)
      .where(eq(schema.clinicProvider.organizationId, existing.id))
      .limit(1)
    const dentistId = providerFound?.id ?? newId('prov')
    const hygienistId = newId('prov')
    if (!providerFound) {
      await db.insert(schema.clinicProvider).values([
        { id: dentistId, organizationId: existing.id, displayName: 'Dr. Jordan Reyes', role: 'dentist', email: 'jordan@acme-dental.example' },
        { id: hygienistId, organizationId: existing.id, displayName: 'Maria Vega, RDH', role: 'hygienist', email: 'maria@acme-dental.example' },
      ])

      // Backfill providerId on existing appointments: cleanings go to the
      // hygienist, everything else to the dentist. Only touches rows that
      // currently have no provider attached so this is idempotent if the
      // self-heal re-runs.
      await db
        .update(schema.appointment)
        .set({ providerId: hygienistId })
        .where(
          and(
            eq(schema.appointment.organizationId, existing.id),
            eq(schema.appointment.type, 'cleaning'),
            isNull(schema.appointment.providerId),
          ),
        )
      await db
        .update(schema.appointment)
        .set({ providerId: dentistId })
        .where(
          and(
            eq(schema.appointment.organizationId, existing.id),
            isNull(schema.appointment.providerId),
          ),
        )
    }

    // Backfill appointment.source = 'manual' on rows that lack one. Cheap
    // and idempotent (rows that already have a source are untouched).
    await db
      .update(schema.appointment)
      .set({ source: 'manual' })
      .where(
        and(
          eq(schema.appointment.organizationId, existing.id),
          isNull(schema.appointment.source),
        ),
      )

    // SEO module: give the demo's public-booking visits a realistic
    // traffic-source mix so the organic→booking funnel is populated.
    await backfillDemoBookingAttribution(existing.id)

    // Seed one reminder log row against an existing future appointment so
    // the drawer's reminder-activity stripe isn't empty.
    const [reminderFound] = await db
      .select({ id: schema.appointmentReminderLog.id })
      .from(schema.appointmentReminderLog)
      .where(eq(schema.appointmentReminderLog.organizationId, existing.id))
      .limit(1)
    if (!reminderFound) {
      const [futureAppt] = await db
        .select({ id: schema.appointment.id })
        .from(schema.appointment)
        .where(
          and(
            eq(schema.appointment.organizationId, existing.id),
            gte(schema.appointment.startTime, new Date()),
          ),
        )
        .limit(1)
      if (futureAppt) {
        // Automated-shaped rows (no sentByUserId) live under the
        // appt_reminder_auto_touch_uq guard — a re-seed defers to whatever is
        // already there rather than tripping the boot-time resync.
        await db
          .insert(schema.appointmentReminderLog)
          .values({
            id: newId('rem'),
            organizationId: existing.id,
            appointmentId: futureAppt.id,
            channel: 'email',
            template: 'default_reminder',
          })
          .onConflictDoNothing()
      }
    }

    // Leads module self-heal: top up to the full 6 curated leads so the
    // demo always showcases every glyph state on /leads — fresh / aging
    // / stale / contacted / converted / archived. Additive + idempotent:
    // checks existing lead names + only inserts the ones that are
    // missing. Legacy demos previously seeded with the sparse 3-lead set
    // get topped up to 6 on the next "View as clinic" entry.
    const existingLeads = await db
      .select({ name: schema.lead.name })
      .from(schema.lead)
      .where(eq(schema.lead.organizationId, existing.id))
    const existingLeadNames = new Set(existingLeads.map((r) => r.name))
    // Look up Emma Lopez patient by name so the converted-lead seed can
    // point at her. `null` if she doesn't exist on this demo (older
    // demo predates persona 6) — convert link just stays unset then.
    const [emmaPatient] = await db
      .select({ id: schema.patient.id })
      .from(schema.patient)
      .where(
        and(
          eq(schema.patient.organizationId, existing.id),
          eq(schema.patient.firstName, 'Emma'),
          eq(schema.patient.lastName, 'Lopez'),
        ),
      )
      .limit(1)
    await seedLeadsForOrg(existing.id, new Date(), emmaPatient?.id ?? null, existingLeadNames)

    // Recall & Outreach self-heal: top up to the full audience + campaign
    // + events set. Additive + idempotent. Each pre-fetch is one query.
    const existingAudienceRows = await db
      .select({ id: schema.audiences.id, name: schema.audiences.name })
      .from(schema.audiences)
      .where(eq(schema.audiences.organizationId, existing.id))
    const existingAudiencesByName = new Map(existingAudienceRows.map((r) => [r.name, r.id]))
    const existingCampaignRows = await db
      .select({ id: schema.campaigns.id, name: schema.campaigns.name })
      .from(schema.campaigns)
      .where(eq(schema.campaigns.organizationId, existing.id))
    const existingCampaignsByName = new Map(existingCampaignRows.map((r) => [r.name, r.id]))
    // Persona-identity anchoring: entry i is the patient whose email matches
    // persona i (never an arbitrary org patient — see the anchoring note
    // above getPersonaAlignedPatientIds). Then a one-time repair sweep
    // removes seeded artifacts that legacy positional resyncs misattributed
    // to real patients (e.g. the "phantom 5★ review").
    const existingPatientIds = await getPersonaAlignedPatientIds(existing.id, new Date())
    await cleanupMisattributedDemoArtifacts(existing.id, existingPatientIds)
    await seedRecallOutreachForOrg(
      existing.id,
      new Date(),
      existingPatientIds,
      existingAudiencesByName,
      existingCampaignsByName,
    )
    // Push any legacy demo scheduled campaign far into the future so the new
    // send-scheduled-campaigns cron never actually blasts demo email on resync.
    // (Legacy demos were seeded with scheduledAt ~2 days out; the create path
    // now seeds far-future, this corrects the ones already in the DB.)
    await db
      .update(schema.campaigns)
      .set({ scheduledAt: new Date(Date.now() + 3650 * 24 * 60 * 60 * 1000) })
      .where(
        and(
          eq(schema.campaigns.organizationId, existing.id),
          eq(schema.campaigns.status, 'scheduled'),
        ),
      )

    // Patient Communications self-heal: top up to the seeded thread set.
    // Additive + idempotent — checks existing thread patient ids before
    // inserting.
    const existingThreadRows = await db
      .select({ patientId: schema.patientThread.patientId })
      .from(schema.patientThread)
      .where(eq(schema.patientThread.organizationId, existing.id))
    const existingThreadPatientIds = new Set(existingThreadRows.map((r) => r.patientId))
    await seedPatientMessagesForOrg(existing.id, new Date(), existingPatientIds, existingThreadPatientIds)

    // Top up Sophia's thread with historical in-app inbounds so legacy
    // demos exercise the "{patient} prefers {channel}" composer label
    // (which needs ≥3 inbound messages on one channel). Idempotent: only
    // inserts when count is still below the threshold.
    await topUpSophiaPreferenceMessages(existing.id, existingPatientIds, new Date())

    // Backfill the demo image attachment onto Emma's "temporary crown" inbound
    // (the photo-attachment showcase) for legacy demos seeded before
    // attachments existed. Idempotent: only writes when no message in her
    // thread carries an attachment yet.
    await topUpEmmaAttachment(existing.id, existingPatientIds)

    // Seed a pending "send later" message (Marcus) so the scheduled-send strip
    // shows in legacy demos. Idempotent: skips when one already exists.
    await seedDemoScheduledMessage(existing.id, existingPatientIds, new Date())

    // Star Marcus's thread on legacy demos (showcases the star marker +
    // Starred filter). Idempotent: skips when any thread is already starred.
    await topUpStarredThread(existing.id, existingPatientIds)

    // Testimonials self-heal: legacy demos seeded fabricated "Sarah K."
    // testimonials with no patientId — they don't correspond to any CRM
    // patient. Idempotent: only patches when none of the existing
    // testimonials are linked to a real patient yet. We rebuild from seed
    // so the rendered testimonials match the patients who actually
    // completed reviews (Mia, Noah) plus one free-text legacy entry.
    await topUpLinkedDemoTestimonials(existing.id, existingPatientIds)

    // one-time (2026-06): Acme→Dream Dental — force-refresh the location name +
    // seo_meta on existing demos (both seed-only paths that backfill-when-null
    // never revisits). Scoped to this isDemo org. Remove with the rename.
    await renameDemoAcmeArtifacts(existing.id)

    // Reviews self-heal: top up config + review requests for legacy demos.
    const existingReviewConfigRows = await db
      .select({ id: schema.clinicReviewConfig.organizationId })
      .from(schema.clinicReviewConfig)
      .where(eq(schema.clinicReviewConfig.organizationId, existing.id))
    const existingReviewRequestRows = await db
      .select({ patientId: schema.reviewRequest.patientId })
      .from(schema.reviewRequest)
      .where(eq(schema.reviewRequest.organizationId, existing.id))
    const existingReviewPatients = new Set(existingReviewRequestRows.map((r) => r.patientId))
    await seedReviewsForOrg(
      existing.id,
      new Date(),
      existingPatientIds,
      existingReviewConfigRows.length > 0,
      existingReviewPatients,
    )

    // Review-text backfill: legacy demos seeded review_request rows before
    // migration 0035 added `review_text`, so completed reviews show "no copy
    // here" on /reviews/received even though the public testimonials have
    // the text. Backfills review_text + rating on any completed review_request
    // whose patient matches a DEMO_REVIEW_TEXTS entry. Idempotent —
    // skips rows that already have non-null text.
    await topUpDemoReviewText(existing.id)

    // Blog self-heal: top up the curated post set. Additive + idempotent —
    // checks existing slugs so legacy demos pick up the blog on next entry.
    const existingBlogRows = await db
      .select({ slug: schema.blogPost.slug })
      .from(schema.blogPost)
      .where(eq(schema.blogPost.organizationId, existing.id))
    await seedBlogPostsForOrg(existing.id, new Date(), new Set(existingBlogRows.map((r) => r.slug)))

    const patientCount = (
      await db.select({ id: schema.patient.id }).from(schema.patient).where(eq(schema.patient.organizationId, existing.id))
    ).length
    const appointmentCount = (
      await db
        .select({ id: schema.appointment.id })
        .from(schema.appointment)
        .where(eq(schema.appointment.organizationId, existing.id))
    ).length

    // Careers self-heal: seed once if the legacy demo has no job postings.
    // Placed after the count selects so it doesn't shift the seeder test's
    // queue positions. locationId=null is fine — the public JobPosting
    // location is derived from the clinic's primary location at render time.
    const [existingJob] = await db
      .select({ id: schema.jobPosting.id })
      .from(schema.jobPosting)
      .where(eq(schema.jobPosting.organizationId, existing.id))
      .limit(1)
    if (!existingJob) await seedDemoCareers(existing.id, null, new Date())

    // Shop self-heal: seed the catalog once if the legacy demo has none.
    const [existingProduct] = await db
      .select({ id: schema.shopProduct.id })
      .from(schema.shopProduct)
      .where(eq(schema.shopProduct.organizationId, existing.id))
      .limit(1)
    if (!existingProduct) await seedDemoShop(existing.id, new Date())

    // Membership self-heal: seed plans (+ members for existing patients) once.
    const [existingPlan] = await db
      .select({ id: schema.membershipPlan.id })
      .from(schema.membershipPlan)
      .where(eq(schema.membershipPlan.organizationId, existing.id))
      .limit(1)
    if (!existingPlan) {
      // Members come from the seeded personas only (identity-anchored) —
      // the old unordered `.limit(3)` could hand a membership to a real
      // patient someone created in the demo org.
      const memberPatients = existingPatientIds.filter((x): x is string => !!x).slice(0, 3)
      await seedDemoMemberships(existing.id, new Date(), memberPatients)
    }

    // PMS Integrations self-heal: seed the sandbox connection + entity maps +
    // sync/write-back history once (idempotent — no-op if already connected).
    await seedDemoPms(existing.id)

    // Zernio (Google Business) self-heal: seed a connected synthetic GBP so the
    // Integrations Google Business card demos the connected state. Demo never
    // hits the network. Idempotent.
    await seedDemoZernio(existing.id, existing.name)

    // Google Business reviews self-heal: seed the synthetic Google reviews so
    // legacy demos showcase /reviews/received + the public AggregateRating.
    // Idempotent (upsert by externalReviewId). Never networks.
    await seedDemoGoogleReviews(existing.id)

    // Reviews redesign self-heal: legacy demo config predates the Google-first
    // loop — flip it to the showcase state (auto-ask immediately, auto-feature
    // 4★+, private-feedback path on). And mark ONE qualifying 5★ Google review
    // hidden so the "hide from website" override is visible. Both idempotent +
    // demo-scoped (seedDemoGoogleReviews' onConflictDoNothing won't set the flag
    // on a pre-existing row, so we set it here).
    await db
      .update(schema.clinicReviewConfig)
      .set({
        autoSendEnabled: 1,
        autoSendDelayHours: 0,
        featureMinStars: 4,
        showPrivateFeedback: 1,
        // Star-gate showcase: the demo review landing demos the triage ask.
        starGateEnabled: 1,
        // NPS showcase: the survey toggle reads ON and the pulse section has
        // data (seedDemoNpsResponses). Demo orgs never actually send.
        npsEnabled: 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.clinicReviewConfig.organizationId, existing.id))
    await db
      .update(schema.platformReview)
      .set({ hiddenFromSite: 1, updatedAt: new Date() })
      .where(
        and(
          eq(schema.platformReview.organizationId, existing.id),
          eq(schema.platformReview.externalReviewId, 'demo_gr_2'),
        ),
      )

    // Facebook recommendations self-heal: seed synthetic FB recommendations
    // (recommend / don't-recommend) so the Reviews "From Facebook" section
    // showcases populated state on legacy demos. Idempotent; never networks. FB
    // recommendations are excluded from the public AggregateRating (Google-only).
    await seedDemoFacebookReviews(existing.id)

    // Google Business sync self-heal: flag the synced fields 'google' + stamp
    // googleSyncedAt + seed google_photos so legacy demos showcase the Settings
    // "Sync from Google" provenance + import gallery. Non-destructive (only
    // fills defaults). Never networks.
    await seedDemoGbpSync(existing.id)

    // Google Business local metrics self-heal: the SEO GBP-metrics card + the
    // Analytics "Google Business — local actions" tile read demoMetrics()
    // whenever the connection is isDemo (seeded above). No row to persist — this
    // asserts the prerequisite + documents where the numbers come from.
    await seedDemoGbpMetrics(existing.id)

    // Per-platform social metrics self-heal: the Analytics "Social performance"
    // band reads synthetic per-platform numbers (IG/FB followers/reach/
    // engagement) whenever the connection is isDemo (the IG+FB accounts were
    // seeded by seedDemoZernio). No row to persist — documented no-op hook.
    await seedDemoSocialMetrics(existing.id)

    // Social posts self-heal: seed multi-channel social posts (a published
    // cross-post to GBP+IG+FB w/ image + Book CTA, a published GBP Offer, a
    // scheduled IG+FB cross-post, a scheduled GBP Event) so the Social Posts
    // page + content calendar showcase populated history on legacy demos.
    // Idempotent; never networks (isDemo rows).
    await seedDemoSocialPosts(existing.id)

    // Social add-on self-heal: flag the demo (Premium) clinic's social_addon = 1
    // so the entitlement computes the full 5 social slots for PR 2's social UI.
    // Idempotent; never touches Stripe (the demo has no real subscription).
    await seedDemoSocialAddon(existing.id)

    // THE VOICE self-heal (Transformation Phase 2): reseed the Approval
    // Inbox's open proposals + the ledger entries behind the standup card.
    // Persona-anchored by identity; delete-and-reseed by the act_demo_/
    // prop_demo_ markers, so a demo session's approvals reset on resync.
    await seedDemoVoice(
      existing.id,
      buildPatientPersonas(new Date()).map((p, i) => ({
        patientId: existingPatientIds[i] ?? null,
        firstName: p.firstName,
      })),
    )

    // Money-coherence self-heal: ensure a paid-unfulfilled order + an online
    // balance payment exist (drives the Overview "Orders to fulfill" card, the
    // /payments/online page, and the commerce timeline events on legacy demos).
    await seedDemoMoneyCoherence(existing.id)

    // Website Editor: seed the AI-rewrite allowance meter with a non-zero count.
    await seedDemoAiUsage(existing.id)

    // The Dream Team's goal — the team has somewhere to aim in the demo.
    await seedDemoGoal(existing.id)

    // CYCLES (D7d): the demo org is excluded from every cron, so its
    // heartbeat would read "first cycle hasn't run yet" forever — a true
    // sentence about the demo that tells a lie about the product. Stamped
    // ~20 minutes back on each resync (which runs on every deploy/boot), so
    // the Dream Team page shows the live state a real clinic sees.
    await db
      .update(schema.clinicProfile)
      .set({ dreamTeamCycleAt: new Date(Date.now() - 20 * 60 * 1000) })
      .where(eq(schema.clinicProfile.organizationId, existing.id))

    // Patient-portal family self-heal: Lily (Emma's dependent) + her upcoming
    // cleaning, so Family access demos on legacy seeds too. Idempotent.
    await seedDemoFamilyForOrg(existing.id, new Date())

    // Website Presence self-heal: ~3 weeks of site_pageview rollups + seo_meta
    // overrides so /analytics + /seo show real traffic on legacy demos.
    await seedDemoSiteAnalytics(existing.id)

    // Patient tags self-heal: seed the curated tag catalog + assignments once
    // (bails if any tag already exists, or if there are no patients). Matched by
    // persona name so it back-fills legacy demos whose patient ids differ.
    await seedDemoPatientTags(existing.id)

    // Message templates self-heal: seed the 3 starters + 1 custom reply so the
    // /messages composer + Settings showcase populated state. Name-keyed
    // idempotent; bails on no patients.
    await seedDemoMessageTemplates(existing.id)

    // Patient documents self-heal: seed a couple of before/after photos on the
    // detail Documents panel. Idempotent (bails if any doc exists / no patients).
    await seedDemoPatientDocuments(existing.id)

    // Follow-ups self-heal: seed staff follow-ups (overdue/today/upcoming/done)
    // so the Overview card + /followups + detail panel populate on legacy demos.
    await seedDemoFollowups(existing.id)

    // Saved views self-heal: seed a few patient-list views (idempotent).
    await seedDemoPatientViews(existing.id)

    // Referral partner self-heal: seed the demo MSP partner + attribution +
    // commission ledger so /partners populates on legacy demos. Idempotent;
    // never overwrites a real referral assignment. Runs LAST so its reads sit
    // at the tail of the self-heal sequence.
    await seedDemoReferralPartner(existing.id)

    // Intake-forms self-heal: upgrade a legacy demo's default form to the latest
    // template (adds insurance-card / photo / instructions field types) + backfill
    // file data onto a submission. Placed at the tail so its reads sit after the
    // count selects (mirrors the referral self-heal note above).
    await upgradeDemoIntakeForm(existing.id)
    // Seed a "New Patient Packet" bundling the two demo forms. Tail placement →
    // exhausted seeder-test queue makes it a clean no-op there.
    await seedDemoPacket(existing.id)

    // Fast-pass waitlist self-heal: two persona-anchored entries + a pending
    // offer showcase. Tail placement for the same queue-position reason.
    await seedDemoWaitlist(existing.id, new Date(), existingPatientIds)

    // Booking-deposit self-heal: paid deposit on Emma's widget consultation +
    // a visit-type catalog with a $50 consultation deposit (only when null).
    await seedDemoBookingDeposit(existing.id, new Date(), existingPatientIds)

    // Billing-outreach self-heal: one sent pay-link request on Marcus.
    await seedDemoBalanceOutreach(existing.id, new Date(), existingPatientIds)

    // Refer-a-friend self-heal: Sophia's share link + Emma stamped as her referral.
    await seedDemoReferral(existing.id, new Date(), existingPatientIds)

    // Payment-plan self-heal: Marcus's active 6-month autopay showcase.
    await seedDemoPaymentPlan(existing.id, new Date(), existingPatientIds)

    // Preferred-language self-heal: Sophia prefers Spanish (only-when-null).
    await seedDemoPreferredLanguage(existing.id, existingPatientIds)

    // NPS pulse self-heal: four answered surveys across the score bands.
    await seedDemoNpsResponses(existing.id, new Date(), existingPatientIds)

    // Loyalty self-heal: program on + Mia/Noah's persona-anchored ledger.
    await seedDemoLoyalty(existing.id, new Date(), existingPatientIds)

    return {
      organizationId: existing.id,
      organizationSlug: existing.slug,
      organizationName: existing.name,
      created: false,
      patientCount,
      appointmentCount,
    }
  }

  const orgId = newId('org')
  const now = new Date()

  await db.insert(schema.organization).values({
    id: orgId,
    name,
    slug,
    type: 'clinic',
    isDemo: true,
    createdAt: now,
  })

  await db.insert(schema.clinicProfile).values({
    organizationId: orgId,
    legalName: 'Dream Dental, PLLC',
    displayName: 'Dream Dental',
    // The demo ships fully personalized — the hub's go-live checklist reads
    // this to show the "site personalized" state a real mature clinic has.
    onboardingInterviewCompletedAt: new Date(),
    leadForms: DEMO_CONTACT_LEAD_FORM,
    copyOverrides: DEMO_COPY_OVERRIDES,
    // Tagline is now the hero H1, so it carries the real value-prop weight.
    tagline: 'Dental care that finally feels human.',
    about:
      'We started Dream Dental to make going to the dentist feel like going to any other thoughtful, modern place. Calm rooms, plain-English explanations, no judgment about how long it\'s been. Whether it\'s your first cleaning in years or a routine check-up, you\'ll be in good hands — and out the door knowing exactly what happened and why.',
    brandColor: '#9CAF9F',
    template: 'modern',
    // Live site announcement bar — shows the "Cute Dream" states out of the
    // box (no endsAt so it never expires in the demo). Booking-linked.
    announcement: {
      message: 'Now welcoming new patients — same-week visits available.',
      endsAt: null,
      href: '/book',
    },
    phone: '(512) 555-0100',
    email: 'hello@dream-dental.example',
    logoUrl: DEMO_LOGO_URL,
    heroImageUrl: DEMO_HERO_IMAGE_URL,
    heroImageUrl2: DEMO_HERO_IMAGE_2_URL,
    coloringPages: DEMO_COLORING_PAGES,
    differenceVideoUrl: DEMO_DIFFERENCE_VIDEO_URL,
    calendarFeedToken: DEMO_CALENDAR_FEED_TOKEN,
    // Set & forget retention automations on, so the Recall & Outreach card
    // showcases the "on" state. The cron skips demo clinics (never sends), so
    // the preview counts come from the seeded patients — no email goes out.
    birthdayAutoSendEnabled: 1,
    lapsedReactivationEnabled: 1,
    // Smart follow-up rules on (balance + recall) so the /followups rules card
    // showcases the "on" state. The cron skips demo → no rule-created follow-ups.
    followupAutomation: { balance: true, recall: true, unconfirmed: false },
    // Morning digest on for showcase (cron skips demo → no real email sent).
    dailyDigestEnabled: 1,
    addressLine1: '500 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    country: 'US',
    hours: {
      mon: { open: '08:00', close: '17:00' },
      tue: { open: '08:00', close: '17:00' },
      wed: { open: '08:00', close: '17:00' },
      thu: { open: '08:00', close: '17:00' },
      fri: { open: '08:00', close: '15:00' },
      sat: { open: null, close: null },
      sun: { open: null, close: null },
    },
    // Central time — a non-UTC, non-default zone so the demo exercises the
    // timezone-aware booking grid + appointment-email rendering.
    timezone: 'America/Chicago',
    services: DEMO_SERVICES,
    staff: DEMO_STAFF,
    stats: DEMO_STATS,
    // testimonials are patched in below, after patient IDs are known, so
    // the seeded testimonials can reference real patient records.
    testimonials: [],
    officePhotos: DEMO_OFFICE_PHOTOS,
    faq: DEFAULT_FAQ_ITEMS,
    acceptedInsuranceCarriers: DEMO_INSURANCE_CARRIERS,
    paymentMethods: DEMO_PAYMENT_METHODS,
    financingPartners: DEMO_FINANCING_PARTNERS,
    cancellationPolicy: DEMO_CANCELLATION_POLICY,
    portalSettings: DEMO_PORTAL_SETTINGS,
    emailAutomations: DEMO_EMAIL_AUTOMATIONS,
    chairCount: DEMO_CHAIR_COUNT,
    visitTypeSettings: DEMO_VISIT_TYPES,
    recallDefaultMonths: DEMO_RECALL_DEFAULT_MONTHS,
    planTier: 'premium',
    subscriptionStatus: 'active',
  })

  // Primary location
  const locationId = newId('loc')
  await db.insert(schema.clinicLocation).values({
    id: locationId,
    organizationId: orgId,
    name: 'Dream Dental — Downtown',
    addressLine1: '500 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    phone: '(512) 555-0100',
    isPrimary: 1,
  })

  // Seed 15 patients with curated personas so every Patients-module
  // glyph + lifecycle stage shows up somewhere in the demo. Each persona
  // index below is referenced later for invoices, form submissions, notes.
  //
  // - [0] Mia Hayes — happy-path active patient with intake on file
  // - [1] Liam Brooks — new (★), booking source, future visit + no intake (📝!)
  // - [2] Charlotte Diaz — birthday this week (🎂)
  // - [3] Marcus Johnson — outstanding overdue invoice ($)
  // - [4] Sophia Iverson — confirmed appt in next 24h (warms the chair view)
  // - [5] Aiden Kim — lapsed, ~20 months since last visit (💤 + lifecycle=lapsed)
  // - [6] Emma Lopez — at_risk, 7 months since last visit
  // - [7] Noah Mitchell — relationship notes + intake on file
  // - [8..13] Filler active patients (randomized within persona shape)
  // - [14] Olivia Nguyen — archived (isActive=0)
  const personas = buildPatientPersonas(now)
  const patientIds: string[] = []
  for (let i = 0; i < personas.length; i++) {
    const p = personas[i]
    const pid = newId('pat')
    patientIds.push(pid)
    // Marketing opt-in distribution: most personas are opted-in (the
    // realistic case — patients gave us their email knowing we're a clinic
    // and the unsub link sits in every footer). Persona 9 (one filler)
    // demos the explicitly-opted-out state for the 🔕 glyph; persona 14
    // (archived Olivia) is also opted-out as a natural side-effect.
    const marketingEmailOptIn = i === 9 || i === 14 ? 0 : 1
    const marketingEmailOptInAt = marketingEmailOptIn === 1 ? p.firstSeenAt : null
    const marketingEmailOptOutAt = marketingEmailOptIn === 0 ? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) : null
    // SMS opt-in is rarer (TCPA requires explicit opt-in). Two personas
    // opted in via the intake form so the Phase B SMS audience has rows.
    const marketingSmsOptIn = i === 0 || i === 4 ? 1 : 0
    const marketingSmsOptInAt = marketingSmsOptIn === 1 ? p.firstSeenAt : null
    await db.insert(schema.patient).values({
      id: pid,
      organizationId: orgId,
      firstName: p.firstName,
      lastName: p.lastName,
      dateOfBirth: p.dateOfBirth,
      email: p.email,
      phone: p.phone,
      addressLine1: p.addressLine1,
      city: p.city,
      state: p.state,
      postalCode: p.postalCode,
      insuranceProvider: p.insuranceProvider,
      insurancePolicyNumber: p.insurancePolicyNumber,
      notes: p.notes,
      isActive: p.isActive,
      source: p.source,
      lifecycle: p.lifecycle,
      firstSeenAt: p.firstSeenAt,
      lastActivityAt: p.lastActivityAt,
      marketingEmailOptIn,
      marketingEmailOptInAt,
      marketingEmailOptOutAt,
      marketingSmsOptIn,
      marketingSmsOptInAt,
      marketingOptInSource: marketingEmailOptIn === 1 ? 'backfill' : 'manual',
      // Charlotte (idx 2) is on a tighter 3-month perio recall so the
      // per-patient recall override + the recall pill both have a populated
      // example. Everyone else inherits the clinic default (6 months).
      recallIntervalMonths: i === 2 ? 3 : null,
      // Explicit persona marker — anchoring prefers this over the
      // @example.com email convention (survives an email edit).
      isDemoPersona: 1,
    })
  }

  // Now that patient IDs exist, build the testimonials so each one references
  // a real CRM patient (Mia Hayes / Noah Mitchell — the same patients whose
  // review_request rows get seeded as `status='completed'` further down).
  await db
    .update(schema.clinicProfile)
    .set({
      testimonials: buildDemoTestimonials(
        patientIds,
        personas.map((p) => ({ firstName: p.firstName, lastName: p.lastName, city: p.city, state: p.state })),
      ),
      updatedAt: new Date(),
    })
    .where(eq(schema.clinicProfile.organizationId, orgId))

  // Staff members for the Appointments module — CRM-side display labels.
  // NOT clinical providers (per DESIGN.md out-of-scope). Each appointment
  // below attaches to one so the "with [Staff]" line and provider filter
  // chip have something to filter against.
  const providerDentistId = newId('prov')
  const providerHygienistId = newId('prov')
  await db.insert(schema.clinicProvider).values([
    {
      id: providerDentistId,
      organizationId: orgId,
      displayName: 'Dr. Jordan Reyes',
      role: 'dentist',
      email: 'jordan@acme-dental.example',
    },
    {
      id: providerHygienistId,
      organizationId: orgId,
      displayName: 'Maria Vega, RDH',
      role: 'hygienist',
      email: 'maria@acme-dental.example',
    },
  ])

  // Curated appointments so personas trigger the right glyphs.
  // Past: most personas (except [1] new + [5] lapsed) have completed visits.
  // Future: persona [1] has a new-patient cleaning in 5 days (no intake →
  // 📝!), persona [4] has a confirmed appt in 22h, persona [3] has an
  // unconfirmed appt in 30h (⚠️ + $ overlap), persona [0] [2] [7] all
  // have scheduled future visits, persona [5] (lapsed Aiden) just rebooked
  // → triggers 💤 lapsed-returning glyph, persona [6] (Emma) has an
  // appointment created 20 minutes ago → triggers 🆕 booked-just-now,
  // persona [0] (Mia) has a rescheduled appointment → triggers 📅.
  let apptCount = 0
  const dayMs = 24 * 60 * 60 * 1000
  const hourMs = 60 * 60 * 1000

  // Phantom cancelled "from" row for Mia's reschedule — establishes the
  // audit trail (rescheduledFromAppointmentId points back at this id).
  const miaOriginalId = newId('appt')

  const apptsToSeed: Array<{
    id: string
    patientIdx: number
    startOffsetMs: number
    type: typeof APPT_TYPES[number]
    status: 'scheduled' | 'confirmed' | 'completed' | 'no_show' | 'cancelled'
    notes: string | null
    providerId: string
    source: 'booking_widget' | 'manual' | 'recall_campaign' | 'phone' | 'invite'
    confirmedAt?: Date
    confirmedVia?: 'sms' | 'email' | 'manual' | 'auto_sms_keyword'
    rescheduledFromAppointmentId?: string
    cancelledAt?: Date
    cancelledVia?: 'staff' | 'portal' | 'reschedule' | 'waitlist_claim' | 'pms'
    createdAtOverride?: Date
  }> = [
    // ── Past visits ──
    { id: newId('appt'), patientIdx: 0, startOffsetMs: -60 * dayMs, type: 'cleaning', status: 'completed', notes: null, providerId: providerHygienistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 0, startOffsetMs: -240 * dayMs, type: 'checkup', status: 'completed', notes: null, providerId: providerDentistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 2, startOffsetMs: -90 * dayMs, type: 'cleaning', status: 'completed', notes: null, providerId: providerHygienistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 3, startOffsetMs: -45 * dayMs, type: 'filling', status: 'completed', notes: 'MOD on #14, 2 carpules lido', providerId: providerDentistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 5, startOffsetMs: -600 * dayMs, type: 'cleaning', status: 'completed', notes: null, providerId: providerHygienistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 6, startOffsetMs: -210 * dayMs, type: 'cleaning', status: 'completed', notes: null, providerId: providerHygienistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 7, startOffsetMs: -150 * dayMs, type: 'consultation', status: 'completed', notes: null, providerId: providerDentistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 8, startOffsetMs: -30 * dayMs, type: 'cleaning', status: 'no_show', notes: null, providerId: providerHygienistId, source: 'manual' },
    // ❓ Unmarked past visit — confirmed, the day came and went, nobody
    // recorded the outcome (feeds the Overview "Did these visits happen?"
    // catch-net + the agenda's 'unmarked' chip).
    { id: newId('appt'), patientIdx: 2, startOffsetMs: -2 * dayMs - 4 * hourMs, type: 'checkup', status: 'confirmed', notes: null, providerId: providerDentistId, source: 'manual', confirmedAt: new Date(now.getTime() - 4 * dayMs), confirmedVia: 'email' },
    // Phantom cancelled "from" row — original time Mia was booked before reschedule.
    { id: miaOriginalId, patientIdx: 0, startOffsetMs: 7 * dayMs + 10 * hourMs, type: 'cleaning', status: 'cancelled', notes: 'Originally booked here — patient asked to move.', providerId: providerHygienistId, source: 'booking_widget', cancelledAt: new Date(now.getTime() - 2 * dayMs), cancelledVia: 'reschedule' },
    // ── Future visits ──
    { id: newId('appt'), patientIdx: 1, startOffsetMs: 5 * dayMs + 9 * hourMs, type: 'cleaning', status: 'confirmed', notes: 'New patient cleaning', providerId: providerHygienistId, source: 'booking_widget', confirmedAt: new Date(now.getTime() - 1 * dayMs), confirmedVia: 'email' },
    { id: newId('appt'), patientIdx: 0, startOffsetMs: 14 * dayMs + 10 * hourMs, type: 'cleaning', status: 'scheduled', notes: 'Rescheduled from earlier slot', providerId: providerHygienistId, source: 'manual', rescheduledFromAppointmentId: miaOriginalId },
    { id: newId('appt'), patientIdx: 2, startOffsetMs: 21 * dayMs + 11 * hourMs, type: 'checkup', status: 'scheduled', notes: null, providerId: providerDentistId, source: 'manual' },
    { id: newId('appt'), patientIdx: 4, startOffsetMs: 22 * hourMs, type: 'cleaning', status: 'confirmed', notes: null, providerId: providerHygienistId, source: 'booking_widget', confirmedAt: new Date(now.getTime() - 4 * hourMs), confirmedVia: 'sms' },
    { id: newId('appt'), patientIdx: 3, startOffsetMs: 30 * hourMs, type: 'filling', status: 'scheduled', notes: 'Patient called to ask about pre-auth status', providerId: providerDentistId, source: 'phone' },
    { id: newId('appt'), patientIdx: 7, startOffsetMs: 9 * dayMs + 14 * hourMs, type: 'cleaning', status: 'confirmed', notes: null, providerId: providerHygienistId, source: 'manual', confirmedAt: new Date(now.getTime() - 12 * hourMs), confirmedVia: 'manual' },
    // 💤 lapsed-returning — Aiden (persona 5) just rebooked after ~20 months
    { id: newId('appt'), patientIdx: 5, startOffsetMs: 3 * dayMs + 13 * hourMs, type: 'cleaning', status: 'scheduled', notes: 'Welcome back! First visit in almost a year.', providerId: providerHygienistId, source: 'recall_campaign' },
    // 🆕 booked-just-now — Emma (persona 6) booked 20 min ago
    { id: newId('appt'), patientIdx: 6, startOffsetMs: 11 * dayMs + 15 * hourMs, type: 'consultation', status: 'scheduled', notes: null, providerId: providerDentistId, source: 'booking_widget', createdAtOverride: new Date(now.getTime() - 20 * 60 * 1000) },
  ]
  for (const a of apptsToSeed) {
    // Snap seeded start time to the nearest 30-min boundary so demo
    // appointments read like a real clinic schedule (9:00, 9:30, 10:00…)
    // rather than inheriting whatever minute/second `now` happens to be
    // when the seeder runs (which leaves every demo appointment ending in
    // `:20` or `:43`).
    const start = snapToHalfHour(new Date(now.getTime() + a.startOffsetMs))
    const end = new Date(start.getTime() + 45 * 60 * 1000)
    await db.insert(schema.appointment).values({
      id: a.id,
      organizationId: orgId,
      patientId: patientIds[a.patientIdx],
      locationId,
      providerId: a.providerId,
      title: `${a.type.replace('_', ' ')} — ${personas[a.patientIdx].firstName} ${personas[a.patientIdx].lastName}`,
      startTime: start,
      endTime: end,
      type: a.type,
      status: a.status,
      notes: a.notes,
      source: a.source,
      confirmedAt: a.confirmedAt ?? null,
      confirmedVia: a.confirmedVia ?? null,
      cancelledAt: a.cancelledAt ?? null,
      cancelledVia: a.cancelledVia ?? null,
      rescheduledFromAppointmentId: a.rescheduledFromAppointmentId ?? null,
      ...(a.createdAtOverride ? { createdAt: a.createdAtOverride } : {}),
    })
    apptCount++
  }

  // Reminder log — gives the drawer's "Reminder activity" stripe real
  // rows + triggers the ⏱ "reminder sent recently" glyph on a couple of
  // futures. Patterns:
  //  - Sophia [4] (confirmed in 22h): email sent 6h ago, patient replied
  //  - Mia [0]   (scheduled 14d out): email sent 5 days ago (no ⏱)
  //  - Liam [1]  (confirmed 5d out): email sent 6h ago (⏱), no reply yet
  //  - Marcus [3] (scheduled 30h out): email sent 90 min ago (⏱), no reply
  const apptByIdx = (idx: number, when: 'future' | 'past' = 'future') => {
    const matches = apptsToSeed.filter((a) => a.patientIdx === idx && (when === 'future' ? a.startOffsetMs > 0 : a.startOffsetMs <= 0))
    return matches[0]?.id
  }
  const reminderSeeds: Array<{
    apptId: string | undefined
    minutesAgo: number
    channel: 'sms' | 'email'
    repliedMinutesAgo?: number
    replyBody?: string
  }> = [
    { apptId: apptByIdx(4), minutesAgo: 6 * 60, channel: 'email', repliedMinutesAgo: 5 * 60 + 50, replyBody: 'Confirmed, see you then.' },
    { apptId: apptByIdx(0), minutesAgo: 5 * 24 * 60, channel: 'email' },
    { apptId: apptByIdx(1), minutesAgo: 6 * 60, channel: 'email' },
    { apptId: apptByIdx(3), minutesAgo: 90, channel: 'email' },
  ]
  for (const r of reminderSeeds) {
    if (!r.apptId) continue
    await db
      .insert(schema.appointmentReminderLog)
      .values({
        id: newId('rem'),
        organizationId: orgId,
        appointmentId: r.apptId,
        channel: r.channel,
        template: 'default_reminder',
        sentAt: new Date(now.getTime() - r.minutesAgo * 60 * 1000),
        repliedAt: r.repliedMinutesAgo ? new Date(now.getTime() - r.repliedMinutesAgo * 60 * 1000) : null,
        replyBody: r.replyBody ?? null,
      })
      .onConflictDoNothing()
  }

  // A couple of tasks to populate the Tasks board
  await db.insert(schema.tasks).values([
    {
      organizationId: orgId,
      title: 'Order Invisalign supplies',
      description: 'Box of aligner trays running low',
      status: 'todo',
      priority: 'medium',
      position: 0,
    },
    {
      organizationId: orgId,
      title: 'Call insurance re: claim #4421',
      description: 'Patient escalation, pending 14 days',
      status: 'in_progress',
      priority: 'high',
      position: 0,
    },
    {
      organizationId: orgId,
      title: 'Quarterly equipment maintenance',
      status: 'todo',
      priority: 'low',
      position: 1,
    },
  ])

  // Customer rows — half derived from patients (so invoices link via
  // customers.patientId and surface on patient timelines), half generic
  // "leads" (so the platform-side /ecommerce/customers + marketing
  // pipeline modules also have something to show).
  //
  // Personas with a customers row: [0] Mia (LTV history), [3] Marcus
  // (overdue $), [4] Sophia (paid history), [7] Noah (paid history).
  const patientLinkedCustomers = [0, 3, 4, 7].map((idx) => ({
    organizationId: orgId,
    patientId: patientIds[idx],
    name: `${personas[idx].firstName} ${personas[idx].lastName}`,
    email: personas[idx].email!,
    phone: personas[idx].phone,
    location: `${personas[idx].city}, ${personas[idx].state}`,
    pipelineStage: 'won',
    lifecycleStage: 'customer',
    lastActivityAt: new Date(now.getTime() - dayMs),
  }))
  const STAGES = ['new', 'contacted', 'qualified', 'opportunity', 'won']
  const leadCustomers = Array.from({ length: 6 }, (_, i) => {
    const first = pick(FIRST_NAMES)
    const last = pick(LAST_NAMES)
    const loc = pick(CITIES)
    return {
      organizationId: orgId,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      phone: phoneNumber(),
      location: `${loc.city}, ${loc.state}`,
      pipelineStage: STAGES[i % STAGES.length],
      lifecycleStage: i < 3 ? 'lead' : 'customer',
      lastActivityAt: new Date(now.getTime() - i * dayMs),
    }
  })
  const insertedCustomers = await db
    .insert(schema.customers)
    .values([...patientLinkedCustomers, ...leadCustomers])
    .returning({ id: schema.customers.id })

  // The Mosaic `products` table is no longer seeded. Its only readers were the
  // template's own /ecommerce/shop, /product and /cart pages, deleted in the
  // Mosaic deletion pass — the real dental catalog is `shopProduct`, seeded by
  // `seedDemoShop`. Writing four rows nothing renders is the "no fake content"
  // rule inverted: not a placeholder without data, but data without a surface.

  // A handful of product orders + invoices, evenly distributed across statuses.
  const orderStatuses = ['pending', 'processing', 'delivered', 'delivered', 'shipped'] as const
  for (let i = 0; i < 5; i++) {
    await db.insert(schema.orders).values({
      organizationId: orgId,
      orderNumber: '#' + newId().slice(0, 6).toUpperCase(),
      customerId: insertedCustomers[i % insertedCustomers.length]?.id ?? null,
      status: orderStatuses[i % orderStatuses.length],
      totalCents: 9500 + i * 5000,
      currency: 'USD',
      items: [
        { name: 'Treatment plan phase ' + (i + 1), quantity: 1, priceCents: 9500 + i * 5000 },
      ],
    })
  }

  // Invoices — curated so each patient-linked customer has a realistic
  // history. Patient-linked customer IDs are the first N of insertedCustomers
  // (in the same order as patientLinkedCustomers above).
  // [0] Mia: 2 paid invoices (LTV history)
  // [1] Marcus: 1 paid + 1 overdue (drives the $ glyph + balance pill)
  // [2] Sophia: 1 paid
  // [3] Noah: 1 paid
  const invoiceSeeds: Array<{
    customerIdx: number
    status: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled'
    totalCents: number
    daysAgo: number
  }> = [
    { customerIdx: 0, status: 'paid', totalCents: 22500, daysAgo: 90 },
    { customerIdx: 0, status: 'paid', totalCents: 18000, daysAgo: 30 },
    { customerIdx: 1, status: 'paid', totalCents: 15000, daysAgo: 120 },
    { customerIdx: 1, status: 'overdue', totalCents: 45000, daysAgo: 21 },
    { customerIdx: 2, status: 'paid', totalCents: 9500, daysAgo: 60 },
    { customerIdx: 3, status: 'paid', totalCents: 30000, daysAgo: 150 },
  ]
  for (const inv of invoiceSeeds) {
    const created = new Date(now.getTime() - inv.daysAgo * dayMs)
    await db.insert(schema.invoices).values({
      organizationId: orgId,
      invoiceNumber: '#' + newId().slice(0, 6).toUpperCase(),
      customerId: insertedCustomers[inv.customerIdx]?.id ?? null,
      status: inv.status,
      totalCents: inv.totalCents,
      currency: 'USD',
      createdAt: created,
      paidAt: inv.status === 'paid' ? new Date(created.getTime() + 2 * dayMs) : null,
    })
  }

  // Default intake form template — the standard dental new-patient form.
  await seedDefaultIntakeForm(orgId)
  // A second form so the "Send intake" dropdown (multi-form picker) is visible.
  await seedSecondDemoIntakeForm(orgId)
  // Seed the hand-written Spanish translation on the default form (fresh demos).
  // A targeted update by slug — no select, so it doesn't shift the seeder test's
  // staged select queue (the self-heal path uses upgradeDemoIntakeForm instead).
  await db
    .update(schema.formTemplate)
    .set({ translations: { es: DEMO_FORM_ES } })
    .where(and(eq(schema.formTemplate.organizationId, orgId), eq(schema.formTemplate.slug, 'new-patient-intake')))

  // Form submissions — one per persona that already filled out the intake.
  // Persona [1] (new patient, future visit) is intentionally *missing* a
  // submission so the 📝! "missing intake before next visit" glyph triggers.
  const [defaultForm] = await db
    .select({ id: schema.formTemplate.id })
    .from(schema.formTemplate)
    .where(eq(schema.formTemplate.organizationId, orgId))
    .limit(1)
  if (defaultForm) {
    const submissionSeeds: Array<{ patientIdx: number; daysAgo: number }> = [
      { patientIdx: 0, daysAgo: 240 },
      { patientIdx: 2, daysAgo: 95 },
      { patientIdx: 3, daysAgo: 50 },
      { patientIdx: 6, daysAgo: 220 },
      { patientIdx: 7, daysAgo: 160 },
    ]
    for (const s of submissionSeeds) {
      const p = personas[s.patientIdx]
      await db.insert(schema.formSubmission).values({
        id: newId('sub'),
        organizationId: orgId,
        formTemplateId: defaultForm.id,
        patientId: patientIds[s.patientIdx],
        appointmentId: null,
        // Keyed to the real DEFAULT_INTAKE_TEMPLATE field ids so the submission
        // viewer + timeline render actual answers. Persona 0 also carries an
        // insurance-card photo pair + a concern photo so the file-upload render
        // path is exercised.
        data: {
          first_name: p.firstName,
          last_name: p.lastName,
          email: p.email,
          phone: p.phone,
          date_of_birth: p.dateOfBirth,
          insurance_provider: p.insuranceProvider ?? 'None',
          anxiety_level: s.patientIdx === 7 ? 'Anxious — go slow with me' : 'A little nervous',
          hipaa: true,
          signature: `${p.firstName} ${p.lastName}`,
          ...(s.patientIdx === 0 ? DEMO_INTAKE_FILE_DATA : {}),
        },
        submitterName: `${p.firstName} ${p.lastName}`,
        submitterEmail: p.email,
        submitterPhone: p.phone,
        submittedAt: new Date(now.getTime() - s.daysAgo * dayMs),
        ...(s.patientIdx === 0 ? { aiSummary: DEMO_INTAKE_SUMMARY, aiSummaryAt: new Date(now.getTime() - s.daysAgo * dayMs) } : {}),
      })
    }
  }

  // Patient notes — relationship notes (NOT clinical) on a few personas
  // so the Notes panel on the detail page renders real content.
  const noteSeeds: Array<{ patientIdx: number; body: string; daysAgo: number }> = [
    { patientIdx: 0, body: 'Prefers Dr. Patel for cleanings. Loves the warm towels.', daysAgo: 90 },
    { patientIdx: 5, body: 'Tried to reach 2024-09 — left voicemail, no callback. Try again next quarter.', daysAgo: 240 },
    { patientIdx: 5, body: 'Confirmed wants to come back, life got busy. Sending recall email week of demo.', daysAgo: 12 },
    { patientIdx: 7, body: 'Highly anxious. Always pre-medicate with halcion + use nitrous. Spouse usually drives.', daysAgo: 150 },
    { patientIdx: 3, body: 'Balance dispute: insurance kicked back the May filling — call to walk through EOB.', daysAgo: 18 },
  ]
  for (const n of noteSeeds) {
    await db.insert(schema.patientNote).values({
      id: newId('pnote'),
      organizationId: orgId,
      patientId: patientIds[n.patientIdx],
      authorId: null, // demo notes have no author — UI shows "Staff"
      body: n.body,
      createdAt: new Date(now.getTime() - n.daysAgo * dayMs),
    })
  }

  // ── Website leads — public contact-form submissions ─────────────────
  // Lookup Emma Lopez's patient id so the converted-lead seed can point
  // back at the persona. Falls back to `null` if she's not in patientIds
  // (shouldn't happen — Emma is persona 6 — but defensive).
  const emmaPatientId = patientIds[6] ?? null
  await seedLeadsForOrg(orgId, now, emmaPatientId, new Set())

  // SEO: realistic traffic-source mix on the public-booking appointments.
  await backfillDemoBookingAttribution(orgId)

  // Careers: open roles + applicants across the pipeline (pure inserts).
  await seedDemoCareers(orgId, locationId, now)

  // Shop: catalog of dental products + sample orders (pure inserts).
  await seedDemoShop(orgId, now, patientIds)

  // Membership plans + members.
  await seedDemoMemberships(orgId, now, patientIds)

  // Patient tags: a small curated catalog + assignments across the personas.
  await seedDemoPatientTags(orgId)

  // Editable /messages reply templates: 3 starters + 1 custom.
  await seedDemoMessageTemplates(orgId)

  // Patient documents: a couple of before/after photos on the detail panel.
  await seedDemoPatientDocuments(orgId)

  // Patient follow-ups across the personas (overdue / today / upcoming / done).
  await seedDemoFollowups(orgId)

  // Saved patient-list views (Recall due / Has a balance / VIP …).
  await seedDemoPatientViews(orgId)

  // ── Recall & Outreach — audiences + campaigns + events ──────────────
  // Seeded after patients/appointments so the audience filters resolve to
  // realistic counts AND so the "Sent" campaign can attribute Aiden's
  // recall_campaign booking back to itself via a 'booked' event.
  await seedRecallOutreachForOrg(orgId, now, patientIds, new Map(), new Map())

  // ── Patient Communications — threads + messages ─────────────────────
  // Seeded after patients so threads can be tied to the right persona.
  // Mix of in-app + email messages, mix of inbound/outbound, one snoozed
  // thread, one with high unread count for the red-rot border state.
  await seedPatientMessagesForOrg(orgId, now, patientIds, new Set())
  await seedDemoScheduledMessage(orgId, patientIds, now)

  // ── Reviews & Reputation — config + review requests ─────────────────
  // Seeded after patients + appointments so requests can be tied to
  // real completed visits. Mix of funnel states so the dashboard shows
  // every status pill + the per-platform breakdown.
  await seedReviewsForOrg(orgId, now, patientIds, false, new Set())

  // ── Blog — curated posts covering every state ───────────────────────
  // 2 published (bylined to demo staff), 1 plain draft, 1 AI draft pending
  // review — so /blog + the public blog index both show real content.
  await seedBlogPostsForOrg(orgId, now, new Set())

  // ── PMS Integrations — sandbox PMS connection (provider 'demo') ─────
  // Seeded last so every provider/patient/appointment exists to map. Builds
  // the connection + entity maps + sync history + write-back log (every state)
  // so /integrations showcases two-way sync without a live PMS.
  await seedDemoPms(orgId)

  // Zernio (Google Business): seed a connected synthetic GBP so the Integrations
  // Google Business card showcases the connected state. Never hits the network.
  await seedDemoZernio(orgId)

  // Google Business reviews: seed ~6 synthetic reviews so /reviews/received, the
  // dashboard Google stats, and the public-site AggregateRating all populate.
  // Never networks (isDemo rows).
  await seedDemoGoogleReviews(orgId)

  // Facebook recommendations: seed ~4 synthetic FB recommendations (3 recommend,
  // 1 doesn't, 1 bare/no-comment) so the Reviews "From Facebook" section + the
  // recommend/don't tallies populate. Never networks (isDemo rows). Excluded from
  // the public AggregateRating (Google-only).
  await seedDemoFacebookReviews(orgId)

  // Google Business hours/address/phone/photos sync: flag the synced fields as
  // 'google' + stamp a recent googleSyncedAt + seed google_photos so the
  // Settings "Sync from Google" card showcases the populated provenance + the
  // import-from-Google gallery. Never networks (applies synthetic demo data).
  await seedDemoGbpSync(orgId)

  // Google Business local metrics: the SEO GBP-metrics card + the Analytics
  // "Google Business — local actions" tile read demoMetrics() (synthetic
  // impressions/calls/directions/bookings + dental top keywords) whenever the
  // connection is isDemo (seeded by seedDemoZernio above). Nothing to persist —
  // this documents the metrics demo path + asserts the connection prerequisite.
  await seedDemoGbpMetrics(orgId)

  // Per-platform social metrics: the Analytics "Social performance" band reads
  // synthetic per-platform numbers (IG/FB followers/reach/engagement) whenever
  // the connection is isDemo (the IG+FB accounts were seeded by seedDemoZernio
  // above). Nothing to persist — documented no-op hook.
  await seedDemoSocialMetrics(orgId)

  // Social posts: seed multi-channel posts (a published cross-post to GBP+IG+FB
  // w/ image + Book CTA, a published GBP Offer, a scheduled IG+FB cross-post, a
  // scheduled GBP Event) so the Social Posts page + content calendar showcase a
  // populated history. The Book CTA uses the clinic's real /book URL. Never
  // networks (isDemo rows). Seeded after seedDemoZernio (which seeds the
  // GBP+IG+FB connected accounts the targets reference).
  await seedDemoSocialPosts(orgId)

  // Social add-on: flag the demo (Premium) clinic's social_addon = 1 so the
  // entitlement computes the full 5 social slots for PR 2's social UI. Never
  // touches Stripe (the demo has no real subscription).
  await seedDemoSocialAddon(orgId)

  // THE VOICE (Transformation Phase 2): the Approval Inbox's open proposals
  // (anchored to the unreplied 2★ demo review, a seeded new lead, the demo
  // social channels, and the recall audience) + the ledger entries behind the
  // weekly standup card. Persona-anchored; never networks (demo approvals
  // simulate). Seeded after reviews/leads/zernio/audiences exist.
  await seedDemoVoice(
    orgId,
    buildPatientPersonas(now).map((p, i) => ({
      patientId: patientIds[i] ?? null,
      firstName: p.firstName,
    })),
    now,
  )

  // Website Editor: seed the AI-rewrite allowance meter with a non-zero count.
  await seedDemoAiUsage(orgId)

  // Patient portal — family access: Lily (Emma's 9-year-old) + her upcoming
  // cleaning so the guardian view has live demo data.
  await seedDemoFamilyForOrg(orgId, now)

  // Website Presence: site_pageview rollups + Search-appearance overrides so
  // /analytics + /seo show real website traffic on the fresh demo.
  await seedDemoSiteAnalytics(orgId)

  // Referral partner program: demo MSP partner + attribution + commission
  // ledger so /partners + the clinic Referral card populate.
  await seedDemoReferralPartner(orgId)

  // Fast-pass waitlist: persona-anchored entries + a pending offer showcase.
  await seedDemoWaitlist(orgId, now, patientIds)

  // Booking-deposit showcase: paid deposit on Emma's widget consultation +
  // a visit-type catalog carrying a $50 consultation deposit.
  await seedDemoBookingDeposit(orgId, now, patientIds)

  // Billing-outreach showcase: one sent pay-link request on Marcus.
  await seedDemoBalanceOutreach(orgId, now, patientIds)

  // Refer-a-friend showcase: Sophia's share link + Emma stamped as her referral.
  await seedDemoReferral(orgId, now, patientIds)

  // Payment-plan showcase: Marcus's active 6-month autopay plan (2 paid).
  await seedDemoPaymentPlan(orgId, now, patientIds)

  // Preferred-language showcase: Sophia prefers Spanish (only-when-null).
  await seedDemoPreferredLanguage(orgId, patientIds)

  // NPS pulse showcase: four answered surveys across the score bands.
  await seedDemoNpsResponses(orgId, now, patientIds)

  // Loyalty showcase: program on + Mia/Noah's persona-anchored ledger.
  await seedDemoLoyalty(orgId, now, patientIds)

  return {
    organizationId: orgId,
    organizationSlug: slug,
    organizationName: name,
    created: true,
    patientCount: patientIds.length,
    appointmentCount: apptCount,
  }
}

// Everything the single-file module used to export, re-exported from its new
// home so every `@/lib/services/demo-clinic` import site is unchanged.
export { cleanupMisattributedDemoArtifacts, getPersonaAlignedPatientIds } from './cleanup'
export { seedDemoNotificationsForUser, seedDemoSiteAnalytics } from './seed-analytics'
export { DEMO_SERVICES, upgradeLegacyDemoStats } from './services-catalog'
export type { DemoClinicResult } from './types'
