import Link from 'next/link'
import {
  CHANGELOG_ENTRIES,
  CHANGELOG_KIND_LABELS,
  formatWeekOf,
  type ChangelogItemKind,
} from '@/lib/marketing/changelog'
import { PageHero } from '@/components/marketing/ui'
import { JsonLd, SITE_URL } from '@/lib/marketing/seo'

export const metadata = {
  title: 'Changelog — what’s new in DreamCRM',
  alternates: { canonical: '/changelog' },
  description:
    'Everything that changes in DreamCRM, summarized once a week in plain English: new features, improvements, and fixes across the website, booking, patient portal, messages, and payments.',
}

/** Kind pill. The word carries the meaning; the tone only reinforces it. */
const KIND_TONE: Record<ChangelogItemKind, string> = {
  new: 'border-teal-200 bg-teal-50 text-teal-800',
  improved: 'border-blue-200 bg-blue-50 text-blue-800',
  fixed: 'border-amber-200 bg-amber-50 text-amber-800',
}

function KindPill({ kind }: { kind: ChangelogItemKind }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[0.75rem] font-semibold ${KIND_TONE[kind]}`}
    >
      {CHANGELOG_KIND_LABELS[kind]}
    </span>
  )
}

export default function ChangelogPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'DreamCRM changelog',
          itemListElement: CHANGELOG_ENTRIES.map((entry, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: entry.title,
            url: `${SITE_URL}/changelog#${entry.weekOf}`,
          })),
        }}
      />

      <PageHero
        eyebrow="Changelog"
        title="What’s new in DreamCRM"
        sub="We ship most days and write about it once a week — one entry per week, everything that changed, in the words your front desk would use."
      />

      <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        {CHANGELOG_ENTRIES.map((entry, i) => (
          <article
            key={entry.weekOf}
            id={entry.weekOf}
            aria-labelledby={`heading-${entry.weekOf}`}
            className={`scroll-mt-24 ${i > 0 ? 'mt-14 border-t border-gray-200 pt-14' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Link
                href={`/changelog#${entry.weekOf}`}
                className="text-[0.8rem] font-bold uppercase tracking-wider text-gray-500 hover:text-teal-700"
              >
                <time dateTime={entry.weekOf}>{formatWeekOf(entry.weekOf)}</time>
              </Link>
              {entry.release && (
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[0.75rem] font-semibold text-gray-600">
                  {entry.release} release
                </span>
              )}
            </div>

            <h2
              id={`heading-${entry.weekOf}`}
              className="mt-3 text-[1.5rem] font-bold leading-tight tracking-tight text-gray-950 sm:text-[1.75rem]"
            >
              {entry.title}
            </h2>
            <p className="mt-3 text-[0.98rem] leading-relaxed text-gray-600">{entry.summary}</p>

            <ul className="mt-8 space-y-7">
              {entry.items.map((item) => (
                <li key={item.title}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                    <KindPill kind={item.kind} />
                    <h3 className="text-[1.02rem] font-semibold leading-snug text-gray-950">
                      {item.title}
                    </h3>
                  </div>
                  <p className="mt-2 text-[0.92rem] leading-relaxed text-gray-600">{item.body}</p>
                </li>
              ))}
            </ul>
          </article>
        ))}

        <p className="mt-14 rounded-xl border border-gray-200 bg-gray-50/70 px-5 py-4 text-center text-[0.88rem] leading-relaxed text-gray-600">
          Something here you want to talk through? Email{' '}
          <a
            href="mailto:hello@dreamcreatestudio.com"
            className="font-semibold text-teal-700 hover:underline"
          >
            hello@dreamcreatestudio.com
          </a>{' '}
          — a person answers. New here?{' '}
          <Link href="/product" className="font-semibold text-teal-700 hover:underline">
            See what DreamCRM does
          </Link>
          .
        </p>
      </section>
    </>
  )
}
