import Link from 'next/link'
import type { ReactNode } from 'react'
import { Eyebrow, PrimaryCta, GhostCta } from '@/components/marketing/ui'
import { JsonLd, articleLd, breadcrumbLd } from '@/lib/marketing/seo'
import type { ResourceGuide } from '@/lib/marketing/resources'

/**
 * Shared shell for the practice-growth guides (slice 4b): hero + article
 * column + Article/Breadcrumb JSON-LD + the one CTA block. Content pages
 * stay bespoke TSX; this keeps the chrome and schema uniform.
 */

export function GuideShell({ guide, children }: { guide: ResourceGuide; children: ReactNode }) {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Resources', path: '/resources' },
            { name: guide.title, path: `/resources/${guide.slug}` },
          ]),
          articleLd({
            title: guide.title,
            description: guide.description,
            path: `/resources/${guide.slug}`,
            datePublished: guide.datePublished,
          }),
        ]}
      />
      <section className="border-b border-gray-100 bg-gradient-to-b from-teal-50/60 to-white">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <div className="mkt-enter"><Eyebrow>Practice growth library</Eyebrow></div>
          <h1 className="mkt-enter mkt-d1 text-[1.9rem] font-extrabold leading-tight tracking-tight sm:text-[2.4rem]">
            {guide.title}
          </h1>
          <p className="mkt-enter mkt-d2 mt-4 text-[0.98rem] leading-relaxed text-gray-700">{guide.description}</p>
          <p className="mt-4 text-[0.8rem] font-medium text-gray-400">
            {guide.readMinutes}-minute read · free to copy and use in your practice
          </p>
        </div>
      </section>

      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">{children}</article>

      <section className="border-t border-gray-100 bg-gray-50/70">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
          <h2 className="text-[1.4rem] font-bold tracking-tight">Want this to run itself?</h2>
          <p className="mx-auto mt-3 max-w-xl text-[0.95rem] leading-relaxed text-gray-600">
            Everything in this guide is a job DreamCRM does automatically — recall asks that send
            themselves, a website that books 24/7, reviews that grow on their own. $200/mo, no card
            to try it.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <PrimaryCta href="/signup">Start free — 7 days</PrimaryCta>
            <GhostCta href="/grade">Grade your practice free</GhostCta>
          </div>
          <p className="mt-6 text-[0.85rem] text-gray-500">
            <Link href="/resources" className="font-semibold text-teal-700 hover:underline">
              ← All growth guides
            </Link>
          </p>
        </div>
      </section>
    </>
  )
}

export function GuideH2({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="mt-10 text-[1.35rem] font-bold tracking-tight text-gray-950 first:mt-0">
      {children}
    </h2>
  )
}

export function GuideP({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-[0.95rem] leading-relaxed text-gray-700">{children}</p>
}

export function GuideList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[0.95rem] leading-relaxed text-gray-700">
          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

/** A copy-ready script/template block — the guide's original material. */
export function ScriptCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="mt-5 overflow-hidden rounded-xl border border-teal-200 bg-teal-50/40">
      <figcaption className="border-b border-teal-100 bg-white px-4 py-2 text-[0.72rem] font-bold uppercase tracking-wider text-teal-700">
        {label}
      </figcaption>
      <blockquote className="whitespace-pre-line px-4 py-4 text-[0.92rem] leading-relaxed text-gray-800">
        {children}
      </blockquote>
    </figure>
  )
}

/** A "watch out" note — honest caveats stay visible, not in a footnote. */
export function GuideNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-[0.88rem] leading-relaxed text-gray-700">
      {children}
    </p>
  )
}
