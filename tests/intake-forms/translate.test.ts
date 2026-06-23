import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Spanish translation: the pure extract/localize helpers (the rendering
 * contract) + the generate service (caches, meters, drops hallucinated keys,
 * degrades on failure).
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
    schema: { formTemplate: { id: 'id', organizationId: 'org', schema: 'sch', translations: 'tr', title: 'title' } },
  }
})

import { extractTranslatableStrings, localizeSchema, type FormTemplateSchema } from '@/lib/types/forms'
import { generateFormTranslation } from '@/lib/services/form-translate'

const schema: FormTemplateSchema = {
  sections: [
    {
      id: 's1',
      title: 'About you',
      description: 'The basics',
      fields: [
        { id: 'name', type: 'text', label: 'First name', required: true, help: 'Legal name' },
        { id: 'anx', type: 'radio', label: 'Comfort?', required: false, options: ['Calm', 'Nervous'] },
        { id: 'note', type: 'content', label: 'Heading', required: false, body: 'Read this.' },
      ],
    },
  ],
}

beforeEach(() => {
  runClaudeJson.mockReset()
  aiConfigured.mockReturnValue(true)
  selectRows = []
  inserts.length = 0
  updates.length = 0
})

describe('extractTranslatableStrings', () => {
  it('pulls section + field + help + options + content body, with stable keys', () => {
    const out = extractTranslatableStrings(schema)
    const keys = out.map((s) => s.key)
    expect(keys).toContain('s:s1')
    expect(keys).toContain('sd:s1')
    expect(keys).toContain('f:name')
    expect(keys).toContain('h:name')
    expect(keys).toContain('f:anx')
    expect(keys).toContain('o:anx:0')
    expect(keys).toContain('o:anx:1')
    expect(keys).toContain('b:note')
    expect(out.find((s) => s.key === 'f:name')?.text).toBe('First name')
  })
})

describe('localizeSchema', () => {
  it('replaces strings by key + preserves field ids/types', () => {
    const map = { 's:s1': 'Sobre usted', 'f:name': 'Nombre', 'o:anx:0': 'Tranquilo' }
    const out = localizeSchema(schema, map)
    expect(out.sections[0].title).toBe('Sobre usted')
    expect(out.sections[0].fields[0].label).toBe('Nombre')
    expect(out.sections[0].fields[0].id).toBe('name') // id untouched
    const anx = out.sections[0].fields[1] as { options: string[] }
    expect(anx.options[0]).toBe('Tranquilo')
    expect(anx.options[1]).toBe('Nervous') // missing key → English fallback
  })

  it('returns the schema unchanged when no map', () => {
    expect(localizeSchema(schema, null)).toBe(schema)
  })
})

describe('generateFormTranslation', () => {
  it('returns not_found when the template is missing', async () => {
    selectRows = [[]]
    expect(await generateFormTranslation({ organizationId: 'o', templateId: 'x' })).toEqual({ ok: false, reason: 'not_found' })
  })

  it('translates, drops hallucinated keys, caches + meters', async () => {
    selectRows = [[{ schema, translations: null, title: 'Intake' }], [{ count: 0 }]]
    runClaudeJson.mockResolvedValue({
      items: [
        { key: 'f:name', es: 'Nombre' },
        { key: 'f:does_not_exist', es: 'Basura' }, // hallucinated → dropped
      ],
    })
    const res = await generateFormTranslation({ organizationId: 'o', templateId: 't' })
    expect(res).toEqual({ ok: true, count: 1 })
    expect(inserts).toHaveLength(1)
    const set = updates[0] as { translations: { es: Record<string, string> } }
    expect(set.translations.es).toEqual({ 'f:name': 'Nombre' })
  })

  it('degrades to failed on a malformed result (no cache write)', async () => {
    selectRows = [[{ schema, translations: null, title: 'Intake' }], [{ count: 0 }]]
    runClaudeJson.mockResolvedValue({ nope: true })
    expect(await generateFormTranslation({ organizationId: 'o', templateId: 't' })).toEqual({ ok: false, reason: 'failed' })
    expect(updates).toHaveLength(0)
  })
})
