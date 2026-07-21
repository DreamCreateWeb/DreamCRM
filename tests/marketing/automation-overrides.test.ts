import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Automation message overrides (campaigns phase 2): a clinic's edited copy
 * is a custom campaign_templates row tagged automationKind. The engine
 * reads getAutomationTemplate — override first, system default otherwise —
 * and the override never leaks into the "Start from" picker.
 */

const state = {
  selectRows: [] as unknown[],
  inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  deletes: 0,
}

vi.mock('@/lib/db', async () => {
  const schema = await import('@/lib/db/schema')
  const chain = () => {
    const obj: Record<string, unknown> = {}
    obj.from = () => obj
    obj.where = () => obj
    obj.orderBy = () => obj
    obj.limit = async () => state.selectRows
    obj.then = (resolve: (v: unknown) => void) => resolve(state.selectRows)
    return obj
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (vals: Record<string, unknown>) => ({
          returning: async () => {
            state.inserts.push(vals)
            return [{ id: 501, createdAt: new Date(), updatedAt: new Date(), ...vals }]
          },
        }),
      }),
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: () => ({
            returning: async () => {
              state.updates.push(vals)
              return [{ id: 500, createdAt: new Date(), updatedAt: new Date(), organizationId: 'org_a', kind: 'custom', category: 'birthday', name: 'x', description: null, subject: String(vals.subject), previewText: null, bodyHtml: String(vals.bodyHtml), bodyJson: null, defaultChannel: 'resend', defaultAudienceSlug: null, automationKind: 'birthday' }]
            },
          }),
        }),
      }),
      delete: () => ({
        where: () => ({
          returning: async () => {
            state.deletes++
            return [{ id: 500 }]
          },
        }),
      }),
    },
    schema,
  }
})

import {
  getAutomationTemplate,
  upsertAutomationOverride,
  deleteAutomationOverride,
  systemTemplateForKind,
  SYSTEM_TEMPLATES,
} from '@/lib/services/marketing-templates'

beforeEach(() => {
  state.selectRows = []
  state.inserts = []
  state.updates = []
  state.deletes = 0
})

const OVERRIDE_ROW = {
  id: 500,
  organizationId: 'org_a',
  kind: 'custom',
  category: 'birthday',
  name: 'Birthday — your version',
  description: null,
  subject: 'Our own birthday note',
  previewText: 'From us.',
  bodyHtml: '<p>Custom body</p>',
  bodyJson: null,
  defaultChannel: 'resend',
  defaultAudienceSlug: null,
  automationKind: 'birthday',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('systemTemplateForKind', () => {
  it('maps every retention kind to a real system template', () => {
    expect(systemTemplateForKind('birthday').category).toBe('birthday')
    expect(systemTemplateForKind('reactivation').category).toBe('reactivation')
    expect(systemTemplateForKind('welcome').category).toBe('welcome')
    expect(systemTemplateForKind('benefits').name).toMatch(/^Use your benefits/)
  })
})

describe('getAutomationTemplate', () => {
  it('prefers the org override and flags it custom', async () => {
    state.selectRows = [OVERRIDE_ROW]
    const msg = await getAutomationTemplate('org_a', 'birthday')
    expect(msg.subject).toBe('Our own birthday note')
    expect(msg.isCustom).toBe(true)
  })

  it('falls back to the system default when no override exists', async () => {
    state.selectRows = []
    const msg = await getAutomationTemplate('org_a', 'birthday')
    const sys = SYSTEM_TEMPLATES.find((t) => t.category === 'birthday')!
    expect(msg.subject).toBe(sys.subject)
    expect(msg.isCustom).toBe(false)
  })
})

describe('upsertAutomationOverride', () => {
  it('creates the override row tagged with automationKind + org', async () => {
    state.selectRows = [] // no existing override
    await upsertAutomationOverride('org_a', 'welcome', { subject: 'S', bodyHtml: '<p>B</p>' }, 'user_1')
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toMatchObject({
      organizationId: 'org_a',
      kind: 'custom',
      automationKind: 'welcome',
      subject: 'S',
    })
  })

  it('updates in place when an override already exists', async () => {
    state.selectRows = [OVERRIDE_ROW]
    await upsertAutomationOverride('org_a', 'birthday', { subject: 'S2', bodyHtml: '<p>B2</p>' }, 'user_1')
    expect(state.inserts).toHaveLength(0)
    expect(state.updates).toHaveLength(1)
    expect(state.updates[0].subject).toBe('S2')
  })
})

describe('deleteAutomationOverride', () => {
  it('deletes and reports the count', async () => {
    const res = await deleteAutomationOverride('org_a', 'birthday')
    expect(state.deletes).toBe(1)
    expect(res.deleted).toBe(1)
  })
})
