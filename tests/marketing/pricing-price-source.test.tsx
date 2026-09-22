import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ALLOWED_QUOTES,
  PRICE_ROOTS,
  PRICE_SOURCE,
  formatHit,
  identifierWords,
  isBand,
  nameIsPricey,
  partition,
  planPriceHits,
  priceQuotingFiles,
  scanTreeForPlanPriceLiterals,
  sourceCarriesThePrices,
} from './plan-price-literals'
// The REAL config, statically bound at collection: `vi.doMock` below only
// affects later dynamic imports, so assertion 2 always grades the tree
// against the plan that actually ships. Reading it here rather than copying
// four numbers into this file is the point — a reprice moves the guard's
// subject automatically, or the guard retires itself on the day it matters
// most.
import { getQuotedPlan } from '@/lib/stripe-config'

/**
 * THE PLAN'S PRICE EXISTS ONCE, IN `lib/stripe-config.ts`. EVERYTHING ELSE
 * THAT SAYS THE NUMBER RESOLVES IT THERE.
 *
 * DREAMCRM-38 is the defect this exists for: three surfaces had each drifted
 * to quoting the $500 LIST price for a plan that costs $200, and the fix was
 * `getQuotedPlan()`. #620 turned that into a rule. DREAMCRM-102 gave the rule
 * its EYES.
 *
 * WHAT CHANGED, AND WHY IT IS THE WHOLE ISSUE. The predicate below has been
 * right since #620. Its SUBJECT was `PRICE_QUOTING_ROUTES`, a hand-written
 * list of ten file paths — and this file's own header used to record that list
 * growing in every single move that opened a file DREAMCRM-38 had not looked
 * at: eight, then nine, then ten, each one written up as a discovery. A guard
 * whose docblock narrates its own population going up is a guard telling you
 * where its next miss will be. The list is deleted. The field of view is now
 * DERIVED from the tree — every tracked `.ts` / `.tsx` under `app`,
 * `components` and `lib`, 1,342 files — and lives in `./plan-price-literals`,
 * which also holds the three spellings and the band discriminator.
 *
 * WHAT THE LIST COULD NOT SEE, measured on `main` at `12fc04e4` and fixed in
 * the same PR (the tree has to be green for the guard to land at all):
 * twenty-eight live literals in four files the list had never named — the
 * HOMEPAGE (seven, including the pricing teaser's `$500`/`$200` as two JSX
 * text nodes and the JSON-LD `price` a search engine reads), the comparison
 * registry (ten), the prospecting product-knowledge prose a model reads back
 * to a prospect in our own voice (ten), and the practice-grade report's
 * closing CTA (one).
 *
 * TWO ASSERTIONS, BECAUSE ONE OF THEM ALONE PROVES NOTHING. That split
 * predates the widening and survives it:
 *
 *   1. **The surface FOLLOWS the config.** Mock the plan to numbers no literal
 *      in the repo could coincidentally match and check the surface renders
 *      those. A page that merely happens to agree with today's config passes
 *      an equality check against today's config, which is why that shape is
 *      not the test — and a page that resolves the number through ARITHMETIC
 *      is invisible to any source scan, which is why assertion 2 is not a
 *      safety net for this one.
 *   2. **No plan price is spelled as a literal.** This is what catches the
 *      drift arriving BACK — a `$200` typed into a new paragraph agrees with
 *      the config on the day it is written, so assertion 1 stays green through
 *      the entire life of the defect and goes red only at the reprice, which
 *      is the moment the page is already wrong in production.
 *
 * **WIDENING THE EYES CHANGED ASSERTION 2. ASSERTION 1 WAS EXTENDED
 * DELIBERATELY, TO EXACTLY ONE MORE SURFACE**, and the reasoning is the part
 * worth keeping. Assertion 1 costs a render, so it cannot follow the scan out
 * to 1,342 files and should not try. What it is FOR is the case the scan
 * structurally cannot see — a number reached through computation — so it
 * belongs wherever a rendered price is assembled rather than printed. The
 * homepage now carries the price in five shapes at once (the metadata
 * description, a hero chip, an honesty-tenet body, the JSON-LD `price` field
 * and the struck-through teaser pair) and is the loudest surface on the site;
 * `/pricing` was already here. Every other newly-covered file is a CONTENT
 * REGISTRY whose strings are interpolated rather than computed, and the
 * comparison FAQ is exercised through the homepage render anyway, since the
 * page imports the registry. **Assertion 1 goes where the number could be
 * WRONG rather than merely stale; assertion 2 goes everywhere.**
 *
 * WATCHED FAIL (§2d) — see the PR description for the runs. Both halves were
 * run against real defects in real shapes, not synthetic ones, and the
 * widening's own red run was against a literal in a file the old list could
 * not see, with the guard STAGED first (`git ls-files`-derived: an unstaged
 * file is invisible to the run you would certify it with).
 */

// The homepage is an async server component that resolves a session and
// redirects signed-in staff. Same three mocks `marketing-site.test.tsx` uses.
vi.mock('@/lib/auth/context', () => ({
  getTenantContext: vi.fn(async () => null),
}))
vi.mock('@/lib/session', () => ({
  getServerSession: vi.fn(async () => null),
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

/** Numbers no literal in this repo could match by accident. */
const MOCK = { price: 314, annualPrice: 3140, listPrice: 777, listAnnualPrice: 7770 }

const mockThePlan = () => {
  vi.resetModules()
  vi.doMock('@/lib/stripe-config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/stripe-config')>()
    return { ...actual, getQuotedPlan: () => ({ ...actual.getQuotedPlan(), ...MOCK }) }
  })
}

/**
 * THE UNMOCK IS A TEARDOWN, NOT A LAST LINE — and this file learned that the
 * way §2d says to. The plan mock started life as a `doUnmock` after the
 * assertions, so the FIRST watched-fail run left the mock live when assertion
 * 1 threw: assertion 2 then read the MOCKED plan, found none of
 * 314/777/3140/7770 spelled anywhere, and reported CLEAN with six literals
 * sitting in the file.
 *
 * A guard that goes quiet exactly when its sibling finds something is worse
 * than no guard. `afterEach` runs on the failure path too.
 */
afterEach(() => {
  vi.doUnmock('@/lib/stripe-config')
  vi.resetModules()
})

describe('assertion 1 — the surface FOLLOWS the config (DREAMCRM-38)', () => {
  it('renders the numbers the config carries on /pricing, and follows them when the config moves', async () => {
    mockThePlan()
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

  it('follows the config on the HOMEPAGE too — teaser pair, hero chip, tenet, metadata and the JSON-LD', async () => {
    // THE SURFACE ASSERTION 1 GAINED ON DREAMCRM-102, and the only one it
    // gained. Five shapes of the same number on one page, four of which no
    // list of routes had ever pointed anything at.
    mockThePlan()
    const page = await import('@/app/(marketing)/page')
    const Home = page.default

    render(await Home())

    // The teaser panel: the founding rate beside the struck-through list.
    expect(screen.getAllByText('$314').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('$777').length).toBeGreaterThanOrEqual(1)
    // The hero chip and the honesty tenet — prose, where a stale number lives
    // longest because nothing about a sentence looks like configuration.
    expect(screen.getByText('$314/mo after, flat')).toBeInTheDocument()
    expect(screen.getByText(/One plan, \$314\/mo — published/)).toBeInTheDocument()
    // The JSON-LD offer a search engine reads and nobody proofreads.
    const ld = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
      .map((s) => s.textContent ?? '')
      .join(' ')
    expect(ld).toContain('314')
    // The page description, which is the number's only appearance in a search
    // result — it is a module-scope const, so it follows or it does not.
    expect(String(page.metadata.description)).toContain('$314/mo founding practice rate (regularly $777)')
  })

  it('follows the config in the comparison registry, which is prose in a `.ts` file', async () => {
    // `lib/marketing/comparisons.ts` held ten copies of the rate and was off
    // the old list entirely, on the argument that its market BANDS collide
    // with our integers. The bands are discriminated structurally now, so the
    // registry is graded like anything else — and this is the half a source
    // scan cannot give you: proof the string it emits actually MOVES.
    mockThePlan()
    const { COMPARISONS, buildComparisonFaq } = await import('@/lib/marketing/comparisons')
    const faq = buildComparisonFaq(COMPARISONS[0]!)
    expect(faq.map((f) => f.a).join(' ')).toContain('$314/mo published')
    // The band beside it is somebody else's number and must NOT move.
    expect(COMPARISONS[0]!.reportedPricing).toContain('$249')
  })

  it('follows the config in the prospecting product knowledge a model reads aloud', async () => {
    mockThePlan()
    const { PRODUCT_KNOWLEDGE, PRODUCT_KNOWLEDGE_SHORT } = await import('@/lib/prospect-product-knowledge')
    for (const text of [PRODUCT_KNOWLEDGE, PRODUCT_KNOWLEDGE_SHORT]) {
      expect(text).toContain('$314/mo')
      expect(text).toContain('$777')
      expect(text).toContain('$3,140')
      // And the competitor band is untouched by a reprice, which is the whole
      // argument for discriminating a band structurally rather than by file.
      expect(text).toContain('$800-2,000/mo')
    }
  })
})

describe('assertion 2 — no plan price is spelled as a literal, anywhere (DREAMCRM-102)', () => {
  const planPrices = () => {
    const plan = getQuotedPlan()
    return new Set(
      [plan.price, plan.annualPrice, plan.listPrice, plan.listAnnualPrice].filter(
        (n): n is number => typeof n === 'number',
      ),
    )
  }

  it('still finds all four plan prices in the price source — the premise every absence below rests on', () => {
    // §2d's reader lesson, turned on this file: every assertion here is an
    // ABSENCE, so a subject that quietly moved makes all of them GREENER and
    // the failure is invisible from every direction they look.
    const prices = planPrices()
    expect(
      sourceCarriesThePrices(prices),
      `${PRICE_SOURCE} no longer spells the plan's prices where this rule can see them — so ` +
        'every "no literal anywhere" assertion below is passing over a subject that has moved.',
    ).toEqual(Array.from(prices).sort((a, b) => a - b))
  })

  it('spells no plan price as a literal anywhere under app, components or lib', () => {
    const { offenders } = partition(scanTreeForPlanPriceLiterals(planPrices()))

    expect(
      offenders.map(formatHit),
      'A plan price typed into a file that quotes it agrees with the config on the day it is ' +
        'written and disagrees at the next reprice — which is the shape DREAMCRM-38 was. ' +
        'Resolve it through `getQuotedPlan()` (each surface reads it once into `PLAN`/`PRICE`). ' +
        'If the number genuinely is not our plan price, add a reasoned entry to ' +
        '`ALLOWED_QUOTES` in tests/marketing/plan-price-literals.ts — and if it is one end of a ' +
        'market BAND, it should not have reached you at all: widen `isBand` instead.',
    ).toEqual([])
  })

  it('has no allowance that has stopped pardoning anything', () => {
    // The dead-exclusion premise, the #587/#594 family in its fifth pointing.
    // A pardon whose site was deleted or rewritten goes on pardoning whatever
    // lands on that file and value next, and a scan that has stopped finding
    // something looks exactly like a clean tree.
    const { deadAllowances } = partition(scanTreeForPlanPriceLiterals(planPrices()))
    expect(
      deadAllowances.map((a) => `${a.file} / ${a.value} / near "${a.near}"`),
      'These allowances match nothing any more. Delete each one, or re-point it at the site it ' +
        'was written for — an exemption nobody can see expire is a door.',
    ).toEqual([])
  })

  it('is still looking at something — the tree carries money literals that are NOT the plan', () => {
    // The mirror of the dead-exclusion check, one level up: a SCAN that has
    // stopped finding anything looks exactly like a clean one. Three probes,
    // because the three that could break are the tree walk, the extractor and
    // the comment stripper.
    const vendorBand = scanTreeForPlanPriceLiterals(new Set([399]))
    expect(
      vendorBand.map((h) => h.file),
      'the tree walk + extractor stopped finding a money literal that is definitely there, so ' +
        'the absence assertions above are worth nothing',
    ).toContain('lib/marketing/comparisons.ts')

    // The pricing FAQ names Open Dental's ~$30/mo API fee and the $20/mo
    // social add-on. Both must survive the rule — they are somebody else's
    // price and an add-on, not the plan.
    const pricing = 'app/(marketing)/pricing/page.tsx'
    const addOns = planPriceHits(
      pricing,
      readFileSync(join(process.cwd(), pricing), 'utf8'),
      new Set([20, 30]),
    ).map((h) => h.value)
    expect(addOns).toContain(30)
    expect(addOns).toContain(20)
  })

  it('derives its field of view from the tree, and it reaches the four files the old list missed', () => {
    // THE ASSERTION THIS ISSUE IS ABOUT. `PRICE_QUOTING_ROUTES` was ten paths;
    // a file that quotes the price is graded the day it is written now, by
    // nobody's memory.
    const files = priceQuotingFiles()
    expect(files.length).toBeGreaterThan(1000)
    for (const missed of [
      'app/(marketing)/page.tsx',
      'lib/marketing/comparisons.ts',
      'lib/prospect-product-knowledge.ts',
      'app/g/[token]/report-view.tsx',
    ]) {
      expect(files, `${missed} was outside the old list of ten routes`).toContain(missed)
    }
    // And every root is genuinely walked, not just the one with the pages in
    // it: `lib/recall-roi.ts` is the worst site this rule ever caught and it
    // is not under `app` at all.
    for (const root of PRICE_ROOTS) {
      expect(files.some((f) => f.startsWith(`${root}/`)), `${root} is unread`).toBe(true)
    }
  })
})

describe('the field of view — the extractor, on fixtures', () => {
  const PLAN = new Set([200, 500, 2000])
  const hits = (src: string) => planPriceHits('fixture.ts', src, PLAN).map((h) => h.value)

  it('finds a plain price and a thousands-separated one', () => {
    expect(hits('the rate is $200/mo')).toEqual([200])
    expect(hits('get 12: $2,000/year.')).toEqual([2000])
  })

  it('finds the PROSE cadences, with no dollar sign in sight', () => {
    // The spellings the `$`-only scan walked past. Each is how a human writes
    // a price in a sentence, and each was measured against the real tree.
    expect(hits('200/mo, no card to try it')).toEqual([200])
    expect(hits('200/month, month-to-month')).toEqual([200])
    expect(hits('200 a month, flat')).toEqual([200])
    expect(hits('200 per month after the trial')).toEqual([200])
    expect(hits('2,000 per year = 2 months free')).toEqual([2000])
  })

  it('finds a price assigned to a PRICE-SHAPED NAME — the shape that cost DREAMCRM-38 the most', () => {
    // `const LIST_MONTHLY = 500` printed through `toLocaleString()` is what
    // the original source scan walked straight past, and
    // `PLAN_PRICE_MONTHLY = 200` in `lib/recall-roi.ts` was DIVIDED by.
    expect(hits('const LIST_MONTHLY = 500')).toEqual([500])
    expect(hits('const RATE_ANNUAL = 2000')).toEqual([2000])
    expect(hits('export const PLAN_PRICE_MONTHLY = 200')).toEqual([200])
    expect(hits("softwareApplicationLd([{ name: 'DreamCRM', price: 200 }])")).toEqual([200])
    expect(hits("{ 'listPrice': 500 }")).toEqual([500])
  })

  it('leaves a bare number on an innocent name alone — a rule that fires on noise is a rule people turn off', () => {
    expect(hits('const DEBOUNCE_MS = 200')).toEqual([])
    expect(hits('const fontWeight = 500')).toEqual([])
    expect(hits('style={{ fontWeight: 500 }}')).toEqual([])
    expect(hits('className="bg-teal-200 text-teal-800"')).toEqual([])
    expect(hits('shadow-[0_2px_10px_-4px_rgb(58_103_217/0.18)]')).toEqual([])
    expect(hits('if (res.status === 200) return')).toEqual([])
  })

  it('names a price rather than merely containing the letters — Sentinel, #665 note 1', () => {
    // §2d's identity-looseness family, arriving in the guard's own VOCABULARY:
    // a word is not a substring, the same way a name is not a prefix. The
    // first version alternated bare substrings, so `fee` matched inside
    // `FEED_PAST_DAYS` and `rate` inside `generate`. None held a plan number
    // on the day it was found — but the remedy for a false positive is to
    // narrow the predicate, never to register the innocent file.
    for (const id of ['LIST_MONTHLY', 'RATE_ANNUAL', 'PLAN_PRICE_MONTHLY', 'listPrice', 'estMonthly', 'rateAnnual', 'plan-price', 'MONTHLY_CAP'])
      expect(nameIsPricey(id), `${id} should still be read as a price name`).toBe(true)

    for (const id of ['FEED_PAST_DAYS', 'FEED_FUTURE_DAYS', 'showPrivateFeedback', 'generate', 'separate', 'iterate', 'DEBOUNCE_MS', 'fontWeight'])
      expect(nameIsPricey(id), `${id} is not a price and must not be graded as one`).toBe(false)

    // The splitter itself, because everything above rides on it.
    expect(identifierWords('listAnnualPrice')).toEqual(['list', 'Annual', 'Price'])
    expect(identifierWords('INCLUDED_MONTHLY_SEGMENTS')).toEqual(['INCLUDED', 'MONTHLY', 'SEGMENTS'])
    expect(identifierWords('MRRByMonth')).toEqual(['MRR', 'By', 'Month'])
  })

  it('crosses a JSX brace — `price={200}`, Sentinel, #665 note 2', () => {
    // A price SURFACE is exactly where this spelling gets written, and
    // `[:=]\s*\d` cannot get past the `{`. Nothing in the tree was live, which
    // is the reason it is a widening rather than a repair.
    expect(hits('<PriceTag price={200} />')).toEqual([200])
    expect(hits('<Card listPrice={500} rate={200} />')).toEqual([500, 200])
    // A numeric OBJECT KEY is not a price, and `= {` reaches one too.
    expect(hits("const priceCopy = { 200: 'founding rate' }")).toEqual([])
    // The innocents the brace could have swept in.
    expect(hits('<Input maxLength={200} />')).toEqual([])
    expect(hits('<circle cx={500} cy={200} />')).toEqual([])
  })

  it('leaves a market BAND alone, from either end — the discriminator that does the most work', () => {
    // `/compare` carries vendor bands whose low end is our rate and whose high
    // end is our annual. Neither is our price, and the old answer was to leave
    // the whole FILE off the list, which took its genuine quotes with it.
    expect(hits("'$200–350/mo' // a booking vendor")).toEqual([])
    expect(hits('costing $800-2,000/mo across separate tools')).toEqual([])
    expect(hits('reported $200—400 per location')).toEqual([])
    expect(hits('bundles run $800-$2,000/mo')).toEqual([])
    // It is STRUCTURAL, not nominal: nothing here knows what a vendor is
    // called, so a competitor added next month needs no list entry.
    expect(hits('AcmeCo, reported $150-200/mo')).toEqual([])
  })

  it('needs the far end of a band to look like MONEY — Sentinel, #665 note 3', () => {
    // THE QUIET DIRECTION, which is what earns a fix rather than a note. The
    // first version pardoned a number followed by dash-then-ANY-digit, so a
    // genuine `$200` went silent the moment an em dash and a small number
    // followed it — and this repo's marketing prose is made of em dashes.
    expect(hits('$200 — 7 days free')).toEqual([200])
    expect(hits('$200 — 1 plan, everything in it')).toEqual([200])
    expect(hits('$2,000 a year — 2 months free')).toEqual([2000])
    // A real band's far end is itself a price: a `$`, or three digits.
    expect(hits('reported $200–350/mo')).toEqual([])
    expect(hits('reported $200–$99/mo')).toEqual([])
    // ...and the near end too, so a countdown cannot pardon the price after it.
    expect(hits('7 — $200/mo')).toEqual([200])
    expect(hits('$800-$200/mo bundles')).toEqual([])
  })

  it('keeps a band on ONE LINE — a list item on the next line is not a range', () => {
    // `\s*` crosses a newline, so a band match ran from the end of one line to
    // a bullet at the start of the next and the price above it went silent.
    expect(hits('the rate is $200\n- 7 day trial')).toEqual([200])
    expect(hits('the rate is $200\n– 350 patients reached')).toEqual([200])
    // On one line it is still a band.
    expect(hits('the vendor is $200 – 350 a month')).toEqual([])
  })

  it('does NOT let a band swallow a real quote beside it — the dangerous direction', () => {
    // The mutation that matters: if `isBand` were loose about distance, the
    // genuine `$200/mo` in the same sentence as a band would be pardoned and
    // the rule would report clean with the defect live.
    expect(hits('paying $800-2,000/mo across tools; we consolidate for $200/mo')).toEqual([200])
    expect(hits('vendors charge $300-400; ours is $200 a month')).toEqual([200])
    // A hyphen that is not a range must not pardon anything either.
    expect(hits('the month-to-month price is $200/mo')).toEqual([200])
  })

  it('does NOT fire on a template interpolation, which is the compliant spelling', () => {
    expect(hits('const usd = (n: number) => `$${n.toLocaleString("en-US")}`')).toEqual([])
    expect(hits('`${usd(PRICE.rateAnnual)}/year`')).toEqual([])
    expect(hits('`${RATE_MONTHLY}/mo flat`')).toEqual([])
  })

  it('knows where a number ENDS — the identity-looseness family, on a price', () => {
    // "A prefix is not a name" and "a number has no end either" are the two
    // mutations that came back GREEN WITH THE CODE CHANGED in this repo's
    // mutation pass, which is the worst result on the scale. A price is a
    // number, so it gets the same question asked of it: `$200` must not be
    // read out of `$2000`, `$20000` or `$200,000`.
    expect(hits('$2000')).toEqual([2000])
    expect(hits('$20000')).toEqual([])
    expect(hits('$200,000 raised')).toEqual([])
    expect(hits('1200/mo for the whole stack')).toEqual([])
    expect(hits('const totalAnnualCost = 20000')).toEqual([])
    // And the order-of-magnitude mutation the mutation pass says to try
    // BEFORE off-by-one: a guard that cannot tell 200 from 2000 is not a
    // guard. These are two different plan prices, so both must be reported
    // and neither may stand in for the other.
    expect(hits('$200 monthly, $2,000 annual — per month $200')).toEqual([200, 2000, 200])
  })

  it('reads every price in a line, not only the first', () => {
    expect(hits('Why is the price $200 instead of $500?')).toEqual([200, 500])
  })

  it('ignores a price written in a comment — the rule is about what renders', () => {
    // Without this the rule is unsatisfiable: `/pricing`, `/why`,
    // `lib/marketing/docs.ts` and the scanner's own header all name both
    // numbers to explain the defect, and the first run of the #620 guard
    // reported six offenders every one of which was a sentence.
    expect(hits('// the $500 list price\nconst x = 1')).toEqual([])
    expect(hits('/* a plan that costs $200 */\nconst x = 1')).toEqual([])
    expect(
      hits('/**\n * quoting the $500 LIST price for a plan that costs $200\n */\nconst x = 1'),
    ).toEqual([])
  })

  it('does NOT let a string hide a price behind a `//`, which a regex stripper would', () => {
    // The blind spot the shared stripper exists for. A
    // `replace(/\/\/.*$/gm)` returns [] here and the literal ships.
    expect(hits("const note = 'special // $200 offer'")).toEqual([200])
    expect(hits('const url = "https://example.com" // $500\nconst p = "$200"')).toEqual([200])
  })

  it('survives escapes inside a string, so a quote cannot end a run early', () => {
    expect(hits("const s = 'it\\'s $200 flat'")).toEqual([200])
  })

  it('reports the line and enough context to say WHICH $200 it means', () => {
    // A failure message that names a file and a number sends the reader
    // hunting; nine of these can be in one file.
    const [hit] = planPriceHits('fixture.ts', 'const a = 1\nconst b = 2\nconst rate = 200\n', PLAN)
    expect(hit!.line).toBe(3)
    expect(hit!.spelling).toBe('assignment')
    expect(formatHit(hit!)).toBe('fixture.ts:3 — 200 (assignment) — const rate = 200')
  })

  it('was ASSEMBLED without losing its escapes — the second-copy hazard, pinned', () => {
    // §2d: a pattern you build rather than write owes a self-check that it
    // still matches something it MUST match. `BAND_BEFORE`/`BAND_AFTER` are
    // concatenated out of `String.raw` fragments now, and the first draft used
    // a PLAIN template literal — where `\$` becomes `$` and `\d` becomes the
    // letter `d`. A silently-broken regex pardons nothing and reports a clean
    // tree, which is the same false green as the bug it was written to catch.
    //
    // These three assertions fail on that mutation and pass on the real thing,
    // which is what makes them a self-check rather than a comment.
    const band = '$800-2,000/mo'
    expect(isBand(band, band.indexOf('2,000'), band.indexOf('2,000') + 5)).toBe(true)
    const dollarFar = 'from $200-$99/mo'
    expect(isBand(dollarFar, dollarFar.indexOf('200'), dollarFar.indexOf('200') + 3)).toBe(true)
    const acrossLines = 'the rate is $200\n- 7 day trial'
    expect(isBand(acrossLines, acrossLines.indexOf('200'), acrossLines.indexOf('200') + 3)).toBe(false)
  })

  it('grades a band by structure, in both directions, on the raw offsets', () => {
    // `isBand` drives the only silent skip in the scanner, so it is asserted
    // directly rather than only through its effect.
    const low = 'from $200-350/mo'
    expect(isBand(low, low.indexOf('200'), low.indexOf('200') + 3)).toBe(true)
    const high = '$800-2,000/mo'
    expect(isBand(high, high.indexOf('2,000'), high.indexOf('2,000') + 5)).toBe(true)
    const solo = 'ours is $200/mo'
    expect(isBand(solo, solo.indexOf('200'), solo.indexOf('200') + 3)).toBe(false)
  })
})

describe('the allowlist is reasoned entry by entry', () => {
  it('gives every entry a file, a value, an anchor and a SENTENCE', () => {
    // §2c: the exemption is keyed per MATCH, never per file — a file-wide
    // exemption is a door, and the tenancy guard's first version proved it by
    // excusing the insurance-card scanner along with the form beside it. The
    // `near` anchor is what makes an entry die when its line is rewritten.
    expect(ALLOWED_QUOTES.length).toBeGreaterThan(0)
    for (const a of ALLOWED_QUOTES) {
      expect(a.file, 'an entry names one file').toMatch(/^(app|components|lib)\//)
      expect(Number.isInteger(a.value)).toBe(true)
      expect(a.near.length, `${a.file} needs an anchor specific enough to expire`).toBeGreaterThan(4)
      expect(
        a.why.length,
        `${a.file} carries no sentence saying why its number is not a plan price`,
      ).toBeGreaterThan(80)
    }
  })

  it('pardons no file wholesale — every entry is one value on one anchored line', () => {
    // A plain record rather than a `Map` walk: `tsconfig.json` targets es5,
    // so iterating a Map is a typecheck error (TS2802) — a rule the whole repo
    // lives under, not a preference of this file.
    const byFile: Record<string, number> = {}
    for (const a of ALLOWED_QUOTES) byFile[a.file] = (byFile[a.file] ?? 0) + 1
    for (const [file, n] of Object.entries(byFile)) {
      expect(n, `${file} has ${n} allowances; a file collecting pardons is turning into a door`).toBeLessThan(3)
    }
  })
})
