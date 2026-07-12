import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getEffectiveWebsiteProfile, getWebsiteDraftStatus } from '@/lib/services/website-draft'
import { publicSiteUrl } from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getOpenJobs } from '@/lib/services/careers'
import { getSeoMeta } from '@/lib/services/site-analytics'
import { copyKeysForTemplate } from '@/lib/services/ai-website-edit'
import { buildSitePagesIndex, hasColoringPages } from '@/lib/clinic-site-helpers'
import { SEO_PAGE_KEYS, SEO_PAGE_PATHS } from '@/lib/types/seo-meta'
import { getSiteTemplate } from '@/lib/site-templates/registry'
import type { ClinicStaff } from '@/lib/types/clinic-content'
import { PageHeader } from '@/components/ui/page-header'
import { ActionButton } from '@/components/ui/action-button'
import { EmptyState } from '@/components/ui/empty-state'
import PagesManager, { type PageCopyGroup } from './pages-manager'
import PublishCard from '../publish-card'
import SeoMetaForm from './seo-meta-form'

export const metadata = {
  title: 'Website Pages - DreamCRM',
  description: 'Every page of your site — what’s live, what would publish the rest, and each page’s words.',
}

export const dynamic = 'force-dynamic'

/**
 * Website → Pages — the unified page manager: every page the site can serve
 * as one honest list (live pages + gated-off ones with the plain-language
 * reason that would publish them), each page's copy overrides as plain
 * forms, and the per-page search appearance (moved here from the SEO page).
 */
export default async function WebsitePagesPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')
  if (ctx.role !== 'owner' && ctx.role !== 'admin') redirect('/website')

  // Two views on purpose: the Live/Not-published pills describe the LIVE site
  // (raw row — a staged team list hasn't published /team yet), while the copy
  // forms + search appearance edit the EFFECTIVE (draft-merged) values.
  const effective = await getEffectiveWebsiteProfile(ctx.organizationId)
  const profile = effective?.profile
  const liveProfile = effective?.raw

  if (!profile || !liveProfile) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-3xl mx-auto">
        <EmptyState
          icon="📄"
          title="Your clinic profile isn’t set up yet"
          body="Finish setting up your clinic first — then every page of your site is managed here."
          action={
            <ActionButton variant="primary" size="sm" href="/settings/clinic">
              Set up your clinic
            </ActionButton>
          }
        />
      </div>
    )
  }

  // The same gate trio the editor's page navigator uses — best-effort so one
  // failed read only hides that page's row, never the manager.
  const [posts, plans, jobs, seoMeta] = await Promise.all([
    listPublishedPosts(ctx.organizationId, { limit: 1 }).catch(() => []),
    listActivePlans(ctx.organizationId).catch(() => []),
    getOpenJobs(ctx.organizationId).catch(() => []),
    getSeoMeta(ctx.organizationId),
  ])
  const gates = {
    hasTeam: ((liveProfile.staff as ClinicStaff[] | null) ?? []).length > 0,
    hasBlog: posts.length > 0,
    hasCareers: jobs.length > 0,
    hasDentalPlans: plans.length > 0,
    hasColoringPages: hasColoringPages(liveProfile),
    isPro: liveProfile.planTier === 'pro' || liveProfile.planTier === 'premium',
    selfBooking: liveProfile.selfBookingEnabled !== false,
  }
  const templateDef = getSiteTemplate(liveProfile.template)
  const index = buildSitePagesIndex({
    ...gates,
    extraPages: templateDef.extraMarketingPages
      .filter((p) => !p.gate || p.gate(gates))
      .map((p) => ({ path: p.path, label: p.label })),
  })

  // Per-page copy-override groups: the concrete (non-wildcard) keys with the
  // clinic's saved value + the saved concrete instances of wildcard families.
  // Wildcard families themselves stay canvas-only (their indexes live on the
  // page), noted honestly per row.
  const overrides = (profile.copyOverrides as Record<string, string> | null) ?? {}
  const allKeys = copyKeysForTemplate(profile.template)
  const copyByPath = new Map<string, PageCopyGroup>()
  for (const k of allKeys) {
    const group = copyByPath.get(k.page) ?? { concrete: [], savedWildcard: [], wildcardFamilies: 0 }
    if (k.key.includes('*')) {
      group.wildcardFamilies += 1
      const prefixRe = new RegExp('^' + k.key.replace(/[.]/g, '\\.').replace(/\*/g, '\\d+') + '$')
      for (const [saved, value] of Object.entries(overrides)) {
        if (prefixRe.test(saved)) group.savedWildcard.push({ key: saved, label: k.label, current: value })
      }
    } else {
      group.concrete.push({
        key: k.key,
        label: k.label,
        fallback: k.fallback,
        current: overrides[k.key] ?? null,
      })
    }
    copyByPath.set(k.page, group)
  }

  const draftStatus = await getWebsiteDraftStatus(ctx.organizationId).catch(() => ({ count: 0, changes: [] as { column: string; label: string }[] }))
  const siteUrl = publicSiteUrl({ slug: ctx.organizationSlug, profile })
  const domain = siteUrl.replace(/^https?:\/\//, '')
  // The meta editor only offers overrides for pages that actually serve.
  const livePaths = new Set(index.filter((p) => p.live).map((p) => p.path))
  const applicablePages = SEO_PAGE_KEYS.filter((k) => livePaths.has(SEO_PAGE_PATHS[k]))

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-5xl mx-auto">
      <PageHeader
        eyebrow={
          <Link href="/website" className="hover:underline underline-offset-4">
            ‹ Website
          </Link>
        }
        title="Pages"
        subtitle="Every page of your site — what’s live, what would publish the rest, and each page’s words."
        actions={
          <ActionButton variant="secondary" size="sm" href="/website/editor">
            Open the editor
          </ActionButton>
        }
      />
      {/* Publish state travels with every editing surface — saved-but-
          unpublished changes are visible wherever they were made. */}
      {draftStatus.count > 0 && (
        <PublishCard count={draftStatus.count} labels={draftStatus.changes.map((c) => c.label)} />
      )}
      <PagesManager
        pages={index}
        copyByPath={Object.fromEntries(copyByPath)}
        siteUrl={siteUrl}
      />

      {/* ── Search appearance — per-page titles + descriptions (was the SEO
          page's #meta section; the accordion is the proven editor). ─────── */}
      <section id="meta" className="v2-card p-4 sm:p-5 mt-6 scroll-mt-28">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Search appearance</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 max-w-2xl">
          The title + description Google shows for each page. Leave a field blank to use the smart
          default we generate from your content.
          {!gates.isPro && ' Search-appearance overrides are part of the Pro plan.'}
        </p>
        {gates.isPro ? (
          <div className="max-w-2xl">
            <SeoMetaForm
              initial={seoMeta}
              clinicName={profile.displayName ?? ctx.organizationName}
              tagline={profile.tagline ?? null}
              about={(profile.about as string | null) ?? null}
              domain={domain}
              applicablePages={applicablePages}
            />
          </div>
        ) : (
          <Link
            href="/settings/billing?upgrade=seo"
            className="inline-block text-xs font-medium text-teal-700 dark:text-teal-300 hover:underline underline-offset-4"
          >
            See plans →
          </Link>
        )}
      </section>
    </div>
  )
}
