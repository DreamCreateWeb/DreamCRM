import Link from 'next/link'
import { PageHero, MONO_LABEL, DAY_WIRE } from '@/components/marketing/ui'
import { JsonLd, breadcrumbLd } from '@/lib/marketing/seo'
import { LEGAL_DOCS, formatLegalDate, type LegalDoc } from '@/lib/marketing/legal'

/**
 * A LEGAL DOCUMENT — the Privacy Policy and the Terms of Service.
 *
 * It wears the help article's clothes on purpose (`docs/[slug]/page.tsx`):
 * `PageHero`, the mono spine row, the `DAY_WIRE` hairline above each heading,
 * the same measure and the same body ink. A policy is the page a careful
 * buyer reads most slowly, so it gets the site's most readable layout and
 * nothing decorative — no tiles, no call-to-action band, no product mock.
 *
 * The words are not here. They are DATA in `lib/marketing/legal.ts`, where
 * every figure they quote is resolved rather than typed.
 */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const others = LEGAL_DOCS.filter((d) => d.path !== doc.path)
  return (
    <>
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', path: '/' },
          { name: doc.title, path: doc.path },
        ])}
      />

      <PageHero eyebrow="Legal" title={doc.title} sub={doc.summary}>
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600 ${MONO_LABEL}`}>
          <span>Last updated {formatLegalDate(doc.updated)}</span>
          {others.map((o) => (
            <span key={o.path} className="flex items-center gap-3">
              <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
              <Link href={o.path} className="text-teal-700 hover:underline">
                {o.title}
              </Link>
            </span>
          ))}
        </div>
      </PageHero>

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-2 sm:px-6 lg:pb-20">
        <article className="max-w-2xl">
          {doc.sections.map((section, i) => (
            <section key={section.id} aria-labelledby={section.id}>
              <h2
                id={section.id}
                className={`scroll-mt-24 text-[1.45rem] font-bold leading-snug tracking-[-0.02em] text-gray-950 sm:text-[1.6rem] ${
                  i === 0 ? 'mt-2' : 'mt-12 border-t pt-8'
                }`}
                style={i === 0 ? undefined : { borderColor: DAY_WIRE }}
              >
                {section.heading}
              </h2>
              {section.paragraphs?.map((p, j) => (
                <p key={j} className="mt-4 text-[1rem] leading-relaxed text-gray-700">
                  {p}
                </p>
              ))}
              {section.bullets && (
                <ul className="mt-4 list-disc space-y-2.5 pl-5 text-[1rem] leading-relaxed text-gray-700">
                  {section.bullets.map((b, j) => (
                    <li key={j}>{b}</li>
                  ))}
                </ul>
              )}
              {section.after?.map((p, j) => (
                <p key={j} className="mt-4 text-[1rem] leading-relaxed text-gray-700">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </>
  )
}
