import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * THE GOAL's PROGRESS NUMBER (docs/ai-operations.md, D6/D11).
 *
 * The card's caption promises a count of patients SEATED since the goal was
 * set. The first cut counted every patient row with a `firstSeenAt` in the
 * window — which means a practice that connects their PMS the week after
 * setting a goal opens this card to "1,800 new patients seated in the last
 * 3 days". The whole point of the card is that it does not make claims like
 * that, so the acquisition semantics have to be the SAME ones Analytics and
 * the Overview tile use.
 */

const rows = vi.hoisted(() => ({ value: [] as Array<{ source: string | null }> }))
vi.mock('@/lib/db', () => {
  const chain = {
    from: () => chain,
    where: () => Promise.resolve(rows.value),
    limit: () => Promise.resolve(rows.value),
    orderBy: () => chain,
  }
  return {
    db: { select: () => chain },
    schema: new Proxy({} as Record<string, unknown>, {
      get: () => new Proxy({}, { get: () => ({}) }),
    }),
  }
})

import { seatedSince } from '@/lib/services/goals'

beforeEach(() => {
  rows.value = []
})

describe('seatedSince', () => {
  it('counts patients the practice actually gained', async () => {
    rows.value = [{ source: 'website' }, { source: 'google' }, { source: null }]
    expect(await seatedSince('org_1', new Date('2026-08-01T00:00:00Z'))).toBe(3)
  })

  it('EXCLUDES bulk backfills — connecting a PMS is not eighteen hundred new patients', async () => {
    rows.value = [
      { source: 'website' },
      { source: 'pms_import' },
      { source: 'import' },
      { source: 'pms_import' },
    ]
    expect(await seatedSince('org_1', new Date('2026-08-01T00:00:00Z'))).toBe(1)
  })

  it('says a plain zero when nothing came in', async () => {
    expect(await seatedSince('org_1', new Date('2026-08-01T00:00:00Z'))).toBe(0)
  })
})

describe('the acquisition semantics are the SHARED ones', () => {
  const src = readFileSync(resolve(process.cwd(), 'lib/services/goals.ts'), 'utf8')

  it('reuses the single-homed backfill list rather than re-listing sources', () => {
    expect(src).toContain("from '@/lib/patient-acquisition'")
    expect(src).toContain('BACKFILL_PATIENT_SOURCES')
    // A local copy of the list is the exact drift this guard exists to stop.
    expect(src).not.toMatch(/'pms_import'/)
  })

  it('excludes archived patients, like every other new-patient count', () => {
    expect(src).toContain("ne(schema.patient.lifecycle, 'archived')")
  })
})
