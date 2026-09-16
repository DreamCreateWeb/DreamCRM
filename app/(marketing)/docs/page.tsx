import Link from 'next/link'
import { docsByCategory, DOCS, DOC_CATEGORY_GLYPH } from '@/lib/marketing/docs'
import {
  PageHero,
  PrimaryCta,
  GhostCta,
  ToneTile,
  ToneDash,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'

/**
 * THE HELP DOCS INDEX — `BRAND.md` Part 8 move 6, page 6 (the second half).
 *
 * THE SHAPE IS THE RESOURCE HUB'S, AND THAT IS THE POINT RATHER THAN A COPY.
 * Page 5 turned a shelf of three equal cards into an INDEX whose rows answer
 * the only question a reader brings to a shelf — *which one has what I need*.
 * This page had the same job and a registry of articles to do it with, in a
 * `md:grid-cols-2` of four bordered boxes: the categories were stacked two
 * across, so the reading order zig-zagged, and every row was a title, a
 * summary and a read time inside a card with a hairline around it.
 *
 * It is four SECTIONS now, one per category, each opening on the group header
 * this move has used since page 5 (the subject's tone tile, a mono label, the
 * real count) and each row hard left on the page's own `max-w-6xl` column.
 *
 * TIER B, AND IT IS THE CLEAREST CASE ON THE SITE. `BRAND.md` Part 3: a tile
 * on the GROUP, a tone dash on each row, where the rows are one kind of thing
 * under a heading that already names the subject. Thirty-one help articles
 * under four category headings is that shape exactly — a tile per article
 * would be the bland-check-mark veto in its fourth costume, and four tiles
 * plus a column of legible lines is what the veto asked for.
 *
 * SECTION CONTAINERS ALL MATCH — the constraint pages 1–5 paid for and handed
 * forward. The old body sat on `max-w-5xl` under a `max-w-6xl` hero, so every
 * row started 64px right of the `h1`. One `max-w-6xl` column throughout; the
 * reading measure is held by narrowing the TEXT (the summary column) rather
 * than the container.
 *
 * NOTHING BELOW THE HERO CARRIES A DECORATIVE LAYER — pages 1–5's answer, for
 * pages 1–5's reason. Every run in this body rides the page's own white at its
 * flat ratio; only the three hero runs needed measuring, and they are in
 * `BRAND.md` Part 7, "The docs and the changelog, measured".
 *
 * EVERY COUNT IS COMPUTED, in the header and in all four group headers. A
 * number written into prose goes stale silently — the move-3 census did it
 * twice.
 *
 * NO EMOJI. Part 5's animated set marks a MOMENT and a reader looking for a
 * help article has not had one; the body-copy clause is about plain unicode
 * where a NAMED HUMAN writes, and a help doc is the house voice. Sixth page in
 * a row, and Part 5's table is untouched.
 */

export const metadata = {
  title: 'Help docs — DreamCRM',
  alternates: { canonical: '/docs' },
  description:
    'Setup guides and how-tos for every part of DreamCRM: website, booking, patient portal, reviews, recall, shop, and the PMS sync.',
}

const pad = (n: number) => String(n).padStart(2, '0')

export default function DocsIndexPage() {
  const groups = docsByCategory()
  const total = DOCS.length

  return (
    <>
      <PageHero
        eyebrow="Help docs"
        title="Everything, explained in front-desk language"
        sub="Short, honest guides — most under five minutes. The product also explains itself the first time you open each page."
      >
        {/* The hero's spine: what is actually behind this page, in mono.
            The home hero's trust row arriving on an index. */}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600 ${MONO_LABEL}`}>
          <span>
            <span aria-hidden="true">{pad(total)}</span>
            <span className="sr-only">{total}</span> articles
          </span>
          <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
          <span>
            <span aria-hidden="true">{pad(groups.length)}</span>
            <span className="sr-only">{groups.length}</span> categories
          </span>
          <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
          <span>No login needed</span>
        </div>
      </PageHero>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        {groups.map((group) => (
          <div key={group.category} className="mt-12 first:mt-0">
            {/* ── THE GROUP HEADER — page 5's shelf header, which is the
                   product tour's spec-header idiom: the subject's tile, a
                   mono label, a `DAY_WIRE` hairline, the real count. ── */}
            <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: DAY_WIRE }}>
              <ToneTile glyph={DOC_CATEGORY_GLYPH[group.category]} size="md" />
              <h2 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>{group.category}</h2>
              <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
                <span aria-hidden="true">{pad(group.articles.length)}</span>
                <span className="sr-only">{group.articles.length} articles</span>
              </p>
            </div>

            <ul>
              {group.articles.map((a) => (
                <li key={a.slug} className="border-b" style={{ borderColor: DAY_WIRE }}>
                  {/* ONE LINK PER ROW, covering the whole row. A second
                      "Read →" pointing at the same href is a second tab stop
                      that goes exactly where the first one does (page 5). */}
                  <Link
                    href={`/docs/${a.slug}`}
                    className="group mkt-nudge-host block py-5 lg:grid lg:grid-cols-12 lg:gap-x-10"
                  >
                    <div className="flex items-start gap-2.5 lg:col-span-5">
                      <ToneDash glyph={DOC_CATEGORY_GLYPH[group.category]} className="mt-[0.72em]" />
                      <h3 className="text-[1.05rem] font-semibold leading-snug tracking-[-0.01em] text-gray-950 group-hover:text-teal-700">
                        {a.title}
                        <span className="mkt-nudge ml-2 inline-block text-teal-700" aria-hidden="true">
                          →
                        </span>
                      </h3>
                    </div>
                    <div className="mt-1.5 pl-[1.3rem] lg:col-span-7 lg:mt-0 lg:pl-0">
                      <p className="max-w-2xl text-[0.92rem] leading-relaxed text-gray-600">
                        {a.summary}
                      </p>
                      <p className={`mt-2 text-gray-500 ${MONO_LABEL}`}>{a.minutes} min read</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* ── THE CLOSE — the page's bookend ────────────────────────────────
             The 36px gradient rule that opened the page under the eyebrow,
             closing it. The shape pages 1, 3, 4 and 5 close on, and
             deliberately not the old centred `gray-50` panel — a centred
             block under a hard-left hero is the drift move 6 exists to
             close. The "a person answers" promise is the honest part and it
             keeps its own line. ── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            Can&apos;t find it?
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            Email us and a person answers
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            Not a ticket queue and not a bot —{' '}
            <a
              href="mailto:hello@dreamcreatestudio.com"
              className="font-semibold text-teal-700 hover:underline"
            >
              hello@dreamcreatestudio.com
            </a>
            . If the answer should have been in here, we write the doc too.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start free — 7 days</PrimaryCta>
            <GhostCta href="/product">See what DreamCRM does</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
