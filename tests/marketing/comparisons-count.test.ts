import { describe, it, expect } from 'vitest'
import { COMPARISONS, comparisonCountLabel } from '@/lib/marketing/comparisons'

/**
 * `comparisonCountLabel()` — the derived count in `/compare`'s section opener.
 *
 * WHY THIS FILE EXISTS, GIVEN `marketing-site.test.tsx` ALREADY RENDERS THE
 * PAGE. That test pins the rendered heading against `comparisonCountLabel()`,
 * and that is the right assertion for the CALL SITE: it goes red the moment
 * somebody types a literal into `compare/page.tsx`, which is exactly the
 * defect that shipped on #621 ("Five comparisons" over eight cards).
 *
 * What it cannot catch is a defect one level in, because the page and the test
 * both ask the same function what the answer should be. Drop the leading 'No'
 * from `COUNT_WORDS` and the page reads "Nine comparisons" over eight cards
 * with that test still green — the same wrong number on the same public page,
 * arriving through the door the fix opened (Sentinel, review of #621).
 *
 * So this file STATES the answers instead of asking for them. The inputs are
 * literal and the expectations are literal; nothing here reads
 * `COMPARISONS.length`, so a ninth vendor does not make it stale and does not
 * make it lie.
 */
describe('comparisonCountLabel', () => {
  // The table Sentinel specified. `0` and `1` reach the plural branch's two
  // edges and `13` reaches the numeral fallback — NOTHING on the live site
  // reaches any of them, since the registry has eight entries and will have
  // nine next, which is why they can only be tested by passing the count in.
  it.each([
    [0, 'No comparisons'],
    [1, 'One comparison'],
    [8, 'Eight comparisons'],
    [13, '13 comparisons'],
  ])('renders %i as "%s"', (n, expected) => {
    expect(comparisonCountLabel(n)).toBe(expected)
  })

  // Every word in the map, stated rather than derived — this is what makes the
  // "drop the leading 'No'" mutation fail. An off-by-one anywhere in
  // COUNT_WORDS shifts at least one of these.
  it('spells every count the map covers, in the right place', () => {
    const spelled = [
      'No',
      'One',
      'Two',
      'Three',
      'Four',
      'Five',
      'Six',
      'Seven',
      'Eight',
      'Nine',
      'Ten',
      'Eleven',
      'Twelve',
    ]
    spelled.forEach((word, n) => {
      expect(comparisonCountLabel(n).split(' ')[0], `count ${n} spelled wrong`).toBe(word)
    })
  })

  // The boundary the docblock talks about, asserted rather than described:
  // twelve is the last spelled count, thirteen is the first numeral.
  it('falls back to the numeral one past the end of the map', () => {
    expect(comparisonCountLabel(12)).toBe('Twelve comparisons')
    expect(comparisonCountLabel(13)).toBe('13 comparisons')
    expect(comparisonCountLabel(99)).toBe('99 comparisons')
  })

  // The default argument is the whole reason the page stays honest on its own.
  it('defaults to the registry, so the page needs no argument', () => {
    expect(comparisonCountLabel()).toBe(comparisonCountLabel(COMPARISONS.length))
  })
})
