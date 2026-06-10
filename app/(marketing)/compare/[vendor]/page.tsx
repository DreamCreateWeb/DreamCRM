import { notFound } from 'next/navigation'
import Link from 'next/link'
import { COMPARISONS, COMPARISON_DISCLAIMER, getComparison } from '@/lib/marketing/comparisons'
import { Eyebrow, PrimaryCta, GhostCta, MatrixMark, CheckIcon } from '@/components/marketing/ui'
import { DEMO_URL } from '@/lib/marketing/site'

interface Props {
  params: Promise<{ vendor: string }>
}

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ vendor: c.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { vendor } = await params
  const c = getComparison(vendor)
  if (!c) return {}
  return {
    title: `DreamCRM vs ${c.name} — an honest comparison`,
    description: c.summary.slice(0, 155),
  }
}

export default async function ComparePage({ params }: Props) {
  const { vendor } = await params
  const c = getComparison(vendor)
  if (!c) notFound()

  return (
    <>
      <section className="border-b border-gray-100 bg-gradient-to-b from-violet-50/60 to-white">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <Eyebrow>Comparison</Eyebrow>
          <h1 className="text-[2.1rem] font-extrabold leading-tight tracking-tight sm:text-[2.7rem]">
            DreamCRM vs {c.name}
          </h1>
          <p className="mt-2 text-[0.95rem] font-medium text-violet-700">{c.category}</p>
          <p className="mt-5 text-[0.98rem] leading-relaxed text-gray-700">{c.summary}</p>
          <p className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-[0.82rem] text-gray-500">
            <span className="font-semibold text-gray-700">Reported pricing:</span> {c.reportedPricing}.
            DreamCRM: $99–199/mo published, month-to-month.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 className="text-[1.2rem] font-bold tracking-tight">Where {c.name} shines</h2>
            <p className="mt-1 text-[0.82rem] text-gray-500">
              Real strengths — if these are your deciding factors, weigh them seriously.
            </p>
            <ul className="mt-5 space-y-4">
              {c.theirStrengths.map((s) => (
                <li key={s.title} className="rounded-xl border border-gray-200 p-4">
                  <p className="text-[0.92rem] font-bold text-gray-900">{s.title}</p>
                  <p className="mt-1 text-[0.85rem] leading-relaxed text-gray-600">{s.body}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-[1.2rem] font-bold tracking-tight text-violet-700">Where DreamCRM wins</h2>
            <p className="mt-1 text-[0.82rem] text-gray-500">Every claim verifiable in the product today.</p>
            <ul className="mt-5 space-y-4">
              {c.ourStrengths.map((s) => (
                <li key={s.title} className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                  <p className="flex items-center gap-2 text-[0.92rem] font-bold text-gray-900">
                    <CheckIcon className="h-4 w-4 text-violet-600" />
                    {s.title}
                  </p>
                  <p className="mt-1 text-[0.85rem] leading-relaxed text-gray-700">{s.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-t border-gray-100 bg-gray-50/70">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <h2 className="mb-6 text-center text-[1.4rem] font-bold tracking-tight">
            Feature by feature
          </h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[42rem] text-[0.875rem]">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-500">Capability</th>
                  <th className="w-44 px-4 py-3 text-center font-bold text-violet-700">DreamCRM</th>
                  <th className="w-44 px-4 py-3 text-center font-bold text-gray-950">{c.name}</th>
                </tr>
              </thead>
              <tbody>
                {c.matrix.map((row) => (
                  <tr key={row.feature} className="border-t border-gray-100 align-top">
                    <td className="px-4 py-3 font-medium text-gray-800">{row.feature}</td>
                    <td className="px-4 py-3 text-center">
                      <MatrixMark value={row.dreamcrm} />
                      {row.dreamcrmNote && (
                        <p className="mt-1 text-[0.72rem] leading-snug text-gray-500">{row.dreamcrmNote}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <MatrixMark value={row.vendor} />
                      {row.vendorNote && (
                        <p className="mt-1 text-[0.72rem] leading-snug text-gray-500">{row.vendorNote}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-center text-[0.78rem] leading-relaxed text-gray-400">{COMPARISON_DISCLAIMER}</p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
        <h2 className="text-[1.5rem] font-bold tracking-tight">The bottom line</h2>
        <p className="mx-auto mt-4 max-w-2xl text-[0.98rem] leading-relaxed text-gray-700">{c.bottomLine}</p>

        <div className="mt-8 grid gap-3 text-left sm:grid-cols-2">
          <div className="rounded-xl border border-gray-200 p-5">
            <p className="text-[0.78rem] font-bold uppercase tracking-wider text-gray-400">
              Choose {c.name} if
            </p>
            <ul className="mt-3 space-y-2">
              {c.theirStrengths.map((s) => (
                <li key={s.title} className="flex items-start gap-2 text-[0.88rem] text-gray-700">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" aria-hidden="true" />
                  {s.title} matters most to you
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-5">
            <p className="text-[0.78rem] font-bold uppercase tracking-wider text-violet-600">
              Choose DreamCRM if
            </p>
            <ul className="mt-3 space-y-2">
              {c.ourStrengths.slice(0, 3).map((s) => (
                <li key={s.title} className="flex items-start gap-2 text-[0.88rem] text-gray-800">
                  <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600" />
                  {s.title.toLowerCase().replace(/^./, (ch) => ch.toUpperCase())} is what you&apos;re missing
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <PrimaryCta href="/signup">Start free setup</PrimaryCta>
          <GhostCta href={DEMO_URL} external>
            Browse the demo practice ↗
          </GhostCta>
        </div>
        <p className="mt-8 text-[0.85rem] text-gray-500">
          Comparing someone else?{' '}
          <Link href="/compare" className="font-semibold text-violet-600 hover:underline">
            All comparisons →
          </Link>
        </p>
      </section>
    </>
  )
}
