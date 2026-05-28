import { notFound } from 'next/navigation'
import { getClinicSiteBySlug, publicSiteUrl, resolveSiteBasePath } from '@/lib/services/clinic-site'
import BookForm from './book-form'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  const url = `${publicSiteUrl(data)}/book`
  const title = `Book a Visit — ${name}`
  const description = `Book your appointment online with ${name}. Same-week availability.`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function BookPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  if (!isPro) notFound()

  const name = data.profile.displayName ?? data.orgName
  const brand = data.profile.brandColor ?? '#9CAF9F'
  const basePath = await resolveSiteBasePath(slug)

  // Template-level warm-neutral palette (mirrors modern-template.tsx).
  const BG = '#FAF7F2'
  const INK = '#1C1A17'
  const INK_MUTED = '#6B635A'
  const SURFACE = '#FFFFFF'
  const BORDER = '#E8E2D9'

  return (
    <div
      className="min-h-screen font-inter antialiased"
      style={{ backgroundColor: BG, color: INK }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 backdrop-blur-md border-b"
        style={{ backgroundColor: `${BG}EE`, borderColor: BORDER }}
      >
        <div className="max-w-[1240px] mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between gap-4">
          <a href={basePath} className="flex items-center gap-3 min-w-0">
            {data.profile.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={data.profile.logoUrl}
                alt={name}
                className="w-10 h-10 rounded-lg object-cover shrink-0"
              />
            ) : (
              <span
                className="flex items-center justify-center w-10 h-10 rounded-lg text-white text-base font-bold shrink-0"
                style={{ backgroundColor: brand }}
              >
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="font-semibold text-[17px] leading-tight truncate" style={{ color: INK }}>
              {name}
            </span>
          </a>
          {data.profile.phone && (
            <a
              href={`tel:${data.profile.phone}`}
              className="hidden sm:inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition hover:bg-[#F1ECE3]"
              style={{ color: INK_MUTED }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              {data.profile.phone}
            </a>
          )}
        </div>
      </header>

      {/* ── Header copy ─────────────────────────────────────────────────── */}
      <main className="py-16 sm:py-20">
        <div className="max-w-[640px] mx-auto px-5 sm:px-8">
          <div className="mb-10">
            <p
              className="text-xs font-semibold uppercase tracking-[0.16em] mb-4"
              style={{ color: brand }}
            >
              Book a visit
            </p>
            <h1
              className="text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.02em] mb-4"
              style={{ color: INK }}
            >
              Let&rsquo;s get you on the schedule.
            </h1>
            <p className="text-lg leading-[1.55]" style={{ color: INK_MUTED }}>
              Pick a time that works. Most patients are seen the same week.
            </p>
          </div>

          <div
            className="rounded-2xl p-7 sm:p-9"
            style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
          >
            <BookForm orgId={data.orgId} brand={brand} clinicName={name} />
          </div>

          <p className="text-center mt-8 text-sm" style={{ color: INK_MUTED }}>
            Rather call?{' '}
            {data.profile.phone ? (
              <a
                href={`tel:${data.profile.phone}`}
                className="font-medium hover:underline"
                style={{ color: INK }}
              >
                {data.profile.phone}
              </a>
            ) : (
              'Contact us directly.'
            )}
          </p>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t" style={{ borderColor: BORDER }}>
        <div
          className="max-w-[1240px] mx-auto px-5 sm:px-8 py-8 text-center text-sm"
          style={{ color: INK_MUTED }}
        >
          © {new Date().getFullYear()} {name} · Powered by{' '}
          <a
            href="https://dreamcreateweb.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
            style={{ color: INK }}
          >
            DreamCreate
          </a>
        </div>
      </footer>
    </div>
  )
}
