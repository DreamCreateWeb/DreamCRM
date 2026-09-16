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

/**
 * THE CHANGELOG — `BRAND.md` Part 8 move 6, page 6 (the second half).
 *
 * ── WHAT THIS RESTYLE WAS NOT ALLOWED TO TOUCH, AND DID NOT ───────────────
 *
 * The owner's cadence directive (2026-09-09, and `dreamcrm-conventions` §7):
 * **entries are batched WEEKLY — one longer entry per week, never a
 * per-update entry.** The obvious "improvement" available to a restyle here
 * is to break a week's nineteen items into their own cards, or to group them
 * under New / Improved / Fixed headings, and both of those are the weekly
 * entry stopping being one entry. So the registry is untouched, the entry
 * order is untouched, nothing is split, and the page still renders exactly
 * what `lib/marketing/changelog.ts` holds, in the order it holds it.
 *
 * What changed is the SHAPE of a week, not its contents.
 *
 * ── THE WEEK IS A CHAPTER NOW ─────────────────────────────────────────────
 *
 * The page already had the right instinct and the wrong altitude: the date
 * was a small grey link, the week's headline was the biggest thing on screen,
 * and the nineteen items below it were a flat `space-y-7` list. A reader
 * landing mid-scroll could not tell which week they were in.
 *
 * It is the product tour's chapter mark (page 3) and the manifesto's numbered
 * belief (page 4) arriving on a changelog: the week opens on a mono chapter
 * head — the date, the release name, `NN / NN` as a mono numeral — over a
 * `DAY_WIRE` hairline, then the headline, then the summary. At `lg` the
 * chapter head LEADS in its own column and the week's story sits in the other
 * seven, so the date stays beside the items it belongs to instead of
 * scrolling away above them.
 *
 * THE ITEM COUNT IS COMPUTED, and so is the week count and every numeral. A
 * number typed into prose about a countable fact in the tree is the shape
 * that went stale twice in move 3.
 *
 * ── THE ROCKET STAYS, AND IT IS THE ONE EMOJI CALL SITE ON THIS MOVE ──────
 *
 * Six move-6 pages have now shipped with no emoji, because Part 5's animated
 * set marks a MOMENT and an index, a table, a manifesto and a help doc have
 * none in them. This page has one: the newest week is *something shipped*,
 * which is the rocket's entry in Part 5's table verbatim. It was already here
 * and already correct — labelled rather than decorative, because "which of
 * these is live right now" is meaning the copy does not carry — so the move
 * is to leave it alone and give it the room a mark deserves.
 *
 * `emoji-changelog-placement.test.tsx` pins the premise: the rocket is on
 * `CHANGELOG_ENTRIES[0]` and nowhere else.
 *
 * ── THE KIND PILL KEEPS ITS AMBER, AND THAT IS NOT A TONE-TILE BREACH ─────
 *
 * `lib/marketing/tone-tiles.ts` withholds `amber` and `rose` because they are
 * the tone registry's URGENCY signals and nothing on a benefit list is
 * urgent. A changelog is the one marketing surface where that reasoning does
 * not apply: "Fixed" is a STATUS of a change, the word carries the meaning,
 * and the colour only reinforces it. These are chips, not tone tiles — Part 3
 * gives `999px` to status chips by name — so they stay.
 *
 * ── SECTION CONTAINERS ALL MATCH ──────────────────────────────────────────
 *
 * The body was `max-w-3xl` under a `max-w-6xl` hero. One column now; the
 * reading measure is held by `max-w-2xl` on the prose itself.
 *
 * NOTHING BELOW THE HERO CARRIES A DECORATIVE LAYER, so every run rides white
 * at its flat ratio. Only the hero runs needed measuring — `BRAND.md` Part 7,
 * "The docs and the changelog, measured".
 */

export const metadata = {
  title: 'Changelog — what’s new in DreamCRM',
  alternates: { canonical: '/changelog' },
  description:
    'Everything that changes in DreamCRM, summarized once a week in plain English: new features, improvements, and fixes across the website, booking, patient portal, messages, and payments.',
}

/**
 * THE KIND IS A WORD; THE COLOUR BELONGS TO THE SUBJECT — `BRAND.md` Part 2
 * and Part 3, DREAMCRM-80 follow-up.
 *
 * This was three `rounded-full` chips carrying the meaning in colour: `teal`
 * for New, `blue` for Improved, `amber` for Fixed. **Two of those three are
 * wrong.** Part 2: *"the brand hue is never a status"* — `teal` IS the brand
 * ramp, and on a page a visitor scans, a teal chip reading "New" beside two
 * other chips makes the brand colour mean a status, which is the exact
 * dilution that rule exists to stop. And `blue` is not in the tone registry
 * at all (Part 2's status set is emerald / amber / rose / violet / fuchsia),
 * so one of the three was borrowing a hue with no meaning behind it. Part 3
 * adds a third: `999px` is reserved for eyebrow badges and status chips, and
 * a changelog kind is neither.
 *
 * **The fix was written in the file's own comment**, which read *"the word
 * carries the meaning; the tone only reinforces it."* If the word carries
 * it, the colour is spending the brand ramp on nothing. So the kind is a mono
 * micro-label now (Part 4's signature detail, one ink at 5.30 on white), and
 * the colour moved to the thing a reader skimming a week actually wants: the
 * SUBJECT. `ChangelogItem.glyph` is a tone tile from
 * `lib/marketing/tone-tiles.ts` — "booking", "payments", "your website" —
 * and it cannot mean a status because that registry has no statuses in it.
 *
 * TIER A (Part 3): a tile per LINE, because every item in a week is a
 * different KIND of thing. Two items about the website get two globes and
 * that is correct — the wallpaper rule is about one identical mark repeated
 * down an inventory, not about a week that touched one area twice.
 *
 * `glyph` is REQUIRED on a `ChangelogItem`, the call `RESOURCE_GUIDES.glyph`
 * made on move 6 page 5: a new entry cannot compile until somebody decides
 * what it touched, which is a question the author answers anyway while
 * writing the body.
 *
 * **NOTHING ABOUT THE CADENCE CHANGES.** Entries stay batched weekly, one
 * longer entry per week (the owner's directive, §7). No entry is split,
 * merged, reordered or added; `tests/marketing/changelog.test.tsx` holds all
 * of that and stayed green through this.
 *
 * The pills graded FINE on the way out, and that is worth saying because it
 * is not why they went — `teal-800` on `teal-50` is 8.61, `blue-800` on
 * `blue-50` is 8.11, `amber-800` on `amber-50` is 6.84 through
 * `tests/a11y/palette.ts`. This is a Part 2 fix, not a Part 7 one, and
 * conflating the two is how a palette rule gets argued as an accessibility
 * one and then bargained with.
 */
function KindLabel({ kind }: { kind: ChangelogItemKind }) {
  return (
    <span className={`shrink-0 text-gray-500 ${MONO_LABEL}`}>{CHANGELOG_KIND_LABELS[kind]}</span>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')

export default function ChangelogPage() {
  const weeks = CHANGELOG_ENTRIES.length
  const total = pad(weeks)

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
      >
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-gray-600 ${MONO_LABEL}`}>
          <span>
            <span aria-hidden="true">{total}</span>
            <span className="sr-only">{weeks}</span> {weeks === 1 ? 'week' : 'weeks'} written up
          </span>
          <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
          <span>One entry per week, always</span>
        </div>
      </PageHero>

      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        {CHANGELOG_ENTRIES.map((entry, i) => (
          <article
            key={entry.weekOf}
            id={entry.weekOf}
            aria-labelledby={`heading-${entry.weekOf}`}
            className={`scroll-mt-24 ${i > 0 ? 'mt-16 border-t pt-16' : ''}`}
            style={i > 0 ? { borderColor: DAY_WIRE } : undefined}
          >
            <div className="lg:grid lg:grid-cols-12 lg:gap-x-10">
              {/* ── THE CHAPTER HEAD — page 3's move, on a week. It leads in
                     its own column at `lg` so the date stays beside the items
                     it belongs to rather than scrolling away above them. ── */}
              <div className="lg:col-span-4">
                <div className="lg:sticky lg:top-24">
                  <div
                    className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3 text-gray-500 ${MONO_LABEL}`}
                    style={{ borderColor: DAY_WIRE }}
                  >
                    <span aria-hidden="true">
                      {pad(i + 1)} / {total}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-teal-600" aria-hidden="true" />
                    <Link
                      href={`/changelog#${entry.weekOf}`}
                      className="text-teal-700 hover:underline"
                    >
                      <time dateTime={entry.weekOf}>{formatWeekOf(entry.weekOf)}</time>
                    </Link>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    {entry.release && (
                      <span
                        className={`inline-flex items-center rounded-full border bg-white px-2.5 py-0.5 text-gray-600 ${MONO_LABEL}`}
                        style={{ borderColor: DAY_WIRE }}
                      >
                        {entry.release} release
                      </span>
                    )}
                    <span className={`text-gray-500 ${MONO_LABEL}`}>
                      <span aria-hidden="true">{pad(entry.items.length)}</span>
                      <span className="sr-only">{entry.items.length}</span> changes
                    </span>
                    {/* The rocket marks the CURRENT week only, and moves down
                        the page every time a week is added —
                        `CHANGELOG_ENTRIES[0]` is the newest by construction.
                        It carries meaning the copy does not (which of these is
                        live right now), so it is labelled rather than
                        decorative. BRAND.md Part 5. */}
                    {i === 0 && (
                      <MarketingEmoji name="rocket" size={28} label="Shipped this week" />
                    )}
                  </div>
                </div>
              </div>

              {/* ── THE WEEK'S STORY ─────────────────────────────────────── */}
              <div className="mt-6 lg:col-span-8 lg:mt-0">
                <h2
                  id={`heading-${entry.weekOf}`}
                  className="max-w-2xl text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-gray-950 sm:text-[1.9rem]"
                >
                  {entry.title}
                </h2>
                <p className="mt-4 max-w-2xl text-[1rem] leading-relaxed text-gray-700">
                  {entry.summary}
                </p>

                <ul className="mt-9">
                  {entry.items.map((item) => (
                    <li
                      key={item.title}
                      className="border-t py-6 first:border-t-0 first:pt-0"
                      style={{ borderColor: DAY_WIRE }}
                    >
                      <div className="flex items-center gap-3">
                        <ToneTile glyph={item.glyph} size="md" />
                        <KindLabel kind={item.kind} />
                      </div>
                      <h3 className="mt-2.5 max-w-2xl text-[1.05rem] font-semibold leading-snug tracking-[-0.01em] text-gray-950">
                        {item.title}
                      </h3>
                      <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-gray-600">
                        {item.body}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </section>

      {/* ── THE CLOSE — the page's bookend ────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:pb-20">
        <div className="max-w-2xl">
          <div className={`mb-5 flex items-center gap-3 text-teal-700 ${MONO_LABEL}`}>
            <span
              className="h-[3px] w-9 shrink-0 rounded-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
              aria-hidden="true"
            />
            Something here you want to talk through?
          </div>
          <h2 className="text-[1.9rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-gray-950 sm:text-[2.4rem]">
            Email us and a person answers
          </h2>
          <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">
            <a
              href="mailto:hello@dreamcreatestudio.com"
              className="font-semibold text-teal-700 hover:underline"
            >
              hello@dreamcreatestudio.com
            </a>{' '}
            — not a ticket queue. New here? The product tour is the fastest way to see what
            all of this adds up to.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/product">See what DreamCRM does</PrimaryCta>
            <GhostCta href="/signup">Start free — 7 days</GhostCta>
          </div>
        </div>
      </section>
    </>
  )
}
