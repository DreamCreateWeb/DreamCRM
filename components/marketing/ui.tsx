import Link from 'next/link'
import { FOOTER_COLUMNS, MARKETING } from '@/lib/marketing/site'
import { COMPARISONS } from '@/lib/marketing/comparisons'

/**
 * Server-side primitives for the marketing site: footer, section scaffolds,
 * CTAs, motion styles, and the product mocks. SaaS register: white/gray-50
 * grounds, gray-950 ink, brand-teal accent, 12px radii, Inter.
 *
 * The mocks are deliberately built from real copy — names, times, message
 * text, prices — so they read as screenshots of the actual product, not
 * wireframe placeholders. They're CSS/JSX (retina-crisp, theme-consistent,
 * zero image weight) and aria-hidden (decorative).
 */

/* ── Motion (CSS-only, reduced-motion safe) ─────────────────────────── */

/** Keyframes + utility classes for the marketing pages. Rendered once in the
 *  marketing layout. Everything degrades to static under reduced motion. */
export function MarketingMotionStyles() {
  return (
    <style>{`
      @keyframes mkt-fade-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      @keyframes mkt-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
      @keyframes mkt-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      .mkt-enter { opacity: 0; animation: mkt-fade-up 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      .mkt-d1 { animation-delay: 0.08s; } .mkt-d2 { animation-delay: 0.16s; }
      .mkt-d3 { animation-delay: 0.24s; } .mkt-d4 { animation-delay: 0.34s; }
      .mkt-float { animation: mkt-float 7s ease-in-out infinite; }
      .mkt-float-slow { animation: mkt-float 9s ease-in-out 1.2s infinite; }
      .mkt-marquee-track { display: flex; width: max-content; animation: mkt-marquee 36s linear infinite; }
      .mkt-marquee:hover .mkt-marquee-track { animation-play-state: paused; }
      @media (prefers-reduced-motion: reduce) {
        .mkt-enter { opacity: 1; animation: none; }
        .mkt-float, .mkt-float-slow { animation: none; }
        .mkt-marquee-track { animation: none; }
      }
    `}</style>
  )
}

/** Scrolling strip of everything included — pauses on hover. */
export function MarqueeStrip() {
  const items = [
    'Practice website', 'Edit-in-place studio', 'Online booking', 'Patient portal',
    'Unified messages', 'Digital intake', 'Reviews', 'Google reviews', 'Recall campaigns',
    'Practice analytics', 'Shop & memberships', 'Careers + ATS', 'Open Dental sync',
    'Google Business', 'Social posting', 'SEO dashboard', 'Blog with AI drafts',
    'Family access', 'Online payments',
  ]
  const row = (key: string, hidden: boolean) => (
    <div key={key} className="flex items-center" aria-hidden={hidden || undefined}>
      {items.map((label) => (
        <span key={`${key}-${label}`} className="flex items-center whitespace-nowrap px-5 text-[0.82rem] font-semibold text-gray-500">
          <span className="mr-5 h-1 w-1 rounded-full bg-teal-300" aria-hidden="true" />
          {label}
        </span>
      ))}
    </div>
  )
  return (
    <div className="mkt-marquee overflow-hidden border-y border-gray-100 bg-white py-3.5" aria-label="Everything included">
      <div className="mkt-marquee-track">
        {row('a', false)}
        {row('b', true)}
      </div>
    </div>
  )
}

/* ── Footer ─────────────────────────────────────────────────────────── */

export function MarketingFooter() {
  // The Compare column derives from the comparisons config so a new vendor
  // page can never be missing from the footer (the hand-written list already
  // drifted once).
  const columns = FOOTER_COLUMNS.map((col) =>
    col.title === 'Compare'
      ? {
          title: 'Compare',
          links: [
            { label: 'All comparisons', href: '/compare' },
            ...COMPARISONS.map((c) => ({ label: `DreamCRM vs ${c.name}`, href: `/compare/${c.slug}` })),
          ],
        }
      : col,
  )
  return (
    <footer className="bg-gray-950 text-gray-400">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/dream-create-logo-inverse.webp"
            alt={MARKETING.companyName}
            width={470}
            height={100}
            className="h-7 w-auto"
            decoding="async"
          />
          <p className="mt-3 max-w-[16rem] text-[0.82rem] leading-relaxed">
            {MARKETING.tagline}. Website, booking, portal, comms, reviews, and shop — wrapped around
            the PMS you already run.
          </p>
        </div>
        {columns.map((col) => (
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

/* ── Scaffolds ──────────────────────────────────────────────────────── */

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[0.75rem] font-bold uppercase tracking-[0.14em] text-teal-700">{children}</p>
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

/** The marketing brand texture — exported so the home hero and PageHero
 *  can never drift apart. */
export const HERO_DOT_GRID = {
  backgroundImage: 'radial-gradient(circle, #a8ece7 1px, transparent 1px)',
  backgroundSize: '22px 22px',
} as const

/** Shared subpage hero: dot-grid texture + eyebrow + title + sub. */
export function PageHero({
  eyebrow,
  title,
  sub,
  children,
}: {
  eyebrow: string
  title: React.ReactNode
  sub?: string
  children?: React.ReactNode
}) {
  return (
    <section className="relative overflow-hidden border-b border-gray-100">
      <div className="absolute inset-0 opacity-30" style={HERO_DOT_GRID} aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white to-transparent" aria-hidden="true" />
      <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <div className="mkt-enter">
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>
        <h1 className="mkt-enter mkt-d1 text-[2.1rem] font-extrabold leading-tight tracking-tight sm:text-[2.7rem]">
          {title}
        </h1>
        {sub && (
          <p className="mkt-enter mkt-d2 mx-auto mt-4 max-w-2xl text-[1rem] leading-relaxed text-gray-600">
            {sub}
          </p>
        )}
        {children && <div className="mkt-enter mkt-d3 mt-7">{children}</div>}
      </div>
    </section>
  )
}

export function PrimaryCta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-lg bg-teal-700 px-5 py-2.5 text-[0.92rem] font-semibold text-white shadow-sm shadow-teal-200 transition-all hover:-translate-y-px hover:bg-teal-800 hover:shadow-md hover:shadow-teal-200"
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
    'inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-[0.92rem] font-semibold text-gray-800 transition-all hover:-translate-y-px hover:border-gray-400 hover:shadow-sm'
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

export function CheckIcon({ className = 'h-4 w-4 text-teal-700' }: { className?: string }) {
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

/* ── Product mocks (real content, not wireframes) ───────────────────── */

function StatusPill({ tone, children }: { tone: 'amber' | 'emerald' | 'rose' | 'teal'; children: React.ReactNode }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    teal: 'bg-teal-50 text-teal-700',
  }
  return <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold ${tones[tone]}`}>{children}</span>
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.58rem] font-bold text-white ${color}`}>
      {initials}
    </span>
  )
}

/** Browser-framed morning-huddle dashboard, populated like a real Tuesday —
 *  the grouped sidebar shows the platform's real module breadth. */
export function DashboardMock() {
  const groups: Array<{ label: string; items: string[] }> = [
    { label: 'Daily', items: ['Overview', 'Patients', 'Appointments', 'Leads', 'Messages'] },
    { label: 'Growth', items: ['Recall', 'Reviews', 'Social Posts', 'Analytics'] },
    { label: 'Website', items: ['Website', 'Blog', 'SEO'] },
    { label: 'Business', items: ['Shop', 'Integrations'] },
  ]
  const kpis: Array<[string, string, string]> = [
    ['Unconfirmed · 48h', '3', 'border-amber-200 bg-amber-50 text-amber-800'],
    ['New leads', '2', 'border-sky-200 bg-sky-50 text-sky-800'],
    ['Forms this week', '5', 'border-emerald-200 bg-emerald-50 text-emerald-800'],
    ['Reviews to ask', '4', 'border-violet-200 bg-violet-50 text-violet-800'],
  ]
  const chair: Array<{ t: string; n: string; v: string; s: 'Confirmed' | 'Unconfirmed'; i: string; c: string; g?: string }> = [
    { t: '8:00', n: 'Mia Hayes', v: 'Cleaning', s: 'Confirmed', i: 'MH', c: 'bg-teal-400', g: '🎂' },
    { t: '9:30', n: 'Liam Brooks', v: 'Checkup', s: 'Unconfirmed', i: 'LB', c: 'bg-sky-400', g: '$' },
    { t: '10:00', n: 'Lily Lopez', v: 'Cleaning', s: 'Confirmed', i: 'LL', c: 'bg-emerald-400', g: '★ 📝' },
    { t: '11:30', n: 'Marcus Johnson', v: 'Consultation', s: 'Unconfirmed', i: 'MJ', c: 'bg-amber-400' },
  ]
  const trends: Array<[string, string, string]> = [
    ['New patients', '12', 'text-emerald-600'],
    ['No-show rate', '3%', 'text-emerald-600'],
    ['Recall booked', '9', 'text-teal-700'],
  ]
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-xl shadow-gray-200/60" aria-hidden="true">
      <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <span className="ml-3 rounded-md bg-white px-2 py-0.5 text-[0.62rem] font-medium text-gray-400">
          www.dreamcreatestudio.com
        </span>
      </div>
      <div className="flex">
        <div className="hidden w-36 shrink-0 border-r border-gray-100 bg-gray-50/40 p-2.5 sm:block">
          <div className="mb-2.5 flex items-center gap-1.5 rounded-md border border-gray-100 bg-white px-1.5 py-1">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-teal-400 to-teal-700 text-[0.5rem] font-bold text-white">
              D
            </span>
            <span className="truncate text-[0.6rem] font-bold text-gray-800">Dream Dental</span>
            <span className="ml-auto rounded bg-teal-50 px-1 py-0.5 text-[0.46rem] font-bold text-teal-700">Pro</span>
          </div>
          {groups.map((grp) => (
            <div key={grp.label} className="mb-2 last:mb-0">
              <p className="px-1 pb-0.5 text-[0.5rem] font-bold uppercase tracking-wider text-gray-400">{grp.label}</p>
              <div className="space-y-0.5">
                {grp.items.map((item) => (
                  <div
                    key={item}
                    className={`rounded-md px-1.5 py-1 text-[0.62rem] font-semibold ${item === 'Overview' ? 'bg-teal-50 text-teal-700' : 'text-gray-500'}`}
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex-1 space-y-3 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.58rem] font-bold uppercase tracking-wider text-teal-700">Morning huddle · Tue, Jun 16</p>
              <p className="text-[0.85rem] font-bold text-gray-900">Dream Dental</p>
            </div>
            <span className="rounded-md bg-teal-600 px-2.5 py-1 text-[0.62rem] font-bold text-white">Open agenda</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {kpis.map(([label, n, tone]) => (
              <div key={label} className={`rounded-lg border p-2 ${tone}`}>
                <p className="text-[0.5rem] font-semibold leading-tight opacity-80">{label}</p>
                <p className="text-[0.95rem] font-extrabold leading-tight">{n}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-gray-100 p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[0.6rem] font-bold uppercase tracking-wider text-gray-400">Today&apos;s chair</p>
              <p className="text-[0.54rem] font-semibold text-gray-400">8 booked · 5 confirmed</p>
            </div>
            <div className="space-y-1">
              {chair.map((r) => (
                <div
                  key={r.t}
                  className={`flex items-center gap-2 rounded-md border border-l-[3px] border-gray-100 px-2 py-1 ${r.s === 'Confirmed' ? 'border-l-emerald-400' : 'border-l-amber-400'}`}
                >
                  <span className="w-7 text-[0.6rem] font-bold text-gray-400">{r.t}</span>
                  <Avatar initials={r.i} color={r.c} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate text-[0.66rem] font-semibold text-gray-800">{r.n}</span>
                      {r.g && <span className="shrink-0 text-[0.56rem] leading-none">{r.g}</span>}
                    </span>
                    <span className="block text-[0.56rem] text-gray-400">{r.v}</span>
                  </span>
                  <StatusPill tone={r.s === 'Confirmed' ? 'emerald' : 'amber'}>{r.s}</StatusPill>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {trends.map(([label, n, tone]) => (
              <div key={label} className="rounded-lg border border-gray-100 px-2 py-1.5">
                <p className="text-[0.5rem] font-semibold text-gray-400">{label}</p>
                <p className={`text-[0.8rem] font-extrabold ${tone}`}>{n}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Phone-framed clinic-branded patient portal (warm sage theme). */
export function PortalMock() {
  return (
    <div className="mx-auto w-[230px] overflow-hidden rounded-[2.6rem] border-[8px] border-gray-900 bg-[#FAF7F2] text-left shadow-2xl shadow-gray-500/30 ring-1 ring-black/5" aria-hidden="true">
      {/* status bar + notch */}
      <div className="relative flex items-center justify-between bg-white px-4 pt-2 pb-1 text-[#1C1A17]">
        <span className="text-[0.5rem] font-bold tabular-nums">9:41</span>
        <span className="absolute left-1/2 top-1.5 h-3 w-14 -translate-x-1/2 rounded-full bg-gray-900" />
        <span className="flex items-center gap-1">
          <span className="flex items-end gap-[1.5px]">
            <span className="h-1 w-[2px] rounded-sm bg-current" />
            <span className="h-[6px] w-[2px] rounded-sm bg-current" />
            <span className="h-2 w-[2px] rounded-sm bg-current" />
            <span className="h-2.5 w-[2px] rounded-sm bg-current opacity-30" />
          </span>
          <svg viewBox="0 0 16 11" className="h-2 w-2.5 fill-current" aria-hidden="true">
            <path d="M8 10.5 .4 3A10.7 10.7 0 0 1 15.6 3L8 10.5Z" />
          </svg>
          <span className="relative inline-flex h-2 w-3.5 items-center rounded-[2px] border border-current px-[1px]">
            <span className="h-1 w-2/3 rounded-[1px] bg-current" />
            <span className="absolute -right-[2.5px] top-1/2 h-[5px] w-[1.5px] -translate-y-1/2 rounded-r-sm bg-current" />
          </span>
        </span>
      </div>
      {/* app header */}
      <div className="flex items-center gap-2 border-b border-[#E8E2D9] bg-white px-3 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7E957F] text-[0.55rem] font-bold text-white">D</span>
        <span className="text-[0.7rem] font-bold text-[#1C1A17]">Dream Dental</span>
        <span className="ml-auto rounded-full bg-[#7E957F] px-2 py-0.5 text-[0.5rem] font-bold text-white">Book</span>
      </div>
      <div className="space-y-2.5 p-3">
        <p className="font-serif text-[0.92rem] font-semibold text-[#7E957F]">Good morning, Mia</p>
        <div className="rounded-xl border border-l-4 border-[#E8E2D9] border-l-[#7E957F] bg-white p-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#7E957F] text-[0.5rem] font-bold text-white">MV</span>
            <div>
              <p className="text-[0.66rem] font-bold text-[#1C1A17]">Cleaning · Maria Vega</p>
              <p className="text-[0.56rem] text-[#6B635A]">
                Tomorrow · 9:30 AM <span className="rounded-full bg-[#FAF7F2] px-1 font-bold text-[#7E957F]">SOON</span>
              </p>
            </div>
          </div>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded-full bg-[#7E957F] px-2.5 py-1 text-[0.55rem] font-bold text-white">Confirm visit</span>
            <span className="rounded-full border border-[#E8E2D9] bg-white px-2.5 py-1 text-[0.55rem] font-semibold text-[#1C1A17]">Reschedule</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-[#EBDCB8] bg-[#FBF3E4] px-2 py-1.5">
          <span className="text-[0.6rem]">📝</span>
          <p className="text-[0.54rem] font-semibold leading-tight text-[#8A6116]">
            A few questions before your visit — saves you the clipboard.
          </p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-[#7E957F] to-[#5f7561] p-2.5 text-white">
          <div className="flex items-center justify-between">
            <p className="text-[0.5rem] font-bold uppercase tracking-wider opacity-80">Smile Club</p>
            <span className="text-[0.6rem]" aria-hidden="true">✨</span>
          </div>
          <p className="mt-0.5 text-[0.7rem] font-bold">Member · 2 cleanings left</p>
          <p className="text-[0.5rem] opacity-80">Renews Jan 2027</p>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {['Book', 'Message', 'Billing'].map((label) => (
            <div key={label} className="rounded-lg border border-[#E8E2D9] bg-white px-1.5 py-2 text-center">
              <p className="text-[0.55rem] font-bold text-[#1C1A17]">{label}</p>
            </div>
          ))}
        </div>
      </div>
      {/* bottom tab bar */}
      <div className="flex justify-around border-t border-[#E8E2D9] bg-white px-2 py-1.5 text-[0.5rem] font-semibold text-gray-400">
        <span className="text-[#7E957F]">Home</span>
        <span>Visits</span>
        <span>Messages</span>
        <span>More</span>
      </div>
      {/* home indicator */}
      <div className="flex justify-center bg-white pb-1.5 pt-1">
        <span className="h-1 w-20 rounded-full bg-gray-900/70" />
      </div>
    </div>
  )
}

/** Edit-in-place website studio over the warm clinic site. */
export function EditorMock() {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-xl shadow-gray-200/60" aria-hidden="true">
      <div className="flex items-center gap-1.5 border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
        <span className="ml-3 rounded-md bg-white px-2 py-0.5 text-[0.62rem] font-medium text-gray-400">
          acme-dental.dreamcreatestudio.com
        </span>
        <span className="ml-auto rounded-md bg-teal-600 px-2 py-0.5 text-[0.6rem] font-bold text-white">Editing</span>
      </div>
      <div className="bg-[#FAF7F2] p-4">
        <div className="relative rounded-lg border-2 border-dashed border-teal-400 bg-white/70 p-3.5">
          <span className="absolute -top-2.5 right-3 rounded-full bg-teal-600 px-2 py-0.5 text-[0.58rem] font-bold text-white">
            ✎ Edit headline
          </span>
          <p className="font-serif text-[1.05rem] font-semibold leading-snug text-[#7E957F]">
            Dental care that finally feels human.
          </p>
          <p className="mt-1 text-[0.62rem] text-[#6B635A]">Same-week visits · No judgment, ever · Most PPO plans</p>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[['01', 'Cleanings'], ['02', 'Whitening'], ['03', 'Invisalign']].map(([n, label]) => (
            <div key={n} className="rounded-lg bg-white p-2">
              <p className="text-[0.6rem] font-bold text-[#7E957F]">{n}</p>
              <p className="text-[0.62rem] font-semibold text-[#1C1A17]">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-white p-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#7E957F] text-[0.6rem] font-bold text-white">
            DR
          </span>
          <div>
            <p className="text-[0.66rem] font-bold text-[#1C1A17]">Dr. Elena Reyes</p>
            <p className="text-[0.56rem] text-[#6B635A]">Lead dentist · 12 years</p>
          </div>
          <span className="ml-auto rounded-full border border-teal-300 bg-teal-50 px-2 py-0.5 text-[0.56rem] font-bold text-teal-700">
            📷 Replace
          </span>
        </div>
      </div>
    </div>
  )
}

/** Live slot grid, one taken slot struck through, one selected. */
export function BookingMock() {
  const days: Array<[string, string, boolean]> = [['Mon', '15', false], ['Tue', '16', true], ['Wed', '17', false], ['Thu', '18', false]]
  const slots: Array<[string, 'open' | 'taken' | 'selected']> = [
    ['8:00 AM', 'open'], ['8:30 AM', 'open'], ['9:00 AM', 'taken'],
    ['9:30 AM', 'open'], ['10:00 AM', 'selected'], ['10:30 AM', 'open'],
  ]
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-xl shadow-gray-200/60" aria-hidden="true">
      <p className="text-[0.85rem] font-bold text-gray-900">Book a visit — Cleaning</p>
      <p className="mt-0.5 text-[0.66rem] text-gray-400">Real openings from Dream Dental&apos;s calendar</p>
      <div className="mt-3 flex gap-2">
        {days.map(([dow, d, active]) => (
          <div
            key={d}
            className={`flex-1 rounded-lg border px-2 py-1.5 text-center ${active ? 'border-teal-600 bg-teal-600 text-white' : 'border-gray-200 text-gray-600'}`}
          >
            <p className="text-[0.56rem] font-semibold opacity-80">{dow}</p>
            <p className="text-[0.8rem] font-extrabold leading-tight">{d}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {slots.map(([t, state]) => (
          <div
            key={t}
            className={`rounded-lg border px-2 py-1.5 text-center text-[0.66rem] font-semibold ${
              state === 'taken'
                ? 'border-gray-100 bg-gray-50 text-gray-300 line-through'
                : state === 'selected'
                  ? 'border-teal-600 bg-teal-50 text-teal-700'
                  : 'border-gray-200 text-gray-700'
            }`}
          >
            {t}
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-lg bg-teal-600 py-2 text-center text-[0.7rem] font-bold text-white">
        Book Tuesday · 10:00 AM
      </div>
      <p className="mt-2 text-center text-[0.58rem] text-gray-400">Confirmation + intake form sent automatically</p>
    </div>
  )
}

/** One patient thread across portal + email. */
export function MessagesMock() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-xl shadow-gray-200/60" aria-hidden="true">
      <div className="flex items-center gap-2.5 border-b border-gray-100 pb-3">
        <Avatar initials="SI" color="bg-teal-400" />
        <div>
          <p className="text-[0.78rem] font-bold text-gray-900">Sophia Iverson</p>
          <p className="text-[0.6rem] text-gray-400">Next visit: Jun 24 · Cleaning</p>
        </div>
        <span className="ml-auto"><StatusPill tone="amber">Waiting 2h</StatusPill></span>
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex justify-start">
          <p className="max-w-[75%] rounded-2xl rounded-bl-md bg-gray-100 px-3 py-2 text-[0.7rem] leading-snug text-gray-800">
            Hi! Any chance I can move Friday&apos;s cleaning to next week? Work got crazy 😅
          </p>
        </div>
        <p className="pl-1 text-[0.54rem] font-bold uppercase tracking-wide text-gray-400">via portal · 8:14 AM</p>
        <div className="flex justify-end">
          <p className="max-w-[75%] rounded-2xl rounded-br-md bg-teal-600 px-3 py-2 text-[0.7rem] leading-snug text-white">
            Of course! Tuesday 2:30 or Wednesday 9:00 — which works better?
          </p>
        </div>
        <div className="flex justify-start">
          <p className="max-w-[60%] rounded-2xl rounded-bl-md bg-gray-100 px-3 py-2 text-[0.7rem] leading-snug text-gray-800">
            Tuesday 2:30, perfect. Thank you!!
          </p>
        </div>
        <p className="pl-1 text-[0.54rem] font-bold uppercase tracking-wide text-gray-400">via email — same thread</p>
      </div>
      <div className="mt-3 flex gap-2">
        <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-[0.66rem] text-gray-400">
          Reply… <span className="text-gray-300">(templates ⌄)</span>
        </div>
        <span className="rounded-lg bg-teal-600 px-3 py-1.5 text-[0.66rem] font-bold text-white">Send</span>
      </div>
    </div>
  )
}

/** Patient review → featured testimonial flow. */
export function ReviewsMock() {
  return (
    <div className="space-y-3 text-left" aria-hidden="true">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xl shadow-gray-200/60">
        <div className="flex items-center gap-2">
          <Avatar initials="NM" color="bg-emerald-500" />
          <p className="text-[0.72rem] font-bold text-gray-900">Noah Mitchell</p>
          <div className="ml-auto flex text-amber-400">
            {[...Array(5)].map((_, i) => (
              <svg key={i} viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d="M10 1.5 12.6 7l6 .9-4.3 4.2 1 6-5.3-2.9L4.7 18l1-6L1.4 7.9l6-.9L10 1.5Z" />
              </svg>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[0.7rem] italic leading-relaxed text-gray-700">
          “Booked online at 11pm on a Sunday, sat in the chair Tuesday morning. They explained
          every step before any work — no surprises, no upsells.”
        </p>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-[0.6rem] text-gray-400">Completed visit · Jun 9</p>
          <span className="rounded-full bg-teal-600 px-3 py-1 text-[0.62rem] font-bold text-white">
            Feature on website →
          </span>
        </div>
      </div>
      <div className="ml-8 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
        <CheckIcon className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <p className="text-[0.64rem] font-bold text-emerald-800">
          Live on your testimonials as “Noah M. · Cedar Park” — and invited onward to Google.
        </p>
      </div>
    </div>
  )
}

/** Sent → Opened → Clicked → Booked funnel with real numbers. */
export function RecallFunnelMock() {
  const stages: Array<[string, number, string, string]> = [
    ['Sent', 142, 'w-full', 'bg-teal-200 text-teal-900'],
    ['Opened', 96, 'w-[72%]', 'bg-teal-300 text-teal-900'],
    ['Clicked', 41, 'w-[42%]', 'bg-teal-400 text-white'],
    ['Booked', 18, 'w-[26%]', 'bg-teal-600 text-white'],
  ]
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-xl shadow-gray-200/60" aria-hidden="true">
      <div className="flex items-center justify-between">
        <p className="text-[0.85rem] font-bold text-gray-900">“Time for your next cleaning”</p>
        <StatusPill tone="emerald">Sent Jun 2</StatusPill>
      </div>
      <p className="mt-0.5 text-[0.66rem] text-gray-400">Audience: due or overdue · builds itself from patient data</p>
      <div className="mt-4 space-y-2">
        {stages.map(([label, n, width, tone]) => (
          <div key={label} className={`flex items-center justify-between rounded-md px-2.5 py-1.5 ${width} ${tone}`}>
            <span className="text-[0.66rem] font-bold">{label}</span>
            <span className="text-[0.72rem] font-extrabold">{n}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[0.64rem] font-bold text-emerald-700">
        ↳ 18 real visits on the books — none of them from a phone call
      </p>
    </div>
  )
}

/** Storefront with named products and prices. */
export function ShopMock() {
  const products: Array<[string, string, string, string]> = [
    ['Whitening kit', '$49', 'bg-teal-50', '😁'],
    ['Sonic brush', '$89', 'bg-sky-50', '🪥'],
    ['Smile Club · yearly', '$399', 'bg-emerald-50', '✨'],
    ['Retainer cleaner', '$14', 'bg-amber-50', '🫧'],
  ]
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-xl shadow-gray-200/60" aria-hidden="true">
      <div className="flex items-center justify-between">
        <p className="text-[0.85rem] font-bold text-gray-900">Dream Dental Shop</p>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[0.6rem] font-bold text-emerald-700">
          Payouts → your bank
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {products.map(([name, price, tone, emoji]) => (
          <div key={name} className="rounded-lg border border-gray-100 p-2.5">
            <div className={`mb-2 flex h-12 items-center justify-center rounded-md text-base ${tone}`}>{emoji}</div>
            <p className="truncate text-[0.66rem] font-bold text-gray-800">{name}</p>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-[0.7rem] font-extrabold text-gray-900">{price}</p>
              <span className="rounded-md bg-teal-600 px-2 py-0.5 text-[0.56rem] font-bold text-white">Add</span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[0.58rem] text-gray-400">
        Membership billing + birthday coupons included
      </p>
    </div>
  )
}

/** Google Business connection (synced reviews) + one composer publishing to
 *  Google and the socials. */
export function GoogleSocialMock() {
  const channels: Array<[string, string]> = [
    ['Google', 'bg-[#4285F4]'],
    ['Instagram', 'bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5]'],
    ['Facebook', 'bg-[#1877F2]'],
    ['TikTok', 'bg-gray-900'],
  ]
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-xl shadow-gray-200/60" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4285F4] text-[0.66rem] font-bold text-white">G</span>
          <div>
            <p className="text-[0.78rem] font-bold text-gray-900">Google Business</p>
            <p className="text-[0.58rem] text-gray-400">Dream Dental · connected</p>
          </div>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6rem] font-bold text-emerald-700">
          <span className="flex text-amber-400">
            {[...Array(5)].map((_, i) => (
              <svg key={i} viewBox="0 0 20 20" className="h-2.5 w-2.5 fill-current" aria-hidden="true">
                <path d="M10 1.5 12.6 7l6 .9-4.3 4.2 1 6-5.3-2.9L4.7 18l1-6L1.4 7.9l6-.9L10 1.5Z" />
              </svg>
            ))}
          </span>
          4.9 · 128
        </span>
      </div>
      <div className="mt-3 rounded-lg border border-gray-100 p-2.5">
        <p className="text-[0.64rem] leading-snug text-gray-700">
          &ldquo;Got me in same week and explained every step. Painless.&rdquo;
        </p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="rounded-md bg-teal-600 px-2 py-0.5 text-[0.56rem] font-bold text-white">Reply</span>
          <span className="text-[0.56rem] text-gray-400">synced from Google — reply in one place</span>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-gray-100 p-2.5">
        <p className="mb-1.5 text-[0.6rem] font-bold uppercase tracking-wider text-gray-400">New post · publish to</p>
        <div className="flex flex-wrap gap-1.5">
          {channels.map(([label, tone]) => (
            <span key={label} className="flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-[0.58rem] font-semibold text-gray-700">
              <span className={`h-2.5 w-2.5 rounded-full ${tone}`} />
              {label}
            </span>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <p className="text-[0.62rem] text-gray-500">&ldquo;Now welcoming new patients ✨&rdquo;</p>
          <span className="rounded-md bg-teal-600 px-2.5 py-1 text-[0.58rem] font-bold text-white">Schedule</span>
        </div>
      </div>
    </div>
  )
}
