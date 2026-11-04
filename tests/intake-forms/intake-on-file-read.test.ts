import { describe, it, expect, vi } from 'vitest'

/**
 * ML-30 (the ML-27 follow-up): the display reads — agenda pill, Overview
 * glyph, patient list/record flag, day audit — and the booking confirmation's
 * attach decision all ask the ONE predicate (`isIntakeOnFile`), through
 * lib/services/intake-on-file-read.ts. Real statements, rendered through
 * drizzle's pg-proxy dialect, are captured so the org scoping is pinned.
 */
const NOW = new Date('2026-06-10T15:00:00Z')
const captured: Array<{ sql: string; params: unknown[] }> = []
let rowsToReturn: unknown[][] = []

vi.mock('@/lib/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/db/schema')>('@/lib/db/schema')
  const { drizzle } = await import('drizzle-orm/pg-proxy')
  const db = drizzle(
    async (sql: string, params: unknown[]) => {
      captured.push({ sql, params })
      return { rows: rowsToReturn }
    },
    { schema },
  )
  return { db, schema }
})

const FORMS = [
  { id: 'f_gen', isDefault: 1, autoSendAudience: 'all', appointmentTypeIds: null, refreshMonths: 12, updatedAt: new Date('2026-01-01') },
  { id: 'f_sed', isDefault: 0, autoSendAudience: 'all', appointmentTypeIds: ['sedation'], refreshMonths: null, updatedAt: new Date('2026-01-01') },
]
vi.mock('@/lib/services/forms', () => ({ listFormTemplates: vi.fn(async () => FORMS) }))

import { loadIntakeOnFile, isIntakeOnFileForRule } from '@/lib/services/intake-on-file-read'

describe('loadIntakeOnFile', () => {
  it('a submission inside the refresh window is on file; one older than it is not; scoped to the org', async () => {
    captured.length = 0
    // rows are positional for pg-proxy: patient_id, form_template_id, max(submitted_at)
    rowsToReturn = [
      ['p_fresh', 'f_gen', '2026-03-01 12:00:00'],
      ['p_stale', 'f_gen', '2024-01-01 12:00:00'],
    ]
    const r = await loadIntakeOnFile('org_1', ['p_fresh', 'p_stale', 'p_none'], NOW, 'America/New_York')
    expect(r.has('p_fresh', 'cleaning')).toBe(true)
    expect(r.has('p_stale', 'cleaning')).toBe(false)
    expect(r.has('p_none', 'cleaning')).toBe(false)
    const stmt = captured.find((c) => c.sql.includes('form_submission'))!
    expect(stmt.sql).toContain('"organization_id" = $1')
    expect(stmt.params[0]).toBe('org_1')
  })

  it('a visit-specific form is on file only when THAT form was filled', async () => {
    rowsToReturn = [['p1', 'f_gen', '2026-06-01 12:00:00']]
    const r = await loadIntakeOnFile('org_1', ['p1'], NOW, 'America/New_York')
    expect(r.has('p1', 'cleaning')).toBe(true)
    expect(r.has('p1', 'sedation')).toBe(false)
  })

  it('no patients → nobody on file, and no query', async () => {
    captured.length = 0
    const r = await loadIntakeOnFile('org_1', [], NOW, 'America/New_York')
    expect(r.has('x')).toBe(false)
    expect(captured).toHaveLength(0)
  })
})

describe('isIntakeOnFileForRule (the booking confirmation)', () => {
  it('a second visit inside the window is "already on file"; outside it is asked again', async () => {
    rowsToReturn = [['f_gen', '2026-03-01 12:00:00']]
    expect(await isIntakeOnFileForRule('org_1', 'p1', FORMS[0], NOW, 'America/New_York')).toBe(true)
    rowsToReturn = [['f_gen', '2024-03-01 12:00:00']]
    expect(await isIntakeOnFileForRule('org_1', 'p1', FORMS[0], NOW, 'America/New_York')).toBe(false)
    rowsToReturn = []
    expect(await isIntakeOnFileForRule('org_1', 'p1', FORMS[0], NOW, 'America/New_York')).toBe(false)
  })
})
