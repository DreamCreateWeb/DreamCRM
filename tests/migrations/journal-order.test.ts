import { describe, it, expect } from 'vitest'
import journal from '@/lib/db/migrations/meta/_journal.json'

/**
 * Drizzle's migrator applies a journal entry only when its `when` exceeds the
 * ledger's max applied timestamp — an entry with a SMALLER `when` than an
 * earlier-applied migration is silently skipped (this took the demo site down
 * on 2026-06-12 when 0062's real timestamp lost to 0061's hand-rounded future
 * one). Pin strict monotonicity so it can never happen again.
 */
describe('migration journal ordering', () => {
  it('idx values are strictly increasing', () => {
    const idxs = journal.entries.map((e: { idx: number }) => e.idx)
    for (let i = 1; i < idxs.length; i++) expect(idxs[i], `entry ${i}`).toBeGreaterThan(idxs[i - 1])
  })

  it('when timestamps are strictly increasing with idx (drizzle applies by when)', () => {
    const entries = journal.entries as Array<{ when: number; tag: string }>
    // 0007 and 0054 carried out-of-order timestamps before this guard existed
    // (hand-rounding + parallel-branch generation); those pairs applied to prod
    // long ago, so they are harmless — but nothing new may ever violate again.
    const KNOWN_HISTORICAL = new Set(['0008_medical_mad_thinker', '0055_jittery_clint_barton'])
    for (let i = 1; i < entries.length; i++) {
      if (KNOWN_HISTORICAL.has(entries[i].tag)) continue
      expect(
        entries[i].when,
        `${entries[i].tag} must have when > ${entries[i - 1].tag}`,
      ).toBeGreaterThan(entries[i - 1].when)
    }
  })
})
