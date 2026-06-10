import Link from 'next/link'
import { PLANS } from '@/lib/stripe-config'

/**
 * The public marketing site served at the root of www.dreamcreatestudio.com
 * for signed-out visitors. Same design language as the clinic sites + portal
 * (warm paper ground, Fraunces display, sage accent) — the marketing site IS
 * the product demo. Pure server component: the FAQ uses <details>, nav uses
 * anchors, zero client JS.
 *
 * Voice per DESIGN.md: short declarative, first-person plural, concrete
 * numbers, acknowledge friction ("keep the PMS you have"). No corporate
 * medical blue, no stock smiles, no "world-class".
 */

const BG = '#FAF7F2'
const INK = '#1C1A17'
const MUTED = '#6B635A'
const SURFACE = '#FFFFFF'
const BORDER = '#E8E2D9'
const SAGE = '#7E957F' // platform accent — deeper sage for AA contrast on warm white
const TEAL = '#36514c' // forest band, same hue as clinic-site footer

const SITE_DOMAIN = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'dreamcreatestudio.com'
const DEMO_URL = `https://acme-dental-demo.${SITE_DOMAIN}`

const DISPLAY = { fontFamily: 'var(--font-display)' } as const

/* ── Small building blocks ──────────────────────────────────────────── */

function CtaButton({
  href,
  children,
  variant = 'primary',
  external = false,
}: {
  href: string
  children: React.ReactNode
  variant?: 'primary' | 'quiet' | 'onDark'
  external?: boolean
}) {
  const cls = 'inline-flex items-center justify-center rounded-full px-6 py-3 text-[0.95rem] font-semibold transition-opacity hover:opacity-90'
  const style =
    variant === 'primary'
      ? { backgroundColor: INK, color: '#FFF7EE' }
      : variant === 'onDark'
        ? { backgroundColor: '#F5EFE7', color: TEAL }
        : { backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls} style={style}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={cls} style={style}>
      {children}
    </Link>
  )
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[0.75rem] font-bold uppercase tracking-[0.16em]" style={{ color: SAGE }}>
      {children}
    </p>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" className="mt-1 h-3.5 w-3.5 shrink-0" fill="none" stroke={SAGE} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 8.5l3.5 3.5 7.5-8" />
    </svg>
  )
}

/* ── Feature catalog (mirrors the live module set — keep honest) ────── */

const FEATURES: Array<{ title: string; body: string; glyph: React.ReactNode }> = [
  {
    title: 'A website patients actually like',
    body: 'A warm, modern site on your own address — services, team, insurance, the works. Edit it yourself by clicking the page, with an AI assistant when you want a head start.',
    glyph: <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-13ZM3 8.5h18" />,
  },
  {
    title: 'Online booking, real openings',
    body: 'Patients pick from your live availability — after hours too, when a third of bookings happen. Wrong-visit-type bookings are designed out, not cleaned up.',
    glyph: <><rect x="3.5" y="5" width="17" height="16" rx="2.5" /><path d="M3.5 10h17M8 2.5V7m8-4.5V7M8.5 14.5l2.5 2.5 4.5-5" /></>,
  },
  {
    title: 'A patient portal in your brand',
    body: 'Confirm, reschedule, fill forms, see balances, pay online — wearing your logo and colors, not ours. You choose exactly which features patients see.',
    glyph: <><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  },
  {
    title: 'Every conversation, one place',
    body: 'Website leads, patient messages, and your clinic inbox in one queue — with aging colors so nothing quietly rots while the phone rings.',
    glyph: <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12Z" />,
  },
  {
    title: 'Reviews that write themselves',
    body: 'Post-visit requests patients answer in one tap. Their words land on your website as featured testimonials — you just toggle them on.',
    glyph: <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9L12 3.5Z" />,
  },
  {
    title: 'Recall that fills the chair',
    body: 'Due and overdue patients surface themselves; warm campaigns go out by email with booking links. You see Sent → Opened → Booked, not vanity numbers.',
    glyph: <path d="M4 12a8 8 0 1 1 2.3 5.6M4 12V7m0 5h5" />,
  },
  {
    title: 'A shop your patients will use',
    body: 'Whitening kits, electric brushes, membership plans — sold from your site, paid out to your bank. Birthday coupons included.',
    glyph: <><path d="M5 8h14l-1 12a1.5 1.5 0 0 1-1.5 1.3h-9A1.5 1.5 0 0 1 6 20L5 8Z" /><path d="M9 10.5V6a3 3 0 0 1 6 0v4.5" /></>,
  },
  {
    title: 'Plays nicely with your PMS',
    body: 'Keep Open Dental. We sync patients, visits, and balances two-way through the official API — every write lands in your audit trail, no database scraping.',
    glyph: <path d="M9 7h6a4 4 0 0 1 0 8h-2m-4 2H5a4 4 0 0 1 0-8h2m1 4h8" />,
  },
]

const REPLACES: Array<{ tool: string; price: string }> = [
  { tool: 'Website agency retainer', price: '$150–500/mo' },
  { tool: 'Online booking vendor', price: '$200–350/mo' },
  { tool: 'Patient communications suite', price: '$250–400/mo' },
  { tool: 'Review management tool', price: '$100–300/mo' },
  { tool: 'Recall / reactivation service', price: '$150–300/mo' },
  { tool: 'Careers job-board listings', price: '$100–400/mo' },
]

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Do I have to leave my practice management system?',
    a: 'No — that’s the point. DreamCRM wraps the PMS you already run. Charts, procedures, and claims stay where they are; we handle the website, booking, portal, communications, reviews, and shop around it. Open Dental syncs two-way through its official API today, with more systems on the way.',
  },
  {
    q: 'We already have a website. What happens to it?',
    a: 'Your DreamCRM site can replace it or run alongside it while you decide. Either way, you can edit every word and photo yourself, in place, without emailing anyone — and your content stays yours.',
  },
  {
    q: 'How long does setup take?',
    a: 'Your site and dashboard exist the moment you finish signup — about ten minutes of questions. Most practices spend their first week letting the front desk poke around, then point their domain when they’re happy.',
  },
  {
    q: 'Is patient data safe?',
    a: 'Data is encrypted in transit and at rest, hosted on AWS infrastructure, with role-based access for your team. We deliberately never store clinical records — charts and claims stay in your PMS.',
  },
  {
    q: 'Is there a contract?',
    a: 'Month-to-month, cancel anytime. Annual billing is available if you’d rather pay for ten months and get twelve.',
  },
  {
    q: 'What does my front desk have to learn?',
    a: 'One screen a day: the morning huddle. It shows today’s chair, who needs a confirmation text, new leads, and unread messages — each one click deep. If a task takes training, we consider that our bug.',
  },
]

/* ── Page ───────────────────────────────────────────────────────────── */

export default function MarketingHome() {
  return (
    <div style={{ backgroundColor: BG, color: INK }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&display=swap"
      />
      <style>{`:root { --font-display: 'Fraunces', Georgia, serif; } html { scroll-behavior: smooth; }`}</style>

      {/* ── Header ── */}
      <header className="sticky top-0 z-30 backdrop-blur" style={{ backgroundColor: 'rgba(250,247,242,0.92)', borderBottom: `1px solid ${BORDER}` }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full text-[0.95rem] font-bold text-white" style={{ backgroundColor: SAGE, ...DISPLAY }}>
              D
            </span>
            <span className="text-[1.05rem] font-semibold tracking-tight">DreamCRM</span>
          </Link>
          <nav className="hidden items-center gap-6 text-[0.9rem] font-medium md:flex" style={{ color: MUTED }} aria-label="Main">
            <a href="#features" className="hover:opacity-70">What you get</a>
            <a href="#pricing" className="hover:opacity-70">Pricing</a>
            <a href="#faq" className="hover:opacity-70">FAQ</a>
            <a href={DEMO_URL} target="_blank" rel="noreferrer" className="hover:opacity-70">
              Live demo ↗
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/signin"
              className="rounded-full px-4 py-2 text-[0.88rem] font-semibold"
              style={{ color: INK, border: `1px solid ${BORDER}`, backgroundColor: SURFACE }}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full px-4 py-2 text-[0.88rem] font-semibold text-white"
              style={{ backgroundColor: INK }}
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
          <p className="mb-4 text-[0.8rem] font-bold uppercase tracking-[0.16em]" style={{ color: SAGE }}>
            For dental practices
          </p>
          <h1 className="mx-auto max-w-3xl text-[2.5rem] font-semibold leading-[1.08] tracking-tight sm:text-[3.4rem]" style={{ ...DISPLAY, color: INK }}>
            Your whole front office.
            <br />
            <span style={{ color: SAGE }}>One calm system.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[1.05rem] leading-relaxed" style={{ color: MUTED }}>
            Website, online booking, patient portal, messages, reviews, recall, even a shop —
            replacing the five or six subscriptions a typical practice juggles. All wrapped around
            the practice management system you already run.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <CtaButton href="/signup">Get started — from $99/mo</CtaButton>
            <CtaButton href={DEMO_URL} variant="quiet" external>
              See a live demo practice ↗
            </CtaButton>
          </div>
          <p className="mt-4 text-[0.82rem]" style={{ color: MUTED }}>
            Month-to-month · set up in about 10 minutes · keep your PMS
          </p>
        </section>

        {/* ── The consolidation pitch ── */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid items-center gap-10 rounded-3xl p-8 sm:p-12 lg:grid-cols-2" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
            <div>
              <SectionEyebrow>Why practices switch</SectionEyebrow>
              <h2 className="text-[1.8rem] font-semibold leading-tight sm:text-[2.2rem]" style={DISPLAY}>
                Six logins. Six invoices.
                <br />
                Six support queues.
              </h2>
              <p className="mt-4 text-[0.98rem] leading-relaxed" style={{ color: MUTED }}>
                A typical practice spends $800–$2,000 a month across separate tools that don&apos;t
                talk to each other. DreamCRM does the same jobs in one place, for one predictable
                price — and because it&apos;s one system, your website leads become patients,
                patients get portals, and visits trigger review requests without anyone copying
                data between tabs.
              </p>
              <div className="mt-6">
                <CtaButton href="#pricing" variant="quiet">
                  See pricing ↓
                </CtaButton>
              </div>
            </div>
            <ul className="space-y-2.5">
              {REPLACES.map((r) => (
                <li key={r.tool} className="flex items-center justify-between gap-4 rounded-2xl px-4 py-3" style={{ backgroundColor: BG, border: `1px solid ${BORDER}` }}>
                  <span className="text-[0.92rem] font-medium">{r.tool}</span>
                  <span className="text-[0.85rem] line-through" style={{ color: '#B9B0A5' }}>{r.price}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-4 rounded-2xl px-4 py-3 text-white" style={{ backgroundColor: TEAL }}>
                <span className="text-[0.92rem] font-semibold">DreamCRM — all of it</span>
                <span className="text-[0.92rem] font-bold">$99–199/mo</span>
              </li>
            </ul>
          </div>
        </section>

        {/* ── Feature tour ── */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-20 sm:px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <SectionEyebrow>What you get</SectionEyebrow>
            <h2 className="text-[1.8rem] font-semibold leading-tight sm:text-[2.2rem]" style={DISPLAY}>
              Everything patient-facing, finally in one place
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
                <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: BG, color: SAGE }}>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {f.glyph}
                  </svg>
                </span>
                <h3 className="mt-3.5 text-[1.02rem] font-semibold leading-snug">{f.title}</h3>
                <p className="mt-1.5 text-[0.86rem] leading-relaxed" style={{ color: MUTED }}>
                  {f.body}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-[0.88rem]" style={{ color: MUTED }}>
            Plus: digital intake forms · morning-huddle dashboard · practice analytics · careers page
            with applicant tracking · blog &amp; SEO tools.
          </p>
        </section>

        {/* ── How it works ── */}
        <section className="text-white" style={{ backgroundColor: TEAL }}>
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="mb-3 text-[0.75rem] font-bold uppercase tracking-[0.16em] opacity-70">How it works</p>
              <h2 className="text-[1.8rem] font-semibold leading-tight sm:text-[2.2rem]" style={DISPLAY}>
                Live before your next staff meeting
              </h2>
            </div>
            <div className="grid gap-8 sm:grid-cols-3">
              {[
                {
                  n: '01',
                  t: 'Answer a few questions',
                  b: 'Practice name, services, hours, the basics. Signup takes about ten minutes, and our AI drafts your website copy from your answers.',
                },
                {
                  n: '02',
                  t: 'Make it yours',
                  b: 'Click anything on your new site to edit it. Add your team’s photos, set your brand color, choose what your patient portal offers.',
                },
                {
                  n: '03',
                  t: 'Bring your PMS when ready',
                  b: 'Connect Open Dental and patients, visits, and balances sync two-way. Until then, everything works standalone from day one.',
                },
              ].map((s) => (
                <div key={s.n}>
                  <p className="text-[2rem] font-semibold opacity-50" style={DISPLAY}>{s.n}</p>
                  <h3 className="mt-2 text-[1.1rem] font-semibold">{s.t}</h3>
                  <p className="mt-2 text-[0.9rem] leading-relaxed opacity-80">{s.b}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <CtaButton href="/signup" variant="onDark">Start your setup</CtaButton>
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <SectionEyebrow>Pricing</SectionEyebrow>
            <h2 className="text-[1.8rem] font-semibold leading-tight sm:text-[2.2rem]" style={DISPLAY}>
              One subscription. No surprises.
            </h2>
            <p className="mt-3 text-[0.95rem]" style={{ color: MUTED }}>
              Month-to-month, cancel anytime. Pay annually and get two months free.
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {PLANS.map((plan) => {
              const highlight = plan.id === 'pro'
              return (
                <div
                  key={plan.id}
                  className="relative flex flex-col rounded-3xl p-7"
                  style={{
                    backgroundColor: SURFACE,
                    border: highlight ? `2px solid ${SAGE}` : `1px solid ${BORDER}`,
                  }}
                >
                  {highlight && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-white" style={{ backgroundColor: SAGE }}>
                      Most popular
                    </span>
                  )}
                  <h3 className="text-[1.15rem] font-semibold">{plan.name}</h3>
                  <p className="mt-2">
                    <span className="text-[2.4rem] font-semibold leading-none" style={DISPLAY}>${plan.price}</span>
                    <span className="text-[0.9rem]" style={{ color: MUTED }}> /month</span>
                  </p>
                  <p className="mt-1 text-[0.8rem]" style={{ color: MUTED }}>
                    or ${plan.annualPrice}/year
                  </p>
                  <ul className="mt-5 flex-1 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[0.88rem] leading-snug">
                        <Check />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-7">
                    <Link
                      href="/signup"
                      className="block rounded-full py-3 text-center text-[0.92rem] font-semibold"
                      style={
                        highlight
                          ? { backgroundColor: INK, color: '#FFF7EE' }
                          : { backgroundColor: SURFACE, color: INK, border: `1px solid ${BORDER}` }
                      }
                    >
                      Choose {plan.name}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-20 sm:px-6">
          <div className="mx-auto mb-8 max-w-2xl text-center">
            <SectionEyebrow>Questions</SectionEyebrow>
            <h2 className="text-[1.8rem] font-semibold leading-tight sm:text-[2.2rem]" style={DISPLAY}>
              The things every practice asks
            </h2>
          </div>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-2xl px-5 py-4" style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[0.98rem] font-semibold [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="shrink-0 text-lg transition-transform group-open:rotate-45" style={{ color: SAGE }} aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-[0.92rem] leading-relaxed" style={{ color: MUTED }}>
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="rounded-3xl px-8 py-14 text-center text-white" style={{ backgroundColor: TEAL }}>
            <h2 className="mx-auto max-w-2xl text-[1.9rem] font-semibold leading-tight sm:text-[2.4rem]" style={DISPLAY}>
              Give your front desk one system to love
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[0.98rem] leading-relaxed opacity-80">
              Start with the website tonight. Add booking, the portal, and your PMS whenever
              you&apos;re ready — it&apos;s all already in there.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <CtaButton href="/signup" variant="onDark">Get started</CtaButton>
              <a href={DEMO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-full px-6 py-3 text-[0.95rem] font-semibold text-white/90 hover:text-white" style={{ border: '1px solid rgba(255,255,255,0.35)' }}>
                Browse the demo practice ↗
              </a>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-[0.85rem] sm:px-6" style={{ color: MUTED }}>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[0.7rem] font-bold text-white" style={{ backgroundColor: SAGE, ...DISPLAY }}>
              D
            </span>
            <span>© {new Date().getFullYear()} Dream Create · DreamCRM</span>
          </div>
          <nav className="flex flex-wrap items-center gap-5" aria-label="Footer">
            <a href="#pricing" className="hover:opacity-70">Pricing</a>
            <a href={DEMO_URL} target="_blank" rel="noreferrer" className="hover:opacity-70">Live demo</a>
            <Link href="/signin" className="hover:opacity-70">Sign in</Link>
            <Link href="/signup" className="font-semibold hover:opacity-70" style={{ color: INK }}>
              Get started
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
