import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as portal from '@/components/patient-portal/ui'
import { AA, contrast, hexToRgb, ROOT } from './palette'

/**
 * THE PORTAL'S OWN PALETTE, GRADED — every ink it owns, on every surface it
 * owns.
 *
 * `tests/a11y/token-contrast.test.ts` does this for the dashboard, out of the
 * stylesheet. The portal is not in that palette: it is a warm cream world with
 * its own hexes, single-homed in `components/patient-portal/ui.tsx` and banned
 * everywhere else by `portal-tokens.test.ts`. Nothing had ever multiplied the
 * two lists together.
 *
 * WHAT IT COST TO NOT HAVE THIS. The slot grid's "taken" time was a one-off
 * warm grey, `#B9B0A5`, on a one-off warm well, `#F3EEE7` — **1.85:1**. Both
 * ends of the pair were written raw at the call site, so neither guard could
 * see it: `portal-tokens.test.ts` bans the hexes it has been TOLD about, and
 * the browser suite only measures what a spec puts on screen — no `portal:`
 * stop ever loads a day with a booked slot in it. It was measured by hand in
 * batch 62 and carried as an OPEN NOW entry until batch 64.
 *
 * THE POINT IS THE SURFACE, not the ink. The portal added two inks and four
 * washes over the program and every one of them was graded on arrival; what
 * nobody graded was a new GROUND, because a background looks like a decoration
 * until something is written on it. So the rule below is keyed off the token
 * module: a new `PORTAL_*` hex has to declare which half of a pair it is, and
 * then it is multiplied against the other half automatically.
 *
 * It holds at ZERO with no ceiling, like every other source rule in this
 * directory. The worst pair in the portal today is 4.60.
 *
 * WHAT IT DOES NOT SEE — false negatives by design:
 *   · The clinic BRAND, which is data rather than a token. `portal-brand.ts`
 *     derives it against the ground and `portal-brand.test.ts` grades it.
 *   · A colour a portal file spells raw. `portal-tokens.test.ts` is what makes
 *     that impossible for the hexes it lists — which is why the wash joined
 *     that list in the same batch as this file.
 *   · Which ink actually lands on which surface. It grades the whole product,
 *     so a pair the product never renders still has to clear AA. That is the
 *     cheap direction to be wrong in.
 */

/** Every hex the token module exports, by its token name. */
const TOKENS: Record<string, string> = Object.fromEntries(
  Object.entries(portal).filter(
    ([name, value]) => name.startsWith('PORTAL_') && typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value),
  ) as [string, string][],
)

/**
 * Which half of a contrast pair each token is, decided by its NAME so a new
 * token cannot arrive unclassified — the `it` below fails on one that does.
 *
 * `_BORDER` is neither: a hairline carries no text and WCAG 1.4.11 grades a
 * boundary at 3:1 against its neighbours, which is a different rule from this
 * one and not one this file is pretending to enforce.
 */
const SURFACE_SUFFIX = /(_BG|_WASH)$/
const INK_SUFFIX = /(_INK|_MUTED|_ERROR)$/
const NOT_A_PAIR = /_BORDER$/

const surfaces = Object.keys(TOKENS).filter((n) => SURFACE_SUFFIX.test(n))
const inks = Object.keys(TOKENS).filter((n) => INK_SUFFIX.test(n))

describe('the portal palette', () => {
  it('classifies every token it exports (a new one cannot arrive ungraded)', () => {
    const unclassified = Object.keys(TOKENS).filter(
      (n) => !SURFACE_SUFFIX.test(n) && !INK_SUFFIX.test(n) && !NOT_A_PAIR.test(n),
    )
    expect(
      unclassified,
      'A new PORTAL_* hex has to say whether it is an ink or a surface, or it is not graded ' +
        'against anything — which is exactly how the taken-slot well got in. Name it *_INK / ' +
        '*_MUTED / *_ERROR or *_BG / *_WASH:\n  ' +
        unclassified.join('\n  '),
    ).toEqual([])
  })

  it('reads a real palette (the lists are not silently empty)', () => {
    // A rule that multiplies two empty lists passes forever.
    expect(surfaces.length).toBeGreaterThanOrEqual(5)
    expect(inks.length).toBeGreaterThanOrEqual(5)
    expect(TOKENS.PORTAL_WASH).toBe('#F3EEE7')
  })

  it('clears AA for every ink on every surface', () => {
    const failures: string[] = []
    for (const ink of inks) {
      for (const surface of surfaces) {
        const ratio = contrast(hexToRgb(TOKENS[ink]), hexToRgb(TOKENS[surface]))
        if (ratio < AA) failures.push(`${ink} ${TOKENS[ink]} on ${surface} ${TOKENS[surface]} = ${ratio.toFixed(2)}`)
      }
    }
    expect(failures, `portal pairs under ${AA}:1\n  ${failures.join('\n  ')}`).toEqual([])
  })

  it('and on the white card, which is a surface the module does not name', () => {
    // Cards are plain `#FFFFFF` in the primitives rather than a token. White
    // is the LIGHTER of the two grounds, so it is the easy direction — graded
    // anyway, because "the ground is not a token" is how the wash got missed.
    const failures = inks.filter((ink) => contrast(hexToRgb(TOKENS[ink]), [255, 255, 255]) < AA)
    expect(failures).toEqual([])
  })
})

describe('the taken time slot', () => {
  const SLOT_PICKER = 'components/patient-portal/slot-picker.tsx'
  const source = readFileSync(join(ROOT, SLOT_PICKER), 'utf8')

  it('paints itself out of the token module, not out of a one-off hex', () => {
    expect(source).toContain('style={{ color: MUTED, backgroundColor: WASH }}')
    expect(
      source.includes('#B9B0A5'),
      'the retired one-off grey is back in the slot picker — it is 1.85:1 on the wash',
    ).toBe(false)
  })

  it('still says "taken" without using colour to say it', () => {
    // The strikethrough and the sr-only suffix are what carry the state. The
    // fix above makes the label legible; it must not have made the state
    // depend on being able to tell two warm greys apart.
    expect(source).toContain('line-through')
    expect(source).toContain('<span className="sr-only"> — taken</span>')
  })

  it('pins what was wrong with the old pair, rather than asserting the new one is fine', () => {
    // The floor is exercised in both directions from the same maths: the
    // retired grey really does miss AA on this wash, and PORTAL_MUTED really
    // does clear it. A rule whose failing case is only described in prose is a
    // rule nobody has watched fail.
    const wash = hexToRgb(portal.PORTAL_WASH)
    expect(contrast(hexToRgb('#B9B0A5'), wash)).toBeLessThan(AA)
    expect(contrast(hexToRgb(portal.PORTAL_MUTED), wash)).toBeGreaterThanOrEqual(AA)
  })
})
