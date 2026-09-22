/**
 * THE PLAN PRICE EXISTS ONCE, IN `lib/stripe-config.ts`. EVERYTHING ELSE THAT
 * SAYS THE NUMBER RESOLVES IT THERE — and this module is the EYES of the rule
 * that holds it (DREAMCRM-102).
 *
 * `tests/marketing/pricing-price-source.test.tsx` has asserted the right thing
 * since #620. What it could not do was SEE: its subject was
 * `PRICE_QUOTING_ROUTES`, a hand-written list of ten file paths, and that
 * file's own header recorded the population going up in every single move that
 * opened a file DREAMCRM-38 had not looked at — eight, then nine, then ten.
 * A guard confessing in prose to the hand-kept-list defect is a guard telling
 * you where its next miss will come from. The predicate was right; the eyes
 * are what this module replaces.
 *
 * THE FIELD OF VIEW IS DERIVED, NOT LISTED: every tracked `.ts` / `.tsx` under
 * `app`, `components` and `lib`. A file that quotes the price on the day it is
 * written is graded on that day, by nobody's memory.
 *
 * WHAT THE OLD LIST COULD NOT SEE, measured on `main` at `12fc04e4` before the
 * widening and re-measured on this branch:
 *
 *   - `app/(marketing)/page.tsx` — THE HOMEPAGE, and the loudest surface on
 *     the site: the pricing teaser rendering `$500` struck through beside
 *     `$200` as two literal JSX text nodes, the page metadata description, a
 *     hero chip, a proof card, and `price: 200` inside the JSON-LD a search
 *     engine reads.
 *   - `lib/marketing/comparisons.ts` — the comparison registry, same shape as
 *     `lib/marketing/docs.ts` (which was already on the old list) and far
 *     bigger. Its market BANDS are the reason `/compare` was argued OFF the
 *     old list; see `isBand` below for why that argument does not require a
 *     file-shaped hole.
 *   - `lib/prospect-product-knowledge.ts` — prose a model reads back to a
 *     prospect in our voice, so a stale number here is spoken rather than
 *     merely printed.
 *   - `app/g/[token]/report-view.tsx` — a page a prospect reaches from a link
 *     we sent them.
 *
 * THREE SPELLINGS, BECAUSE THE DOLLAR SIGN WAS NEVER THE PRICE. DREAMCRM-38's
 * worst site was `const LIST_MONTHLY = 500` and the worst this rule has ever
 * caught was `PLAN_PRICE_MONTHLY = 200` in `lib/recall-roi.ts`, which
 * `computeRecallRoi` DIVIDES by — a reprice would not have made `/roi` stale,
 * it would have made the break-even arithmetic the whole page is built around
 * wrong. A scan that needs a `$` walks past both. See `SPELLINGS`.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT SEE, stated here rather than
 * discovered later (§2d — a caveat describing a hole the detector does not
 * have is worse than no caveat; every one below was MEASURED, not reasoned
 * about):
 *
 *   - **A number assembled at runtime.** `200` is not spelled anywhere in
 *     `const n = 2 * 100` or in `Number('2' + '00')`. Nothing in the tree does
 *     this and a guard that tried would be an interpreter.
 *   - **A price written in words** — "two hundred a month". Zero instances.
 *   - **A number reaching a reader from the DATABASE or from an env var.**
 *     Blog bodies are rows; this grades source.
 *   - **A cadence spelled some way `CADENCE` does not list** — "200 monthly",
 *     "200 each month". Zero instances; widen the alternation when one lands
 *     rather than adding a file to an allowlist.
 *   - **`docs/**`, `scripts/**`, `e2e/**` and `tests/**`.** The roots are the
 *     three the product renders from. A price in a doc is stale prose; a price
 *     on a page is a lie to a customer.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments } from './source-text'

/**
 * The three product roots this rule grades, whole.
 *
 * Bare roots rather than a list of divisions on purpose: a new top-level
 * directory under any of them is graded the day it appears. Ten guards on
 * `INTAKE_RULES` are keyed on a hand-written `SCAN_DIRS` and are ungraded when
 * their tree grows a directory (§2, the #615 field-of-view shape, live in ten
 * files at once) — this one is not going to be the eleventh.
 */
export const PRICE_ROOTS = ['app', 'components', 'lib']

/**
 * Every tracked source file under the three roots.
 *
 * `git ls-files` rather than `readdirSync`: it asks the index, so a generated
 * file, an ignored build artefact or somebody's scratch copy is not graded —
 * and the set is exactly what a reviewer would see in a diff.
 *
 * ⚠️ IT IS THEREFORE BLIND TO A FILE YOU HAVE NOT STAGED (§2d). `git add` is a
 * step of the verifying run, not of the commit after it.
 */
export function priceQuotingFiles(cwd: string = process.cwd()): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...PRICE_ROOTS], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out
    .split('\u0000')
    .filter((f) => /\.tsx?$/.test(f))
    .sort()
}

export type Spelling = 'dollar' | 'cadence' | 'assignment'

export interface PriceHit {
  /** Repo-relative, forward slashes. */
  file: string
  /** 1-indexed, for a failure message somebody can click. */
  line: number
  /** Byte offset in the comment-stripped source — what SOURCE ORDER means
   *  when three regex passes each sweep the file independently. */
  index: number
  /** The number as written, commas and all — `2,000`, not `2000`. */
  text: string
  /** The number as a number, which is what gets compared to the plan. */
  value: number
  spelling: Spelling
  /** The source line, trimmed, so the failure says WHICH `$200` it means. */
  context: string
}

/**
 * A `$`-prefixed money literal.
 *
 * `$${…}` — a template interpolation — is not a literal and does not match,
 * which is what lets every fixed surface keep its one `usd()` helper. The
 * `(?!\.\d)` is there so `$2.50` reports 2.50's worth of nothing rather than
 * a bare `2`.
 */
const DOLLAR = /\$(\d+(?:,\d{3})*)(?!\w)(?!\.\d)/g

/**
 * A bare number carrying a CADENCE — `200/mo`, `200 a month`, `2,000 per
 * year`. No dollar sign required, because prose drops it constantly and the
 * number is still a price the moment it is followed by "/mo".
 *
 * The leading group is a boundary rather than a lookbehind so the expression
 * stays readable and the hit's offset is computable without one; `$` is
 * excluded from it because a `$`-prefixed number is already `DOLLAR`'s, and
 * counting it twice would report the same site under two spellings.
 */
const CADENCE =
  /(^|[^\w.$])(\d+(?:,\d{3})*)\s*(?:\/\s*(?:mo|mos|month|months|yr|year|years)|\s+(?:a|per)\s+(?:mo|month|yr|year))(?![\w-])/gi

/**
 * A number assigned to a PRICE-SHAPED NAME — `LIST_MONTHLY = 500`,
 * `price: 200`, `rateAnnual = 2000`.
 *
 * THIS IS THE SPELLING THE ORIGINAL SOURCE SCAN WALKED STRAIGHT PAST, and it
 * is the one that has found the two worst sites in the rule's history: the old
 * `price-card.tsx` (`const LIST_MONTHLY = 500`, printed through
 * `toLocaleString()`) and `lib/recall-roi.ts` (`PLAN_PRICE_MONTHLY = 200`,
 * DIVIDED by). A price that is an INPUT TO A CALCULATION does not go stale at
 * a reprice — it goes WRONG — and it never carries a dollar sign.
 *
 * `NAME_IS_PRICEY` is the discriminator, and it is deliberately a small closed
 * vocabulary rather than "any identifier". A bare `= 200` scan is noise with a
 * rule attached: `200` is a Tailwind step, a pixel value, a row count, an HTTP
 * status and a timeout, and §2d is explicit that a guard which fires on
 * something innocent is a guard somebody turns off.
 */
const ASSIGNMENT = /(^|[^\w$.])(['"]?)([A-Za-z_$][\w$]*)\2\s*[:=]\s*(\d+(?:,\d{3})*)(?![\w.])/g

/**
 * The names that make a bare number a price.
 *
 * MEASURED, not guessed: this vocabulary was widened until it caught every
 * dollar-signless plan price the census found and then stopped, and the
 * innocents it swept in at each step are recorded in the test beside it.
 * `amount` is absent on purpose — this repo's money columns are `amountCents`,
 * so every `amount` in the tree is cents and a plan price in cents (20000)
 * is not a number this rule is looking for.
 */
const NAME_IS_PRICEY = /price|rate|cost|fee|msrp|mrr|monthly|annual/i

/**
 * A RANGE — the discriminator that does the most work, and the reason
 * `/compare` does not need to be a hole in the field of view.
 *
 * `'$200–350/mo'` for a booking vendor, `$800-2,000/mo` for a tool stack: the
 * low end of the first is the same integer as our rate today and the high end
 * of the second is the same integer as our annual, and NEITHER IS OUR PRICE.
 * The old guard's answer was to leave `/compare` off its list, which is a
 * file-shaped hole — everything else on that page, including its genuine
 * `$200/mo` quotes, went ungraded with it.
 *
 * IT IS STRUCTURAL RATHER THAN NOMINAL, and that is what makes it safe to
 * derive: a band is two numbers joined by a dash, which is a fact about the
 * text rather than about which file it is in or what a vendor is called. A
 * competitor added next month gets the same treatment with nobody editing a
 * list — the shape §2d asks for, derived from what identifies the SUBJECT
 * rather than from the property the check itself grades.
 *
 * Both directions, because a plan price can be either end of a band: `200–350`
 * (ours is the low end) and `800-2,000` (ours is the high end). Hyphen, en
 * dash and em dash; an optional `$` on the far number, which prose writes both
 * ways (`$800-2,000` and `$800-$2,000`).
 */
const BAND_BEFORE = /\d(?:[\d,]*\d)?\s*[-–—]\s*\$?$/
const BAND_AFTER = /^\s*[-–—]\s*\$?\d/

/**
 * Is the number at `[start, end)` one end of a market band rather than a
 * quote of our own price?
 */
export function isBand(code: string, start: number, end: number): boolean {
  return BAND_BEFORE.test(code.slice(Math.max(0, start - 32), start)) || BAND_AFTER.test(code.slice(end))
}

/**
 * THE ONE FILE THE PRICE IS ALLOWED TO EXIST IN.
 *
 * Not an exemption — the rule's own subject. "The plan's price exists ONCE,
 * in `lib/stripe-config.ts`" is the invariant, so the definition is what the
 * other 1,341 files are graded against rather than a case against them. The
 * test beside this asserts the four numbers are still HERE, which is the
 * premise every offender list is worth nothing without: a scan whose subject
 * has quietly moved reports a beautifully clean tree.
 */
export const PRICE_SOURCE = 'lib/stripe-config.ts'

/**
 * THE ALLOWLIST — four entries, each carrying the sentence that makes it
 * NOT-A-PLAN-PRICE. This is the part that decides whether the rule survives
 * contact, so read it as policy rather than as plumbing.
 *
 * **KEYED PER MATCH, NEVER PER FILE.** §2c's two zero-tolerance guards both
 * learned this the expensive way: the tenancy guard's first version excused
 * whole FILES, which swept the insurance-card scanner in along with the intake
 * form beside it, and putting `orgId: string,` back into the scanner left every
 * case green. A file-wide exemption is a door. An entry here names the file,
 * the value AND a `near` substring that must still be on the line — so editing
 * the line kills the pardon and the next run says so, which is the safe
 * direction.
 *
 * **WHAT IS NOT HERE, because it is structural instead.** The biggest class by
 * far — competitor and market BANDS — is handled by `isBand` above and costs
 * this list nothing. That matters: `/compare` alone would otherwise have put
 * eight vendor bands here, and a list that grows with the marketing site is
 * the hand-kept list this whole issue exists to delete.
 *
 * **THE CLASSES, and why each is not our price:**
 *
 *   1. A COMPETITOR'S estimated monthly spend, as a single figure rather than
 *      a band. `isBand` cannot see it — there is no second number — so it is
 *      named, and the reason is that the deal room is ABOUT what somebody else
 *      charges.
 *   2. A THIRD PARTY'S THRESHOLD. CareCredit's promotional financing starts at
 *      purchases over $200; the integer is a coincidence and the sentence is
 *      about their product. Deliberately NOT generalised into a
 *      "comparator preposition" detector — "plans from $200/mo" is how our OWN
 *      price gets written, so a threshold rule would be a hole in the shape of
 *      the most likely next defect.
 *   3 and 4. A MONTHLY COUNT rather than a monthly price. `MONTHLY_CAP = 200`
 *      is 200 AI translations and `INCLUDED_MONTHLY_SEGMENTS = 2000` is 2,000
 *      SMS segments. `NAME_IS_PRICEY` matches them on `monthly`, which it must
 *      keep — `LIST_MONTHLY = 500` is the defect that spelling exists for.
 *      Narrowing the vocabulary to lose these two would lose that one with
 *      them, so they are named instead of the rule being blunted.
 */
export interface AllowedQuote {
  file: string
  value: number
  /** A substring that must still be on the matched line, or the pardon dies. */
  near: string
  why: string
}

export const ALLOWED_QUOTES: AllowedQuote[] = [
  {
    file: 'lib/prospect-vendors.ts',
    value: 500,
    near: 'estMonthly',
    why:
      "A COMPETITOR'S estimated monthly cost, not ours. `prospect-vendors.ts` is the deal " +
      "room's list of vendors we would displace and what a practice is likely paying each of " +
      'them; PatientPop / Tebra landing on the same integer as our list price is a coincidence, ' +
      'and a reprice must not touch it. It is a single figure rather than a band, so `isBand` ' +
      'cannot see it.',
  },
  {
    file: 'lib/services/demo-clinic/clinic-config.ts',
    value: 200,
    near: 'financing',
    why:
      "A THIRD PARTY'S THRESHOLD. CareCredit's promotional 0% APR applies to qualifying " +
      'purchases over $200 — their minimum, in seeded demo copy about their product. Nothing ' +
      'about our plan changes it.',
  },
  {
    file: 'lib/services/form-translate.ts',
    value: 200,
    near: 'MONTHLY_CAP',
    why:
      'A COUNT, not money: 200 AI form translations per org per month. It matches on `monthly`, ' +
      'which `NAME_IS_PRICEY` has to keep because `LIST_MONTHLY = 500` is the dollar-signless ' +
      'defect that spelling exists for.',
  },
  {
    file: 'lib/sms.ts',
    value: 2000,
    near: 'INCLUDED_MONTHLY_SEGMENTS',
    why:
      'A COUNT, not money: 2,000 included SMS segments per month. Same reading as ' +
      '`MONTHLY_CAP` above — the unit is segments, and the number moves with carrier ' +
      'economics rather than with the plan.',
  },
]

const allows = (entry: AllowedQuote, hit: PriceHit): boolean =>
  entry.file === hit.file && entry.value === hit.value && hit.context.includes(entry.near)

/**
 * Split a scan into what still offends and which pardons have stopped
 * matching anything.
 *
 * THE SECOND HALF IS THE POINT — the `#587` / `#594` dead-exclusion family in
 * its fifth pointing. A scan that has stopped finding something looks exactly
 * like a clean tree, and a pardon whose site was deleted or rewritten goes on
 * pardoning whatever lands on that file and value next. Both directions fail.
 */
export function partition(hits: PriceHit[]): { offenders: PriceHit[]; deadAllowances: AllowedQuote[] } {
  const offenders = hits.filter((h) => !ALLOWED_QUOTES.some((a) => allows(a, h)))
  const deadAllowances = ALLOWED_QUOTES.filter((a) => !hits.some((h) => allows(a, h)))
  return { offenders, deadAllowances }
}

const lineOf = (code: string, index: number): number => {
  let n = 1
  for (let i = 0; i < index; i++) if (code[i] === '\n') n++
  return n
}

const contextOf = (code: string, index: number): string => {
  const from = code.lastIndexOf('\n', index) + 1
  let to = code.indexOf('\n', index)
  if (to === -1) to = code.length
  const raw = code.slice(from, to).trim()
  return raw.length > 160 ? `${raw.slice(0, 157)}…` : raw
}

/**
 * Every number in `source` that is spelled as a price AND equals one of
 * `planPrices`, with the bands dropped.
 *
 * Comments are blanked first — through the shared stripper in
 * `./source-text`, not a copy of one. Without that the rule is unsatisfiable:
 * this module's own header names both numbers to explain the defect, exactly
 * as `/pricing`, `/why` and `lib/marketing/docs.ts` do, and the first run of
 * the old guard reported six offenders every one of which was a sentence.
 * (The stripper PRESERVES OFFSETS, which is why line numbers survive it.)
 */
export function planPriceHits(file: string, source: string, planPrices: ReadonlySet<number>): PriceHit[] {
  const code = stripComments(source)
  const hits: PriceHit[] = []
  const seen = new Set<number>()

  const add = (start: number, text: string, spelling: Spelling) => {
    const value = Number(text.replace(/,/g, ''))
    if (!planPrices.has(value)) return
    if (seen.has(start)) return
    if (isBand(code, start, start + text.length)) return
    seen.add(start)
    hits.push({
      file,
      line: lineOf(code, start),
      index: start,
      text,
      value,
      spelling,
      context: contextOf(code, start),
    })
  }

  let m: RegExpExecArray | null
  // `exec` in a loop rather than `[...matchAll()]`: `tsconfig.json` targets
  // es5, so spreading an iterator is a typecheck error (TS2802) — a rule the
  // whole repo lives under, not a preference of this file.
  const dollar = new RegExp(DOLLAR.source, 'g')
  while ((m = dollar.exec(code)) !== null) add(m.index + 1, m[1]!, 'dollar')

  const cadence = new RegExp(CADENCE.source, 'gi')
  while ((m = cadence.exec(code)) !== null) add(m.index + m[1]!.length, m[2]!, 'cadence')

  const assignment = new RegExp(ASSIGNMENT.source, 'g')
  while ((m = assignment.exec(code)) !== null) {
    if (!NAME_IS_PRICEY.test(m[3]!)) continue
    add(m.index + m[0]!.length - m[4]!.length, m[4]!, 'assignment')
  }

  // SOURCE ORDER, not report order. The three passes above each sweep the
  // whole file, so without this a failure lists a line's second price before
  // its first and a reader has to re-find the site by hand.
  return hits.sort((a, b) => a.index - b.index)
}

/**
 * The whole tree, graded — `PRICE_SOURCE` excluded, because the definition is
 * the thing everything else is graded against. `planPriceHits` itself has no
 * such carve-out, so `sourceCarriesThePrices` below can point the same
 * extractor at the definition and check the premise.
 */
export function scanTreeForPlanPriceLiterals(
  planPrices: ReadonlySet<number>,
  cwd: string = process.cwd(),
): PriceHit[] {
  const out: PriceHit[] = []
  for (const rel of priceQuotingFiles(cwd)) {
    if (rel === PRICE_SOURCE) continue
    const source = readFileSync(join(cwd, rel), 'utf8')
    for (const hit of planPriceHits(rel, source, planPrices)) out.push(hit)
  }
  return out
}

/**
 * Which of the plan's prices `PRICE_SOURCE` still spells out.
 *
 * THE PREMISE CHECK, and the one this rule cannot live without. Every
 * assertion downstream is an ABSENCE — *this scan returns nothing* — so a
 * subject that has quietly moved (the plan renamed, the numbers hoisted into
 * an env var, the extractor narrowed by a refactor) makes the whole rule
 * GREENER, which is invisible from every direction the rest of the file looks
 * (§2d, the reader's-own-eyes lesson).
 */
export function sourceCarriesThePrices(
  planPrices: ReadonlySet<number>,
  cwd: string = process.cwd(),
): number[] {
  const source = readFileSync(join(cwd, PRICE_SOURCE), 'utf8')
  const found = new Set(planPriceHits(PRICE_SOURCE, source, planPrices).map((h) => h.value))
  return Array.from(found).sort((a, b) => a - b)
}

/** `app/(marketing)/page.tsx: line 447 — $200 (dollar) — <span …>$200</span>` */
export const formatHit = (h: PriceHit): string =>
  `${h.file}:${h.line} — ${h.text} (${h.spelling}) — ${h.context}`
