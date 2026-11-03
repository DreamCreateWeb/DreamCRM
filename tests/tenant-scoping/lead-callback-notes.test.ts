/**
 * ML-22's lead writers — every NEW write carries the lead's org id (ORG_A
 * pattern): the parked call-back day, the desk's note, the second touch's
 * stamp, and reopenLead's reset of that stamp. Real drizzle-orm + the real
 * schema; only @/lib/db is mocked, so the captured where-clause is the
 * genuine eq(...) fragments.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = {
  wheres: [] as Array<{ kind: 'select' | 'update'; sql: string }>,
  sets: [] as Array<Record<string, unknown>>,
}

function captureSql(clause: unknown): string {
  const seen = new Set<unknown>()
  const parts: string[] = []
  const queue: unknown[] = [clause]
  while (queue.length) {
    const v = queue.shift()
    if (v == null) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(String(v))
      continue
    }
    if (typeof v !== 'object' || seen.has(v)) continue
    seen.add(v)
    const obj = v as Record<string, unknown>
    if (obj.value !== undefined) parts.push(String(obj.value))
    for (const k of Object.keys(obj)) queue.push(obj[k])
    if (Array.isArray(v)) for (const item of v) queue.push(item)
  }
  return parts.join('|')
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  return {
    db: {
      update: () => ({
        set: (values: Record<string, unknown>) => {
          state.sets.push(values)
          return {
            where: async (clause: unknown) => {
              state.wheres.push({ kind: 'update', sql: captureSql(clause) })
            },
          }
        },
      }),
    },
    schema,
  }
})

import { setLeadCallBack, setLeadNote, markLeadFollowedUp, reopenLead } from '@/lib/services/leads'

const ORG_A = 'org_A'
const LEAD = 'lead_1'

beforeEach(() => {
  state.wheres.length = 0
  state.sets.length = 0
})

describe('ML-22 lead writers carry the org id', () => {
  it('setLeadCallBack', async () => {
    const at = new Date('2026-08-04T17:00:00Z')
    await setLeadCallBack(ORG_A, LEAD, at)
    expect(state.wheres).toHaveLength(1)
    expect(state.wheres[0].sql).toContain(ORG_A)
    expect(state.wheres[0].sql).toContain(LEAD)
    expect(state.sets[0]).toMatchObject({ callBackAt: at })
    await setLeadCallBack(ORG_A, LEAD, null)
    expect(state.sets[1]).toMatchObject({ callBackAt: null })
    expect(state.wheres[1].sql).toContain(ORG_A)
  })

  it('setLeadNote trims, and an empty note clears', async () => {
    await setLeadNote(ORG_A, LEAD, '  Left a voicemail.  ')
    expect(state.wheres[0].sql).toContain(ORG_A)
    expect(state.wheres[0].sql).toContain(LEAD)
    expect(state.sets[0]).toMatchObject({ notes: 'Left a voicemail.' })
    await setLeadNote(ORG_A, LEAD, '   ')
    expect(state.sets[1]).toMatchObject({ notes: null })
  })

  it('markLeadFollowedUp stamps without touching the status', async () => {
    await markLeadFollowedUp(ORG_A, LEAD)
    expect(state.wheres[0].sql).toContain(ORG_A)
    expect(state.wheres[0].sql).toContain(LEAD)
    expect(state.sets[0].followedUpAt).toBeInstanceOf(Date)
    expect(state.sets[0]).not.toHaveProperty('status')
  })

  it('reopenLead resets the second touch with the first (a fresh cycle) and keeps the desk’s own plan', async () => {
    await reopenLead(ORG_A, LEAD)
    expect(state.wheres[0].sql).toContain(ORG_A)
    expect(state.sets[0]).toMatchObject({ status: 'new', contactedAt: null, followedUpAt: null })
    expect(state.sets[0]).not.toHaveProperty('callBackAt')
    expect(state.sets[0]).not.toHaveProperty('notes')
  })
})
