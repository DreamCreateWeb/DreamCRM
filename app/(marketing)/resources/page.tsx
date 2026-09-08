import Link from 'next/link'
import { RESOURCE_GUIDES } from '@/lib/marketing/resources'
import { PageHero } from '@/components/marketing/ui'
import { JsonLd, SITE_URL } from '@/lib/marketing/seo'

export const metadata = {
  title: 'Practice growth library — free guides for dental practices',
  alternates: { canonical: '/resources' },
  description:
    'Free, copy-ready guides for growing a dental practice: recall scripts that get patients back, membership plan pricing math, and the patient-growth playbook in the right order.',
}

export default function ResourcesIndexPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Practice growth library',
          itemListElement: RESOURCE_GUIDES.map((g, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: g.title,
            url: `${SITE_URL}/resources/${g.slug}`,
          })),
        }}
      />
      <PageHero
        eyebrow="Practice growth library"
        title="Free guides, real scripts, honest math."
        sub="Everything here is copy-ready and works whether or not you ever use DreamCRM — the scripts are the ones our own platform sends, and the math is the math."
      />

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <div className="grid gap-4 md:grid-cols-3">
          {RESOURCE_GUIDES.map((g) => (
            <Link
              key={g.slug}
              href={`/resources/${g.slug}`}
              className="group flex flex-col rounded-xl border border-gray-200 p-6 transition-colors hover:border-teal-300"
            >
              <h2 className="text-[1.05rem] font-bold leading-snug text-gray-950">{g.title}</h2>
              <p className="mt-3 flex-1 text-[0.88rem] leading-relaxed text-gray-600">{g.description}</p>
              <span className="mt-4 text-[0.8rem] font-medium text-gray-400">{g.readMinutes}-minute read</span>
              <span className="mt-2 inline-block text-[0.85rem] font-semibold text-teal-700 group-hover:underline">
                Read the guide →
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-teal-200 bg-teal-50/50 p-6 text-center">
          <h2 className="text-[1.15rem] font-bold tracking-tight">Start with the free grade</h2>
          <p className="mx-auto mt-2 max-w-xl text-[0.9rem] leading-relaxed text-gray-700">
            Before reading anything: see where your practice actually stands. The grader checks
            your website, your Google listing, your reviews, and your search rank — free,
            instant, yours to keep.
          </p>
          <Link
            href="/grade"
            className="mt-4 inline-block rounded-lg bg-teal-600 px-6 py-2.5 text-[0.9rem] font-semibold text-white transition-colors hover:bg-teal-700"
          >
            Grade your practice free
          </Link>
        </div>
      </section>
    </>
  )
}
