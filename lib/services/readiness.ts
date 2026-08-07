import 'server-only'
import { and, eq, ne, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import {
  resolveReadiness,
  hoursLookSeeded,
  type ReadinessInput,
  type ReadinessReport,
} from '@/lib/readiness'
import { DEFAULT_CLINIC_HOURS } from '@/lib/onboarding/defaults'
import { siteNeedsPersonalization } from '@/lib/services/starter-pack'
import { getIntegrationsHealth } from '@/lib/services/pms/health'
import { getGbpListingTruth } from '@/lib/services/gbp-listing'

/**
 * Loader for the readiness resolver (lib/readiness.ts) — assembles ONE
 * ReadinessInput per org from the healthiest signal each subsystem already
 * exposes, then grades it with the pure core. Every surface that used to
 * derive its own setup truth (activation checklist, Website hub go-live
 * list, Overview health banner) renders from this report instead.
 *
 * Best-effort per subsystem: a failed read of one signal must not blind the
 * whole report, so each optional load degrades to its honest unknown (e.g.
 * a failed PMS-health read grades as if no connection exists rather than
 * inventing 'ready'). A failed CORE read (the profile row) returns null —
 * callers treat null as "don't render", never as "all set".
 */

async function exists(query: Promise<Array<unknown>>): Promise<boolean> {
  return (await query).length > 0
}

export async function getReadinessInput(
  organizationId: string,
): Promise<ReadinessInput | null> {
  const [profile] = await db
    .select({
      logoUrl: schema.clinicProfile.logoUrl,
      heroImageUrl: schema.clinicProfile.heroImageUrl,
      staff: schema.clinicProfile.staff,
      hours: schema.clinicProfile.hours,
      hoursSource: schema.clinicProfile.hoursSource,
      portalSettings: schema.clinicProfile.portalSettings,
      tagline: schema.clinicProfile.tagline,
      onboardingInterviewCompletedAt: schema.clinicProfile.onboardingInterviewCompletedAt,
      selfBookingEnabled: schema.clinicProfile.selfBookingEnabled,
      websiteDomain: schema.clinicProfile.websiteDomain,
      customDomainStatus: schema.clinicProfile.customDomainStatus,
    })
    .from(schema.clinicProfile)
    .where(eq(schema.clinicProfile.organizationId, organizationId))
    .limit(1)
  if (!profile) return null

  const [
    pmsHealth,
    gbpTruth,
    zernioConn,
    socialCountRow,
    inboxRow,
    shopConfigRow,
    smsRow,
    hasPatients,
    reviewsConfigured,
    hasShopProduct,
    memberCountRow,
    platformGsc,
  ] = await Promise.all([
    getIntegrationsHealth(organizationId).catch(() => null),
    getGbpListingTruth(organizationId).catch(() => null),
    db
      .select({ status: schema.zernioConnection.status })
      .from(schema.zernioConnection)
      .where(eq(schema.zernioConnection.organizationId, organizationId))
      .limit(1)
      .catch(() => []),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.zernioAccount)
      .where(
        and(
          eq(schema.zernioAccount.organizationId, organizationId),
          ne(schema.zernioAccount.platform, 'googlebusiness'),
        ),
      )
      .catch(() => [{ count: 0 }]),
    db
      .select({ syncStatus: schema.emailAccount.syncStatus })
      .from(schema.emailAccount)
      .where(eq(schema.emailAccount.organizationId, organizationId))
      .limit(1)
      .catch(() => []),
    db
      .select({ stripeAccountStatus: schema.shopConfig.stripeAccountStatus })
      .from(schema.shopConfig)
      .where(eq(schema.shopConfig.organizationId, organizationId))
      .limit(1)
      .catch(() => []),
    db
      .select({ a2pStatus: schema.clinicSmsConfig.a2pStatus })
      .from(schema.clinicSmsConfig)
      .where(eq(schema.clinicSmsConfig.organizationId, organizationId))
      .limit(1)
      .catch(() => []),
    exists(
      db
        .select({ id: schema.patient.id })
        .from(schema.patient)
        .where(eq(schema.patient.organizationId, organizationId))
        .limit(1),
    ).catch(() => false),
    exists(
      db
        .select({ id: schema.clinicReviewConfig.organizationId })
        .from(schema.clinicReviewConfig)
        .where(eq(schema.clinicReviewConfig.organizationId, organizationId))
        .limit(1),
    ).catch(() => false),
    exists(
      db
        .select({ id: schema.shopProduct.id })
        .from(schema.shopProduct)
        .where(eq(schema.shopProduct.organizationId, organizationId))
        .limit(1),
    ).catch(() => false),
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.member)
      .where(eq(schema.member.organizationId, organizationId))
      .catch(() => [{ count: 0 }]),
    // Platform-level Search Console connection (the shared property that
    // covers every {slug}.dreamcreatestudio.com clinic).
    exists(
      db
        .select({ id: schema.gscConnection.organizationId })
        .from(schema.gscConnection)
        .innerJoin(
          schema.organization,
          eq(schema.organization.id, schema.gscConnection.organizationId),
        )
        .where(eq(schema.organization.type, 'platform'))
        .limit(1),
    ).catch(() => false),
  ])

  const staffArr = Array.isArray(profile.staff) ? (profile.staff as unknown[]) : []
  const portal = profile.portalSettings
  const portalCustomized =
    portal != null && typeof portal === 'object' && Object.keys(portal).length > 0
  const domainStatus = profile.customDomainStatus as { state?: string } | null
  const zernioStatus = zernioConn[0]?.status ?? null

  return {
    personalizationNeeded: siteNeedsPersonalization({
      onboardingInterviewCompletedAt: profile.onboardingInterviewCompletedAt,
      tagline: profile.tagline,
    }),
    logoUrl: profile.logoUrl ?? null,
    heroImageUrl: profile.heroImageUrl ?? null,
    siteTeamCount: staffArr.length,
    hours: {
      present: profile.hours != null,
      source: profile.hoursSource ?? null,
      looksSeeded: hoursLookSeeded(profile.hours, DEFAULT_CLINIC_HOURS),
    },
    selfBookingEnabled: profile.selfBookingEnabled !== false,
    domainState: profile.websiteDomain ? (domainStatus?.state ?? 'pending') : null,
    gsc: { platformConnected: platformGsc, customDomain: !!profile.websiteDomain },
    gbp: {
      connected: !!gbpTruth?.connected,
      errored: zernioStatus === 'error',
      websiteButton: gbpTruth?.connected ? gbpTruth.state : null,
    },
    socialCount: Number(socialCountRow[0]?.count ?? 0),
    pms: pmsHealth
      ? { severity: pmsHealth.severity, status: pmsHealth.status, message: pmsHealth.message }
      : null,
    hasPatients,
    inbox: {
      connected: inboxRow.length > 0,
      errored: inboxRow[0]?.syncStatus === 'error',
    },
    stripeStatus: shopConfigRow[0]?.stripeAccountStatus ?? 'none',
    smsState: smsRow[0]?.a2pStatus ?? null,
    reviewsConfigured,
    portalCustomized,
    memberCount: Number(memberCountRow[0]?.count ?? 0),
    hasShopProduct,
  }
}

/** The graded report, or null when the org has no clinic profile (callers
 *  render nothing — null is never "all set"). */
export async function getReadinessReport(
  organizationId: string,
): Promise<ReadinessReport | null> {
  const input = await getReadinessInput(organizationId)
  if (!input) return null
  return resolveReadiness(input)
}
