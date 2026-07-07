import React from 'react'
import Link from 'next/link'
import { PLANS } from '@/lib/stripe-config'
import { SectionTitle, PrimaryCta, CheckIcon, MatrixMark, PageHero } from '@/components/marketing/ui'
import { JsonLd, faqPageLd } from '@/lib/marketing/seo'

export const metadata = {
  title: 'Pricing — DreamCRM',
  alternates: { canonical: '/pricing' },
  description:
    'Flat, published pricing: Basic $150/mo (website tier), Pro $250/mo (front office), Premium $500/mo (growth + PMS sync). Month-to-month, no contract — or annual with 2 months free.',
}

/** Tier matrix — mirrors the real module gating in lib/modules/clinic.ts. */
const MATRIX: Array<{ group: string; rows: Array<{ label: string; tiers: [boolean, boolean, boolean] }> }> = [
  {
    group: 'Website & brand',
    rows: [
      { label: 'Practice website on your address', tiers: [true, true, true] },
      { label: 'Edit-in-place Website Studio', tiers: [true, true, true] },
      { label: 'AI copy assistant (monthly allowance)', tiers: [true, true, true] },
      { label: 'Contact + insurance-check lead capture', tiers: [true, true, true] },
      { label: 'SEO foundations (sitemap, schema, social cards)', tiers: [true, true, true] },
      { label: 'Blog + AI-drafted posts', tiers: [false, true, true] },
      { label: 'SEO dashboard (Google Search Console data)', tiers: [false, true, true] },
      { label: 'Careers page + applicant tracking', tiers: [false, false, true] },
    ],
  },
  {
    group: 'Front office',
    rows: [
      { label: 'Patient records with action flags', tiers: [false, true, true] },
      { label: 'Appointments agenda + reminders', tiers: [false, true, true] },
      { label: 'Online booking from live availability', tiers: [false, true, true] },
      { label: 'Website leads triage queue', tiers: [false, true, true] },
      { label: 'Unified patient messages', tiers: [false, true, true] },
      { label: 'Connected Gmail inbox', tiers: [false, true, true] },
      { label: 'Digital intake forms', tiers: [false, true, true] },
    ],
  },
  {
    group: 'Patient experience',
    rows: [
      { label: 'Clinic-branded patient portal', tiers: [false, true, true] },
      { label: 'Self-serve reschedule & cancel', tiers: [false, true, true] },
      { label: 'Family access (one login per household)', tiers: [false, true, true] },
      { label: 'Review collection + website testimonials', tiers: [false, true, true] },
      { label: 'Google reviews sync + reply', tiers: [false, true, true] },
    ],
  },
  {
    group: 'Growth & integrations',
    rows: [
      { label: 'Recall & outreach campaigns', tiers: [false, false, true] },
      { label: 'Google Business sync + social posting', tiers: [false, true, true] },
      { label: 'Practice analytics', tiers: [false, false, true] },
      { label: 'Online shop + membership plans', tiers: [false, false, true] },
      { label: 'Online balance payments (via Stripe Connect)', tiers: [false, false, true] },
      { label: 'Open Dental two-way sync (official API)', tiers: [false, false, true] },
    ],
  },
]

const PRICING_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Do I have to pay to try it?',
    a: 'No. Every practice starts with a 7-day free trial of the full Premium tier — website, booking, portal, messaging, reviews, marketing, all of it — with no credit card required. You pick a plan and add billing only when you decide to stay.',
  },
  {
    q: 'Is there a contract or setup fee?',
    a: 'No. Every plan is month-to-month with no setup fee, and you can cancel anytime — your website content exports with you. Prefer annual? Pay for 10 months, get 12: Basic $1,500, Pro $2,500, Premium $5,000 per year \u2014 two months free.',
  },
  {
    q: 'Can I switch tiers later?',
    a: 'Yes, anytime under Settings → Plan. Upgrades unlock modules immediately; changes prorate through Stripe.',
  },
  {
    q: 'What does Open Dental access cost on their side?',
    a: 'Open Dental bills API access for your office (around $30/mo, paid to Open Dental). That fee is theirs, not ours — we surface it up front because surprise line items are how trust dies.',
  },
  {
    q: 'Do you take a cut of my shop or membership revenue?',
    a: 'Shop and membership payments run through your own Stripe account and pay out to your bank. Stripe charges its standard processing fees; your subscription covers the platform.',
  },
  {
    q: 'What about texting (SMS)?',
    a: 'Patient-facing email is live today (sent from your practice identity). Two-way SMS is on our roadmap but not available yet — it needs a regulated carrier-registration process we haven’t completed. We won’t sell it before it works.',
  },
  {
    q: 'How many social accounts can I connect?',
    a: 'Connecting your Google Business profile is free on every plan and never counts against a limit. For social platforms (Instagram, Facebook, TikTok, YouTube, LinkedIn), Pro includes one connected account and Premium includes two; if you want more, there’s a flat add-on ($30/mo on Pro, $20/mo on Premium). It’s published here, same as everything else.',
  },
  {
    q: 'Is my data locked in?',
    a: 'No. Your PMS remains the system of record for clinical data, your website content is exportable, and leaving is a cancellation, not a migration project.',
  },
]

export default function PricingPage() {
  return (
    <>
      <JsonLd data={faqPageLd(PRICING_FAQS)} />
      <PageHero
        eyebrow="Pricing"
        title="The whole number, on the page"
        sub="No discovery calls, no custom quotes, no per-feature add-ons. Pick a tier, switch whenever, cancel monthly."
      />

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="mb-8 rounded-xl border border-teal-200 bg-teal-50/70 px-5 py-4 text-center">
          <p className="text-[0.95rem] font-semibold text-gray-950">
            Every practice starts with 7 days of Premium, free — no card required.
          </p>
          <p className="mt-1 text-[0.85rem] text-gray-600">
            Try everything below first. Pick a tier when you&apos;re convinced; switch or cancel monthly.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`flex flex-col rounded-xl border bg-white p-7 ${plan.id === 'pro' ? 'border-teal-400 ring-1 ring-teal-400' : 'border-gray-200'}`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-[1.05rem] font-bold">{plan.name}</h2>
                {plan.id === 'pro' && (
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[0.7rem] font-bold text-teal-700">
                    Most popular
                  </span>
                )}
              </div>
              <p className="mt-3 text-[2.3rem] font-extrabold tracking-tight">
                ${plan.price}
                <span className="text-[0.9rem] font-medium text-gray-500"> /mo</span>
              </p>
              <p className="text-[0.8rem] text-gray-500">
                or ${plan.annualPrice.toLocaleString('en-US')}/yr — 2 months free
              </p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[0.875rem] leading-snug text-gray-700">
                    <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={`/signup?plan=${plan.id}`}
                className={`mt-7 block rounded-lg py-2.5 text-center text-[0.9rem] font-semibold ${
                  plan.id === 'pro'
                    ? 'bg-teal-700 text-white hover:bg-teal-800'
                    : 'border border-gray-300 text-gray-800 hover:border-gray-400'
                }`}
              >
                Choose {plan.name}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-gray-100 bg-gray-50/70">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <SectionTitle sub="The exact module gating, mirrored from the product — nothing hidden behind a sales call.">
            What unlocks at each tier
          </SectionTitle>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[40rem] text-[0.875rem]">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-500">Feature</th>
                  {PLANS.map((p) => (
                    <th key={p.id} className="w-28 px-4 py-3 text-center font-bold text-gray-950">
                      {p.name}
                      <span className="block text-[0.72rem] font-medium text-gray-400">${p.price}/mo</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((group) => (
                  <React.Fragment key={group.group}>
                    <tr className="border-t border-gray-200 bg-gray-50/80">
                      <td colSpan={4} className="px-4 py-2 text-[0.72rem] font-bold uppercase tracking-wider text-gray-500">
                        {group.group}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.label} className="border-t border-gray-100">
                        <td className="px-4 py-2.5 text-gray-800">{row.label}</td>
                        {row.tiers.map((has, i) => (
                          <td key={i} className="px-4 py-2.5 text-center">
                            <MatrixMark value={has ? 'yes' : 'no'} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <SectionTitle>Pricing questions, answered straight</SectionTitle>
        <div className="space-y-3">
          {PRICING_FAQS.map((f) => (
            <details key={f.q} className="group rounded-xl border border-gray-200 px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[0.95rem] font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="shrink-0 text-teal-700 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-3 text-[0.9rem] leading-relaxed text-gray-600">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 text-center">
          <PrimaryCta href="/signup">Start your free trial</PrimaryCta>
        </div>
      </section>
    </>
  )
}
