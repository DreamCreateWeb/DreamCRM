/**
 * Unit tests for the Website Studio AI command bar's edit-mapping. Mocks
 * `runClaudeJson` (so no network) and the DB (so we can assert the patch the
 * service writes) and drives each edit type.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { configured: boolean; toolInput: unknown } = { configured: true, toolInput: null }
let capturedPatch: Record<string, unknown> | null = null

const profileRow = {
  organizationId: 'org_1',
  displayName: 'Acme Dental',
  tagline: 'Old headline',
  about: 'Old about text.',
  phone: null,
  email: null,
  brandColor: '#9CAF9F',
  copyOverrides: null,
  stats: null,
  differenceChips: null,
  acceptedInsuranceCarriers: null,
}

vi.mock('@/lib/ai', () => ({
  aiConfigured: () => state.configured,
  runClaudeJson: async () => state.toolInput,
}))
vi.mock('@/lib/services/ai-website', () => ({ incrementAiUsage: async () => {} }))
vi.mock('@/lib/services/service-library-ai', () => ({ CORE_VOICE_RULES: '' }))
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => [profileRow] }) }),
    }),
    update: () => ({
      set: (p: Record<string, unknown>) => {
        capturedPatch = p
        return { where: async () => {} }
      },
    }),
  },
}))

import { applyAiWebsiteEdit } from '@/lib/services/ai-website-edit'

beforeEach(() => {
  state.configured = true
  state.toolInput = null
  capturedPatch = null
})

describe('applyAiWebsiteEdit', () => {
  it('returns an error when AI is not configured', async () => {
    state.configured = false
    const r = await applyAiWebsiteEdit('org_1', 'change the headline')
    expect(r.ok).toBe(false)
  })

  it('maps a field edit to the column + labels it', async () => {
    state.toolInput = { summary: 'Updated headline', page: '/', edits: [{ type: 'field', field: 'tagline', value: 'A brand new headline' }] }
    const r = await applyAiWebsiteEdit('org_1', 'change the headline')
    expect(r.ok).toBe(true)
    expect(capturedPatch?.tagline).toBe('A brand new headline')
    if (r.ok) {
      expect(r.edits.map((e) => e.label)).toContain('Hero headline')
      expect(r.page).toBe('/')
      expect(r.anchor).toBe('tagline')
    }
  })

  it('writes a known copy key into copy_overrides + anchors to it', async () => {
    state.toolInput = { summary: 'x', page: '/', edits: [{ type: 'copy', key: 'home.contactTitle', value: 'Come see us' }] }
    const r = await applyAiWebsiteEdit('org_1', 'x')
    expect((capturedPatch?.copyOverrides as Record<string, string>)['home.contactTitle']).toBe('Come see us')
    if (r.ok) expect(r.anchor).toBe('copy:home.contactTitle')
  })

  it('ignores an unknown copy key (no edit applied → error)', async () => {
    state.toolInput = { summary: 'x', page: '/', edits: [{ type: 'copy', key: 'totally.made.up', value: 'x' }] }
    const r = await applyAiWebsiteEdit('org_1', 'x')
    expect(r.ok).toBe(false)
    expect(capturedPatch).toBeNull()
  })

  it('rejects an invalid brand color but accepts a valid hex', async () => {
    state.toolInput = { summary: 'x', page: '/', edits: [{ type: 'brandColor', value: 'blue' }] }
    const bad = await applyAiWebsiteEdit('org_1', 'make it blue')
    expect(bad.ok).toBe(false)

    state.toolInput = { summary: 'x', page: '/', edits: [{ type: 'brandColor', value: '#2563EB' }] }
    const good = await applyAiWebsiteEdit('org_1', 'make it blue')
    expect(good.ok).toBe(true)
    expect(capturedPatch?.brandColor).toBe('#2563EB')
  })

  it('maps stats to id/value/label triples', async () => {
    state.toolInput = {
      summary: 'x',
      page: '/',
      edits: [{ type: 'stats', stats: [{ value: 'Same-week', label: 'appointments' }, { value: 'Most', label: 'insurance accepted' }] }],
    }
    await applyAiWebsiteEdit('org_1', 'x')
    const stats = capturedPatch?.stats as Array<{ id: string; value: string; label: string }>
    expect(stats).toHaveLength(2)
    expect(stats[0]).toMatchObject({ value: 'Same-week', label: 'appointments' })
    expect(stats[0].id).toBeTruthy()
  })

  it('sets difference chips from the full list', async () => {
    state.toolInput = { summary: 'x', page: '/', edits: [{ type: 'chips', items: ['Same-week visits', 'No judgment, ever'] }] }
    await applyAiWebsiteEdit('org_1', 'x')
    expect(capturedPatch?.differenceChips).toEqual(['Same-week visits', 'No judgment, ever'])
  })

  it('derives the page from a subpage copy key (model page ignored)', async () => {
    state.toolInput = { summary: 'x', page: '/', edits: [{ type: 'copy', key: 'insurance.heading', value: 'Insurance, simplified.' }] }
    const r = await applyAiWebsiteEdit('org_1', 'x')
    if (r.ok) {
      expect(r.page).toBe('/insurance')
      expect(r.anchor).toBe('copy:insurance.heading')
    }
  })

  it('sets payment methods + routes to the payment page', async () => {
    state.toolInput = { summary: 'x', page: '/', edits: [{ type: 'paymentMethods', items: ['Cash', 'All major credit cards'] }] }
    const r = await applyAiWebsiteEdit('org_1', 'x')
    expect(capturedPatch?.paymentMethods).toEqual(['Cash', 'All major credit cards'])
    if (r.ok) expect(r.page).toBe('/payment-financing')
  })

  it('sets the cancellation policy text', async () => {
    state.toolInput = { summary: 'x', page: '/', edits: [{ type: 'cancellationPolicy', value: 'Please give 24 hours notice.' }] }
    await applyAiWebsiteEdit('org_1', 'x')
    expect(capturedPatch?.cancellationPolicy).toBe('Please give 24 hours notice.')
  })

  it('validates office hours — keeps valid HH:MM, drops bad times, honors closed', async () => {
    state.toolInput = {
      summary: 'x',
      page: '/',
      edits: [{ type: 'hours', hours: { mon: { open: '09:00', close: '17:00', closed: false }, sun: { closed: true }, tue: { open: 'nope', close: '17:00' } } }],
    }
    await applyAiWebsiteEdit('org_1', 'x')
    const h = capturedPatch?.hours as Record<string, { open: string | null; close: string | null; closed: boolean }>
    expect(h.mon).toEqual({ open: '09:00', close: '17:00', closed: false })
    expect(h.sun).toEqual({ open: null, close: null, closed: true })
    expect(h.tue).toEqual({ open: null, close: '17:00', closed: false })
  })

  it('replaces the FAQ list with ids + routes to /faq', async () => {
    state.toolInput = {
      summary: 'x',
      page: '/',
      edits: [{ type: 'faq', faq: [{ category: 'Booking', question: 'Do you take walk-ins?', answer: 'Same-week appointments are usually available.' }] }],
    }
    const r = await applyAiWebsiteEdit('org_1', 'x')
    const faq = capturedPatch?.faq as Array<{ id: string; question: string }>
    expect(faq).toHaveLength(1)
    expect(faq[0].id).toBeTruthy()
    expect(faq[0].question).toBe('Do you take walk-ins?')
    if (r.ok) expect(r.page).toBe('/faq')
  })
})
