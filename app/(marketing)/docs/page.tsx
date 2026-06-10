import Link from 'next/link'
import { docsByCategory } from '@/lib/marketing/docs'
import { Eyebrow } from '@/components/marketing/ui'

export const metadata = {
  title: 'Help docs — DreamCRM',
  description:
    'Setup guides and how-tos for every part of DreamCRM: website, booking, patient portal, reviews, recall, shop, and the Open Dental sync.',
}

export default function DocsIndexPage() {
  const groups = docsByCategory()
  return (
    <>
      <section className="border-b border-gray-100 bg-gradient-to-b from-violet-50/60 to-white">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
          <Eyebrow>Help docs</Eyebrow>
          <h1 className="text-[2.1rem] font-extrabold leading-tight tracking-tight sm:text-[2.6rem]">
            Everything, explained in front-desk language
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[0.98rem] leading-relaxed text-gray-600">
            Short, honest guides — most under five minutes. The product also explains itself the
            first time you open each page.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-2">
          {groups.map((group) => (
            <div key={group.category}>
              <h2 className="text-[0.8rem] font-bold uppercase tracking-wider text-gray-400">
                {group.category}
              </h2>
              <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
                {group.articles.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/docs/${a.slug}`} className="group block px-4 py-3.5 hover:bg-gray-50">
                      <p className="flex items-baseline justify-between gap-3">
                        <span className="text-[0.95rem] font-semibold text-gray-900 group-hover:text-violet-700">
                          {a.title}
                        </span>
                        <span className="shrink-0 text-[0.72rem] font-medium text-gray-400">
                          {a.minutes} min
                        </span>
                      </p>
                      <p className="mt-0.5 text-[0.82rem] leading-snug text-gray-500">{a.summary}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-12 rounded-xl border border-gray-200 bg-gray-50/70 px-5 py-4 text-center text-[0.88rem] text-gray-600">
          Can&apos;t find it? Email{' '}
          <a href="mailto:hello@dreamcreatestudio.com" className="font-semibold text-violet-600 hover:underline">
            hello@dreamcreatestudio.com
          </a>{' '}
          — a person answers.
        </p>
      </section>
    </>
  )
}
