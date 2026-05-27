import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { getOpenJobs } from '@/lib/services/careers'
import { ROLE_LABELS, EMPLOYMENT_LABELS, formatComp } from '@/lib/types/careers'
import BlogChrome from '@/components/clinic-site/blog-chrome'

const INK = '#1C1A17'
const INK_MUTED = '#6B635A'
const BORDER = '#E8E2D9'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/careers`
  const title = `Careers — ${name}`
  const description = `Join the team at ${name}. See our open dental positions and apply today.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: name, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function ClinicCareersPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const basePath = `/site/${slug}`
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const name = data.profile.displayName ?? data.orgName
  const jobs = await getOpenJobs(data.orgId)
  const cityState = [data.primaryLocation?.city, data.primaryLocation?.state].filter(Boolean).join(', ')

  return (
    <BlogChrome data={data} basePath={basePath}>
      <div className="max-w-[900px] mx-auto px-5 sm:px-8 py-14 sm:py-20">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] mb-4" style={{ color: brand }}>
            Careers
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.02em]" style={{ color: INK }}>
            Join the {name} team
          </h1>
          <p className="text-lg leading-[1.55] mt-3 max-w-[560px]" style={{ color: INK_MUTED }}>
            We&apos;re always looking for kind, talented people who care about patients. Here&apos;s what we&apos;re
            hiring for right now.
          </p>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-16 text-center" style={{ borderColor: BORDER, color: INK_MUTED }}>
            <p className="text-base">No open positions at the moment — check back soon, or reach out to introduce yourself.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((j) => {
              const comp = formatComp(j)
              return (
                <a
                  key={j.id}
                  href={`${basePath}/careers/${j.slug}`}
                  className="block rounded-2xl border p-5 sm:p-6 transition hover:shadow-sm"
                  style={{ borderColor: BORDER, backgroundColor: '#fff' }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold tracking-[-0.01em]" style={{ color: INK }}>{j.title}</h2>
                      <p className="text-[14px] mt-1" style={{ color: INK_MUTED }}>
                        {ROLE_LABELS[j.role]} · {EMPLOYMENT_LABELS[j.employmentType]}
                        {comp ? ` · ${comp}` : ''}
                        {cityState ? ` · ${cityState}` : ''}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-[13px] font-semibold px-4 py-2 rounded-full"
                      style={{ backgroundColor: brand, color: '#fff' }}
                    >
                      View &amp; apply
                    </span>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </div>
    </BlogChrome>
  )
}
