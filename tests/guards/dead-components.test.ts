import { describe, it, expect } from 'vitest'
import { deadComponents } from '../../scripts/find-dead-bones.mjs'

/**
 * ML-60 — "nothing imports it" is a failing test. Every module under
 * components/ must have an importer. The Mosaic template's leftovers were
 * fossils; this keeps the next generation of them from accumulating.
 *
 * DATED ALLOWLIST — may only SHRINK. An entry that gains an importer (or is
 * deleted) must be removed here: the last test fails on a stale line.
 * `node scripts/find-dead-bones.mjs` prints the live list.
 */
const TEST_ONLY_ALLOWLIST: Record<string, string> = {
  // A deliberate shared primitive (#452), exercised by its own test, awaiting
  // its first consumer. Kept 2026-11-09 (ML-60): a plausible reader.
  'components/ui/use-optimistic-toggle.ts': '2026-11-09',
}

describe('dead components', () => {
  const { dead, testOnly } = deadComponents()

  it('every components/ module has at least one importer', () => {
    expect(dead, 'unimported component — delete it (node scripts/find-dead-bones.mjs)').toEqual([])
  })

  it('a component only a test imports is on the dated allowlist', () => {
    expect(Object.keys(testOnly).filter((k) => !(k in TEST_ONLY_ALLOWLIST))).toEqual([])
  })

  it('the allowlist only shrinks: no stale entries', () => {
    expect(Object.keys(TEST_ONLY_ALLOWLIST).filter((k) => !(k in testOnly))).toEqual([])
  })
})
