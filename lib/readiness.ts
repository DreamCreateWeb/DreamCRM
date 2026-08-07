/**
 * The READINESS RESOLVER — the one honest answer to "how set up is this
 * practice, really?" (the onboarding overhaul's truth layer, Phase B).
 *
 * Before this module, five surfaces each derived their own version of setup
 * truth (the 11-task activation checklist, the Website hub's go-live list,
 * the SEO health score, the integrations pills, and a PMS-only health
 * banner) — and they disagreed: a PMS connection in `status:'error'` ticked
 * "done" while the banner beside it said broken; connecting Google Business
 * ticked "Connect your social channels" with zero social accounts; `{}`
 * counted as configured; and the Website checklist's Search-Console row was
 * permanently unachievable for any clinic on a custom domain. Every one of
 * those defects is a GRADING error: existence was read as health.
 *
 * This module grades every setup fact by HEALTH, in one place, from plain
 * serializable inputs (client-safe, no DB) so every surface can render the
 * same truth. `lib/services/readiness.ts` loads the org and assembles the
 * input; surfaces consume the report and add presentation only.
 *
 * The grade vocabulary is deliberately small:
 *  - 'ready'     — genuinely working, verified by the healthiest signal we
 *                  hold (not by a row existing).
 *  - 'attention' — exists but BROKEN, or actively harmful (the ghost
 *                  schedule: live booking on unconfirmed hours). The only
 *                  grade that should interrupt anyone.
 *  - 'waiting'   — in an external queue (carrier review, DNS, first sync).
 *                  Their queue, not the clinic's; narrated, never nagged.
 *  - 'todo'      — not started; someone still has to act.
 *  - 'na'        — not applicable to this practice (e.g. platform Search
 *                  Console data for a custom-domain clinic). Excluded from
 *                  every count; rendered, if at all, as an honest note.
 *
 * Copy rules: anti-shame, plain voice ("Confirm your hours — booking runs
 * on them", never "hours configuration incomplete"). Waits say whose queue
 * it is. Nothing here celebrates a lie.
 */

export type ReadinessGrade = 'ready' | 'attention' | 'waiting' | 'todo' | 'na'

export type ReadinessFactId =
  | 'website_personalized'
  | 'brand'
  | 'site_team'
  | 'hours'
  | 'booking'
  | 'domain'
  | 'search_console'
  | 'gbp'
  | 'gbp_website_button'
  | 'social'
  | 'pms'
  | 'patients'
  | 'inbox'
  | 'payments'
  | 'sms'
  | 'reviews'
  | 'portal'
  | 'team'
  | 'shop'

export interface ReadinessFact {
  id: ReadinessFactId
  label: string
  grade: ReadinessGrade
  /** One plain-voice sentence: what's true, and (for todo/attention) why it
   *  matters or what to do. Shown verbatim on surfaces. */
  summary: string
  /** Where acting on this fact happens. */
  href: string
  /** Optional facts never block "set up" and their todos don't count against
   *  the practice — they're invitations, not obligations. */
  optional: boolean
}

/** The plain, serializable inputs the service assembles per org. */
export interface ReadinessInput {
  /** From siteNeedsPersonalization (starter-pack.ts — the ONE predicate). */
  personalizationNeeded: boolean
  logoUrl: string | null
  heroImageUrl: string | null
  /** Public-site team entries (clinic_profile.staff). */
  siteTeamCount: number
  hours: {
    present: boolean
    /** clinic_profile.hours_source — 'google' means pulled from their real
     *  GBP listing, the strongest confirmation we hold. */
    source: string | null
    /** Hours still byte-identical to the day-0 Mon–Fri 9–5 seed. */
    looksSeeded: boolean
  }
  selfBookingEnabled: boolean
  /** The go-live lever (clinic_profile.site_live_at). While false, the
   *  public site serves the coming-soon page, so booking exposure is moot. */
  siteLive: boolean
  /** Custom-domain state ('active' | 'failed' | anything-else=pending), or
   *  null when the clinic is on the free address. */
  domainState: string | null
  gsc: { platformConnected: boolean; customDomain: boolean }
  gbp: {
    connected: boolean
    errored: boolean
    /** From listingWebsiteState (lib/gbp-listing.ts): what Google's Website
     *  button actually does. Null when GBP isn't connected. */
    websiteButton: 'ok' | 'mismatch' | 'missing' | 'unknown' | null
  }
  /** REAL social accounts (zernio platform != 'googlebusiness'). */
  socialCount: number
  /** From deriveIntegrationsHealth. Null = no PMS connection at all. */
  pms: {
    severity: 'info' | 'warn' | 'error'
    status: string
    message: string
  } | null
  hasPatients: boolean
  inbox: { connected: boolean; errored: boolean }
  /** shop_config.stripe_account_status ('none'|'pending'|'active'|'restricted'). */
  stripeStatus: string
  /** clinic_sms_config.a2p_status, or null when no row exists. */
  smsState: string | null
  reviewsConfigured: boolean
  portalCustomized: boolean
  /** Org members (logins), not the public team page. */
  memberCount: number
  hasShopProduct: boolean
}

export interface ReadinessReport {
  facts: ReadinessFact[]
  /** Broken/harmful facts, required OR optional — a broken thing needs eyes
   *  regardless of whether it was mandatory. Drives the Overview banner. */
  attention: ReadinessFact[]
  /** External queues currently being waited on. */
  waiting: ReadinessFact[]
  /** REQUIRED facts not yet started — the honest "still to do" list. */
  openRequired: ReadinessFact[]
  counts: {
    /** Required facts only (optional + na excluded). */
    requiredTotal: number
    requiredReady: number
    attention: number
    waiting: number
  }
}

/** Is the stored hours value still byte-for-byte the day-0 seed? The seed is
 *  passed in (it lives server-side in lib/onboarding/defaults.ts) so this
 *  stays client-safe + unit-testable. Structural compare — jsonb round-trips
 *  don't guarantee key order. */
export function hoursLookSeeded(
  hours: unknown,
  seed: Record<string, { open: string | null; close: string | null }>,
): boolean {
  if (hours == null || typeof hours !== 'object') return false
  const h = hours as Record<string, unknown>
  const days = Object.keys(seed)
  // Extra keys beyond the seed's days mean somebody shaped these hours.
  if (Object.keys(h).some((k) => !days.includes(k))) return false
  return days.every((day) => {
    const v = h[day]
    const s = seed[day]
    if (v == null || typeof v !== 'object') return s.open == null && s.close == null
    const d = v as { open?: unknown; close?: unknown }
    return (d.open ?? null) === s.open && (d.close ?? null) === s.close
  })
}

function fact(
  id: ReadinessFactId,
  label: string,
  grade: ReadinessGrade,
  summary: string,
  href: string,
  optional = false,
): ReadinessFact {
  return { id, label, grade, summary, href, optional }
}

/** Grade every setup fact from the assembled input. Pure + deterministic. */
export function resolveReadiness(input: ReadinessInput): ReadinessReport {
  const facts: ReadinessFact[] = []

  // ── The website ───────────────────────────────────────────────────────────
  facts.push(
    input.personalizationNeeded
      ? fact(
          'website_personalized',
          'Personalize your site',
          'todo',
          'A 3-minute interview drafts every page in your voice.',
          '/welcome',
        )
      : fact(
          'website_personalized',
          'Site personalized',
          'ready',
          'Your pages are written in your voice.',
          '/website',
        ),
  )
  facts.push(
    input.logoUrl || input.heroImageUrl
      ? fact('brand', 'Brand on the site', 'ready', 'Your logo or photos are live.', '/website/editor')
      : fact(
          'brand',
          'Make your website yours',
          'todo',
          'Add your logo or a real photo — your site instantly stops looking like a template.',
          '/website/editor',
        ),
  )
  facts.push(
    input.siteTeamCount > 0
      ? fact('site_team', 'Team on the site', 'ready', 'Your people are on your site.', '/website/content#staff', true)
      : fact(
          'site_team',
          'Introduce your team',
          'todo',
          'Patients pick practices with faces. Add your people and they appear on your site.',
          '/website/content#staff',
          true,
        ),
  )

  // ── Hours + booking (the ghost-schedule truth) ────────────────────────────
  const hoursConfirmed =
    input.hours.present && (input.hours.source === 'google' || !input.hours.looksSeeded)
  facts.push(
    !input.hours.present
      ? fact(
          'hours',
          'Set your office hours',
          'todo',
          'Hours drive your website, your booking slots, and the portal — one setting, everywhere.',
          '/settings/clinic',
        )
      : hoursConfirmed
        ? fact(
            'hours',
            'Office hours set',
            'ready',
            input.hours.source === 'google'
              ? 'Hours are synced from your Google listing.'
              : 'Your hours are set.',
            '/settings/clinic',
          )
        : fact(
            'hours',
            'Confirm your hours',
            'todo',
            'We started you on Mon–Fri 9–5 — confirm your real week; booking and your website run on it.',
            '/settings/clinic',
          ),
  )
  facts.push(
    !input.siteLive
      ? // Behind the go-live lever nothing public exists, so booking can't
        // leak — the ghost schedule is impossible until the lever is pulled.
        fact(
          'booking',
          'Booking opens with your site',
          'na',
          'Online booking goes public when you take the site live.',
          '/settings/practice',
          true,
        )
      : input.selfBookingEnabled && !hoursConfirmed
        ? fact(
            'booking',
            'Booking is live on unconfirmed hours',
            'attention',
            input.hours.present
              ? 'Patients can book real appointments into hours you haven’t confirmed yet — confirm your week or switch booking to request mode.'
              : 'Your booking page shows “closed” every day until hours are set.',
            '/settings/practice',
          )
        : fact(
            'booking',
            input.selfBookingEnabled ? 'Online booking live' : 'Booking in request mode',
            'ready',
            input.selfBookingEnabled
              ? 'Patients can book into your confirmed hours.'
              : 'Patients request a time; you approve each one.',
            '/settings/practice',
          ),
  )

  // ── Domain + search data ──────────────────────────────────────────────────
  facts.push(
    input.domainState == null
      ? fact(
          'domain',
          'Connect your own domain',
          'todo',
          'Two DNS records put your site on yourpractice.com. The free address works fine meanwhile.',
          '/website/domain',
          true,
        )
      : input.domainState === 'active'
        ? fact('domain', 'Custom domain live', 'ready', 'Your site answers on your own domain.', '/website/domain', true)
        : input.domainState === 'failed'
          ? fact(
              'domain',
              'Domain needs attention',
              'attention',
              'The DNS records aren’t answering — open Domain for the two records to re-check.',
              '/website/domain',
              true,
            )
          : fact(
              'domain',
              'Domain waiting on DNS',
              'waiting',
              'DNS is propagating — that’s the internet’s queue, not yours. We re-check automatically.',
              '/website/domain',
              true,
            ),
  )
  // The old checklist's impossible row: with a custom domain, the platform's
  // shared Search Console property cannot see the clinic's pages — that's OUR
  // architecture, not the clinic's failure. It grades 'na', never 'todo'.
  facts.push(
    input.gsc.customDomain
      ? fact(
          'search_console',
          'Search data',
          'na',
          'Search stats aren’t available for custom domains yet — your site still ranks normally; we just can’t chart it here.',
          '/website/seo',
          true,
        )
      : input.gsc.platformConnected
        ? fact('search_console', 'Search data flowing', 'ready', 'Google clicks + queries, scoped to your pages.', '/website/seo', true)
        : fact(
            'search_console',
            'Search data',
            'na',
            'Search stats aren’t wired up on our side yet — nothing for you to do.',
            '/website/seo',
            true,
          ),
  )

  // ── Google Business + the Website button ──────────────────────────────────
  facts.push(
    !input.gbp.connected
      ? fact(
          'gbp',
          'Connect Google Business',
          'todo',
          'Your Google listing is where most patients find you — connecting it turns on reviews, sync, and the listing watchdog.',
          '/integrations',
        )
      : input.gbp.errored
        ? fact(
            'gbp',
            'Google Business needs attention',
            'attention',
            'The Google connection dropped — reconnect it to keep reviews and your listing in sync.',
            '/integrations',
          )
        : fact('gbp', 'Google Business connected', 'ready', 'Reviews and your listing sync automatically.', '/integrations'),
  )
  if (input.gbp.connected && !input.gbp.errored) {
    const wb = input.gbp.websiteButton
    facts.push(
      wb === 'ok'
        ? fact('gbp_website_button', 'Google’s Website button', 'ready', 'Google sends patients to your site.', '/integrations')
        : wb === 'mismatch'
          ? fact(
              'gbp_website_button',
              'Google sends patients to the wrong site',
              'attention',
              'Your listing’s Website button points somewhere else — every click is going to the wrong place. There’s a fix card in your inbox.',
              '/integrations',
            )
          : wb === 'missing'
            ? fact(
                'gbp_website_button',
                'Your Google listing has no website link',
                'attention',
                'Patients who find you on Google have no button to tap — there’s a fix card in your inbox.',
                '/integrations',
              )
            : fact(
                'gbp_website_button',
                'Google’s Website button',
                'waiting',
                'We’re reading what your listing says — next sync will tell us.',
                '/integrations',
                true,
              ),
    )
  }

  // ── Social (REAL social accounts — Google Business never counts) ─────────
  facts.push(
    input.socialCount > 0
      ? fact('social', 'Social connected', 'ready', 'One post reaches every connected channel.', '/growth/social', true)
      : fact(
          'social',
          'Connect your social channels',
          'todo',
          'Link Instagram or Facebook and one post reaches them all.',
          '/growth/social',
          true,
        ),
  )

  // ── Patients + PMS ────────────────────────────────────────────────────────
  if (input.pms == null) {
    facts.push(
      fact(
        'pms',
        'Connect your practice software',
        'todo',
        'Patients, visits, and balances sync on their own — or import your patient list to start.',
        '/integrations',
      ),
    )
  } else if (input.pms.severity === 'error') {
    facts.push(fact('pms', 'Practice-software sync is broken', 'attention', input.pms.message, '/integrations'))
  } else if (input.pms.severity === 'warn') {
    facts.push(fact('pms', 'Practice-software sync needs a look', 'attention', input.pms.message, '/integrations'))
  } else if (input.pms.status === 'never_synced') {
    facts.push(
      fact('pms', 'Practice software connected', 'waiting', 'Connected — the first sync hasn’t run yet.', '/integrations'),
    )
  } else {
    facts.push(fact('pms', 'Practice software syncing', 'ready', 'Patients and visits sync automatically.', '/integrations'))
  }
  facts.push(
    input.hasPatients
      ? fact('patients', 'Patients in the system', 'ready', 'Your patient records are here.', '/patients')
      : fact(
          'patients',
          'Add your first patients',
          'todo',
          'Add a few by hand, import a list, or connect your practice software and they sync in on their own.',
          '/patients',
        ),
  )

  // ── Inbox, payments, texting ──────────────────────────────────────────────
  facts.push(
    input.inbox.connected && !input.inbox.errored
      ? fact('inbox', 'Clinic inbox connected', 'ready', 'Patient email lands next to everything else.', '/inbox', true)
      : input.inbox.errored
        ? fact(
            'inbox',
            'Inbox connection dropped',
            'attention',
            'The Gmail connection needs a re-link — mail isn’t syncing meanwhile.',
            '/inbox',
            true,
          )
        : fact(
            'inbox',
            'Connect your clinic inbox',
            'todo',
            'Link your Gmail and patient email lands next to everything else — no tab juggling.',
            '/inbox',
            true,
          ),
  )
  facts.push(
    input.stripeStatus === 'active'
      ? fact('payments', 'Online payments on', 'ready', 'Patients can pay balances online.', '/payments', true)
      : input.stripeStatus === 'restricted'
        ? fact(
            'payments',
            'Stripe needs attention',
            'attention',
            'Stripe restricted the account — they usually just need one more document.',
            '/payments',
            true,
          )
        : input.stripeStatus === 'pending'
          ? fact('payments', 'Stripe reviewing', 'waiting', 'Stripe is verifying the account — their queue, usually quick.', '/payments', true)
          : fact(
              'payments',
              'Take payments online',
              'todo',
              'Connect Stripe and patients can pay balances, join plans, and shop online.',
              '/payments',
              true,
            ),
  )
  {
    const sms = input.smsState
    facts.push(
      sms === 'approved'
        ? fact('sms', 'Texting live', 'ready', 'Reminders can reach patients by text.', '/integrations/sms')
        : sms === 'brand_action_needed'
          ? fact(
              'sms',
              'The carriers need one thing from you',
              'attention',
              'Texting approval is paused on a step only you can do — open Texting to see exactly what.',
              '/integrations/sms',
            )
          : sms === 'rejected'
            ? fact(
                'sms',
                'Texting registration was declined',
                'attention',
                'The carriers said no to the current details — open Texting to see their reason and adjust.',
                '/integrations/sms',
              )
            : sms === 'brand_pending' || sms === 'campaign_pending' || sms === 'number_pending' || sms === 'suspended'
              ? fact(
                  'sms',
                  'Texting approval in the carriers’ queue',
                  'waiting',
                  'Carrier review takes days to a few weeks — nothing needed from you; we’ll say the moment it clears.',
                  '/integrations/sms',
                )
              : fact(
                  'sms',
                  'Set up texting',
                  'todo',
                  'Carrier approval takes a few weeks, so starting early matters — one form, we handle the rest.',
                  '/integrations/sms',
                ),
    )
  }

  // ── Reviews, portal, team, shop ───────────────────────────────────────────
  facts.push(
    input.reviewsConfigured
      ? fact('reviews', 'Review collection on', 'ready', 'Happy patients become public reviews on their own.', '/growth/reviews', true)
      : fact(
          'reviews',
          'Turn on review collection',
          'todo',
          'Add your Google link once — happy patients become public reviews from then on.',
          '/growth/reviews',
          true,
        ),
  )
  facts.push(
    input.portalCustomized
      ? fact('portal', 'Patient portal tuned', 'ready', 'You’ve chosen what patients can do online.', '/settings/portal', true)
      : fact(
          'portal',
          'Shape your patient portal',
          'todo',
          'The portal already works with sensible defaults — tune features and notice windows when you’re ready.',
          '/settings/portal',
          true,
        ),
  )
  facts.push(
    input.memberCount > 1
      ? fact('team', 'Front desk invited', 'ready', 'Everyone has their own login.', '/settings/team', true)
      : fact(
          'team',
          'Invite your front desk',
          'todo',
          'Everyone gets their own login — no shared passwords on sticky notes.',
          '/settings/team',
          true,
        ),
  )
  facts.push(
    input.hasShopProduct
      ? fact('shop', 'Shop stocked', 'ready', 'Your shop has products patients can buy.', '/shop', true)
      : fact(
          'shop',
          'Stock your shop',
          'todo',
          'List a whitening kit or electric brush — patients buy while they’re already here.',
          '/shop',
          true,
        ),
  )

  const attention = facts.filter((f) => f.grade === 'attention')
  const waiting = facts.filter((f) => f.grade === 'waiting')
  const required = facts.filter((f) => !f.optional && f.grade !== 'na')
  const openRequired = required.filter((f) => f.grade === 'todo')

  return {
    facts,
    attention,
    waiting,
    openRequired,
    counts: {
      requiredTotal: required.length,
      requiredReady: required.filter((f) => f.grade === 'ready').length,
      attention: attention.length,
      waiting: waiting.length,
    },
  }
}
