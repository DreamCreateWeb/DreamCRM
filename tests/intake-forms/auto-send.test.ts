import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Smart auto-send: getBookingIntakeForm picks the right form for a patient —
 * an audience-specific ('new'/'returning') match beats an 'all' form, which
 * beats the org default; archived forms are excluded by the query.
 */

let forms: Array<Record<string, unknown>> = []
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: async () => forms }) }) },
}))
vi.mock('@/lib/db/schema/clinic', () => ({
  formTemplate: { organizationId: 'ft.org', archivedAt: 'ft.arch' },
  patient: {},
}))
vi.mock('@/lib/utils', () => ({ newId: () => 'id', slugify: (s: string) => s }))

import { getBookingIntakeForm } from '@/lib/services/forms'

function form(over: Record<string, unknown>) {
  return { id: 'f', title: 't', isDefault: 0, autoSendAudience: 'all', updatedAt: new Date('2026-01-01'), ...over }
}

beforeEach(() => {
  forms = []
})

describe('getBookingIntakeForm', () => {
  it('returns null when there are no forms', async () => {
    expect(await getBookingIntakeForm('org_1', true)).toBeNull()
  })

  it('returning patient gets the returning-audience form over the all/default', async () => {
    forms = [
      form({ id: 'intake', autoSendAudience: 'all', isDefault: 1 }),
      form({ id: 'update', autoSendAudience: 'returning' }),
    ]
    expect((await getBookingIntakeForm('org_1', false))?.id).toBe('update')
  })

  it('new patient gets the all/default form when no new-specific form exists', async () => {
    forms = [
      form({ id: 'intake', autoSendAudience: 'all', isDefault: 1 }),
      form({ id: 'update', autoSendAudience: 'returning' }),
    ]
    expect((await getBookingIntakeForm('org_1', true))?.id).toBe('intake')
  })

  it('prefers the default among multiple all-audience forms', async () => {
    forms = [
      form({ id: 'a', autoSendAudience: 'all', updatedAt: new Date('2026-05-01') }),
      form({ id: 'b', autoSendAudience: 'all', isDefault: 1, updatedAt: new Date('2026-01-01') }),
    ]
    expect((await getBookingIntakeForm('org_1', true))?.id).toBe('b')
  })

  it('falls back to the default when nothing else matches', async () => {
    forms = [form({ id: 'only-returning', autoSendAudience: 'returning', isDefault: 1 })]
    // New patient, the only form is returning-audience → default fallback.
    expect((await getBookingIntakeForm('org_1', true))?.id).toBe('only-returning')
  })

  it('a new-specific form wins for a new patient', async () => {
    forms = [
      form({ id: 'all', autoSendAudience: 'all', isDefault: 1 }),
      form({ id: 'newform', autoSendAudience: 'new' }),
    ]
    expect((await getBookingIntakeForm('org_1', true))?.id).toBe('newform')
  })
})
