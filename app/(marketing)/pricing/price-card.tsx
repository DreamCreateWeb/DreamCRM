'use client'

import { useState } from 'react'
import { MONO_LABEL, DAY_WIRE, PrimaryCta, ToneTile, type ToneTileGlyph } from '@/components/marketing/ui'
import { TILE_TONE_CLASSES } from '@/lib/marketing/tone-tiles'
import { usd } from '@/lib/marketing/site'

/**
 * THE PRICE PANEL — `BRAND.md` Part 8 move 6, page 1, and the honest test of
 * whether Daylight Dream survives a page whose subject is a table.
 *
 * Framing rules (owner-set, 2026-07-19): ONE plan, everything included. The
 * list price shows struck through next to the founding rate. Never the word
 * "beta" — the platform is finished software that keeps growing, and the copy
 * must read that way ("every module is live today; new ones land on the same
 * rate").
 *
 * WHAT MOVE 6 CHANGED, AND WHY EACH ONE IS A RULE RATHER THAN A PREFERENCE:
 *
 *  - **Hard left, not centred.** Part 4's alignment, and the thing the owner
 *    meant by *"only halfway"* in round B. A centred SaaS box under a hard-left
 *    display hero is the drift this move exists to close, and it is visible in
 *    one screenshot. The panel is a two-column instrument now: the number on
 *    the left, the terms in their own lane on the right.
 *  - **The radii come down to Part 3's ladder.** 14px card, 12px toggle track,
 *    10px controls. The `rounded-full` trial button was the clearest Part 3
 *    violation left on this page — 999px is *reserved* for eyebrow badges and
 *    status chips, and a primary action is neither. `PrimaryCta` is the site's
 *    one recipe for that button, so this stops keeping a second copy of it.
 *  - **Mono micro-labels** (Part 4's signature detail) on the toggle, the
 *    struck list price, the interval and the footnotes — every run here is
 *    either a label or a number the reader is meant to compare, which is
 *    exactly what that recipe is for. `MONO_LABEL` is 0.75rem: the 12px floor.
 *  - **The signature gradient arrives as an INKLESS 3px rule** across the
 *    panel's top edge, the same treatment `PageHero`'s eyebrow and the footer's
 *    top edge carry. Legal for the one reason those are: Part 2's "white text
 *    starts at `teal-600`" governs fills that CARRY WHITE, and nothing rides
 *    this bar. Put a label on it and it is a rule-3 violation the same
 *    afternoon.
 *  - **Depth is emission, not stacking** (Part 3): one `DAY_WIRE` hairline and
 *    a soft BLUE shadow, no hard-edged drop shadow.
 *
 * NO EMOJI, AND THAT DID NOT CHANGE ON DREAMCRM-56. Part 5 reversed the ban
 * into a usage rule and kept pricing on the never list by name, together with
 * the chrome, the hero, comparisons, errors, billing and legal. A price is the
 * most literal page on this site; a glossy 3D cartoon next to it is the
 * round-2 *"way too childish"* note coming back.
 *
 * THE CELEBRATION ACCENT IS NOT FUCHSIA HERE EITHER. Part 2 gives fuchsia two
 * homes and adds "never on pricing" explicitly. The two-months-free chip is
 * the `growth` tone — emerald, "what it earns you" — and it borrows
 * `TILE_TONE_CLASSES` rather than spelling `bg-emerald-200 text-emerald-800`
 * locally, because a second home for "which colour is growth" is the exact
 * drift `TONE_FILL` and the tone registry both exist to prevent. That recipe
 * is a graded pair (5.95) and a `-200` tint, which is what keeps it outside
 * rule 5 by construction.
 *
 * EVERY PRICE ON THIS PANEL IS RESOLVED, NOT TYPED. The numbers arrive as
 * props from the server page, which reads `getQuotedPlan()` — the DREAMCRM-38
 * rule, where three surfaces had each drifted to quoting the $500 LIST price
 * for a plan that costs $200. A literal here would be a fourth.
 */

/** The terms, Tier A (`BRAND.md` Part 3): four lines, four different KINDS of
 *  thing, so each one earns a tile of its own. The inventory below the panel is
 *  Tier B for the opposite reason — read `ToneDash`'s header for the rule. */
const TERMS: Array<{ glyph: ToneTileGlyph; term: string; detail: string }> = [
  {
    glyph: 'layers',
    term: 'Every module, included',
    detail: 'Website, booking, portal, messages, reviews, recall, shop, PMS sync.',
  },
  {
    glyph: 'tag',
    term: 'Your rate stays locked',
    detail: 'For as long as you’re a subscriber. New modules land on the same price.',
  },
  {
    glyph: 'door',
    term: 'Month-to-month',
    detail: 'No contract, no setup fee, cancel anytime — your content exports with you.',
  },
  {
    glyph: 'gift',
    term: 'Annual: pay for 10, get 12',
    detail: 'The only other way to buy it. Same platform, two months off.',
  },
]

export type PriceCardProps = {
  /** The founding practice rate, per interval. */
  rateMonthly: number
  rateAnnual: number
  /** The struck-through list price, or null where the plan carries none. */
  listMonthly: number | null
  listAnnual: number | null
}


export function PriceCard({ rateMonthly, rateAnnual, listMonthly, listAnnual }: PriceCardProps) {
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly')
  const monthly = interval === 'monthly'
  const list = monthly ? listMonthly : listAnnual
  const rate = monthly ? rateMonthly : rateAnnual
  const perMonthOnAnnual = Math.round(rateAnnual / 12)

  const tab = (value: 'monthly' | 'annual', label: string) => {
    const on = interval === value
    return (
      <button
        type="button"
        onClick={() => setInterval(value)}
        aria-pressed={on}
        className={`rounded-[10px] px-4 py-2 transition-all duration-150 ease-out ${MONO_LABEL} ${
          on
            ? 'bg-gradient-to-r from-teal-600 to-teal-700 text-white shadow-[0_6px_18px_-8px_rgb(58_103_217/0.7)]'
            : 'text-gray-600 hover:text-gray-950'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <div
      className="relative overflow-hidden rounded-[14px] border bg-white shadow-[0_2px_10px_-4px_rgb(58_103_217/0.18),0_30px_70px_-42px_rgb(58_103_217/0.55)]"
      style={{ borderColor: DAY_WIRE }}
    >
      {/* The page's signature mark: the brand's three hues, carrying no ink. */}
      <div
        className="h-[3px] w-full bg-gradient-to-r from-teal-600 via-violet-700 to-fuchsia-700"
        aria-hidden="true"
      />
      <div className="grid gap-8 p-6 sm:p-9 lg:grid-cols-2 lg:gap-10">
        {/* ── The number ── */}
        <div className="min-w-0">
          <div
            className="inline-flex rounded-xl border bg-white p-1"
            role="group"
            aria-label="Billing interval"
            style={{ borderColor: DAY_WIRE }}
          >
            {tab('monthly', 'Monthly')}
            {tab('annual', 'Annual')}
          </div>

          <p className={`mt-7 text-teal-700 ${MONO_LABEL}`}>Founding practice rate</p>

          {/* The reading order for a screen reader is "Regular price $500.
              Founding practice rate $200 per month" — carried by real text
              rather than an `aria-label` on a <span>, which is an attribute
              axe prohibits on an element with no role. */}
          <p className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {list !== null && (
              <>
                <span className="sr-only">Regular price</span>
                {/* Geist Mono, but deliberately NOT `MONO_LABEL`: that recipe
                    is the 0.75rem micro-LABEL and carries its own size, so
                    stacking a second `text-*` on it would leave which one wins
                    to CSS order rather than to this line. Part 4's other mono
                    home is "any number the reader is meant to compare", which
                    is what a struck list price is. */}
                <span className="font-mono-num text-[1.05rem] font-semibold text-gray-500 line-through decoration-2">
                  {usd(list)}
                </span>
                <span className="sr-only">.</span>
              </>
            )}
            <span className="text-[3rem] font-extrabold leading-none tracking-[-0.035em] text-gray-950 sm:text-[3.75rem]">
              {usd(rate)}
            </span>
            <span className={`text-gray-600 ${MONO_LABEL}`}>
              <span aria-hidden="true">/{monthly ? 'mo' : 'yr'}</span>
              <span className="sr-only">per {monthly ? 'month' : 'year'}</span>
            </span>
            {!monthly && (
              <span
                className={`rounded-full px-2.5 py-1 ${TILE_TONE_CLASSES.growth.tile} ${MONO_LABEL}`}
              >
                2 months free
              </span>
            )}
          </p>

          <p className="mt-4 max-w-md text-[0.95rem] leading-relaxed text-gray-600">
            {monthly ? (
              <>
                Everything DreamCRM does, on one published price. Prefer annual? Pay for
                10 months, get 12 — {usd(rateAnnual)}/year.
              </>
            ) : (
              <>
                That’s {usd(perMonthOnAnnual)}/mo, billed yearly. Same platform, same
                locked rate — two months off for paying up front.
              </>
            )}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <PrimaryCta href="/signup">Start your 7-day free trial</PrimaryCta>
            <p className={`text-gray-600 ${MONO_LABEL}`}>No card required</p>
          </div>
        </div>

        {/* ── The terms, in their own lane. A left hairline at `lg`, a top one
               below it — the rule moves rather than disappearing, so the two
               halves stay two halves at every width (Part 10). ── */}
        <ul
          className="min-w-0 space-y-4 border-t pt-7 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0"
          style={{ borderColor: DAY_WIRE }}
        >
          {TERMS.map((t) => (
            <li key={t.term} className="group flex gap-3">
              <ToneTile glyph={t.glyph} size="md" className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-[0.9rem] font-bold text-gray-950">{t.term}</span>
                <span className="mt-0.5 block text-[0.82rem] leading-relaxed text-gray-600">
                  {t.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
