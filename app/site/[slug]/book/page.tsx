import { notFound } from 'next/navigation'
import { getClinicSiteBySlug } from '@/features/clinic-site/queries'
import BookForm from './book-form'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) return {}
  const name = data.profile.displayName ?? data.orgName
  return { title: `Book an Appointment – ${name}` }
}

export default async function BookPage({ params }: Props) {
  const { slug } = await params
  const data = await getClinicSiteBySlug(slug)
  if (!data) notFound()

  const isPro = data.profile.planTier === 'pro' || data.profile.planTier === 'premium'
  if (!isPro) notFound()

  const name = data.profile.displayName ?? data.orgName
  const brand = data.profile.brandColor ?? '#6d28d9'
  const basePath = `/site/${slug}`

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 antialiased">

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href={basePath} className="flex items-center gap-2.5 min-w-0">
            <span
              className="flex items-center justify-center w-8 h-8 rounded-lg text-white text-sm font-bold shrink-0"
              style={{ backgroundColor: brand }}
            >
              {name.charAt(0).toUpperCase()}
            </span>
            <span className="font-bold text-gray-900 text-lg leading-tight truncate">{name}</span>
          </a>
          {data.profile.phone && (
            <a href={`tel:${data.profile.phone}`} className="text-sm text-gray-600 hover:text-gray-900 hidden sm:block">
              {data.profile.phone}
            </a>
          )}
        </div>
      </header>

      {/* Booking form */}
      <main className="py-16 sm:py-24">
        <div className="max-w-xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-3"
              style={{ color: brand }}
            >
              {name}
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">Book an Appointment</h1>
            <p className="text-gray-500">Choose your preferred time and we'll confirm within 24 hours.</p>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
            <BookForm orgId={data.orgId} brand={brand} clinicName={name} />
          </div>

          <p className="text-center mt-6 text-sm text-gray-400">
            Rather call?{' '}
            {data.profile.phone
              ? <a href={`tel:${data.profile.phone}`} className="font-medium text-gray-600 hover:underline">{data.profile.phone}</a>
              : 'Contact us directly.'}
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center text-sm text-gray-400">
          © {new Date().getFullYear()} {name} · Powered by{' '}
          <a href="https://dreamcreateweb.com" target="_blank" rel="noopener noreferrer" className="font-medium text-gray-500 hover:text-gray-700">DreamCreate</a>
        </div>
      </footer>

    </div>
  )
}
