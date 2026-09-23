import Link from 'next/link'
import { MarketingEmoji } from '@/components/marketing/emoji'
import { usd } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import {
  PageHero,
  PrimaryCta,
  GhostCta,
  ToneTile,
  MONO_LABEL,
  DAY_WIRE,
} from '@/components/marketing/ui'

/**
 * THE MARKETING SITE'S OWN 404 — `BRAND.md` Parts 3 and 5.
 *
 * WHAT WAS WRONG. Six marketing routes can miss: `/blog/[slug]`,
 * `/compare/[vendor]`, `/docs/[slug]` and the three resource guides all end in
 * `notFound()` when the slug is not in their registry. Next resolves that to
 * the NEAREST `not-found.tsx`, and this route group had none — so every one of
 * them fell through to `app/not-found.tsx`, a deliberately chrome-less card on
 * a bare white page. A visitor who followed a stale link from a tweet, a
 * newsletter or Google's index landed somewhere with no header, no footer, no
 * nav, and exactly one way out. That is not a 404; that is a dead end.
 *
 * THE ROOT 404 STAYS EXACTLY AS IT IS, deliberately. It is what a CLINIC
 * TENANT gets — someone inside `/patient`, `/site/[slug]` or the dashboard —
 * and our marketing header is not their nav. Putting this file in the
 * `(marketing)` group is what keeps those two answers apart: Next walks UP
 * from the missing route, so only a miss inside this group reaches here and
 * only this group's `layout.tsx` wraps it. The header, the footer, the skip
 * link and the motion styles arrive for free, which is the whole point.
 *
 * THE PERSONALITY, AND THE RULE IT IS STAYING INSIDE. Part 5 bans emoji from
 * "error copy" and this page is one line away from that ban, so the glyph is
 * chosen rather than reached for: 🪐 is the one entry in the registry whose
 * stated use is "the space register itself — ambient, where a page needs a
 * mark and not a mood". It marks a place; it does not react to the visitor.
 * 🎉 and ✨ would both be celebrating a dead link, which is the apology
 * theatre Part 5's copy rules exist to keep off this site. Decorative, so it
 * is `aria-hidden` with no label — "planet" announced next to a heading that
 * already says the page is missing is noise, not access.
 *
 * The copy is straight for the same reason: it says what happened, in one
 * sentence, and then spends the rest of the page being USEFUL. The delight
 * here is the recovery, not a joke about it — four real destinations with the
 * site's own `mkt-nudge` arrow, so a reader who got here by accident leaves
 * with somewhere to be.
 *
 * NOT IN `e2e/marketing-viewport.spec.ts`. That spec asserts `status === 200`
 * on every stop it visits — the one way a width guard can go green while
 * seeing an error shell — so a 404 route structurally cannot join its derived
 * list. Its width stop lives beside its axe stop in `e2e/smoke.spec.ts`
 * instead, which is a hand-typed journey spec and the right home for a page
 * that is reached by missing rather than by linking. `PageHero` and one
 * `max-w-6xl` column are the containers the layout gate already grades on
 * nine other pages; nothing here bleeds, and the mock-free body is why.
 */

export const metadata = {
  title: 'Page not found — DreamCRM',
  // A 404 that Google indexes is a 404 that keeps arriving. The status code
  // already says this; the tag says it to the crawlers that read one and not
  // the other.
  robots: { index: false, follow: true },
}

/**
 * THE PRICE IS RESOLVED, NEVER TYPED. `pricing-price-source.test.tsx` caught
 * the first draft of the Pricing card below carrying a literal `$200/mo` —
 * exactly the defect that guard exists for, arriving exactly the way it does:
 * a new marketing page quoting the plan in passing, on a route nobody thinks
 * of as a pricing surface. `getQuotedPlan()` is pure config, so this stays a
 * static render.
 */
const PLAN = getQuotedPlan()

/**
 * WHERE PEOPLE ACTUALLY MEANT TO GO. Hand-typed rather than expanded from
 * `DOCS` / `COMPARISONS` / `RESOURCE_GUIDES`: the four routes that can miss
 * are all INDEXES of those registries, so the honest answer to "your guide
 * moved" is the shelf it moved on, not a fifth guess at which one you wanted.
 */
const DESTINATIONS = [
  {
    href: '/product',
    glyph: 'layers' as const,
    title: 'The platform',
    body: 'Every part of DreamCRM on one page — website, booking, portal, messages, reviews, recall.',
  },
  {
    href: '/docs',
    glyph: 'form' as const,
    title: 'Help docs',
    body: 'Setup guides and how-tos. Most links that land here were pointing at one of these.',
  },
  {
    href: '/resources',
    glyph: 'chart' as const,
    title: 'The growth library',
    body: 'The long-form guides, with the templates and worked examples that come in them.',
  },
  {
    href: '/pricing',
    glyph: 'money' as const,
    title: 'Pricing',
    body: `One plan, ${usd(PLAN.price)}/mo, flat. The number is on the page — it always is.`,
  },
]

export default function MarketingNotFound() {
  return (
    <>
      <PageHero
        eyebrow="404 · page not found"
        title={
          <>
            This page isn&rsquo;t here.
            <br />
            {/* The signature gradient, and every stop is legal AS INK on white
                — teal-600 5.09, violet-700 6.14, fuchsia-700 6.27 (BRAND.md
                Part 7, re-derived by `token-contrast.test.ts`). Same treatment
                the homepage headline carries, so a visitor who lands here
                sideways still lands on the brand. */}
            <span className="bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700 bg-clip-text text-transparent">
              The rest of it is.
            </span>
          </>
        }
        sub="The link you followed is out of date, or the address has a typo in it. Nothing is broken — this page just doesn’t exist."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <PrimaryCta href="/">Back to the homepage</PrimaryCta>
          {/* "Browse", not "Search": /docs is a shelf of four categories with
              no search box on it, and a 404 is the last page on this site that
              should promise something the next one does not have. */}
          <GhostCta href="/docs">Browse the help docs</GhostCta>
        </div>
      </PageHero>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 lg:pb-24">
        <div className={`mb-8 flex items-center gap-3 text-gray-500 ${MONO_LABEL}`}>
          {/* Part 5's ambient mark. 28px rather than the changelog's 40 — this
              one sits in a mono label run, not at the head of an article. */}
          <MarketingEmoji name="planet" size={28} />
          <span>Four places worth being instead</span>
        </div>

        <ul className="grid gap-4 sm:grid-cols-2">
          {DESTINATIONS.map((d) => (
            <li key={d.href}>
              {/* ONE LINK PER CARD, and the whole card is it — a second
                  "Go →" inside would be a second tab stop landing in the same
                  place (the resources index's rule, same reason). `mkt-nudge`
                  is gated to a fine pointer in `MarketingMotionStyles`, so the
                  arrow never leans on a touch-and-hold, and Part 6's 140ms
                  ease-out with no spring is what it carries.

                  `group` is what lets the tone tile rise WITH the card rather
                  than twitch under the cursor on its own — `mkt-tile` fires
                  only under a `group` ancestor, and a card is exactly the
                  case that rule was written for. */}
              <Link
                href={d.href}
                className="group mkt-nudge-host flex h-full items-start gap-4 rounded-[14px] border bg-white p-5 shadow-[0_2px_10px_-4px_rgb(26_36_64/0.18)] transition-all duration-150 ease-out hover:-translate-y-px hover:shadow-[0_8px_22px_-8px_rgb(26_36_64/0.26)]"
                style={{ borderColor: DAY_WIRE }}
              >
                <ToneTile glyph={d.glyph} size="md" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[1.05rem] font-bold tracking-[-0.01em] text-gray-950">
                    {d.title}
                    <span className="mkt-nudge shrink-0 text-teal-700" aria-hidden="true">
                      →
                    </span>
                  </span>
                  <span className="mt-1.5 block text-[0.92rem] leading-relaxed text-gray-600">
                    {d.body}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
