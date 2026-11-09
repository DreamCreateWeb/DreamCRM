import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const inserted: Array<Record<string, unknown>> = []
let listRows: Array<Record<string, unknown>> = []
let leftJoined = 0

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({ values: async (v: Record<string, unknown>) => void inserted.push(v) }),
    select: () => ({
      from: () => ({
        leftJoin: () => {
          leftJoined++
          return { where: () => ({ orderBy: () => ({ limit: async () => listRows }) }) }
        },
        where: () => ({ orderBy: () => ({ offset: async () => [] }) }),
      }),
    }),
    delete: () => ({ where: async () => {} }),
  },
}))

import { recordWebsiteEdit, listWebsiteHistory } from '@/lib/services/website-history'

beforeEach(() => {
  inserted.length = 0
  leftJoined = 0
})

describe('website history actor', () => {
  it('stamps the actor on a write, null for the machine', async () => {
    await recordWebsiteEdit('org_1', 'Hero tagline', { tagline: 'x' }, 'user_dana')
    await recordWebsiteEdit('org_1', 'Services', { services: [] })
    expect(inserted[0]).toMatchObject({ organizationId: 'org_1', actorUserId: 'user_dana' })
    expect(inserted[1].actorUserId).toBeNull()
  })

  it('lists entries with the actor name via one join; the machine reads Dream Team', async () => {
    const at = new Date()
    listRows = [
      { id: 2, label: 'Hero tagline', createdAt: at, actorName: 'Dana' },
      { id: 1, label: 'Services', createdAt: at, actorName: null },
    ]
    const out = await listWebsiteHistory('org_1')
    expect(leftJoined).toBe(1)
    expect(out.map((r) => r.actorName)).toEqual(['Dana', 'Dream Team'])
  })
})

describe('the actions stamp the signed-in user', () => {
  const src = readFileSync(join(process.cwd(), 'app/(default)/website/editor/website-actions.ts'), 'utf8')
  it('writeSection, publish and discard pass ctx.userId', () => {
    expect(src).toMatch(/recordWebsiteEdit\(ctx\.organizationId, editLabel\(set\), previous, ctx\.userId\)/)
    expect(src).toMatch(/publishWebsiteDraft\(gated\.ctx\.organizationId, gated\.ctx\.userId/)
    expect(src).toMatch(/discardWebsiteDraft\(gated\.ctx\.organizationId, gated\.ctx\.userId/)
  })
})
