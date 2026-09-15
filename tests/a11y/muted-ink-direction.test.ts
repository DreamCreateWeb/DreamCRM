import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AA, contrast, DARK, LIGHT, ROOT, SURFACES, token } from './palette'

/**
 * THE MUTED-LABEL INK RUNS gray-500 IN THE LIGHT AND gray-400 IN THE DARK —
 * NEVER THE OTHER WAY ROUND.
 *
 * FOUND BY A RED `e2e` ON `main` (2026-09-15, DREAMCRM-63's branch update).
 * `staff: appointment drawer open` and `staff: cancel-appointment confirmation
 * over the drawer` both hold a ceiling of ZERO and both reported
 * `color-contrast ×1`, at `.mr-0\.5.dark\:text-gray-500.text-gray-400` —
 * **#93a0bc on #f3f7fe, measured 2.44:1, 12px, normal weight**. The element is
 * the "Views:" label of the shared saved-views bar
 * (`components/saved-views/saved-views-bar.tsx`), which arrived with #587 and
 * reaches that stop through the appointments agenda.
 *
 * It had the pair the wrong way round, and the palette says so in both
 * directions at once — which is what makes this a FACT rather than a
 * preference. Re-derived below rather than transcribed:
 *
 *   light   gray-400  2.29 – 2.63   ✗ every surface
 *   light   gray-500  4.63 – 5.30   ✓ every surface
 *   dark    gray-400  5.73 – 7.07   ✓ every surface
 *   dark    gray-500  2.84 – 3.51   ✗ every surface
 *
 * So `text-gray-400 dark:text-gray-500` is not a near miss; it is the legible
 * step and the illegible one swapped, in both themes. The bar's own twin
 * (`app/(default)/patients/saved-views-bar.tsx`) had it right, as do the two
 * labels in `agenda-view.tsx` and the one in `feedback-admin.tsx`.
 *
 * WHY NO EXISTING GUARD SAW IT, which is the part worth keeping. The
 * dark-mode parity scanner (rule 1, `tests/a11y/class-pairs.ts`) grades a pair
 * — an ink AND a surface in one quoted string. This chunk carries no `bg-*` at
 * all: it inherits whatever surface it lands on. That is a documented false
 * negative of rule 1, not a defect in it, and widening rule 1 to grade an ink
 * against every possible ancestor is the "208 places to catch 8" trade its own
 * header refuses.
 *
 * ~~**THE SWEEP IS NOT DONE, AND THAT IS DELIBERATE.**~~ **THE SWEEP IS DONE —
 * UI batch 64, DREAMCRM-62, the same day.** This file shipped fixing the ONE
 * element that turned a required check red and handed the other 176 to the UI
 * lane with the measurement above; that hand-off was taken, and
 * `text-gray-400 dark:text-gray-500` now appears at **zero sites** across
 * `app/`, `components/` and `lib/`. The house pattern is the right one now.
 *
 * THIS FILE STILL EARNS ITS PLACE, and the reason is the division of labour
 * rather than sentiment. It grades the PALETTE — that the direction is a fact
 * derivable from the ramp in both themes, not a preference — and pins the
 * exact string on the two saved-views bars. The tree-wide half is
 * `tests/a11y/class-pairs.ts` rule 6 + `tests/a11y/quiet-ink.test.ts`, which
 * arrived with that sweep and holds every such pair at zero by measuring
 * against the best-case surface of each theme. Two instruments, different
 * subjects, no shared inventory to disagree about: this one would fail if the
 * palette moved under the rule, that one if a call site drifted back.
 *
 * Do not read a green run HERE as a clean tree even so — it grades the palette
 * and two named components, and says so.
 */

const LIGHT_INK = 'gray-500'
const DARK_INK = 'gray-400'

describe('the muted label ink is gray-500 in the light and gray-400 in the dark', () => {
  it('derives the direction from the palette rather than asserting it', () => {
    // Both halves, on every surface the design system declares. Without the
    // failing half this would pass on a pair that happened to clear one way
    // and be unreadable the other — which is exactly the shipped defect.
    for (const surface of SURFACES) {
      const lightGood = contrast(token(LIGHT, LIGHT_INK), token(LIGHT, surface))
      const lightBad = contrast(token(LIGHT, DARK_INK), token(LIGHT, surface))
      const darkGood = contrast(token(DARK, DARK_INK), token(DARK, surface))
      const darkBad = contrast(token(DARK, LIGHT_INK), token(DARK, surface))

      expect(lightGood, `light: ${LIGHT_INK} on ${surface}`).toBeGreaterThanOrEqual(AA)
      expect(lightBad, `light: ${DARK_INK} on ${surface} must NOT be a text colour`).toBeLessThan(AA)
      expect(darkGood, `dark: ${DARK_INK} on ${surface}`).toBeGreaterThanOrEqual(AA)
      expect(darkBad, `dark: ${LIGHT_INK} on ${surface} must NOT be a text colour`).toBeLessThan(AA)
    }
  })

  it('pins the measurement the red run reported, so the fix is checkable', () => {
    // axe measured #93a0bc on the drawer's #f3f7fe at 2.44. `canvas` light is
    // that surface; if the palette moves and this stops being 2.44, the note
    // above has gone stale and wants re-measuring rather than trusting.
    const measured = contrast(token(LIGHT, DARK_INK), token(LIGHT, 'canvas'))
    expect(measured.toFixed(2), 'the ratio axe reported at the drawer stop').toBe('2.44')
  })

  it('the shared saved-views bar states the pair the right way round', () => {
    // The one site this change fixes. Watched red against the shipped string
    // (`text-gray-400 dark:text-gray-500`) before the swap.
    const bars = [
      'components/saved-views/saved-views-bar.tsx',
      // Its twin, which was already correct — pinned so a future edit cannot
      // quietly bring the two back into disagreement in the other direction.
      'app/(default)/patients/saved-views-bar.tsx',
    ]
    for (const file of bars) {
      const src = readFileSync(join(ROOT, file), 'utf8')
      expect(
        src,
        `${file} paints its "Views:" label with an ink that is unreadable in ` +
          `light mode (${DARK_INK} measures 2.29-2.63 on every surface). The ` +
          `pair is text-${LIGHT_INK} dark:text-${DARK_INK}, and since UI batch ` +
          `64 that is true of every such pair in the tree — tests/a11y/` +
          `quiet-ink.test.ts holds the tree-wide half at zero, so a lone ` +
          `failure here means this file drifted rather than that a sweep is owed.`,
      ).toContain(`text-${LIGHT_INK} dark:text-${DARK_INK} mr-0.5">Views:`)
      expect(src).not.toContain(`text-${DARK_INK} dark:text-${LIGHT_INK} mr-0.5">Views:`)
    }
  })
})
