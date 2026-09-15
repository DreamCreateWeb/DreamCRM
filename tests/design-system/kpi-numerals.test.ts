import { describe, it, expect } from 'vitest'
import { ownAttrs, openingTag, tagSites, tsxFiles } from './jsx-attrs'

/**
 * KPI NUMERALS RIDE THE NUMERAL FACE.
 *
 * v3's migration checklist says it in one line — "numerals → Geist Mono
 * where KPI/money/time/count" — because Nunito's rounded figures are lovely
 * in a sentence and mushy in a column of numbers a person is comparing. The
 * pairing is `font-mono-num` + `tabular-nums`: the first picks the face, the
 * second stops digits from changing width as a count ticks.
 *
 * `tabular-nums` at a KPI size WITHOUT `font-mono-num` is therefore a
 * half-applied recipe — somebody reached for the second half and missed the
 * first — and it reads as a slightly-wrong tile beside a dozen right ones,
 * which is the least likely kind of thing to get reported and the easiest to
 * fix. One violation survived the v3 migration; this stops the second.
 *
 * SCOPE: the dashboard tenants only. The public clinic sites, the patient
 * portal and the marketing site each carry their own type system and their
 * own faces.
 *
 * HOW THE CLASS STRING IS READ, and why it is not a regex any more. This used
 * to match `className=` itself:
 *
 *     /className=(?:"|\{`|')([^"`']{0,400}?)(?:"|`|')/g
 *
 * which had two holes the DREAMCRM-50 mutation pass walked straight through,
 * both of them GREEN with a live offender:
 *
 *   - `className={cn('text-3xl tabular-nums', …)}` — the opening alternation
 *     admits `"`, `` {` `` and `'` only, so every one of the 40 `cn()` call
 *     sites in this repo was invisible. That is the idiom a long conditional
 *     class list is written in, i.e. exactly where a half-applied recipe
 *     hides.
 *   - the `{0,400}` bound — a class list longer than 400 characters (dark
 *     variants plus focus-visible rings gets there easily) simply stopped
 *     matching.
 *
 * It now reads the attribute through `ownAttrs`, the brace- and quote-balanced
 * tag reader the other design-system guards already share. That gives the
 * WHOLE expression whatever it is spelled as — a literal, a template, a
 * `cn(...)` call, any length — so the rule can stop guessing at syntax.
 */

const ROOTS = ['app', 'components']
const SKIP = ['(portal)', 'clinic-site', '/site/', '(marketing)', '(pay)', '(preview)']
const KPI_SIZE = /text-(xl|2xl|3xl|4xl|5xl)\b/

/**
 * Is this className expression a half-applied recipe?
 *
 * The whole expression is judged as one blob. A `cn()` call splits its classes
 * across arguments, and `font-mono-num` legitimately sits in a different
 * argument from `tabular-nums` — asking per-argument would report those as
 * offenders. The cost is a miss when a single element gets the face from one
 * branch and the size from another, which is a shape nobody writes.
 */
export function halfApplied(className: string): boolean {
  if (!className.includes('tabular-nums')) return false
  if (className.includes('font-mono-num')) return false
  return KPI_SIZE.test(className)
}

describe('KPI numerals', () => {
  const files = tsxFiles(ROOTS).filter((f) => !SKIP.some((s) => f.includes(s)))

  it('never wear tabular-nums at KPI size without the numeral face', () => {
    const offenders = tagSites(files)
      .filter((s) => halfApplied(s.attrs.get('className') ?? ''))
      .map((s) => `${s.rel}:${s.line}`)

    expect(
      offenders,
      `tabular-nums at KPI size is half the recipe: it stops the digits\n` +
        `shifting but leaves them in the text face. Add \`font-mono-num\`, or\n` +
        `drop tabular-nums if this is prose rather than a number to compare:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('reads the class list whatever it is spelled as', () => {
    // The two shapes the old regex could not see, plus the ones it could, so
    // neither the reader nor the rule can quietly narrow again.
    const long = 'x'.repeat(420)
    const cases: Array<[string, boolean]> = [
      [`<p className="text-3xl tabular-nums">`, true],
      [`<p className={\`text-3xl tabular-nums \${tone}\`}>`, true],
      [`<p className={cn('text-3xl tabular-nums', sent && 'opacity-60')}>`, true],
      [`<p className={cn('text-3xl tabular-nums ${long}')}>`, true],
      // …and the correct spellings stay quiet.
      [`<p className="text-3xl font-mono-num tabular-nums">`, false],
      [`<p className={cn('text-3xl tabular-nums', 'font-mono-num')}>`, false],
      [`<p className="text-sm tabular-nums">`, false],
      [`<p className="text-3xl">`, false],
    ]
    for (const [tag, expected] of cases) {
      const opened = openingTag(tag, 0)
      expect(opened, `${tag.slice(0, 60)} should parse`).not.toBeNull()
      expect(
        halfApplied(ownAttrs(opened!).get('className') ?? ''),
        `${tag.slice(0, 72)} → expected ${expected}`,
      ).toBe(expected)
    }
  })

  it('is actually reading the dashboard tree', () => {
    // A walk that silently returns nothing passes forever.
    expect(files.length).toBeGreaterThan(200)
    expect(files.some((f) => f.includes('dashboard'))).toBe(true)
    // And the reader has to be finding classNames in it — a tag walk that
    // returned no className at all would also pass forever.
    const withClass = tagSites(files).filter((s) => s.attrs.has('className'))
    expect(withClass.length).toBeGreaterThan(1000)
    expect(withClass.some((s) => (s.attrs.get('className') ?? '').startsWith('cn('))).toBe(true)
  })
})
