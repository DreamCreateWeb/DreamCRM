import Link from 'next/link'
import {
  CHANGELOG_ENTRIES,
  CHANGELOG_KIND_LABELS,
  formatWeekOf,
  type ChangelogItemKind,
} from '@/lib/marketing/changelog'
import { MarketingEmoji } from '@/components/marketing/emoji'
import {
  PageHero,
  PrimaryCta,
  GhostCta,
  ToneTile,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'
import { JsonLd, SITE_URL } from '@/lib/marketing/seo'

export const metadata = {
  title: 'Changelog — what’s new in DreamCRM',
  alternates: { canonical: '/changelog' },
  description:
    'Everything that changes in DreamCRM, summarized once a week in plain English: new features, improvements, and fixes across the website, booking, patient portal, messages, and payments.',
}

/**
 * THE CHANGELOG — `BRAND.md` Part 8 move 6, page 6 (the content routes).
 *
 * THE CADENCE IS UNTOUCHED AND THAT IS THE FIRST THING TO SAY. Entries are
 * batched WEEKLY, one longer entry per week — the owner's directive, and
 * `lib/marketing/changelog.ts` enforces the habit in its registry shape. This
 * move restyles the page; it does not split an entry, merge one, reorder one,
 * or add one. `tests/marketing/changelog.test.tsx` holds all of that.
 *
 * THE MOVE IS THE KIND PILLS, AND IT IS A REAL BRAND FIX RATHER THAN A
 * RESTYLE. They were three `rounded-full` chips carrying the meaning in
 * colour: `teal` for New, `blue` for Improved, `amber` for Fixed. Two of
 * those three are wrong under `BRAND.md` Part 2 — **`teal` is the BRAND ramp
 * and "the brand hue is never a status"**, and **`blue` is not in the tone
 * registry at all**. On a page a visitor SCANS, that makes the brand colour
 * mean "New", which is exactly the dilution Part 2's rule exists to stop.
 * Part 3 also reserves `999px` for eyebrow badges and status chips, and a
 * changelog kind is neither.
 *
 * The old file's own comment was the argument for the fix: *"The word carries
 * the meaning; the tone only reinforces it."* If the word carries it, the
 * colour is spending the brand ramp on nothing. So the kind is a mono
 * micro-label now (Part 4's signature detail), and **the colour moved to the
 * SUBJECT** — a tone tile per item, from the registry every other marketing
 * list on this site uses. It says "booking" or "payments" or "your website",
 * which is the thing a reader skimming a week actually wants, and it cannot
 * mean a status because the registry has no statuses in it.
 *
 * TIER A (Part 3): a tile per LINE, because every item in a week is a
 * different KIND of thing. `ChangelogItem.glyph` is REQUIRED, which is page
 * 5's `RESOURCE_GUIDES.glyph` call — a new entry cannot compile until
 * somebody decides what it touched.
 *
 * THE ROCKET STAYS, on the newest week only. Part 5 gives it exactly that
 * use, it is labelled rather than decorative because it carries meaning the
 * copy does not (which of these is live right now), and it moves down the
 * page every time a week is added. It is the only emoji on this route.
 *
 * SECTION CONTAINERS ALL MATCH — the constraint pages 1–5 paid for. The body
 * sat on `max-w-3xl` under a `max-w-6xl` hero, so every entry started 192px
 * right of the `h1` at 1440. One `max-w-6xl` column now; the reading measure
 * is held by narrowing the TEXT.
 *
 * NOTHING BELOW THE HERO CARRIES A DECORATIVE LAYER — pages 1–5's answer.
 * Measured run: `BRAND.md` Part 7, "The content routes, measured".
 */

/** The kind, as a word. `BRAND.md` Part 4's mono micro-label, one ink. */
function KindLabel({ kind }: { kind: ChangelogItemKind }) {
  return (
    <span className={`shrink-0 text-gray-500 ${MONO_LABEL}`}>{CHANGELOG_KIND_LABELS[kind]}</span>
  )
}

export default function ChangelogPage() {
  const weeks = String(CHANGELOG_ENTRIES.length).padStart(2, '0')

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

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        {/* The group header pages 5's shelf opens on: a mono label, a
            `DAY_WIRE` hairline, the real count as a mono numeral. The count is
            COMPUTED — a number typed in prose about a countable fact in the
            tree is the shape that went stale twice in move 3. */}
        <div className="flex items-center gap-3 border-b pb-3" style={{ borderColor: DAY_WIRE }}>
          <h2 className={`min-w-0 text-gray-950 ${MONO_LABEL}`}>Every week, in order</h2>
          <p className={`ml-auto shrink-0 text-gray-500 ${MONO_LABEL}`}>
            <span aria-hidden="true">{weeks}</span>
            <span className="sr-only">
              {CHANGELOG_ENTRIES.length} week{CHANGELOG_ENTRIES.length === 1 ? '' : 's'}
            </span>
          </p>
        </div>

        {CHANGELOG_ENTRIES.map((entry, i) => (
          <article
            key={entry.weekOf}
            id={entry.weekOf}
            aria-labelledby={`heading-${entry.weekOf}`}
            className={`scroll-mt-24 ${i > 0 ? 'mt-14 border-t pt-14' : 'pt-10'}`}
            style={i > 0 ? { borderColor: DAY_WIRE } : undefined}
          >
            <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-500 ${MONO_LABEL}`}>
              <Link
                href={`/changelog#${entry.weekOf}`}
                className="rounded-sm hover:text-teal-700 hover:underline"
              >
                <time dateTime={entry.weekOf}>{formatWeekOf(entry.weekOf)}</time>
              </Link>
              {entry.release && (
                <>
                  <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
                  <span>{entry.release} release</span>
                </>
              )}
              {/* The rocket marks the CURRENT week only, and moves down the page
                  every time a week is added — `CHANGELOG_ENTRIES[0]` is the
                  newest by construction. It carries meaning the copy does not
                  (which of these is live right now), so it is labelled rather
                  than decorative. BRAND.md Part 5. */}
              {i === 0 && <MarketingEmoji name="rocket" size={26} label="Shipped this week" />}
            </div>

            <h2
              id={`heading-${entry.weekOf}`}
              className="mt-4 max-w-3xl text-[1.7rem] font-extrabold leading-tight tracking-[-0.03em] text-gray-950 sm:text-[2.1rem]"
            >
              {entry.title}
            </h2>
            <p className="mt-3 max-w-2xl text-[1rem] leading-relaxed text-gray-700">
              {entry.summary}
            </p>

            <ul className="mt-10">
              {entry.items.map((item) => (
                <li key={item.title} className="border-b py-6" style={{ borderColor: DAY_WIRE }}>
                  <div className="grid gap-x-10 gap-y-2 lg:grid-cols-12">
                    <div className="lg:col-span-5">
                      <div className="flex items-center gap-3">
                        <ToneTile glyph={item.glyph} size="md" />
                        <KindLabel kind={item.kind} />
                      </div>
                      <h3 className="mt-2.5 text-[1.05rem] font-bold leading-snug tracking-[-0.02em] text-gray-950">
                        {item.title}
                      </h3>
                    </div>
                    <p className="max-w-2xl text-[0.95rem] leading-relaxed text-gray-700 lg:col-span-7">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      {/* ── THE CLOSE — the page's bookend ─────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            Say something
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            Something here you want to talk through?
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            Email{' '}
            <a
              href="mailto:hello@dreamcreatestudio.com"
              className="font-semibold text-teal-700 hover:underline"
            >
              hello@dreamcreatestudio.com
            </a>{' '}
            — a person answers, and what you say shows up in a week like the ones above.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start free — 7 days, no card</PrimaryCta>
            <GhostCta href="/product">See what DreamCRM does</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
