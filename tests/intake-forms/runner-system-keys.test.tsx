import { describe, it, expect } from 'vitest'
import type { SystemFieldKey } from '@/lib/types/forms'
import { submitterFromValues, dedupeSystemKeys, systemKeysFor } from '@/lib/types/forms'

const schema = {
  sections: [
    {
      fields: [
        { id: 'f1', type: 'text', systemKey: 'first_name' as const },
        { id: 'f2', type: 'text', systemKey: 'last_name' as const },
        { id: 'f3', type: 'email', systemKey: 'email' as const },
        { id: 'f4', type: 'tel', systemKey: 'phone' as const },
      ],
    },
  ],
}

describe('the runner derives the submitter by systemKey', () => {
  it('reads custom field ids through their keys', () => {
    expect(submitterFromValues(schema, { f1: ' Ana ', f2: 'Lopez', f3: 'a@x.com', f4: '555' })).toEqual({
      name: 'Ana Lopez',
      email: 'a@x.com',
      phone: '555',
    })
  })
  it('falls back to the legacy hardcoded ids', () => {
    const legacy = { sections: [{ fields: [{ id: 'first_name' }] }] }
    expect(submitterFromValues(legacy, { first_name: 'Bo', last_name: 'Li', email: 'b@x.com' }).name).toBe('Bo Li')
  })
})

describe('system key mapping', () => {
  it('offers keys by field type', () => {
    expect(systemKeysFor('tel')).toEqual(['phone'])
    expect(systemKeysFor('textarea')).toEqual([])
  })
  it('keeps one key per form, dropping later duplicates', () => {
    const s = {
      sections: [
        {
          fields: [
            { id: 'a', type: 'text', systemKey: 'city' as SystemFieldKey | null },
            { id: 'b', type: 'text', systemKey: 'city' as SystemFieldKey | null },
            { id: 'c', type: 'date', systemKey: 'first_name' as SystemFieldKey | null },
          ],
        },
      ],
    }
    dedupeSystemKeys(s)
    expect(s.sections[0].fields.map((f) => f.systemKey ?? null)).toEqual(['city', null, null])
  })
})
