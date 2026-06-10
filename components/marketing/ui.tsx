import Link from 'next/link'
import { FOOTER_COLUMNS, MARKETING } from '@/lib/marketing/site'

/**
 * Server-side primitives for the marketing site: footer, section scaffolds,
 * CTAs, badges, and the CSS product mocks. SaaS register: white/gray-50
 * grounds, gray-950 ink, violet accent, 12px radii, Inter.
 */

export function MarketingFooter() {
  return (
    <footer className="bg-gray-950 text-gray-400">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-600 text-[0.8rem] font-extrabold text-white">
              D
            </span>
            <span className="text-[0.98rem] font-bold tracking-tight text-white">{MARKETING.productName}</span>
          </div>
          <p className="mt-3 max-w-[16rem] text-[0.82rem] leading-relaxed">
            {MARKETING.tagline}. Website, booking, portal, comms, reviews, and shop — wrapped around
            the PMS you already run.
          </p>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-[0.75rem] font-bold uppercase tracking-wider text-gray-500">{col.title}</p>
            <ul className="mt-3 space-y-2">
              {col.links.map((l) =>
                l.external ? (
                  <li key={l.label}>
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-[0.85rem] hover:text-white">
                      {l.label} ↗
                    </a>
                  </li>
                ) : (
                  <li key={l.label}>
                    <Link href={l.href} className="text-[0.85rem] hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-[0.78rem] sm:px-6">
          <span>
            © {new Date().getFullYear()} {MARKETING.companyName}. All rights reserved.
          </span>
          <span>Built for dental practices. Your PMS stays yours.</span>
        </div>
      </div>
    </footer>
  )
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[0.75rem] font-bold uppercase tracking-[0.14em] text-violet-600">{children}</p>
  )
}

export function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <h2 className="text-[1.7rem] font-bold leading-tight tracking-tight text-gray-950 sm:text-[2.1rem]">
        {children}
      </h2>
      {sub && <p className="mt-3 text-[0.98rem] leading-relaxed text-gray-600">{sub}</p>}
    </div>
  )
}

export function PrimaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-5 py-2.5 text-[0.92rem] font-semibold text-white hover:bg-violet-700"
    >
      {children}
    </Link>
  )
}

export function GhostCta({
  href,
  children,
  external = false,
}: {
  href: string
  children: React.ReactNode
  external?: boolean
}) {
  const cls =
    'inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-[0.92rem] font-semibold text-gray-800 hover:border-gray-400'
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  )
}

export function CheckIcon({ className = 'h-4 w-4 text-violet-600' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 8.5l3.5 3.5 7.5-8" />
    </svg>
  )
}

export function MatrixMark({ value }: { value: 'yes' | 'no' | 'partial' }) {
  if (value === 'yes') {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 6.5 4.5 9 10 3" />
        </svg>
        <span className="sr-only">Yes</span>
      </span>
    )
  }
  if (value === 'partial') {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <svg viewBox="0 0 12 12" className="h-3 w-3" fill="currentColor" aria-hidden="true">
          <rect x="2" y="5" width="8" height="2" rx="1" />
        </svg>
        <span className="sr-only">Partial</span>
      </span>
    )
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-gray-400">
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M3 3l6 6M9 3l-6 6" />
      </svg>
      <span className="sr-only">No</span>
    </span>
  )
}

/* ── CSS product mocks (honest abstractions, not fake screenshots) ──── */

/** Browser-framed mock of the morning-huddle dashboard. */
export function DashboardMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-gray-200/60" aria-hidden="true">
      <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
        <span className="ml-3 h-4 w-44 rounded bg-gray-200" />
      </div>
      <div className="flex">
        <div className="hidden w-32 shrink-0 space-y-2 border-r border-gray-100 p-3 sm:block">
          <div className="h-2.5 w-16 rounded bg-gray-200" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`h-6 rounded-md ${i === 0 ? 'bg-violet-100' : 'bg-gray-50'}`} />
          ))}
          <div className="h-2.5 w-12 rounded bg-gray-200" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-6 rounded-md bg-gray-50" />
          ))}
        </div>
        <div className="flex-1 space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div className="h-4 w-36 rounded bg-gray-300" />
            <div className="h-7 w-24 rounded-md bg-violet-600" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['bg-amber-50 border-amber-200', 'bg-violet-50 border-violet-200', 'bg-emerald-50 border-emerald-200'].map((c, i) => (
              <div key={i} className={`space-y-1.5 rounded-lg border p-2.5 ${c}`}>
                <div className="h-2 w-14 rounded bg-gray-300/80" />
                <div className="h-5 w-8 rounded bg-gray-400/60" />
              </div>
            ))}
          </div>
          <div className="space-y-1.5 rounded-lg border border-gray-100 p-2.5">
            <div className="h-2.5 w-24 rounded bg-gray-300" />
            {[
              'border-l-emerald-400',
              'border-l-amber-400',
              'border-l-rose-400',
              'border-l-emerald-400',
            ].map((edge, i) => (
              <div key={i} className={`flex items-center gap-2 rounded-md border border-l-4 border-gray-100 px-2 py-1.5 ${edge}`}>
                <span className="h-5 w-5 rounded-full bg-gray-200" />
                <span className="h-2.5 w-24 rounded bg-gray-200" />
                <span className="ml-auto h-4 w-14 rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Phone-framed mock of the clinic-branded patient portal. */
export function PortalMock() {
  return (
    <div className="mx-auto w-[230px] overflow-hidden rounded-[2rem] border-[6px] border-gray-900 bg-[#FAF7F2] shadow-xl" aria-hidden="true">
      <div className="flex items-center gap-2 border-b border-[#E8E2D9] bg-[#FAF7F2] px-3 py-2.5">
        <span className="h-6 w-6 rounded-full bg-[#9CAF9F]" />
        <span className="h-2.5 w-20 rounded bg-gray-400/70" />
      </div>
      <div className="space-y-2.5 p-3">
        <div className="h-3.5 w-32 rounded bg-gray-400/70" />
        <div className="space-y-2 rounded-xl border border-[#E8E2D9] border-l-4 border-l-[#9CAF9F] bg-white p-2.5">
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-full bg-[#9CAF9F]" />
            <div className="space-y-1">
              <div className="h-2.5 w-24 rounded bg-gray-300" />
              <div className="h-2 w-20 rounded bg-gray-200" />
            </div>
          </div>
          <div className="flex gap-1.5">
            <span className="h-5 w-16 rounded-full bg-[#9CAF9F]" />
            <span className="h-5 w-14 rounded-full border border-[#E8E2D9] bg-white" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-1 rounded-lg border border-[#E8E2D9] bg-white p-1.5">
              <span className="block h-4 w-4 rounded-full bg-[#FAF7F2]" />
              <span className="block h-2 w-10 rounded bg-gray-200" />
            </div>
          ))}
        </div>
        <div className="h-16 rounded-xl border border-[#E8E2D9] bg-white" />
      </div>
      <div className="flex justify-around border-t border-[#E8E2D9] bg-white px-2 py-2">
        {[...Array(4)].map((_, i) => (
          <span key={i} className={`h-4 w-4 rounded ${i === 0 ? 'bg-[#9CAF9F]' : 'bg-gray-200'}`} />
        ))}
      </div>
    </div>
  )
}

/** Slot-grid mock for the booking section. */
export function BookingMock() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xl shadow-gray-200/60" aria-hidden="true">
      <div className="mb-3 h-3.5 w-36 rounded bg-gray-300" />
      <div className="mb-4 flex gap-2">
        {['Mon 15', 'Tue 16', 'Wed 17', 'Thu 18'].map((d, i) => (
          <div
            key={d}
            className={`flex-1 rounded-lg border px-2 py-2 text-center text-[0.7rem] font-semibold ${
              i === 1 ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-200 text-gray-500'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {['8:00', '8:30', '9:00', '9:30', '10:00', '10:30'].map((t, i) => (
          <div
            key={t}
            className={`rounded-lg border px-2 py-2 text-center text-[0.75rem] font-semibold ${
              i === 2
                ? 'border-gray-100 bg-gray-50 text-gray-300 line-through'
                : i === 4
                  ? 'border-violet-600 bg-violet-50 text-violet-700'
                  : 'border-gray-200 text-gray-700'
            }`}
          >
            {t} AM
          </div>
        ))}
      </div>
      <div className="mt-4 h-9 rounded-lg bg-violet-600" />
    </div>
  )
}

/** Unified-thread mock for the messages section. */
export function MessagesMock() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xl shadow-gray-200/60" aria-hidden="true">
      <div className="mb-4 flex items-center gap-2.5 border-b border-gray-100 pb-3">
        <span className="h-8 w-8 rounded-full bg-violet-100" />
        <div className="space-y-1">
          <div className="h-3 w-24 rounded bg-gray-300" />
          <div className="h-2 w-32 rounded bg-gray-200" />
        </div>
        <span className="ml-auto h-5 w-14 rounded-full bg-amber-100" />
      </div>
      <div className="space-y-2.5">
        <div className="flex justify-start">
          <div className="w-3/5 space-y-1.5 rounded-2xl rounded-bl-md bg-gray-100 p-2.5">
            <div className="h-2 w-full rounded bg-gray-300/70" />
            <div className="h-2 w-2/3 rounded bg-gray-300/70" />
          </div>
        </div>
        <p className="pl-1 text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">via portal</p>
        <div className="flex justify-end">
          <div className="w-1/2 space-y-1.5 rounded-2xl rounded-br-md bg-violet-600 p-2.5">
            <div className="h-2 w-full rounded bg-white/50" />
            <div className="h-2 w-1/2 rounded bg-white/50" />
          </div>
        </div>
        <div className="flex justify-start">
          <div className="w-2/5 rounded-2xl rounded-bl-md bg-gray-100 p-2.5">
            <div className="h-2 w-full rounded bg-gray-300/70" />
          </div>
        </div>
        <p className="pl-1 text-[0.62rem] font-semibold uppercase tracking-wide text-gray-400">via email — same thread</p>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-9 flex-1 rounded-lg border border-gray-200 bg-gray-50" />
        <div className="h-9 w-16 rounded-lg bg-violet-600" />
      </div>
    </div>
  )
}

/** Review-request mock: patient quote → featured on the website. */
export function ReviewsMock() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xl shadow-gray-200/60">
        <div className="flex items-center gap-1 text-amber-400">
          {[...Array(5)].map((_, i) => (
            <svg key={i} viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M10 1.5 12.6 7l6 .9-4.3 4.2 1 6-5.3-2.9L4.7 18l1-6L1.4 7.9l6-.9L10 1.5Z" />
            </svg>
          ))}
        </div>
        <div className="mt-2.5 space-y-1.5">
          <div className="h-2 w-full rounded bg-gray-200" />
          <div className="h-2 w-5/6 rounded bg-gray-200" />
          <div className="h-2 w-2/3 rounded bg-gray-200" />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="h-2.5 w-20 rounded bg-gray-300" />
          <div className="rounded-full bg-violet-600 px-3 py-1 text-[0.68rem] font-bold text-white">
            Feature on website →
          </div>
        </div>
      </div>
      <div className="ml-8 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
        <p className="text-[0.68rem] font-bold uppercase tracking-wide text-emerald-700">✓ Live on your testimonials</p>
        <div className="mt-1.5 h-2 w-3/4 rounded bg-emerald-200" />
      </div>
    </div>
  )
}

/** Sent → Opened → Clicked → Booked funnel mock for recall. */
export function RecallFunnelMock() {
  const stages: Array<[string, string, string]> = [
    ['Sent', 'w-full', 'bg-violet-200'],
    ['Opened', 'w-3/4', 'bg-violet-300'],
    ['Clicked', 'w-1/2', 'bg-violet-400'],
    ['Booked', 'w-1/3', 'bg-violet-600'],
  ]
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xl shadow-gray-200/60" aria-hidden="true">
      <div className="mb-1 h-3.5 w-44 rounded bg-gray-300" />
      <p className="mb-4 text-[0.7rem] font-medium text-gray-400">Audience: due or overdue · builds itself</p>
      <div className="space-y-2.5">
        {stages.map(([label, width, color]) => (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-[0.7rem] font-semibold text-gray-500">
              <span>{label}</span>
            </div>
            <div className={`h-6 rounded-md ${width} ${color}`} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.7rem] font-semibold text-emerald-700">↳ attributed to real booked visits</p>
    </div>
  )
}

/** Storefront mock for the shop section. */
export function ShopMock() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xl shadow-gray-200/60" aria-hidden="true">
      <div className="mb-3 flex items-center justify-between">
        <div className="h-3.5 w-28 rounded bg-gray-300" />
        <div className="rounded-full bg-emerald-100 px-2.5 py-1 text-[0.65rem] font-bold text-emerald-700">
          Payouts → your bank
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-gray-100 p-2.5">
            <div className={`mb-2 h-14 rounded-md ${['bg-violet-50', 'bg-amber-50', 'bg-sky-50', 'bg-emerald-50'][i]}`} />
            <div className="h-2.5 w-4/5 rounded bg-gray-300" />
            <div className="mt-1.5 flex items-center justify-between">
              <div className="h-2.5 w-8 rounded bg-gray-400" />
              <div className="h-5 w-10 rounded-md bg-violet-600" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Edit-in-place canvas mock for the website section. */
export function EditorMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl shadow-gray-200/60" aria-hidden="true">
      <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
        <span className="ml-3 h-4 w-40 rounded bg-gray-200" />
        <span className="ml-auto rounded-md bg-violet-600 px-2 py-0.5 text-[0.62rem] font-bold text-white">Editing</span>
      </div>
      <div className="bg-[#FAF7F2] p-4">
        <div className="relative rounded-lg border-2 border-dashed border-violet-400 bg-white/60 p-4">
          <span className="absolute -top-2.5 right-3 rounded-full bg-violet-600 px-2 py-0.5 text-[0.62rem] font-bold text-white">
            ✎ Edit headline
          </span>
          <div className="h-4 w-3/4 rounded bg-gray-800/80" />
          <div className="mt-2 h-2.5 w-1/2 rounded bg-gray-400/60" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg bg-white p-2">
              <div className="h-8 rounded-md bg-[#9CAF9F]/30" />
              <div className="mt-1.5 h-2 w-3/4 rounded bg-gray-200" />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-white p-2.5">
          <span className="h-10 w-10 rounded-full bg-[#9CAF9F]/40" />
          <div className="space-y-1.5">
            <div className="h-2.5 w-24 rounded bg-gray-300" />
            <div className="h-2 w-32 rounded bg-gray-200" />
          </div>
          <span className="ml-auto rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[0.62rem] font-bold text-violet-700">
            📷 Replace
          </span>
        </div>
      </div>
    </div>
  )
}
