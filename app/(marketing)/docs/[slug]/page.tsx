import { notFound } from 'next/navigation'
import Link from 'next/link'
import { DOCS, getDoc } from '@/lib/marketing/docs'
import { JsonLd, breadcrumbLd } from '@/lib/marketing/seo'

interface Props {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const doc = getDoc(slug)
  if (!doc) return {}
  return {
    title: `${doc.title} — DreamCRM docs`,
    description: doc.summary,
    alternates: { canonical: `/docs/${slug}` },
  }
}

export default async function DocArticlePage({ params }: Props) {
  const { slug } = await params
  const doc = getDoc(slug)
  if (!doc) notFound()

  const related = DOCS.filter((d) => d.category === doc.category && d.slug !== doc.slug).slice(0, 3)

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: 'Docs', path: '/docs' },
          { name: doc.title, path: `/docs/${doc.slug}` },
        ])}
      />
      <nav className="text-[0.82rem] text-gray-500" aria-label="Breadcrumb">
        <Link href="/docs" className="font-medium text-teal-700 hover:underline">
          Docs
        </Link>{' '}
        / {doc.category}
      </nav>
      <h1 className="mt-3 text-[1.9rem] font-extrabold leading-tight tracking-tight sm:text-[2.3rem]">
        {doc.title}
      </h1>
      <p className="mt-2 text-[0.95rem] text-gray-600">{doc.summary}</p>
      <p className="mt-1 text-[0.78rem] font-medium text-gray-400">{doc.minutes} min read</p>

      <div className="mt-8 space-y-8">
        {doc.sections.map((section, i) => (
          <section key={i}>
            {section.heading && (
              <h2 className="mb-3 text-[1.2rem] font-bold tracking-tight">{section.heading}</h2>
            )}
            {section.paragraphs?.map((p, j) => (
              <p key={j} className="mb-3 text-[0.95rem] leading-relaxed text-gray-700">
                {p}
              </p>
            ))}
            {section.steps && (
              <ol className="space-y-3">
                {section.steps.map((step, j) => (
                  <li key={j} className="flex gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-[0.78rem] font-bold text-teal-700">
                      {j + 1}
                    </span>
                    <span className="text-[0.95rem] leading-relaxed text-gray-700">{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>

      {related.length > 0 && (
        <aside className="mt-12 rounded-xl border border-gray-200 bg-gray-50/70 p-5">
          <p className="text-[0.78rem] font-bold uppercase tracking-wider text-gray-400">
            More in {doc.category}
          </p>
          <ul className="mt-3 space-y-2">
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={`/docs/${r.slug}`} className="text-[0.9rem] font-semibold text-teal-700 hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}

      <div className="mt-10 flex items-center justify-between border-t border-gray-100 pt-6 text-[0.88rem]">
        <Link href="/docs" className="font-semibold text-teal-700 hover:underline">
          ← All docs
        </Link>
        <Link href="/signup" className="font-semibold text-teal-700 hover:underline">
          Start your free trial →
        </Link>
      </div>
    </article>
  )
}
