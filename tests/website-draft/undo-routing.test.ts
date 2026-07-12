import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stagedJson } from '../helpers/website-draft'

/**
 * Undo routing under Draft→Publish (lib/services/website-history.ts):
 *  - a NORMAL entry's draftable columns walk back INSIDE the draft (undoing a
 *    staged edit must never push its previous value straight to live);
 *  - identity columns restore live (where the save wrote them);
 *  - a PUBLISH entry (previous.__publish) restores LIVE columns — undoing a
 *    publish genuinely reverts the live site;
 *  - the marker key itself is never written as a column.
 */

const selectQueue: unknown[][] = []
const ops: Array<{ set: Record<string, unknown> }> = []
const deletes: number[] = []

vi.mock('@/lib/db', () => {
  const chain = (result: () => unknown[]) => {
    const c: Record<string, unknown> = {}
    for (const m of ['from', 'where', 'orderBy', 'offset']) {
      c[m] = () => c
    }
    c.limit = async () => result()
    // Awaiting the chain directly (no .limit) also resolves.
    c.then = (resolve: (v: unknown[]) => void) => resolve(result())
    return c
  }
  return {
    db: {
      select: () => chain(() => (selectQueue.shift() ?? [])),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            ops.push({ set: v })
          },
        }),
      }),
      delete: () => ({
        where: async () => {
          deletes.push(1)
        },
      }),
    },
  }
})

import { undoLastWebsiteEdit } from '@/lib/services/website-history'

beforeEach(() => {
  selectQueue.length = 0
  ops.length = 0
  deletes.length = 0
})

describe('undoLastWebsiteEdit — Draft→Publish routing', () => {
  it('a normal entry restores draftable columns INTO the draft, identity live', async () => {
    selectQueue.push(
      [{ id: 1, label: 'Hero tagline + Clinic name', previous: { tagline: 'Old tagline', displayName: 'Old name' } }],
      [], // getLastWebsiteEdit after the delete → no more history
    )
    const res = await undoLastWebsiteEdit('org_1')
    expect(res?.undone).toBe('Hero tagline + Clinic name')
    expect(ops).toHaveLength(1)
    const set = ops[0].set
    // Identity restores live…
    expect(set.displayName).toBe('Old name')
    // …content restores into the draft, never the live column.
    expect(set.tagline).toBeUndefined()
    expect(stagedJson(set)).toEqual({ tagline: 'Old tagline' })
    expect(deletes).toHaveLength(1)
  })

  it('a publish entry restores LIVE columns and strips the marker', async () => {
    selectQueue.push(
      [{ id: 2, label: 'Published site changes', previous: { __publish: true, tagline: 'Pre-publish tagline' } }],
      [],
    )
    const res = await undoLastWebsiteEdit('org_1')
    expect(res?.undone).toBe('Published site changes')
    const set = ops[0].set
    expect(set.tagline).toBe('Pre-publish tagline')
    expect(set.websiteDraft).toBeUndefined()
    expect(set).not.toHaveProperty('__publish')
  })

  it('nothing to undo → null, no writes', async () => {
    selectQueue.push([])
    expect(await undoLastWebsiteEdit('org_1')).toBeNull()
    expect(ops).toHaveLength(0)
    expect(deletes).toHaveLength(0)
  })
})
