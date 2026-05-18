import type { ClinicSiteData } from '@/lib/services/clinic-site'
import type { ClinicService, ClinicStaff } from '@/lib/types/clinic-content'
import { DEFAULT_SERVICES } from '@/lib/types/clinic-content'
import ContactForm from '@/app/site/[slug]/contact-form'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const DAY_LABEL: Record<string, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday',
  fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

function fmt12(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

interface HourEntry { open?: string; close?: string; closed?: boolean }
type HoursMap = Record<string, HourEntry>

interface Props {
  data: ClinicSiteData
  /** Base path for internal links — used so server renders correctly under /site/[slug] */
  basePath: string
}

export default function ModernTemplate({ data, basePath }: Props) {
  const { profile, primaryLocation, locations } = data
  const name = profile.displayName ?? data.orgName
  const brand = profile.brandColor ?? '#6d28d9'
  const hours = profile.hours as HoursMap | null
  const isPro = profile.planTier === 'pro' || profile.planTier === 'premium'
  const logoUrl = profile.logoUrl ?? null
  const heroImageUrl = profile.heroImageUrl ?? null
  const services: ClinicService[] =
    (profile.services as ClinicService[] | null) ?? DEFAULT_SERVICES
  const staff: ClinicStaff[] = (profile.staff as ClinicStaff[] | null) ?? []

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 antialiased">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <a href={basePath} className="flex items-center gap-2.5 min-w-0">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logoUrl}
                alt={name}
                className="w-9 h-9 rounded-lg object-cover shrink-0"
              />
            ) : (
              <span
                className="flex items-center justify-center w-8 h-8 rounded-lg text-white text-sm font-bold shrink-0"
                style={{ backgroundColor: brand }}
              >
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="font-bold text-gray-900 text-lg leading-tight truncate">{name}</span>
          </a>
          <div className="flex items-center gap-3">
            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="hidden sm:flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                {profile.phone}
              </a>
            )}
            {isPro ? (
              <a
                href={`${basePath}/book`}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: brand }}
              >
                Book Online
              </a>
            ) : (
              <a
                href={`${basePath}#contact`}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                style={{ backgroundColor: brand }}
              >
                Request Visit
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        {heroImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={heroImageUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/30" />
          </>
        ) : (
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{ backgroundColor: brand }}
          />
        )}
        <div
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ backgroundColor: brand, opacity: 0.15 }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl">
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-4"
              style={{ color: brand }}
            >
              {primaryLocation?.city
                ? `${primaryLocation.city}, ${primaryLocation.state}`
                : (profile.city ? `${profile.city}, ${profile.state}` : 'Quality Dental Care')}
            </p>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight tracking-tight mb-6">
              {name}
            </h1>
            {profile.tagline && (
              <p className="text-xl sm:text-2xl text-gray-600 mb-10 leading-relaxed">
                {profile.tagline}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {isPro ? (
                <a
                  href={`${basePath}/book`}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-white shadow-lg transition hover:opacity-90 hover:shadow-xl"
                  style={{ backgroundColor: brand }}
                >
                  Book Appointment
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>
              ) : (
                <a
                  href={`${basePath}#contact`}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-white shadow-lg transition hover:opacity-90 hover:shadow-xl"
                  style={{ backgroundColor: brand }}
                >
                  Request Appointment
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </a>
              )}
              {profile.phone && (
                <a
                  href={`tel:${profile.phone}`}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-gray-700 bg-white border border-gray-200 hover:border-gray-300 transition"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  {profile.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Services strip ─────────────────────────────────────────────── */}
      <section className="border-y border-gray-100 bg-gray-50/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div
            className={`grid gap-6 ${services.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : services.length === 3 ? 'grid-cols-3' : services.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}
          >
            {services.map((s) => (
              <div key={s.id} className="flex flex-col items-center gap-2 text-center">
                <span className="text-3xl">{s.icon ?? '✨'}</span>
                <span className="text-sm font-medium text-gray-700">{s.name}</span>
                {s.description && (
                  <span className="text-xs text-gray-500 leading-relaxed">{s.description}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Staff / Meet the team ──────────────────────────────────────── */}
      {staff.length > 0 && (
        <section className="py-20 sm:py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-12">
              <p
                className="text-sm font-semibold uppercase tracking-widest mb-3"
                style={{ color: brand }}
              >
                Our Team
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
                Meet the people who care for you
              </h2>
            </div>
            <div
              className={`grid gap-8 ${staff.length >= 4 ? 'grid-cols-2 md:grid-cols-4' : staff.length === 3 ? 'md:grid-cols-3' : staff.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' : 'max-w-md mx-auto'}`}
            >
              {staff.map((s) => (
                <div key={s.id} className="text-center">
                  <div
                    className="aspect-square w-full max-w-[16rem] mx-auto rounded-2xl overflow-hidden bg-gray-100 mb-4"
                    style={!s.photoUrl ? { backgroundColor: brand, opacity: 0.12 } : undefined}
                  >
                    {s.photoUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={s.photoUrl} alt={s.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-5xl">
                        👤
                      </div>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{s.name}</h3>
                  {s.title && (
                    <p className="text-sm font-medium mb-2" style={{ color: brand }}>
                      {s.title}
                    </p>
                  )}
                  {s.bio && <p className="text-sm text-gray-500 leading-relaxed">{s.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── About ──────────────────────────────────────────────────────── */}
      {profile.about && (
        <section className="py-20 sm:py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <p
                  className="text-sm font-semibold uppercase tracking-widest mb-3"
                  style={{ color: brand }}
                >
                  About Us
                </p>
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6 leading-tight">
                  {profile.tagline ?? `Welcome to ${name}`}
                </h2>
                <p className="text-gray-600 leading-relaxed text-lg">{profile.about}</p>
              </div>
              <div
                className="hidden md:flex items-center justify-center h-64 rounded-2xl"
                style={{ backgroundColor: brand, opacity: 0.08 }}
                aria-hidden="true"
              >
                <span className="text-8xl opacity-80">🦷</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Hours + Location ───────────────────────────────────────────── */}
      {(hours || primaryLocation || profile.city) && (
        <section className="bg-gray-50 py-20 sm:py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="grid md:grid-cols-2 gap-10">

              {/* Hours */}
              {hours && Object.keys(hours).length > 0 && (
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg"
                      style={{ backgroundColor: brand }}
                    >
                      🕐
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">Office Hours</h3>
                  </div>
                  <div className="space-y-2.5">
                    {DAYS.map(day => {
                      const entry = (hours as HoursMap)[day]
                      if (!entry) return null
                      return (
                        <div key={day} className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-700 w-28">{DAY_LABEL[day]}</span>
                          <span className="text-gray-500">
                            {entry.closed
                              ? 'Closed'
                              : entry.open && entry.close
                                ? `${fmt12(entry.open)} – ${fmt12(entry.close)}`
                                : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Location */}
              {(primaryLocation || profile.city) && (
                <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg"
                      style={{ backgroundColor: brand }}
                    >
                      📍
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">Find Us</h3>
                  </div>
                  <div className="space-y-3">
                    {locations.map((loc, i) => {
                      const addr = [loc.addressLine1, loc.addressLine2].filter(Boolean).join(' ')
                      const city = [loc.city, loc.state, loc.postalCode].filter(Boolean).join(', ')
                      return (
                        <div key={loc.id} className={i > 0 ? 'pt-3 border-t border-gray-100' : ''}>
                          {locations.length > 1 && (
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{loc.name}</p>
                          )}
                          {addr && <p className="text-gray-700 font-medium">{addr}</p>}
                          {city && <p className="text-gray-500 text-sm">{city}</p>}
                          {loc.phone && <p className="text-gray-500 text-sm mt-1">{loc.phone}</p>}
                        </div>
                      )
                    })}
                    {locations.length === 0 && profile.city && (
                      <div>
                        {profile.addressLine1 && <p className="text-gray-700 font-medium">{profile.addressLine1}</p>}
                        <p className="text-gray-500 text-sm">
                          {[profile.city, profile.state, profile.postalCode].filter(Boolean).join(', ')}
                        </p>
                        {profile.phone && <p className="text-gray-500 text-sm mt-1">{profile.phone}</p>}
                      </div>
                    )}
                    {profile.email && (
                      <a
                        href={`mailto:${profile.email}`}
                        className="inline-block text-sm font-medium mt-2 hover:underline"
                        style={{ color: brand }}
                      >
                        {profile.email}
                      </a>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </section>
      )}

      {/* ── Contact / Request form ─────────────────────────────────────── */}
      <section id="contact" className="py-20 sm:py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mx-auto">
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-3 text-center"
              style={{ color: brand }}
            >
              {isPro ? 'Book an Appointment' : 'Request an Appointment'}
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2 text-center leading-tight">
              We&apos;d love to see you
            </h2>
            <p className="text-gray-500 text-center mb-10">
              {isPro
                ? 'Choose your appointment online and we\'ll confirm within 24 hours.'
                : 'Fill out the form and we\'ll be in touch to confirm your visit.'}
            </p>
            <ContactForm orgId={data.orgId} brand={brand} isPro={isPro} basePath={basePath} />
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div>
            © {new Date().getFullYear()} {name}.
            {profile.phone && <span className="ml-2">{profile.phone}</span>}
          </div>
          <div>
            Powered by{' '}
            <a
              href="https://dreamcreateweb.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gray-500 hover:text-gray-700"
            >
              DreamCreate
            </a>
          </div>
        </div>
      </footer>

    </div>
  )
}
