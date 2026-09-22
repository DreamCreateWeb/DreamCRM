import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/**
 * THE PRICING PAGE QUOTES `lib/stripe-config.ts`, AND NOTHING ON IT IS A
 * TYPED PRICE — DREAMCRM-38's rule, held by a test instead of by care.
 *
 * DREAMCRM-38 is the defect this exists for: the prospecting deal room, the
 * demo track picker and the demo script's closing line had each drifted to
 * quoting the $500 LIST price for a plan that costs $200, and the fix was
 * `getQuotedPlan()` — "every surface that displays the price resolves it here
 * instead of copying the number". The public pricing page, which is the
 * loudest of those surfaces, was still holding its own copy of all four
 * numbers (`LIST_MONTHLY` / `RATE_MONTHLY` / `LIST_ANNUAL` / `RATE_ANNUAL` in
 * `price-card.tsx`, plus three FAQ answers in prose) until move 6.
 *
 * TWO ASSERTIONS, BECAUSE ONE OF THEM ALONE PROVES NOTHING.
 *
 *   1. **The page FOLLOWS the config.** Mock the plan to numbers no literal in
 *      the repo could coincidentally match and check the page renders those.
 *      A hardcoded page fails this; a page that merely happens to agree with
 *      today's config passes an equality check against today's config, which
 *      is why that shape is not the test.
 *   2. **No plan price is spelled as a literal in the route's source.** This
 *      is what catches the drift arriving BACK — a `$200` typed into a new
 *      paragraph agrees with the config on the day it is written, so
 *      assertion 1 stays green through the entire life of the defect and only
 *      goes red at the reprice, which is the moment the page is already wrong
 *      in production.
 *
 * WATCHED FAIL (§2d): both halves were run against the pre-move-6 page, which
 * is the real defect rather than a synthetic one. Assertion 1 went red on the
 * mocked plan (the old card rendered $200/$500 regardless); assertion 2 went
 * red naming six literals in `page.tsx`.
 *
 * THAT RUN ALSO SETTLED WHICH ASSERTION CATCHES WHAT, and it is not the split
 * you would guess. The old `price-card.tsx` held the numbers as
 * `const LIST_MONTHLY = 500` with no dollar sign, and printed them through
 * `${list.toLocaleString(…)}` — so the SOURCE SCAN saw nothing wrong with the
 * file that was most wrong, and named only the FAQ prose. Assertion 1 is what
 * caught the card. Neither half is the safety net for the other; they see
 * different halves of the same defect, which is why both are here.
 *
 * The extractor is also exercised on fixtures below, including the two
 * NON-plan prices on the page — $20 and $30 — which it must leave alone or it
 * would be a rule nobody could satisfy.
 */

const PRICING_ROUTE = ['app/(marketing)/pricing/page.tsx', 'app/(marketing)/pricing/price-card.tsx']

/**
 * EVERY MARKETING SURFACE THAT QUOTES THE PLAN PRICE IN OUR OWN VOICE, because
 * DREAMCRM-38 was never a pricing-page defect — it was FOUR surfaces holding
 * four copies of a number, and the pricing page was merely the loudest.
 * `/why` gained the price on DREAMCRM-78 (move 6 page 4): "the price is on the
 * page" is one of `DESIGN.md`'s three honesty tenets and the manifesto page
 * is the page about those tenets, so the number belongs there — which makes it
 * a fifth place for the drift to come back.
 *
 * `/compare` IS DELIBERATELY NOT IN THIS LIST, and the reason is the rule's
 * own field of view rather than an oversight. Its savings table carries market
 * BANDS — `'$200–350/mo'` for a booking vendor — whose low end is the same
 * integer as our rate today. Scanning that file would report a number that is
 * not our price at all, and §2d is explicit that a guard which fires on
 * something innocent is a guard somebody turns off. Its own quote already
 * resolves through `getQuotedPlan()`; what protects it is assertion 1's shape
 * pointed at that page, not this scan.
 *
 * THE RESOURCE GUIDES' SHARED SHELL JOINED ON DREAMCRM-79 (move 6 page 5),
 * and it is the same defect found a fourth time: `GuideShell`'s closing CTA
 * carried `"$200/mo, no card to try it"` as a literal. What makes it worth a
 * line rather than a silent fix is the BLAST RADIUS — the shell renders on
 * all three guides, so one typed number was live on three public pages at
 * once while "surfaces holding a copy" counted it as one. A shared component
 * is the cheapest place for this drift to hide, which is exactly why the scan
 * takes the COMPONENT rather than the three routes that render it.
 *
 * MOVE 6 PAGE 6 ADDED THREE MORE, AND ONE OF THEM IS NOT A PAGE.
 * `/roi` and `/partner-program` each typed the plan price in our own voice —
 * the sixth and seventh surface, and the count has gone up in every single
 * move that opened a file DREAMCRM-38 never looked at. The third is
 * `lib/recall-roi.ts`, and it is the worst one this rule has caught: it held
 * `PLAN_PRICE_MONTHLY = 200` and `computeRecallRoi` DIVIDES by it, so a
 * reprice would not have made `/roi` stale — it would have made the
 * break-even line the whole page is built around arithmetically WRONG, on a
 * page whose pitch is "that's arithmetic on your own numbers, not a
 * projection". **A price that is an INPUT TO A CALCULATION is the shape to
 * look for next**; every surface before it merely printed one.
 *
 * `/partner-program` is the one worth reading the diff of. Its old copy said
 * "ten practices on DreamCRM = $200/mo to you", which is 10 x 10% of a $200
 * plan — a number that is CORRECT TODAY BY COINCIDENCE and does not merely
 * go stale at a reprice, it starts contradicting the plan price printed
 * three paragraphs above it. Assertion 2 cannot tell a coincidence from a
 * quote and does not need to: both spellings are the literal, and the fix is
 * the same arithmetic the portal already runs.
 *
 * MOVE 6 PAGE 6b ADDED THE EIGHTH AND NINTH, AND THE NINTH IS A NEW SHAPE.
 * `/blog/[slug]`'s closing CTA carried "$200/mo founding practice rate" — an
 * eighth ROUTE, the same defect for the eighth time. `lib/marketing/docs.ts`
 * is the one worth reading: two help-article STEPS said "$200/mo at the
 * founding practice rate (regularly $500)", so the price was sitting in a
 * CONTENT REGISTRY — a `.ts` file full of sentences, rendered on two public
 * doc pages.
 *
 * **Every one of the first eight was a route or a component**, which is why
 * eight previous sweeps of "which files quote the price" walked past this
 * one: nothing about `docs.ts` looks like a pricing surface, and the literal
 * was inside prose inside a data array. `lib/recall-roi.ts` was the previous
 * "not a page" and it was still CODE doing arithmetic. **The shape to look
 * for next is CONTENT** — any registry whose strings reach a reader.
 *
 * This file's own header names both numbers to explain the defect, exactly as
 * `/pricing` and `/why` do, and so does `docs.ts`'s new one — `stripComments`
 * is what keeps the rule satisfiable, and the fixtures below pin that it
 * still works on a JSDoc.
 *
 * `/changelog` and `/docs` (the index) are absent for `/grade`'s reason:
 * neither quotes a price at all.
 *
 * `/grade` is deliberately absent and it is not an oversight — that page
 * quotes no price at all, and adding a file with nothing to find would make
 * the third test below (the one that proves this scan still SEES something)
 * a weaker claim than it is.
 *
 * DREAMCRM-101 ADDED THE TENTH, AND IT IS THE SHAPE THE PARAGRAPH ABOUT THE
 * NINTH TOLD THE NEXT READER TO GO LOOKING FOR. `lib/services/marketing-blog.ts`
 * holds `LAUNCH_POSTS` — three `bodyHtml` strings seeded to `/blog` — and the
 * launch announcement opened with *"for $150–500 a month"*, the PRE-COLLAPSE
 * THREE-TIER RANGE. Two things about it are worth more than the fix:
 *
 *  - It is the second CONTENT REGISTRY, which is what `docs.ts` predicted,
 *    and the prediction was written down ONE MOVE BEFORE the instance
 *    arrived. A shape named in a guard's header is cheaper than a tenth
 *    sweep; this is the first time that has paid off here.
 *  - **The drift was a RANGE, not a wrong single number**, so every spelling
 *    this rule has ever hunted for would have walked past it: the entry read
 *    `$150–500`, and neither 150 nor the undollared 500 is a plan price. It
 *    was found by a ledger entry a human wrote, not by any scan. Assertion 2
 *    protects it going FORWARD — a corrected `$200` typed back in is what it
 *    catches — and it is honest that it could not have found it in the first
 *    place. The rule that WOULD is RELEASE.md:1085's, still Forge's intake.
 *
 * The `$150–500` needle survives in that file on purpose: the one-time
 * content correction in `seedPlatformBlogPosts` has to match the row already
 * published to find it, and it is not a plan price, so it costs this scan
 * nothing.
 */
const PRICE_QUOTING_ROUTES = [
  ...PRICING_ROUTE,
  'app/(marketing)/why/page.tsx',
  'app/(marketing)/resources/guide-ui.tsx',
  'app/(marketing)/roi/page.tsx',
  'app/(marketing)/partner-program/page.tsx',
  'lib/recall-roi.ts',
  'app/(marketing)/blog/[slug]/page.tsx',
  'lib/marketing/docs.ts',
  'app/opengraph-image.tsx',
  'lib/services/marketing-blog.ts',
]

/**
 * Drop comments, keep everything that can reach the page.
 *
 * THIS IS NOT TIDINESS — without it the rule below is unsatisfiable. Both
 * files explain DREAMCRM-38 in their headers, and the only way to explain it
 * is to name the two numbers it was about, so the first run of this guard
 * reported six offenders and every one of them was a sentence. A rule that
 * fires on the prose written to justify it is a rule someone deletes.
 *
 * IT IS A STATE MACHINE RATHER THAN `replace(/\/\/.*$/gm, '')`, and that is
 * the part worth keeping. A line-comment regex cuts at the first `//` it sees
 * — including one INSIDE a string — so `'special // $200 offer'` would have
 * its price stripped and the scan would report clean with the literal live.
 * That is a hiding place, and a hiding place in a guard is worse than no
 * guard, because it comes with a green tick. The fixtures below pin both
 * directions.
 */
export function stripComments(source: string): string {
  let out = ''
  let mode: 'code' | "'" | '"' | '`' | 'line' | 'block' = 'code'
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!
    const next = source[i + 1]
    if (mode === 'code') {
      if (c === '/' && next === '/') { mode = 'line'; i++; continue }
      if (c === '/' && next === '*') { mode = 'block'; i++; continue }
      if (c === "'" || c === '"' || c === '`') mode = c
      out += c
      continue
    }
    if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c } ; continue }
    if (mode === 'block') { if (c === '*' && next === '/') { mode = 'code'; i++ } ; continue }
    // inside a string: an escape consumes the next character whatever it is,
    // so a `\'` never ends the run and a `\\` never swallows the quote after it.
    out += c
    if (c === '\\') { out += next ?? ''; i++; continue }
    if (c === mode) mode = 'code'
  }
  return out
}

/**
 * Every `$N` money literal in a source file, as a number.
 *
 * Deliberately NOT a bare-number scan. `200` appears in class strings
 * (`teal-200`), in pixel values and in row counts, so a bare scan would be
 * noise with a rule attached — and a rule that fires on noise is a rule people
 * turn off. A dollar sign is what makes a number a PRICE on this page.
 *
 * `$${…}` — a template interpolation — is not a literal and does not match,
 * which is what lets the page keep its one `usd()` helper.
 */
export function moneyLiterals(source: string): number[] {
  // `exec` in a loop rather than `[...matchAll()]`: `tsconfig.json` targets es5,
  // so spreading an iterator is a typecheck error (TS2802) — a rule the whole
  // repo lives under, not a preference of this file.
  const re = /\$(\d[\d,]*)(?!\w)/g
  const out: number[] = []
  let m: RegExpExecArray | null
  const code = stripComments(source)
  while ((m = re.exec(code)) !== null) out.push(Number(m[1]!.replace(/,/g, '')))
  return out
}

/**
 * THE UNMOCK IS A TEARDOWN, NOT A LAST LINE — and this file learned that the
 * way §2d says to. The plan mock below started life as a `doUnmock` after the
 * assertions, so the FIRST watched-fail run (both halves against the
 * pre-move-6 page) left the mock live when assertion 1 threw: assertion 2 then
 * read the MOCKED plan, found none of 314/777/3140/7770 spelled in the old
 * page, and reported CLEAN with six literals sitting in the file.
 *
 * A guard that goes quiet exactly when its sibling finds something is worse
 * than no guard. `afterEach` runs on the failure path too.
 */
afterEach(() => {
  vi.doUnmock('@/lib/stripe-config')
  vi.resetModules()
})

describe('the pricing page resolves its price from the plan config (DREAMCRM-38)', () => {
  it('renders the numbers the config carries, and follows them when the config moves', async () => {
    // Numbers no literal in this repo could match by accident — the point is
    // that the page cannot pass by agreeing with the real plan.
    vi.resetModules()
    vi.doMock('@/lib/stripe-config', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/stripe-config')>()
      return {
        ...actual,
        getQuotedPlan: () => ({
          ...actual.getQuotedPlan(),
          price: 314,
          annualPrice: 3140,
          listPrice: 777,
          listAnnualPrice: 7770,
        }),
      }
    })
    const { default: PricingPage } = await import('@/app/(marketing)/pricing/page')

    render(<PricingPage />)

    // The panel, at rest.
    expect(screen.getAllByText('$314').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('$777').length).toBeGreaterThanOrEqual(1)
    // The FAQ prose a few hundred pixels below it, which is where a stale
    // number survives longest because nothing about it looks like config.
    expect(screen.getByText(/Why is the price \$314 instead of \$777\?/)).toBeInTheDocument()
    expect(screen.getByText(/get 12: \$3,140\/year/)).toBeInTheDocument()
    // And the structured data a search engine reads, which no human proofreads.
    const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((s) => s.textContent ?? '')
      .join(' ')
    expect(ld).toContain('314')

    // The annual half of the toggle resolves too — it is a second pair of
    // numbers and therefore a second place to hardcode one.
    await userEvent.click(screen.getByRole('button', { name: /^annual$/i }))
    expect(screen.getAllByText('$3,140').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('$7,770').length).toBeGreaterThanOrEqual(1)
  })

  it('spells no plan price as a literal on any surface that quotes it', async () => {
    const { getQuotedPlan } = await import('@/lib/stripe-config')
    const plan = getQuotedPlan()
    const planPrices = new Set(
      [plan.price, plan.annualPrice, plan.listPrice, plan.listAnnualPrice].filter(
        (n): n is number => typeof n === 'number',
      ),
    )

    const offenders: string[] = []
    for (const rel of PRICE_QUOTING_ROUTES) {
      const source = readFileSync(join(process.cwd(), rel), 'utf8')
      for (const n of moneyLiterals(source)) {
        if (planPrices.has(n)) offenders.push(`${rel}: $${n.toLocaleString('en-US')}`)
      }
    }

    expect(
      offenders,
      'A plan price typed into a page that quotes it agrees with the config on the day it ' +
        'is written and disagrees at the next reprice — which is the shape DREAMCRM-38 was. ' +
        'Resolve it through `getQuotedPlan()` (each page reads it once into `PLAN`/`PRICE`).',
    ).toEqual([])
  })

  it('is still looking at something — the route carries money literals that are NOT the plan', async () => {
    // The mirror of `deadExclusions`: a scan that has stopped finding anything
    // at all looks exactly like a clean one. The pricing FAQ names Open
    // Dental's ~$30/mo API fee and the $20/mo social add-on, and both must
    // survive the rule — they are somebody else's price and an add-on, not the
    // plan.
    const source = readFileSync(join(process.cwd(), PRICING_ROUTE[0]!), 'utf8')
    const found = moneyLiterals(source)
    expect(found).toContain(30)
    expect(found).toContain(20)
  })
})

describe('the field of view — the money-literal extractor, on fixtures', () => {
  it('finds a plain price and a thousands-separated one', () => {
    expect(moneyLiterals('the rate is $200/mo')).toEqual([200])
    expect(moneyLiterals('get 12: $2,000/year.')).toEqual([2000])
  })

  it('does NOT fire on a template interpolation, which is the compliant spelling', () => {
    expect(moneyLiterals('const usd = (n: number) => `$${n.toLocaleString("en-US")}`')).toEqual([])
    expect(moneyLiterals('`${usd(PRICE.rateAnnual)}/year`')).toEqual([])
  })

  it('leaves a bare number alone — a class step is not a price', () => {
    expect(moneyLiterals('className="bg-teal-200 text-teal-800"')).toEqual([])
    expect(moneyLiterals('shadow-[0_2px_10px_-4px_rgb(58_103_217/0.18)]')).toEqual([])
  })

  it('reads every price in a line, not only the first', () => {
    expect(moneyLiterals('Why is the price $200 instead of $500?')).toEqual([200, 500])
  })

  it('ignores a price written in a comment — the rule is about what renders', () => {
    expect(moneyLiterals('// the $500 list price\nconst x = 1')).toEqual([])
    expect(moneyLiterals('/* a plan that costs $200 */\nconst x = 1')).toEqual([])
    // The real shape: a JSDoc block whose CONTINUATION lines carry the prices.
    // A lone ` * …` line with no opener is code, and the extractor is right to
    // say so — a stripper that treated a leading asterisk as a comment marker
    // would be guessing at structure it has not seen.
    expect(
      moneyLiterals('/**\n * quoting the $500 LIST price for a plan that costs $200\n */\nconst x = 1'),
    ).toEqual([])
  })

  it('does NOT let a string hide a price behind a `//`, which a regex stripper would', () => {
    // The blind spot the state machine exists for. A `replace(/\/\/.*$/gm)`
    // returns [] here and the literal ships.
    expect(moneyLiterals("const note = 'special // $200 offer'")).toEqual([200])
    expect(moneyLiterals('const url = "https://example.com" // $500\nconst p = "$200"')).toEqual([200])
  })

  it('survives escapes inside a string, so a quote cannot end a run early', () => {
    expect(moneyLiterals("const s = 'it\\'s $200 flat'")).toEqual([200])
  })
})
