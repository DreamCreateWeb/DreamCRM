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

interface Props {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ edit?: string }>
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

export default async function ClinicSitePage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const basePath = await resolveSiteBasePath(slug)
  const jsonLd = clinicJsonLd(data)
  const [publishedPosts, reviewCount, membershipPlans, openJobs] = await Promise.all([
    listPublishedPosts(data.orgId, { limit: 3 }),
    getCompletedReviewCount(data.orgId),
    listActivePlans(data.orgId),
    getOpenJobs(data.orgId),
  ])
  const hasTeam = ((data.profile.staff as ClinicStaff[] | null) ?? []).length > 0
  const heroImageUrl = data.profile.heroImageUrl ?? null

  return (
    <>
      {/* Preload the hero photo — it's the LCP element (the left oval portrait
          in the shared template). Next.js hoists this <link> into <head> so the
          browser starts fetching it before the template's <img> is parsed.
          Skipped cleanly when the clinic has no hero photo. */}
      {heroImageUrl && (
        <link rel="preload" as="image" href={heroImageUrl} fetchPriority="high" />
      )}
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
      />
    </>
  )
}
