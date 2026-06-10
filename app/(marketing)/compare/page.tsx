import Link from 'next/link'
import { COMPARISONS, COMPARISON_DISCLAIMER } from '@/lib/marketing/comparisons'
import { Eyebrow } from '@/components/marketing/ui'

export const metadata = {
  title: 'Compare DreamCRM to the alternatives',
  description:
    'Honest, page-length comparisons against Weave, NexHealth, RevenueWell, Solutionreach, and Adit — including what each vendor does better than us.',
}

export default function CompareIndexPage() {
  return (
    <>
      <section className="border-b border-gray-100 bg-gradient-to-b from-violet-50/60 to-white">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <Eyebrow>Comparisons</Eyebrow>
          <h1 className="text-[2.2rem] font-extrabold leading-tight tracking-tight sm:text-[2.8rem]">
            Evaluating us against the field? Good.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[1rem] leading-relaxed text-gray-600">
            Every vendor below is genuinely good at something, and each page says exactly what.
            Then it shows where DreamCRM wins, feature by feature, with no asterisks.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          {COMPARISONS.map((c) => (
            <Link
              key={c.slug}
              href={`/compare/${c.slug}`}
              className="group rounded-xl border border-gray-200 p-6 transition-colors hover:border-violet-300"
            >
              <p className="text-[0.8rem] font-semibold text-gray-400">DreamCRM vs</p>
              <h2 className="mt-0.5 text-[1.3rem] font-bold text-gray-950">{c.name}</h2>
              <p className="mt-1 text-[0.85rem] font-medium text-violet-600">{c.category}</p>
              <p className="mt-3 line-clamp-3 text-[0.9rem] leading-relaxed text-gray-600">{c.summary}</p>
              <span className="mt-4 inline-block text-[0.85rem] font-semibold text-violet-600 group-hover:underline">
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
