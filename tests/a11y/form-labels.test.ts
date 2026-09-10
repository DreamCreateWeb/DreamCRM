import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The form-label burn-down guard.
 *
 * `jsx-a11y/label-has-associated-control` landed in batch 52 with 77 existing
 * offenders across 23 files, suppressed BY COUNT in `eslint-suppressions.json`
 * so the class could not grow while it was burned down. Batch 53 closed it:
 * every one of those 77 fields now has an accessible name, and the
 * suppressions file is empty.
 *
 * `pnpm lint` already fails on a NEW unassociated label — the rule is an
 * error and there is nothing left suppressing it. What lint cannot catch is
 * the OTHER way the class comes back: someone runs `eslint --suppress-rule`
 * (or `--suppress-all`) to get a red gate green, and 78 becomes the new
 * floor with no code review ever seeing a label. That is what this test
 * pins — the file has to stay empty of this rule, so re-suppressing it is a
 * visible, deliberate edit that fails the suite.
 *
 * If a genuinely un-nameable control ever needs an exception, it belongs in
 * the component with a comment explaining why, not in a bulk-suppression
 * count nobody reads.
 */

const ROOT = resolve(__dirname, '../..')
const RULE = 'jsx-a11y/label-has-associated-control'

type Suppressions = Record<string, Record<string, { count: number }>>

describe('form labels stay associated with their controls', () => {
  it('nothing suppresses the label rule any more — the 77 are burned down', () => {
    const raw = readFileSync(resolve(ROOT, 'eslint-suppressions.json'), 'utf8')
    const suppressions = JSON.parse(raw) as Suppressions

    const offenders = Object.entries(suppressions)
      .filter(([, rules]) => RULE in rules)
      .map(([file, rules]) => `${file} (${rules[RULE].count})`)

    expect(
      offenders,
      `${RULE} is suppressed again in:\n  ${offenders.join('\n  ')}\n` +
        'Give the field a real accessible name instead of re-suppressing it — ' +
        'a suppressed label is a field a screen reader reads as "edit text, blank".',
    ).toEqual([])
  })

  it('the rule itself is still ON at error, on the `either` assertion', () => {
    // A suppressions file can also be emptied by turning the rule off, which
    // would leave this file passing while the gate it guards is gone.
    const config = readFileSync(resolve(ROOT, 'eslint.config.mjs'), 'utf8')
    expect(config).toContain(`'${RULE}': [`)
    expect(config).toMatch(
      new RegExp(`'${RULE.replace('/', '\\/')}':\\s*\\[\\s*\\n?\\s*'error'`),
    )
    expect(config).toMatch(/assert:\s*'either'/)
  })
})
