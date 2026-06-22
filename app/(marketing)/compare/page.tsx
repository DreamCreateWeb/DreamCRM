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
    </>
  )
}
