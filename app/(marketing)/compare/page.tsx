import Link from 'next/link'
import { COMPARISONS, COMPARISON_DISCLAIMER } from '@/lib/marketing/comparisons'
import { PageHero } from '@/components/marketing/ui'

export const metadata = {
  title: 'Compare DreamCRM to the alternatives',
  alternates: { canonical: '/compare' },
  description:
    'Honest, page-length comparisons against Weave, NexHealth, RevenueWell, Solutionreach, and Adit — including what each vendor does better than us.',
}

export default function CompareIndexPage() {
  return (
    <>
      <PageHero
        eyebrow="Comparisons"
        title="Evaluating us against the field? Good."
        sub="Every vendor below is genuinely good at something, and each page says exactly what. Then it shows where DreamCRM wins, feature by feature, with no asterisks."
      />

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          {COMPARISONS.map((c) => (
            <Link
              key={c.slug}
              href={`/compare/${c.slug}`}
              className="group rounded-xl border border-gray-200 p-6 transition-colors hover:border-teal-300"
            >
              <p className="text-[0.8rem] font-semibold text-gray-400">DreamCRM vs</p>
              <h2 className="mt-0.5 text-[1.3rem] font-bold text-gray-950">{c.name}</h2>
              <p className="mt-1 text-[0.85rem] font-medium text-teal-700">{c.category}</p>
              <p className="mt-3 line-clamp-3 text-[0.9rem] leading-relaxed text-gray-600">{c.summary}</p>
              <span className="mt-4 inline-block text-[0.85rem] font-semibold text-teal-700 group-hover:underline">
                Read the full comparison →
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-10 text-center text-[0.78rem] leading-relaxed text-gray-400">{COMPARISON_DISCLAIMER}</p>
      </section>

      {/* ── The consolidation math (moved here from the homepage 2026-07-19 —
             this is the down-funnel home for the savings argument) ── */}
      <section className="border-t border-gray-100 bg-gray-50/70">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-[1.6rem] font-bold leading-tight tracking-tight sm:text-[1.9rem]">
                The math, if you&apos;re counting
              </h2>
              <p className="mt-4 text-[0.95rem] leading-relaxed text-gray-600">
                A typical practice spends $800–$2,000 a month across patient-facing
                tools that don&apos;t talk to each other. DreamCRM does the same jobs
                as one product — so a website lead becomes a patient, the patient
                gets a portal, and the visit triggers a review request with nobody
                copying data between tabs.
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
              <table className="w-full text-[0.875rem]">
                <thead>
                  <tr className="text-left text-[0.72rem] font-bold uppercase tracking-wider text-gray-400">
                    <th className="px-3 py-2">Replaces</th>
                    <th className="px-3 py-2 text-right">Typical spend</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Website agency retainer', '$150–500/mo'],
                    ['Online booking vendor', '$200–350/mo'],
                    ['Patient communications suite', '$250–400/mo'],
                    ['Review management tool', '$100–300/mo'],
                    ['Recall / reactivation service', '$150–300/mo'],
                    ['Job board listings', '$100–400/mo'],
                  ].map(([tool, price]) => (
                    <tr key={tool} className="border-t border-gray-100">
                      <td className="px-3 py-2.5 font-medium text-gray-800">{tool}</td>
                      <td className="px-3 py-2.5 text-right text-gray-400 line-through">{price}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-teal-200 bg-teal-50/60">
                    <td className="px-3 py-3 font-bold text-gray-950">DreamCRM — all of it</td>
                    <td className="px-3 py-3 text-right font-bold text-teal-700">$200/mo</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
