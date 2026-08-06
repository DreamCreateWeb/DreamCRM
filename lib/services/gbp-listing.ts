import 'server-only'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { resolveGbpAccount } from '@/lib/services/zernio'
import {
  acceptableSiteUrls,
  buildListingWebsiteUrl,
  listingWebsiteState,
  parseGbpListingSnapshot,
  type GbpListingSnapshot,
  type ListingWebsiteState,
} from '@/lib/gbp-listing'

/**
 * LISTING TRUTH, resolved for one clinic (the onboarding overhaul, Phase A —
 * docs/onboarding-overhaul.md). One reader answers "does this practice's
 * Google listing point patients at their real site?" for every consumer:
 * the gbp_website_fix generator, its executor's staleness re-check, the
 * invalidation sweep, and (Phase B) the readiness resolver.
 *
 * Pure derivation over stored state — NO network. The snapshot is whatever
 * the last hourly GBP sync stamped into clinic_profile.gbp_listing; the
 * executor alone re-reads Google live, at the moment of the write.
 */

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'

export interface GbpListingTruth {
  /** Whether a live (or demo) GBP connection exists at all. */
  connected: boolean
  /** True when the connection is the demo's synthetic one. */
  isDemo: boolean
  /** The Zernio account id for writes, when connected. */
  accountId: string | null
  /** The verdict on the listing's Website button. 'unknown' when never
   *  synced / unreadable — every caller treats unknown as "say nothing". */
  state: ListingWebsiteState
  /** The stored snapshot (null when no sync has stamped one yet). */
  snapshot: GbpListingSnapshot | null
  /** The clinic's canonical site URL (custom domain first), untagged. */
  siteUrl: string | null
  /** The UTM-tagged URL the machine writes into the listing. */
  targetUrl: string | null
  /** Every URL identity accepted as "points at us". */
  acceptable: string[]
}

const UNKNOWN: Omit<GbpListingTruth, 'connected' | 'isDemo' | 'accountId'> = {
  state: 'unknown',
  snapshot: null,
  siteUrl: null,
  targetUrl: null,
  acceptable: [],
}

/** Resolve the listing truth for an org. Best-effort: any failed read
 *  resolves to 'unknown' (never throws) — an unreadable row must not file
 *  a fix-it card or block an approve. */
export async function getGbpListingTruth(orgId: string): Promise<GbpListingTruth> {
  try {
    const account = await resolveGbpAccount(orgId)
    if (!account) return { connected: false, isDemo: false, accountId: null, ...UNKNOWN }

    const [row] = await db
      .select({
        slug: schema.organization.slug,
        websiteDomain: schema.clinicProfile.websiteDomain,
        gbpListing: schema.clinicProfile.gbpListing,
      })
      .from(schema.clinicProfile)
      .innerJoin(
        schema.organization,
        eq(schema.organization.id, schema.clinicProfile.organizationId),
      )
      .where(eq(schema.clinicProfile.organizationId, orgId))
      .limit(1)
    if (!row || !row.slug) {
      return { connected: true, isDemo: account.isDemo, accountId: account.accountId, ...UNKNOWN }
    }

    const custom = row.websiteDomain?.trim() || null
    const acceptable = acceptableSiteUrls({
      slug: row.slug,
      siteDomain: SITE_DOMAIN,
      customDomain: custom,
    })
    // Canonical = the first acceptable form (custom domain when present,
    // else the subdomain) — the same preference publicSiteUrl encodes.
    const siteUrl = acceptable[0]
    const snapshot = parseGbpListingSnapshot(row.gbpListing)
    return {
      connected: true,
      isDemo: account.isDemo,
      accountId: account.accountId,
      state: listingWebsiteState(snapshot, acceptable),
      snapshot,
      siteUrl,
      targetUrl: buildListingWebsiteUrl(siteUrl),
      acceptable,
    }
  } catch (e) {
    console.error('[gbp-listing] truth read failed', e)
    return { connected: false, isDemo: false, accountId: null, ...UNKNOWN }
  }
}
