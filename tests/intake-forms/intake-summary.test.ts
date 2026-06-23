import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * AI pre-visit summary: the transcript builder (pure) + the generate/cache
 * service — cached-hit short-circuit, the guards, the happy path (generates,
 * caches, meters), and failure degradation.
 */

const runClaudeJson = vi.fn()
const aiConfigured = vi.fn(() => true)
vi.mock('@/lib/ai', () => ({
  runClaudeJson: (...a: unknown[]) => runClaudeJson(...a),
  aiConfigured: () => aiConfigured(),
}))

let selectRows: unknown[][] = []
const inserts: unknown[] = []
const updates: unknown[] = []
vi.mock('@/lib/db', () => {
  const chain = () => {
    const o: Record<string, unknown> = {}
    o.from = () => o
    o.innerJoin = () => o
    o.where = () => o
    o.limit = async () => selectRows.shift() ?? []
    return o
  }
  return {
    db: {
      select: () => chain(),
      insert: () => ({ values: () => ({ onConflictDoUpdate: async (c: unknown) => { inserts.push(c) } }) }),
      update: () => ({ set: (s: unknown) => ({ where: async () => { updates.push(s) } }) }),
    },
    schema: {
      formSubmission: { id: 'fs.id', organizationId: 'fs.org', data: 'fs.data', aiSummary: 'fs.sum', formTemplateId: 'fs.tpl' },
      formTemplate: { id: 'ft.id', schema: 'ft.schema' },
    },
  }
})

import { buildIntakeTranscript, summarizeSubmission, type IntakeSummary } from '@/lib/services/intake-summary'
import type { FormTemplateSchema } from '@/lib/types/forms'

const schema: FormTemplateSchema = {
  sections: [
    {
      id: 's1',
      title: 'Medical',
      fields: [
        { id: 'note', type: 'content', label: 'Notice', required: false, body: 'read' },
        { id: 'conditions', type: 'checkbox', label: 'Conditions', required: false, options: ['Diabetes', 'Pregnant'] },
        { id: 'pregnant', type: 'yes_no', label: 'Pregnant?', required: false },
        { id: 'meds', type: 'textarea', label: 'Medications', required: false },
        { id: 'sig', type: 'signature', label: 'Sign', required: false },
        { id: 'card', type: 'insurance_card', label: 'Card', required: false },
      ],
    },
  ],
}

const goodSummary: IntakeSummary = { summary: 'Adult patient, on a blood thinner.', alerts: ['Takes warfarin (blood thinner)'] }

beforeEach(() => {
  runClaudeJson.mockReset()
  aiConfigured.mockReturnValue(true)
  selectRows = []
  inserts.length = 0
  updates.length = 0
})

describe('buildIntakeTranscript', () => {
  it('formats answers + skips content/signature/insurance, joins checkboxes, maps yes/no', () => {
    const out = buildIntakeTranscript(schema, {
      note: 'should skip',
      conditions: ['Diabetes', 'Pregnant'],
      pregnant: true,
      meds: 'Warfarin',
      sig: 'Mia N',
      card: [{ url: 'https://cdn/f.jpg', name: 'f', contentType: 'image/jpeg' }],
    })
    expect(out).toContain('Conditions: Diabetes, Pregnant')
    expect(out).toContain('Pregnant?: Yes')
    expect(out).toContain('Medications: Warfarin')
    expect(out).not.toContain('should skip')
    expect(out).not.toContain('Mia N')
    expect(out).not.toContain('cdn/f.jpg')
  })

  it('omits empty/missing answers', () => {
    expect(buildIntakeTranscript(schema, { meds: '' })).toBe('')
  })
})

describe('summarizeSubmission', () => {
  it('returns the cached summary without an AI call', async () => {
    selectRows = [[{ data: {}, aiSummary: goodSummary, tplSchema: schema }]]
    const res = await summarizeSubmission({ organizationId: 'org_1', submissionId: 'sub_1' })
    expect(res).toEqual({ ok: true, summary: goodSummary })
    expect(runClaudeJson).not.toHaveBeenCalled()
  })

  it('returns not_found when the submission is missing', async () => {
    selectRows = [[]]
    expect(await summarizeSubmission({ organizationId: 'org_1', submissionId: 'x' })).toEqual({ ok: false, reason: 'not_found' })
  })

  it('returns empty when there is nothing to summarize', async () => {
    selectRows = [[{ data: {}, aiSummary: null, tplSchema: schema }]]
    expect(await summarizeSubmission({ organizationId: 'org_1', submissionId: 'sub_1' })).toEqual({ ok: false, reason: 'empty' })
    expect(runClaudeJson).not.toHaveBeenCalled()
  })

  it('generates, caches, and meters on the happy path', async () => {
    // 1) submission+template, 2) over-cap usage read
    selectRows = [[{ data: { meds: 'Warfarin' }, aiSummary: null, tplSchema: schema }], [{ count: 0 }]]
    runClaudeJson.mockResolvedValue(goodSummary)
    const res = await summarizeSubmission({ organizationId: 'org_1', submissionId: 'sub_1' })
    expect(res).toEqual({ ok: true, summary: goodSummary })
    expect(inserts).toHaveLength(1) // metered
    expect(updates).toHaveLength(1) // cached on the row
  })

  it('degrades to failed on a malformed AI result (no cache write)', async () => {
    selectRows = [[{ data: { meds: 'Warfarin' }, aiSummary: null, tplSchema: schema }], [{ count: 0 }]]
    runClaudeJson.mockResolvedValue({ summary: 123 })
    expect(await summarizeSubmission({ organizationId: 'org_1', submissionId: 'sub_1' })).toEqual({ ok: false, reason: 'failed' })
    expect(updates).toHaveLength(0)
  })
})
