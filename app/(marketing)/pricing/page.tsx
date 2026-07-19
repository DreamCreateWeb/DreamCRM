import React from 'react'
import { SectionTitle, PrimaryCta, CheckIcon, PageHero } from '@/components/marketing/ui'
import { JsonLd, faqPageLd, softwareApplicationLd } from '@/lib/marketing/seo'
import { PriceCard } from './price-card'

export const metadata = {
  title: 'Pricing — DreamCRM',
  alternates: { canonical: '/pricing' },
  description:
    'One plan, everything included: $200/mo founding practice rate (regularly $500). Website, booking, portal, messaging, reviews, recall, shop, PMS sync. Month-to-month, no contract — or annual with 2 months free.',
}

/**
 * The single-plan feature list — mirrors the real module surface of the
 * product. One column, everything included: the tier matrix retired
 * 2026-07-19 when pricing collapsed to the founding practice rate.
 */
const INCLUDED: Array<{ group: string; rows: string[] }> = [
  {
    group: 'Website & brand',
    rows: [
      'Practice website on your address',
      'Edit-in-place Website Studio',
      'AI copy assistant (monthly allowance)',
      'Contact + insurance-check lead capture',
      'SEO foundations (sitemap, schema, social cards)',
      'Blog + AI-drafted posts',
      'SEO dashboard (Google Search Console data)',
      'Careers page + applicant tracking',
    ],
  },
  {
    group: 'Front office',
    rows: [
      'Patient records with action flags',
      'Appointments agenda + reminders',
      'Online booking from live availability',
      'Website leads triage queue',
      'Unified patient messages',
      'Connected Gmail inbox',
      'Digital intake forms',
    ],
  },
  {
    group: 'Patient experience',
    rows: [
      'Clinic-branded patient portal',
      'Self-serve reschedule & cancel',
      'Family access (one login per household)',
      'Review collection + website testimonials',
      'Google reviews sync + reply',
    ],
  },
  {
    group: 'Growth & integrations',
    rows: [
      'Recall & outreach campaigns',
      'Google Business sync + social posting',
      'Practice analytics',
      'Online shop + membership plans',
      'Online balance payments (via Stripe Connect)',
      'Open Dental two-way sync (official API)',
    ],
  },
]

const PRICING_FAQS: Array<{ q: string; a: string }> = [
  {
    q: 'Do I have to pay to try it?',
    a: 'No. Every practice starts with a 7-day free trial of everything — website, booking, portal, messaging, reviews, marketing, all of it — with no credit card required. You add billing only when you decide to stay.',
  },
  {
    q: 'Is there a contract or setup fee?',
    a: 'No. It’s month-to-month with no setup fee, and you can cancel anytime — your website content exports with you. Prefer annual? Pay for 10 months, get 12: $2,000/year.',
  },
  {
    q: 'Why is the price $200 instead of $500?',
    a: 'We’re building our founding group of practices, and their feedback shapes what we build next. Founding practices get the whole platform at $200/mo, and the rate stays locked for as long as you’re a subscriber — new modules land on the same price.',
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
    a: 'Connecting your Google Business profile is free and never counts against a limit. For social platforms (Instagram, Facebook, TikTok, YouTube, LinkedIn), two connected accounts are included; if you want more, there’s a flat $20/mo add-on for up to five. It’s published here, same as everything else.',
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
      <JsonLd data={softwareApplicationLd([{ name: 'DreamCRM', price: 200 }])} />
      <PageHero
        eyebrow="Pricing"
        title="One plan. The whole platform."
        sub="No tiers, no discovery calls, no per-feature add-ons. Everything DreamCRM does, one published price."
      />

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <PriceCard />
        <p className="mx-auto mt-6 max-w-xl text-center text-[0.85rem] text-gray-500">
          Everything below is live in the product today. New modules ship
          regularly — and land on your plan at no extra cost.
        </p>
      </section>

      <section className="border-t border-gray-100 bg-gray-50/70">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <SectionTitle sub="The product's real module list, mirrored one-to-one — nothing hidden behind a sales call, nothing gated behind a bigger plan.">
            Everything included
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {INCLUDED.map((group) => (
              <div key={group.group} className="rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="text-[0.78rem] font-bold uppercase tracking-wider text-gray-500">
                  {group.group}
                </h3>
                <ul className="mt-3 space-y-2.5">
                  {group.rows.map((row) => (
                    <li key={row} className="flex items-start gap-2.5 text-[0.875rem] leading-snug text-gray-700">
                      <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" />
                      {row}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
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
