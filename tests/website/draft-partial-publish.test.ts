import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { WEBSITE_DRAFT_COLUMNS } from '@/lib/website-draft'
import {
  WEBSITE_COLUMN_SECTION,
  WEBSITE_SECTIONS,
  websiteColumnsOfSections,
  websiteSectionsOf,
} from '@/lib/types/website'

/** Partial publish/discard: only the chosen sections go live, the rest stay
 *  staged, live values of the unchosen keys are never touched, and the
 *  publisher is stamped on the history row. */

let selectRow: Record<string, unknown> | undefined
const ops: Array<{ set: Record<string, unknown> }> = []
const historyCalls: Array<{ previous: Record<string, unknown>; actor: unknown }> = []

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (selectRow ? [selectRow] : []) }) }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          ops.push({ set: v })
        },
      }),
    }),
  },
}))
vi.mock('@/lib/services/website-history', () => ({
  recordWebsiteEdit: vi.fn(async (_o: string, _l: string, previous: Record<string, unknown>, actor: unknown) => {
    historyCalls.push({ previous, actor })
  }),
}))

import {
  publishWebsiteDraft,
  discardWebsiteDraft,
  getWebsiteDraftStatus,
  websiteDraftWithoutKeys,
} from '@/lib/services/website-draft'

const dialect = new PgDialect()

beforeEach(() => {
  ops.length = 0
  historyCalls.length = 0
  selectRow = {
    tagline: 'Live tagline',
    about: 'Live about',
    faq: [],
    websiteDraft: { tagline: 'New tagline', about: 'New about', faq: [{ q: 'Q', a: 'A' }] },
  }
})

describe('the key → section map', () => {
  it('gives every draftable column a section, and no section is empty', () => {
    for (const col of Array.from(WEBSITE_DRAFT_COLUMNS)) expect(WEBSITE_COLUMN_SECTION[col], col).toBeTruthy()
    for (const col of Object.keys(WEBSITE_COLUMN_SECTION)) expect(WEBSITE_DRAFT_COLUMNS.has(col), col).toBe(true)
    for (const s of WEBSITE_SECTIONS) expect(websiteColumnsOfSections([s.key]).length, s.key).toBeGreaterThan(0)
  })
  it('derives changed sections in display order', () => {
    expect(websiteSectionsOf(['faq', 'tagline', 'heroImageUrl']).map((s) => s.key)).toEqual(['hero', 'faq'])
  })
})

describe('getWebsiteDraftStatus sections', () => {
  it('lists the changed sections', async () => {
    const s = await getWebsiteDraftStatus('org_1')
    expect(s.sections.map((x) => x.key)).toEqual(['hero', 'about', 'faq'])
    expect(s.changes.find((c) => c.column === 'faq')?.section).toBe('faq')
  })
})

describe('partial publish', () => {
  it('publishes only the chosen sections, leaves the rest staged, never writes the other live keys', async () => {
    const res = await publishWebsiteDraft('org_1', 'user_dana', { sections: ['hero'] })
    expect(res).toEqual({ published: 1, remaining: 2 })
    expect(ops).toHaveLength(1)
    const set = ops[0].set
    expect(set.tagline).toBe('New tagline')
    // The unchosen keys' LIVE columns are not in the write at all.
    expect(set).not.toHaveProperty('about')
    expect(set).not.toHaveProperty('faq')
    // The blob is trimmed SQL-side, not cleared.
    expect(set.websiteDraft).not.toBeNull()
    expect(historyCalls[0].previous).toEqual({ __publish: true, tagline: 'Live tagline' })
    expect(historyCalls[0].actor).toBe('user_dana')
  })

  it('all sections chosen clears the blob like a full publish', async () => {
    const res = await publishWebsiteDraft('org_1', 'u', { sections: ['hero', 'about', 'faq'] })
    expect(res.remaining).toBe(0)
    expect(ops[0].set.websiteDraft).toBeNull()
  })

  it('no sections option publishes everything (the old behavior)', async () => {
    const res = await publishWebsiteDraft('org_1', 'u')
    expect(res.published).toBe(3)
    expect(ops[0].set.websiteDraft).toBeNull()
  })

  it('an empty or unknown section list publishes nothing and writes nothing', async () => {
    for (const sections of [[], ['nope']]) {
      const res = await publishWebsiteDraft('org_1', 'u', { sections })
      expect(res).toEqual({ published: 0, remaining: 3 })
    }
    expect(ops).toHaveLength(0)
    expect(historyCalls).toHaveLength(0)
  })
})

describe('partial discard', () => {
  it('drops only the chosen sections from the draft; live untouched', async () => {
    const res = await discardWebsiteDraft('org_1', 'u', { sections: ['about'] })
    expect(res.discarded).toBe(1)
    expect(ops).toHaveLength(1)
    expect(ops[0].set).not.toHaveProperty('about')
    expect(ops[0].set).not.toHaveProperty('tagline')
    expect(ops[0].set.websiteDraft).not.toBeNull()
  })
  it('no options clears everything; an unknown section is a no-op', async () => {
    expect((await discardWebsiteDraft('org_1')).discarded).toBe(3)
    expect(ops[0].set.websiteDraft).toBeNull()
    ops.length = 0
    expect((await discardWebsiteDraft('org_1', 'u', { sections: ['nope'] })).discarded).toBe(0)
    expect(ops).toHaveLength(0)
  })
})

describe('websiteDraftWithoutKeys — the rendered statement', () => {
  it('subtracts the keys as bound text params and nulls an emptied blob', () => {
    const q = dialect.sqlToQuery(websiteDraftWithoutKeys(['tagline', 'about']))
    expect(q.sql).toBe(
      `NULLIF(COALESCE("clinic_profile"."website_draft", '{}'::jsonb) - ARRAY[$1, $2]::text[], '{}'::jsonb)`,
    )
    expect(q.params).toEqual(['tagline', 'about'])
  })
})
