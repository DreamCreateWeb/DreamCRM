import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit tests for the patient-tags service (`lib/services/patient-tags.ts`).
 *
 * Covered:
 *  - createPatientTag dedupes case-insensitively (returns the existing tag,
 *    no insert) and cleans/normalizes the name on a fresh create.
 *  - assignTagToPatients filters the selection to ids actually in the org and
 *    returns the assigned count; an empty set is a no-op.
 *  - getTagsForPatients short-circuits on empty input and groups rows into a
 *    Map<patientId, tags>.
 *  - updatePatientTag rejects a rename that collides with a DIFFERENT tag.
 */

const h = vi.hoisted(() => ({
  tagRows: [] as Record<string, unknown>[],
  patientRows: [] as Record<string, unknown>[],
  assignmentRows: [] as Record<string, unknown>[],
  inserts: [] as { table: string | undefined; values: unknown }[],
  updates: [] as { table: string | undefined; set: Record<string, unknown> }[],
}))

vi.mock('@/lib/db', () => {
  function resultFor(table: string | undefined): Promise<unknown[]> {
    if (table === 'patientTag') return Promise.resolve(h.tagRows)
    if (table === 'patient') return Promise.resolve(h.patientRows)
    if (table === 'patientTagAssignment') return Promise.resolve(h.assignmentRows)
    return Promise.resolve([])
  }
  function chain(kind: string, table?: string) {
    const ctx = { kind, tbl: table }
    const proxy: Record<string, unknown> = {
      from: (t: { __t?: string }) => { ctx.tbl = t?.__t; return proxy },
      leftJoin: () => proxy,
      innerJoin: () => proxy,
      where: () => proxy,
      groupBy: () => proxy,
      orderBy: () => resultFor(ctx.tbl),
      limit: () => resultFor(ctx.tbl),
      set: (v: Record<string, unknown>) => { h.updates.push({ table: ctx.tbl, set: v }); return proxy },
      values: (v: unknown) => { h.inserts.push({ table: ctx.tbl, values: v }); return proxy },
      onConflictDoNothing: () => Promise.resolve(undefined),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => resultFor(ctx.tbl).then(res, rej),
    }
    return proxy
  }
  return {
    db: {
      select: () => chain('select'),
      insert: (t: { __t?: string }) => chain('insert', t?.__t),
      update: (t: { __t?: string }) => chain('update', t?.__t),
      delete: (t: { __t?: string }) => chain('delete', t?.__t),
    },
    schema: {
      patientTag: { __t: 'patientTag', id: 'id', organizationId: 'organizationId', name: 'name', color: 'color' },
      patient: { __t: 'patient', id: 'id', organizationId: 'organizationId' },
      patientTagAssignment: {
        __t: 'patientTagAssignment',
        patientId: 'patientId',
        tagId: 'tagId',
        organizationId: 'organizationId',
      },
    },
  }
})

vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }),
  eq: (...a: unknown[]) => ({ a }),
  inArray: (...a: unknown[]) => ({ a }),
  sql: (s: TemplateStringsArray, ...v: unknown[]) => ({ s, v }),
}))

import {
  createPatientTag,
  assignTagToPatients,
  getTagsForPatients,
  updatePatientTag,
} from '@/lib/services/patient-tags'

beforeEach(() => {
  h.tagRows = []
  h.patientRows = []
  h.assignmentRows = []
  h.inserts = []
  h.updates = []
})

describe('createPatientTag', () => {
  it('returns the existing tag (dedupe) without inserting when the name matches', async () => {
    h.tagRows = [{ id: 'ptag_existing', name: 'VIP', color: 'amber' }]
    const tag = await createPatientTag('org_1', { name: 'vip' }, 'user_1')
    expect(tag.id).toBe('ptag_existing')
    expect(h.inserts).toHaveLength(0)
  })

  it('inserts a normalized new tag when none exists', async () => {
    h.tagRows = [] // findTagByName → null
    const tag = await createPatientTag('org_1', { name: '  Needs   follow-up  ', color: 'indigo' }, 'user_1')
    expect(tag.name).toBe('Needs follow-up') // trimmed + collapsed whitespace
    expect(tag.color).toBe('indigo')
    const ins = h.inserts.find((i) => i.table === 'patientTag')
    expect(ins).toBeTruthy()
    expect((ins!.values as { name: string }).name).toBe('Needs follow-up')
  })

  it('coerces an invalid color to gray', async () => {
    h.tagRows = []
    const tag = await createPatientTag('org_1', { name: 'New', color: 'chartreuse' as never }, null)
    expect(tag.color).toBe('gray')
  })

  it('rejects an empty name', async () => {
    await expect(createPatientTag('org_1', { name: '   ' }, null)).rejects.toThrow(/required/i)
  })
})

describe('assignTagToPatients', () => {
  it('assigns only the ids that belong to the org + returns the count', async () => {
    h.tagRows = [{ id: 'tag_1' }] // tagInOrg → found
    h.patientRows = [{ id: 'p1' }, { id: 'p2' }] // only 2 of the 3 supplied are in-org
    const res = await assignTagToPatients('org_1', ['p1', 'p2', 'p_foreign'], 'tag_1', 'user_1')
    expect(res.assigned).toBe(2)
    const ins = h.inserts.find((i) => i.table === 'patientTagAssignment')
    expect((ins!.values as unknown[]).length).toBe(2)
  })

  it('is a no-op for an empty selection', async () => {
    const res = await assignTagToPatients('org_1', [], 'tag_1', null)
    expect(res.assigned).toBe(0)
    expect(h.inserts).toHaveLength(0)
  })

  it('throws when the tag is not in the org', async () => {
    h.tagRows = [] // tagInOrg → not found
    await expect(assignTagToPatients('org_1', ['p1'], 'tag_x', null)).rejects.toThrow(/not found/i)
  })
})

describe('getTagsForPatients', () => {
  it('short-circuits to an empty map with no query for empty input', async () => {
    const map = await getTagsForPatients('org_1', [])
    expect(map.size).toBe(0)
  })

  it('groups assignment rows into a Map<patientId, tags>', async () => {
    h.assignmentRows = [
      { patientId: 'p1', id: 'tag_a', name: 'VIP', color: 'amber' },
      { patientId: 'p1', id: 'tag_b', name: 'Anxious', color: 'rose' },
      { patientId: 'p2', id: 'tag_a', name: 'VIP', color: 'amber' },
    ]
    const map = await getTagsForPatients('org_1', ['p1', 'p2'])
    expect(map.get('p1')?.map((t) => t.name)).toEqual(['VIP', 'Anxious'])
    expect(map.get('p2')?.map((t) => t.id)).toEqual(['tag_a'])
  })
})

describe('updatePatientTag', () => {
  it('rejects a rename that collides with a different tag', async () => {
    h.tagRows = [{ id: 'tag_other', name: 'VIP', color: 'amber' }] // findTagByName → a DIFFERENT tag
    await expect(updatePatientTag('org_1', 'tag_self', { name: 'VIP' })).rejects.toThrow(/already exists/i)
    expect(h.updates).toHaveLength(0)
  })

  it('allows a recolor (no name collision check) and writes the update', async () => {
    await updatePatientTag('org_1', 'tag_self', { color: 'teal' })
    const upd = h.updates.find((u) => u.table === 'patientTag')
    expect((upd!.set as { color: string }).color).toBe('teal')
  })
})
