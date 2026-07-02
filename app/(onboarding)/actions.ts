'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth/server'
import { db, schema } from '@/lib/db'
import { seedDefaultIntakeForm } from '@/lib/services/forms'
import { seedClinicDay0Defaults } from '@/lib/onboarding/defaults'
import { applyStarterFloor } from '@/lib/services/starter-pack'
import { RESERVED_SLUGS, SLUG_PATTERN } from '@/lib/onboarding/slug'
import { slugify } from '@/lib/utils'
import { trialEndDate } from '@/lib/trial'

/** Postgres unique-violation SQLSTATE — a slug claimed between check + insert. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'
}

const Step1 = z.object({
  practiceName: z.string().trim().min(1, 'Tell us your practice name').max(200),
  phone: z.string().trim().max(40).optional(),
})
const Step2 = z.object({
  street: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().min(1).max(20),
  country: z.string().trim().min(1).max(100),
})

const Step3 = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'At least 3 characters')
    .max(40)
    .regex(SLUG_PATTERN, 'Lowercase letters, numbers, and hyphens only'),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a valid color').optional(),
})

// Steps 1-3 just validate input and route forward; the form components persist
// drafts to sessionStorage via lib/onboarding/storage.ts. The real DB writes
// happen in submitOnboarding when the user picks a plan in step 4.
export async function saveOnboardingStep1(input: z.infer<typeof Step1>) {
  Step1.parse(input)
  redirect('/onboarding-02')
}
export async function saveOnboardingStep2(input: z.infer<typeof Step2>) {
  Step2.parse(input)
  redirect('/onboarding-03')
}
export async function saveOnboardingStep3(input: z.infer<typeof Step3>) {
  Step3.parse(input)
  redirect('/onboarding-04')
}

async function slugTaken(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.slug, slug))
    .limit(1)
  return Boolean(row)
}

export interface SlugCheckResult {
  available: boolean
  /** Why it isn't available (already shown politely in the UI). */
  reason?: 'invalid' | 'reserved' | 'taken'
  /** A free alternative worth offering when taken/reserved. */
  suggestion?: string
}

/**
 * Live availability check for the clinic's web address
 * ({slug}.dreamcreatestudio.com) — used by onboarding step 3.
 */
export async function checkClinicSlug(raw: string): Promise<SlugCheckResult> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error('Sign in to continue')

  const slug = raw.trim().toLowerCase()
  if (slug.length < 3 || !SLUG_PATTERN.test(slug)) {
    return { available: false, reason: 'invalid' }
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { available: false, reason: 'reserved', suggestion: await firstFreeSlug(`${slug}-dental`) }
  }
  if (await slugTaken(slug)) {
    return { available: false, reason: 'taken', suggestion: await firstFreeSlug(slug, { skipBase: true }) }
  }
  return { available: true }
}

/** First free variant of a base slug: base, base-dental, base-2 … base-9. */
async function firstFreeSlug(base: string, opts: { skipBase?: boolean } = {}): Promise<string | undefined> {
  const candidates = [
    ...(opts.skipBase ? [] : [base]),
    `${base}-dental`,
    ...Array.from({ length: 8 }, (_, i) => `${base}-${i + 2}`),
  ]
  for (const c of candidates) {
    if (c.length < 3 || !SLUG_PATTERN.test(c) || RESERVED_SLUGS.has(c)) continue
    if (!(await slugTaken(c))) return c
  }
  return undefined
}

const SubmitInput = z.object({
  practiceName: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  street: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  country: z.string().trim().max(100).optional(),
  slug: z.string().trim().toLowerCase().max(40).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** The signer-upper's browser IANA timezone — the clinic's wall-clock
   *  default (validated server-side; falls back to the app default if bogus). */
  timeZone: z.string().trim().max(64).optional(),
  // Plan choice moved OUT of onboarding — every clinic starts a full-Premium,
  // no-card 7-day trial and picks a plan when they set up billing. Kept optional
  // for back-compat with any in-flight client; ignored by the trial start.
  planId: z.enum(['basic', 'pro', 'premium']).optional(),
  interval: z.enum(['monthly', 'annual']).optional(),
})

/**
 * Final onboarding submit. Creates the clinic organization (or reuses the
 * caller's existing one) + the owner membership TRANSACTIONALLY, seeds
 * clinic_profile from the wizard draft, and STARTS A NO-CARD 7-DAY TRIAL —
 * full Premium access, no Stripe, no card. The clinic sets up billing within
 * the 7 days (the trial banner → /billing/setup); on expiry without a paid
 * subscription they're locked to the billing wall.
 *
 * No Stripe call happens here — that removed three signup failure zones at once
 * (abandoned-checkout limbo, a missing price env silently leaving them on basic,
 * and the webhook-latency tier race). The Stripe customer + subscription are
 * created later, only when they convert.
 */
export async function submitOnboarding(input: z.infer<typeof SubmitInput>): Promise<{ ok: true }> {
  const data = SubmitInput.parse(input)
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/signin')

  // Platform admins operate the platform org; running clinic onboarding as one
  // would create a clinic_profile + Stripe subscription ON the platform org
  // (its activeOrganizationId is the platform org). Block it outright.
  if ((session.user as { platformAdmin?: boolean }).platformAdmin) {
    throw new Error('Platform admins cannot go through clinic onboarding.')
  }

  // Resolve (or create) the user's clinic org.
  let orgId = (session.session as { activeOrganizationId?: string | null }).activeOrganizationId
  if (!orgId) {
    const [existing] = await db
      .select()
      .from(schema.member)
      .where(eq(schema.member.userId, session.user.id))
      .limit(1)
    orgId = existing?.organizationId ?? null
  }

  // Defense in depth behind dashboard-shell: if this org-less user was INVITED
  // to an existing clinic, accept that instead of minting a duplicate.
  if (!orgId) {
    const { findPendingInviteForEmail } = await import('@/lib/auth/pending-invite')
    const pending = await findPendingInviteForEmail(session.user.email)
    if (pending) redirect(`/accept-invite?token=${pending.id}`)
  }

  // Set when this submit CREATES the org — the welcome email sends once, not
  // on conflict-path re-submits.
  let isNewOrg = false

  if (!orgId) {
    const orgName = data.practiceName?.trim() || `${session.user.name || 'My'} Clinic`
    // Prefer the slug they picked in step 3 (validated + availability-checked
    // there); fall back to a name-derived slug. The picker check is TOCTOU, so a
    // concurrent signup can claim the slug between check and insert — create the
    // org + owner membership + the session pointer ATOMICALLY (so a mid-failure
    // never orphans the org), retrying the whole transaction on a unique
    // violation with the next free suffix.
    const requested = data.slug && SLUG_PATTERN.test(data.slug) && !RESERVED_SLUGS.has(data.slug) ? data.slug : null
    const baseSlug = requested || slugify(orgName) || 'clinic'
    const newOrgId = crypto.randomUUID()
    const memberId = crypto.randomUUID()
    let created = false
    for (let attempt = 0; attempt < 25 && !created; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`
      if (await slugTaken(slug)) continue
      try {
        await db.transaction(async (tx) => {
          await tx.insert(schema.organization).values({ id: newOrgId, name: orgName, slug, type: 'clinic' })
          await tx.insert(schema.member).values({
            id: memberId,
            organizationId: newOrgId,
            userId: session.user.id,
            role: 'owner',
          })
          await tx
            .update(schema.session)
            .set({ activeOrganizationId: newOrgId })
            .where(eq(schema.session.id, session.session.id))
        })
        created = true
      } catch (err) {
        // Lost the slug race — try the next suffix. Anything else is real.
        if (isUniqueViolation(err) && attempt < 24) continue
        throw err
      }
    }
    if (!created) throw new Error('We couldn’t reserve that web address — please pick a different one.')
    orgId = newOrgId
    isNewOrg = true
  }

  const displayName = data.practiceName?.trim() || session.user.name || 'My Clinic'

  // Validate the client-supplied IANA zone — a bogus value must never poison
  // every wall-clock render. Invalid → null (the app-wide Eastern default).
  const timeZone = (() => {
    const tz = data.timeZone?.trim()
    if (!tz) return null
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
      return tz
    } catch {
      return null
    }
  })()

  await db
    .insert(schema.clinicProfile)
    .values({
      organizationId: orgId,
      legalName: displayName,
      displayName,
      phone: data.phone?.trim() || null,
      addressLine1: data.street?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      country: data.country?.trim() || 'US',
      brandColor: data.brandColor || null,
      timezone: timeZone,
      // Start the no-card 7-day trial: full Premium access, no Stripe. The paid
      // tier + subscription are set later by the webhook on conversion, and a
      // real paid sub then overrides these (see lib/trial.ts). On CONFLICT we
      // DON'T touch any billing/trial field, so re-running onboarding never
      // re-arms the trial clock or downgrades a clinic that already paid.
      planTier: 'premium',
      billingMode: 'self_serve',
      subscriptionStatus: 'trialing',
      trialEndsAt: trialEndDate(),
    })
    .onConflictDoUpdate({
      target: schema.clinicProfile.organizationId,
      set: {
        // EVERY field is conditionally spread: a re-submit with an empty
        // draft (browser Back to /onboarding-04 after completion cleared
        // sessionStorage) must be a no-op, never a wipe of the real clinic
        // name/address to nulls.
        ...(data.practiceName?.trim() ? { legalName: displayName, displayName } : {}),
        ...(data.phone?.trim() ? { phone: data.phone.trim() } : {}),
        ...(data.street?.trim() ? { addressLine1: data.street.trim() } : {}),
        ...(data.city?.trim() ? { city: data.city.trim() } : {}),
        ...(data.state?.trim() ? { state: data.state.trim() } : {}),
        ...(data.postalCode?.trim() ? { postalCode: data.postalCode.trim() } : {}),
        ...(data.country?.trim() ? { country: data.country.trim() } : {}),
        ...(data.brandColor ? { brandColor: data.brandColor } : {}),
        ...(timeZone ? { timezone: timeZone } : {}),
        // planTier / billingMode / subscriptionStatus / trialEndsAt are
        // intentionally NOT updated on conflict — set once at creation, then
        // owned by the trial + the Stripe webhook.
        updatedAt: new Date(),
      },
    })

  // Every clinic starts with the standard new-patient intake form (idempotent
  // — re-running onboarding never duplicates it). Best-effort: a hiccup here
  // must never block checkout.
  try {
    await seedDefaultIntakeForm(orgId)
  } catch (err) {
    console.warn('[onboarding] could not seed default intake form', err)
  }

  // Day-0 operational defaults (standard office hours) so the clinic's live
  // /book page + public footer don't read as "closed every day" before they
  // finish setup. Idempotent (only seeds null fields) + best-effort.
  try {
    await seedClinicDay0Defaults(orgId)
  } catch (err) {
    console.warn('[onboarding] could not seed day-0 defaults', err)
  }

  // Day-0 COMPLETE FLOOR: deterministic starter copy (tagline / about / stats /
  // FAQ / payment methods / cancellation policy) + 4 canonical core services,
  // so the clinic's public site reads as finished the moment they land — they
  // shouldn't have to fill anything for it not to look empty. Idempotent
  // (null-only fill) + best-effort. (Staff / testimonials / insurance carriers
  // are deliberately NOT pre-filled — see starter-pack.ts trust boundary.)
  try {
    await applyStarterFloor(orgId, {
      displayName,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
    })
  } catch (err) {
    console.warn('[onboarding] could not apply starter floor', err)
  }

  // Welcome email — the trial is live. Best-effort (a mail hiccup must never
  // block onboarding); also our earliest deliverability check on the owner's
  // address (before this, their first-ever email was the day-3 trial reminder).
  // Once per clinic: only on the submit that actually created the org.
  if (isNewOrg) try {
    const { sendTrialWelcomeEmail } = await import('@/lib/email')
    const base =
      process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') ||
      'https://www.dreamcreatestudio.com'
    const [org] = await db
      .select({ slug: schema.organization.slug })
      .from(schema.organization)
      .where(eq(schema.organization.id, orgId))
      .limit(1)
    const siteDomain = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'
    await sendTrialWelcomeEmail(session.user.email, {
      firstName: (session.user.name || '').split(' ')[0] || null,
      clinicName: displayName,
      dashboardUrl: `${base}/dashboard`,
      siteUrl: org?.slug ? `https://${org.slug}.${siteDomain}` : null,
    })
  } catch (err) {
    console.warn('[onboarding] could not send welcome email', err)
  }

  // No Stripe here — the trial is live the moment the profile is written. The
  // client routes to the onboarding success screen → the AI website interview.
  return { ok: true }
}
