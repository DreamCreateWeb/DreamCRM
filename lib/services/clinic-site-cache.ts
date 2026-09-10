import 'server-only'
import { unstable_cache, revalidateTag } from 'next/cache'
import { getTableColumns, eq, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organization } from '@/lib/db/schema/auth'
import { clinicProfile, clinicLocation } from '@/lib/db/schema/platform'
import type { ClinicProfile, ClinicLocation } from '@/lib/db/schema/platform'

/**
 * THE DURABLE CACHE FOR THE PUBLIC CLINIC SITE — and the boundary that makes
 * it safe.
 *
 * This module is where slice 2's cache lives, and it is a SEPARATE FILE on
 * purpose. Four PRs of this series established that the public read path has
 * three shapes of viewer-dependence and that only the published half of each
 * can outlive a request. Keeping that half in its own module turns the rule
 * from a convention into a structural fact: NOTHING HERE CAN SEE THE SESSION,
 * because nothing here imports anything that can. There is no `canEditClinic`,
 * no `next/headers`, no `getTenantContext` — and
 * `tests/clinic-site/published-cache.test.ts` fails if any of them appear.
 * (Its mirror, `tests/clinic-site/site-load-dedupe.test.ts`, comes at the same
 * rule from the other side: modules that CAN see the viewer may not cache.)
 *
 * A function that cannot read who is asking cannot serve one viewer's answer
 * to the next. That is the whole safety argument, and it is now checkable by
 * reading the import list.
 *
 * The overlay — a verified editor's unpublished draft merged over these
 * published columns — stays in `lib/services/clinic-site.ts`, OUTSIDE this
 * boundary, and is recomputed per request.
 */

/**
 * Everything derived from one clinic's published columns shares one tag, so a
 * single `revalidateTag` call drops that clinic's site and theme together.
 * Per CLINIC, never global: one practice publishing must not evict every
 * other practice's site from the cache.
 */
export function clinicSiteTag(orgId: string): string {
  return `clinic-site:${orgId}`
}

/**
 * Immediate expiry, expressed as `revalidateTag(tag, { expire: 0 })`.
 *
 * THE FIRST VERSION USED `updateTag`, AND THAT WAS A CLAIM I HADN'T CHECKED.
 * Review asked the fair question: `updateTag` is the Cache Components partner
 * to `'use cache'`, `unstable_cache` is the legacy Data Cache, and
 * `next.config.js` enables neither `cacheComponents` nor `dynamicIO` — so does
 * the pairing do anything at all? I read the installed Next (16.2.10) rather
 * than reasoning about the docs, and the chain is:
 *
 *   revalidateTag / updateTag
 *     -> revalidate()                       (both, same function)
 *     -> workStore.pendingRevalidatedTags
 *     -> executeRevalidates -> revalidateTags()
 *     -> incrementalCache.revalidateTag(tags, durations)
 *     -> cacheHandler.revalidateTag(...)
 *
 * and `unstable_cache` writes its entries through `incrementalCache.set(key,
 * { ..., tags })` on that same handler. So BOTH primitives do invalidate an
 * `unstable_cache` entry; Cache Components being off only makes the separate
 * `getCacheHandlers()` loop (the `'use cache'` handlers) a no-op, while the
 * `incrementalCache` branch runs unconditionally.
 *
 * The pairing was therefore not broken — but the investigation found a real
 * defect next to it. `updateTag` THROWS unless it is called from a Server
 * Action (and also throws when `workStore.page` ends in `/route`), whereas
 * these writers are reachable from route handlers and crons as well. Paired
 * with the blanket `catch` this function used to have, invalidation would have
 * silently not happened on those paths, forever, with no signal.
 *
 * `revalidateTag(tag, { expire: 0 })` has identical effect and no such
 * restriction: `revalidate()` treats `cacheLife.expire === 0` exactly as it
 * treats `updateTag`'s absent profile, setting `pathWasRevalidated` to
 * `ActionDidRevalidateStaticAndDynamic` — the read-your-own-writes flag — and
 * passing `{ expire: 0 }` down as immediate expiry. It is also
 * `unstable_cache`'s documented partner. `tests/clinic-site/next-cache-
 * contract.test.ts` pins the parts of this that are observable against the
 * real module, so the next reader does not have to take the trace on trust.
 */
export function invalidateClinicSite(orgId: string): void {
  invalidateTag(clinicSiteTag(orgId))
}

/**
 * Next's error code for "there is no request scope here" — thrown by
 * `revalidate()` as `Invariant: static generation store missing in ...`.
 */
const NO_REQUEST_SCOPE = 'E263'

/**
 * Swallow ONLY "we are not inside a request", and let everything else out.
 *
 * The previous version was a blanket `catch {}` with a comment asserting the
 * benign case. That is the exact pattern four PRs of this series have been
 * removing from tests, sitting in production code around the single call that
 * delivers the stated contract: a genuine breakage would have been
 * byte-identical to the expected no-op, in every environment, forever.
 *
 * Outside a request (a cron, the demo re-seeder, a boot script) there is
 * legitimately nothing to revalidate against and the TTL is the answer. Every
 * other throw Next can raise here — calling this during render (E7), inside a
 * `'use cache'` (E181), inside an `unstable_cache` callback (E306), inside
 * `generateStaticParams` (E1127) — is a real bug in a call site, and each one
 * means this clinic's site is not being invalidated. Those must surface.
 */
function invalidateTag(tag: string): void {
  try {
    revalidateTag(tag, { expire: 0 })
  } catch (err) {
    const code = (err as { __NEXT_ERROR_CODE?: string })?.__NEXT_ERROR_CODE
    if (code === NO_REQUEST_SCOPE) return
    throw err
  }
}

/**
 * THE TTL IS THE FAIL-SAFE, AND IT IS NOT BELT-AND-BRACES.
 *
 * The obvious design is "tag the cache, `revalidateTag` on every write". I
 * counted the writers before trusting that: `clinic_profile` and
 * `clinic_location` have **78 write sites across 44 files** — identity saves,
 * the Studio's scoped actions, the hub's quick-edit modals, go-live, the
 * announcement bar, GBP sync, PMS sync, trial and billing webhooks, the demo
 * seeder's self-heal. Wiring a tag into all 78 and keeping it wired is exactly
 * the hand-maintained-set pattern that has already failed three times on this
 * issue, and the failure here is ugly and silent: a clinic edits their site,
 * sees no change, and has no way to tell why.
 *
 * So invalidation is BEST-EFFORT AND THE TTL IS THE CONTRACT. Explicit tags on
 * the writers a human is watching in real time (publish, go-live, the identity
 * save) make those feel instant; everything else converges within a minute.
 * A missed writer therefore costs at most 60 seconds of staleness rather than
 * an unbounded stale page.
 *
 * 60s still collapses essentially all of the load this was built for:
 * `docs/LOAD-SANITY.md` has `/site/[slug]` saturating at concurrency 8, which
 * is far more than one origin read per clinic per minute.
 */
export const CACHE_TTL_SECONDS = 60

/**
 * The timestamp columns of a table, derived from the schema rather than
 * listed. See `reviveTimestamps` for why this matters; derived because a
 * hand-written list of 14 columns rots the first time someone adds a 15th,
 * and the symptom of the rot is a crash on a cache hit.
 */
function timestampKeys(table: Parameters<typeof getTableColumns>[0]): string[] {
  return Object.entries(getTableColumns(table))
    .filter(([, col]) => (col as unknown as { dataType: string }).dataType === 'date')
    .map(([name]) => name)
}

/**
 * Resolved on first use, not at module load.
 *
 * The first version ran `timestampKeys` in a top-level `const`, which made
 * merely IMPORTING this module require a fully-built schema — and
 * `tests/clinic-site/resolve-site-base-path.test.ts` mocks the schema away, so
 * the whole file failed to load with "Cannot convert undefined or null to
 * object" before a single test ran. Import-time work in a service module is a
 * dependency nobody declared; deferring it costs one branch.
 */
const memo = new Map<string, string[]>()
function timestampKeysFor(name: string, table: Parameters<typeof getTableColumns>[0]): string[] {
  let keys = memo.get(name)
  if (!keys) {
    keys = timestampKeys(table)
    memo.set(name, keys)
  }
  return keys
}

const profileTimestamps = () => timestampKeysFor('clinic_profile', clinicProfile)
const locationTimestamps = () => timestampKeysFor('clinic_location', clinicLocation)

/**
 * PUT THE DATES BACK. THIS IS THE LOAD-BEARING PART OF THE WHOLE SLICE.
 *
 * `unstable_cache` persists through JSON, so every `Date` in a cached payload
 * comes back as a STRING on a cache hit — while TypeScript still swears it is
 * a `Date`, because the wrapper preserves the declared return type. The types
 * lie precisely across the boundary where the behaviour changes.
 *
 * `clinic_profile` has FOURTEEN timestamp columns and `loadPublishedSite`
 * selects the whole row. The one that bites is `trialEndsAt`, because
 * `resolveTrialState` does `input.trialEndsAt.getTime()` — a TypeError on a
 * string, not a wrong answer — and `app/site/[slug]/robots.txt/route.ts` and
 * `sitemap.xml/route.ts` both call it on this payload. Worse, the two early
 * returns in `resolveTrialState` (paid subscription, or no trial) mean the
 * crash lands on exactly one cohort: clinics INSIDE their 7-day trial. A brand
 * new customer's site would start 500ing its robots.txt and sitemap on the
 * second request, and no test or type would have caught it.
 *
 * So revival happens OUTSIDE the cache boundary, on every call. That is not
 * incidental: on a MISS the wrapper hands back the in-memory value with real
 * `Date`s, and on a HIT it hands back the round-tripped strings. Normalizing
 * on both paths is what makes miss and hit structurally identical — the
 * property `tests/clinic-site/published-cache.test.ts` pins.
 *
 * The strings are ISO-8601 with an explicit `Z` (that is what
 * `JSON.stringify` writes for a Date), so `new Date(value)` is exact. This is
 * NOT the `timestamp()`-without-timezone trap from the aggregate-mapping work
 * — there the raw text carried no zone and had to be read as UTC by hand.
 * Here the zone is in the string.
 */
function reviveTimestamps<T extends Record<string, unknown>>(keys: string[], row: T): T {
  let copy: Record<string, unknown> | null = null
  for (const key of keys) {
    const value = row[key]
    // Already a Date on the miss path; only strings need reviving. Idempotent
    // by construction, so both paths can run it.
    if (typeof value === 'string') {
      copy ??= { ...row }
      copy[key] = new Date(value)
    }
  }
  return (copy as T | null) ?? row
}

/**
 * Freeze the payload so an in-place mutation fails loudly instead of quietly
 * corrupting what the NEXT request gets.
 *
 * `loadSite`'s doc comment has said "nobody may mutate the returned payload"
 * since the split, and with a durable cache that stops being advice: callers
 * now share one object across requests, so a single `data.locations.sort()`
 * reorders another visitor's page. Frozen in every environment, not just dev —
 * the corruption this prevents only exists in production, and a loud throw
 * beats one clinic's data quietly taking another's shape.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

/** The published site payload — no draft, no viewer, no request state. */
export interface PublishedSite {
  orgId: string
  orgName: string
  slug: string
  profile: ClinicProfile
  primaryLocation: ClinicLocation | null
  locations: ClinicLocation[]
  /**
   * Whether the clinic has staged edits — a fact about the CLINIC, so it is
   * cacheable, unlike `hasEditorDraft` which is a fact about the viewer.
   *
   * The draft CONTENT itself is deliberately absent (Sentinel's note on #503):
   * a clinic's unpublished words have no business sitting in a shared cache,
   * even one that no visitor path reads them from. This boolean is all the
   * overlay needs to decide whether to spend a session lookup, and the editor
   * path re-reads the draft itself.
   */
  hasWebsiteDraft: boolean
}

/** The published theme — the twin of the above for the palette + template. */
export interface PublishedTheme {
  orgId: string
  brandColor: string | null
  template: string | null
  hasWebsiteDraft: boolean
}

async function readPublishedSite(
  orgId: string,
  slug: string,
  orgName: string,
): Promise<PublishedSite | null> {
  const [profile] = await db
    .select()
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)

  if (!profile) return null

  const locations = await db
    .select()
    .from(clinicLocation)
    .where(eq(clinicLocation.organizationId, orgId))
    .orderBy(desc(clinicLocation.isPrimary), clinicLocation.createdAt)

  // The draft is dropped HERE, before anything is stored — not masked on read.
  const { websiteDraft, ...rest } = profile
  const published = { ...rest, websiteDraft: null } as ClinicProfile

  return {
    orgId,
    orgName,
    slug,
    profile: published,
    primaryLocation: locations.find((l) => l.isPrimary === 1) ?? locations[0] ?? null,
    locations,
    hasWebsiteDraft: websiteDraft != null,
  }
}

async function readPublishedTheme(slug: string): Promise<PublishedTheme | null> {
  const [row] = await db
    .select({
      id: organization.id,
      type: organization.type,
      brandColor: clinicProfile.brandColor,
      template: clinicProfile.template,
      websiteDraft: clinicProfile.websiteDraft,
    })
    .from(organization)
    .leftJoin(clinicProfile, eq(clinicProfile.organizationId, organization.id))
    .where(eq(organization.slug, slug))
    .limit(1)

  if (!row || row.type !== 'clinic') return null

  return {
    orgId: row.id,
    brandColor: row.brandColor ?? null,
    template: row.template ?? null,
    hasWebsiteDraft: row.websiteDraft != null,
  }
}

/** Revive + freeze — the normalization both cache paths share. */
function settleSite(site: PublishedSite | null): PublishedSite | null {
  if (!site) return null
  return deepFreeze({
    ...site,
    profile: reviveTimestamps(profileTimestamps(), site.profile),
    locations: site.locations.map((l) => reviveTimestamps(locationTimestamps(), l)),
    primaryLocation: site.primaryLocation
      ? reviveTimestamps(locationTimestamps(), site.primaryLocation)
      : null,
  })
}

/**
 * The published site, cached across requests and keyed on ALL THREE arguments.
 *
 * The key matters: `orgName` and `slug` are baked into the returned payload,
 * so keying on `orgId` alone would serve a renamed clinic its old name until
 * the TTL expired. The wrapper is built per call because the TAG depends on
 * `orgId`, which is not known at module scope.
 */
export async function loadPublishedSite(
  orgId: string,
  slug: string,
  orgName: string,
): Promise<PublishedSite | null> {
  const cached = unstable_cache(
    () => readPublishedSite(orgId, slug, orgName),
    ['clinic-site-published', orgId, slug, orgName],
    { revalidate: CACHE_TTL_SECONDS, tags: [clinicSiteTag(orgId)] },
  )
  return settleSite(await cached())
}

/**
 * The published theme, cached the same way. Sentinel flagged this as slice 2's
 * landmine and it is the higher-traffic of the two: `app/site/[slug]/layout.tsx`
 * calls it on EVERY public clinic page, and `lib/site-templates/resolve.ts`
 * uses it to choose which template renders the site.
 *
 * Keyed AND tagged on the SLUG, not the orgId — this loader resolves the org
 * FROM the slug, so at the moment `unstable_cache` needs a tag list the orgId
 * is not yet known, and a tag cannot be added after the entry is written.
 *
 * (An earlier version of this comment claimed the opposite — that it was
 * "tagged on the orgId it resolves to" — which the code never did. The
 * consequence is real rather than cosmetic: the site payload and the theme
 * live under DIFFERENT tags, so a writer holding only an orgId has to resolve
 * the slug to drop both. That is exactly why `invalidateClinicSiteForOrg`
 * pays for a database round trip.)
 */
export async function loadPublishedTheme(slug: string): Promise<PublishedTheme | null> {
  // The org lookup is itself cached and globally tagged-by-slug, so the theme
  // read can name a per-clinic tag on the way out.
  const resolved = await unstable_cache(
    () => readPublishedTheme(slug),
    ['clinic-theme-published', slug],
    { revalidate: CACHE_TTL_SECONDS, tags: [`clinic-site-slug:${slug}`] },
  )()
  return resolved ? deepFreeze({ ...resolved }) : null
}

/**
 * A slug-keyed tag twin for the theme read, which resolves its org FROM the
 * slug and so cannot name the org tag before it has run. Writers call both.
 */
export function clinicSiteSlugTag(slug: string): string {
  return `clinic-site-slug:${slug}`
}

/**
 * The theme half is keyed by SLUG (it resolves the org from the slug, so it
 * cannot name the org tag before it has run), which means a writer has to drop
 * both. `invalidateClinicSiteEverywhere` is the one callers should reach for.
 */
export function invalidateClinicSiteBySlug(slug: string): void {
  invalidateTag(clinicSiteSlugTag(slug))
}

/** Drop a clinic's cached site AND theme. The call writers should make. */
export function invalidateClinicSiteEverywhere(orgId: string, slug: string | null): void {
  invalidateClinicSite(orgId)
  if (slug) invalidateClinicSiteBySlug(slug)
}

/**
 * Drop everything cached for a clinic, given only their org id.
 *
 * The theme half is keyed by SLUG, so this resolves it. Wired into the four
 * writers a human is watching in real time — `stageWebsiteValues` (the single
 * chokepoint every draft write already routes through), `publishWebsiteDraft`,
 * the go-live lever, and the identity save. Every OTHER writer relies on the
 * TTL, deliberately: see CACHE_TTL_SECONDS for why completeness here is a trap
 * rather than a goal.
 *
 * Staging matters as much as publishing, and less obviously: `hasWebsiteDraft`
 * is itself part of the cached payload, so a clinic starting their FIRST draft
 * would otherwise keep reading a cached `false` and not see their own edit on
 * the site preview until the TTL rolled over.
 */
export async function invalidateClinicSiteForOrg(organizationId: string): Promise<void> {
  invalidateClinicSite(organizationId)
  try {
    const [org] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1)
    if (!org?.slug) return
    invalidateClinicSiteBySlug(org.slug)
  } catch (err) {
    // Same shape as the blocking fix above, lower stakes: a failed lookup
    // must not fail the save that triggered it, but it must not be invisible
    // either — the theme entry then survives until the TTL and the clinic
    // sees a stale brand colour with nothing anywhere saying why.
    console.error('[clinic-site-cache] could not resolve slug to invalidate theme', {
      organizationId,
      error: err,
    })
  }
}

/** Exported for the cache-boundary tests only. */
export const __test = { reviveTimestamps, deepFreeze, profileTimestamps, locationTimestamps }
