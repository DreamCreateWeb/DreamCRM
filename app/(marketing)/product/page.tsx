import { Eyebrow, PrimaryCta, GhostCta, CheckIcon, DashboardMock, PortalMock } from '@/components/marketing/ui'
import { DEMO_URL } from '@/lib/marketing/site'
import Link from 'next/link'

export const metadata = {
  title: 'Platform tour — DreamCRM',
  description:
    'A deep dive through every module: website studio, online booking, patient portal, unified messages, reviews, recall, shop & memberships, and the official-API Open Dental sync.',
}

interface ModuleSection {
  id: string
  eyebrow: string
  title: string
  body: string
  bullets: string[]
  docHref?: string
  visual?: 'dashboard' | 'portal'
}

const SECTIONS: ModuleSection[] = [
  {
    id: 'website',
    eyebrow: 'The storefront',
    title: 'A practice website you actually control',
    body: 'Most practices rent their website from an agency and email support to change a sentence. Your DreamCRM site is yours: open the Website Studio and your real, live site appears in an editable canvas — hover any section, click Edit, save, published. Services come from a curated dental library with per-practice AI customization; the blog, SEO plumbing (sitemaps, local schema, social cards), careers page, and lead forms are all part of the same site.',
    bullets: [
      'Edit-in-place studio — change text, photos, services, and hours by clicking the page',
      'AI copy assistant with a monthly allowance on every tier (manual editing is always free)',
      'Services library with detail pages, FAQs, and navigation that build themselves',
      'SEO dashboard reading real Google Search Console data',
      'Blog with AI-drafted posts you review before publishing',
      'Careers page with JobPosting schema — Google for Jobs indexes your openings free',
    ],
    docHref: '/docs/editing-your-website',
  },
  {
    id: 'booking',
    eyebrow: 'Acquisition',
    title: 'Online booking that protects the schedule',
    body: 'Patients book from your real availability — office hours minus what is already on the books, in your timezone — on your public site and in the portal. The classic self-scheduling failure (a root canal booked into a 30-minute cleaning slot) is designed out: you choose which visit types are bookable online, and everything else routes to a phone call.',
    bullets: [
      'Live slot grid, double-booking impossible (the second patient is asked to re-pick)',
      'Visit-type rules and minimum-notice windows, set by you',
      'After-hours capture — bookings happen when your phones are off',
      'Confirmation emails carry your intake form automatically',
      'Every booking tagged with its source: website, portal, or front desk',
      'With Open Dental connected, bookings push into the PMS and cancellations clear the slot',
    ],
    docHref: '/docs/online-booking-rules',
  },
  {
    id: 'portal',
    eyebrow: 'Retention',
    title: 'A patient portal wearing your brand, not ours',
    body: 'Patients get a warm, mobile-first portal with your logo, your colors, your voice — not dental-software chrome. They confirm and self-reschedule visits, fill forms before they arrive, see their balance with an honest as-of date, pay online, and manage the whole family from one passwordless login. You control every feature with toggles where off means gone — no dead links — and preview the result as a patient before sharing it.',
    bullets: [
      'State-aware next-visit card: confirm → add to calendar → directions → reschedule',
      'Self-serve reschedule/cancel with your notice window ("call us" inside it)',
      'Passwordless sign-in links — portals die on forgotten passwords',
      'Family access: parents manage kids’ visits and forms from one login',
      'Online balance payments through your own Stripe account',
      'Per-feature toggles + welcome copy + announcement bar + preview-as-patient',
    ],
    docHref: '/docs/setting-up-the-patient-portal',
    visual: 'portal',
  },
  {
    id: 'messages',
    eyebrow: 'Communication',
    title: 'Every patient conversation in one thread',
    body: 'Portal messages and patient email merge into a single conversation per patient, so the front desk answers people, not channels. Threads a patient is waiting on grow an aging edge from green to red — the inbox triages itself. Your practice Gmail connects too, with team triage for everything that isn’t a patient thread.',
    bullets: [
      'One thread per patient across portal + email',
      'Aging colors on unanswered inbound — nothing rots silently',
      'Reply templates for the three messages you send fifty times a week',
      'Connected Gmail inbox with assignment and resolve states',
      'Patient-facing email sends from your practice identity, not ours',
    ],
    docHref: '/docs/messages-and-your-inbox',
  },
  {
    id: 'reviews',
    eyebrow: 'Reputation',
    title: 'Reviews collected at the right moment',
    body: 'After a good visit, send a one-tap review request. The patient writes their words on your page; you choose which become testimonials on your website — their exact words, never edited — and they’re invited onward to Google where public reputation compounds. Same ask to every patient, no rating-gating: clean under the FTC’s fake-reviews rule.',
    bullets: [
      'Text-first review capture you own, with Google/Healthgrades/Facebook share-on',
      'One-click feature/unfeature onto your website’s testimonial section',
      'Ready-to-ask list driven by completed visits',
      'Per-patient rate limiting so nobody gets over-asked',
    ],
    docHref: '/docs/reviews-collection',
  },
  {
    id: 'recall',
    eyebrow: 'Reactivation',
    title: 'Recall that fills chairs, measured honestly',
    body: 'Audiences build themselves from live patient data — due, overdue, lapsed, birthdays — and stay current without list maintenance. Warm templates go out by email with booking links, and the funnel reports what matters: not opens, but visits actually booked. If Open Dental is connected, its recall engine drives the due dates.',
    bullets: [
      'Self-maintaining audiences from lifecycle + recall status',
      'System templates with your voice: reactivation, birthday, welcome',
      'Sent → Opened → Clicked → Booked attribution to real appointments',
      'One-click unsubscribe honored everywhere automatically',
      'SMS channel on the roadmap (carrier registration in progress)',
    ],
    docHref: '/docs/recall-campaigns',
  },
  {
    id: 'shop',
    eyebrow: 'New revenue',
    title: 'A shop and membership plans nobody else ships',
    body: 'Sell whitening kits, electric brushes, and branded merch from your own website, and run in-house membership plans (the uninsured-patient answer) with benefit tracking. Payments run through your own Stripe account — payouts land in your bank, not ours. No orbital-layer competitor ships a storefront; this is yours alone in the category.',
    bullets: [
      'Product catalog with variants, inventory, pickup or flat-rate shipping',
      'Membership plans billed monthly or annually, with benefit usage tracking',
      'Birthday coupons and promo codes',
      'Stripe Connect: your account, your payouts, your Stripe dashboard',
      'Order pipeline from paid to picked-up/shipped',
    ],
    docHref: '/docs/setting-up-your-shop',
  },
  {
    id: 'integrations',
    eyebrow: 'The foundation',
    title: 'Open Dental sync through the official API — only',
    body: 'DreamCRM wraps your PMS; it never replaces it and never sneaks behind it. The Open Dental sync is two-way through OD’s sanctioned API: patients, appointments, providers, balances, and recall due dates flow in; bookings, cancellations, and a CommLog mirror of every message we send flow back — all visible in your OD audit trail. Open Dental has publicly cautioned its customers about vendors writing directly into its database; we built the integration they recommend instead.',
    bullets: [
      'Two-way: imports patients/visits/balances/recall, pushes bookings + cancellations',
      'CommLog mirroring — our sends appear in each patient’s OD chart',
      'Transparent field map on the integration page: exactly what reads and writes',
      'Sync-health monitoring with proactive alerts — never silent failure',
      'Charts, procedures, and claims never move; clinical data stays in the PMS',
      'Dentrix Ascend next (partner approval in progress)',
    ],
    docHref: '/docs/connecting-open-dental',
    visual: 'dashboard',
  },
]

export default function ProductPage() {
  return (
    <>
      <section className="border-b border-gray-100 bg-gradient-to-b from-violet-50/60 to-white">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:py-20">
          <Eyebrow>Platform tour</Eyebrow>
          <h1 className="text-[2.2rem] font-extrabold leading-tight tracking-tight sm:text-[2.8rem]">
            One system, eight jobs, zero copy-paste between them
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[1rem] leading-relaxed text-gray-600">
            Because it&apos;s one product, the modules compound: a website lead becomes a patient
            record, the patient gets a portal, the visit triggers a review request, and the recall
            campaign knows who&apos;s overdue — automatically.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <PrimaryCta href="/signup">Start free setup</PrimaryCta>
            <GhostCta href={DEMO_URL} external>
              Browse the demo practice ↗
            </GhostCta>
          </div>
        </div>
      </section>

      {/* Sticky in-page nav */}
      <nav className="sticky top-[60px] z-30 border-b border-gray-100 bg-white/90 backdrop-blur" aria-label="Modules">
        <div className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="shrink-0 rounded-lg px-3 py-1.5 text-[0.82rem] font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-950"
            >
              {s.eyebrow}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {SECTIONS.map((s, i) => (
          <section key={s.id} id={s.id} className="scroll-mt-28 border-b border-gray-100 py-16 last:border-b-0">
            <div className={`grid items-start gap-10 lg:grid-cols-2 ${i % 2 === 1 ? 'lg:[&>*:first-child]:order-2' : ''}`}>
              <div>
                <Eyebrow>{s.eyebrow}</Eyebrow>
                <h2 className="text-[1.6rem] font-bold leading-tight tracking-tight sm:text-[1.9rem]">{s.title}</h2>
                <p className="mt-4 text-[0.95rem] leading-relaxed text-gray-600">{s.body}</p>
                {s.docHref && (
                  <Link href={s.docHref} className="mt-4 inline-block text-[0.88rem] font-semibold text-violet-600 hover:underline">
                    Read the setup doc →
                  </Link>
                )}
              </div>
              <div>
                {s.visual === 'portal' ? (
                  <div className="flex justify-center py-2">
                    <PortalMock />
                  </div>
                ) : s.visual === 'dashboard' ? (
                  <DashboardMock />
                ) : (
                  <ul className="space-y-2.5 rounded-xl border border-gray-200 bg-gray-50/60 p-6">
                    {s.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-[0.9rem] leading-snug text-gray-800">
                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                {s.visual && (
                  <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                    {s.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-[0.85rem] leading-snug text-gray-700">
                        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-violet-200 bg-violet-50/60 px-8 py-12 text-center">
          <h2 className="text-[1.6rem] font-bold tracking-tight">Ten minutes from signup to a live website</h2>
          <p className="mx-auto mt-2 max-w-xl text-[0.95rem] text-gray-600">
            Start on Basic with the website, switch tiers as you adopt more. Month-to-month, no contract.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <PrimaryCta href="/signup">Get started</PrimaryCta>
            <GhostCta href="/pricing">See pricing</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
