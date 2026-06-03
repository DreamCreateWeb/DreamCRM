import { notFound } from 'next/navigation'
import {
  getClinicSiteBySlug,
  publicSiteUrl,
  clinicJsonLd,
  resolveSiteBasePath,
  appBaseUrl,
} from '@/lib/services/clinic-site'
import { listPublishedPosts } from '@/lib/services/blog'
import { listActivePlans } from '@/lib/services/membership'
import { getCompletedReviewCount } from '@/lib/services/reviews'
import { getOpenJobs } from '@/lib/services/careers'
import type { ClinicStaff } from '@/lib/types/clinic-content'
import ModernTemplate from '@/components/clinic-site/modern-template'
import { getTenantContext } from '@/lib/auth/context'

interface Props {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ edit?: string }>
}

/**
 * Resolve whether to open the site in Website-Studio edit mode. Gated hard:
 * `?edit=1` AND the current viewer's active tenant context is THIS clinic with
 * an owner/admin role. We resolve via `getTenantContext()` (not a raw member
 * lookup) so it also recognizes a platform admin in "View as clinic" demo
 * mode — whose authorization comes from the demo_context cookie, not a member
 * row. A random visitor hitting `?edit=1` just gets the normal site (no bridge,
 * no affordances). Persistence is independently gated in the server actions,
 * so this only governs the in-canvas affordances.
 */
async function resolveEditMode(orgId: string, edit: boolean): Promise<boolean> {
  if (!edit) return false
  try {
    const ctx = await getTenantContext()
    return (
      ctx?.tenantType === 'clinic' &&
      ctx.organizationId === orgId &&
      (ctx.role === 'owner' || ctx.role === 'admin')
    )
  } catch {
    return false
  }
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const tagline = data.profile.tagline ?? null
  const description =
    tagline ??
    (data.profile.about ? data.profile.about.slice(0, 160) : `Welcome to ${name}.`)
  const url = publicSiteUrl(data)
  const title = tagline ? `${name} — ${tagline}` : name

  return {
    title,
    description,
    metadataBase: new URL(url),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: name,
      type: 'website',
      ...(data.profile.heroImageUrl
        ? { images: [{ url: data.profile.heroImageUrl, alt: name }] }
        : {}),
    },
    twitter: {
      card: data.profile.heroImageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      ...(data.profile.heroImageUrl ? { images: [data.profile.heroImageUrl] } : {}),
    },
    icons: data.profile.logoUrl
      ? { icon: data.profile.logoUrl, apple: data.profile.logoUrl }
      : undefined,
  }
}

export default async function ClinicSitePage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = searchParams ? await searchParams : {}
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const jsonLd = clinicJsonLd(data)
  const [publishedPosts, reviewCount, membershipPlans, openJobs, editMode] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 3 }),
    getCompletedReviewCount(data.orgId),
    listActivePlans(data.orgId),
    getOpenJobs(data.orgId),
    resolveEditMode(data.orgId, sp.edit === '1'),
  ])
  const hasTeam = ((data.profile.staff as ClinicStaff[] | null) ?? []).length > 0

  return (
    <>
      {/* JSON-LD for Google rich results / Knowledge Panel. Embedded as a
          plain script tag rather than next/script so it's part of the
          initial HTML and indexed without a JS roundtrip. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ModernTemplate
        data={data}
        basePath={basePath}
        signInUrl={`${appBaseUrl()}/signin`}
        hasBlog={publishedPosts.length > 0}
        recentPosts={publishedPosts}
        reviewCount={reviewCount}
        hasDentalPlans={membershipPlans.length > 0}
        hasCareers={openJobs.length > 0}
        hasTeam={hasTeam}
        editMode={editMode}
      />
    </>
  )
}
