import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { A11Y_BASELINE } from '../../e2e/axe-baseline'

/**
 * THE AXE BASELINE HAS ONE HOME, AND IT IS NOT A SENTENCE IN A DOC.
 *
 * `docs/E2E.md` used to restate the baseline total in prose — "what is in the
 * baseline today: 36, all `color-contrast`". `e2e/axe-baseline.ts` said 18. Two
 * homes for one fact, already two batches apart, and the wrong one was the one
 * written in prose, because it is the one nobody has to touch when they fix a
 * contrast defect.
 *
 * That drift is not cosmetic. A ceiling is room a defect can hide in, so a doc
 * reporting the room as LARGER than it is describes debt that has already been
 * paid off — it makes the burn-down look stalled and, read the other way, it
 * makes a real regression look like something already accounted for.
 *
 * So the doc points at the file, and this keeps it pointing. The check is
 * deliberately narrow: it does not try to police every number in a long
 * document, only the exact shape that drifted — a count asserted "all
 * `color-contrast`". If somebody writes that sentence again, it has to be true.
 */

const DOC = 'docs/E2E.md'
const BASELINE_FILE = 'e2e/axe-baseline.ts'

function doc(): string {
  return readFileSync(join(process.cwd(), DOC), 'utf8')
}

/** What `e2e/axe-baseline.ts` actually carries, right now. */
function baselineTotal(): number {
  return Object.values(A11Y_BASELINE).reduce(
    (sum, rules) => sum + Object.values(rules).reduce((n, ceiling) => n + ceiling, 0),
    0,
  )
}

describe('docs/E2E.md and the axe baseline', () => {
  it('points at the baseline file as the home for the count', () => {
    expect(
      doc(),
      `${DOC} must name ${BASELINE_FILE} as where the current baseline lives. A reader who cannot ` +
        `find the real home will trust whatever number the prose happens to carry.`,
    ).toContain(BASELINE_FILE)
  })

  it('does not restate a total that disagrees with the file', () => {
    const total = baselineTotal()
    const claims = Array.from(doc().matchAll(/(\d+),?\s*all\s*`color-contrast`/g)).map((m) =>
      Number(m[1]),
    )

    for (const claimed of claims) {
      expect(
        claimed,
        `${DOC} says the baseline holds ${claimed} \`color-contrast\` violations; ${BASELINE_FILE} ` +
          `holds ${total}. Do not re-sync the sentence — delete it and point at the file. A number ` +
          `that has to be hand-updated on every UI fix is a number that will be wrong again by the ` +
          `next batch, and a ceiling reported too high describes room to hide that no longer exists.`,
      ).toBe(total)
    }
  })
})
