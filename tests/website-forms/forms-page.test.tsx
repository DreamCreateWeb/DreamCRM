/**
 * Website → Forms (deep-carve Phase 2) — the site's intake points as one
 * surface. Proves: both builders render from the REAL stored config with an
 * honest Customized/standard pill; saving posts through the Studio's
 * saveLeadForm (one saver, two doors); the chat toggle calls the practice
 * action and reverts optimistically on error; role gate; link-outs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'

let ctx: Record<string, unknown>
let profileRow: Record<string, unknown> | null
const redirectMock = vi.fn((to: string) => {
  throw new Error(`REDIRECT:${to}`)
})

vi.mock('next/navigation', async (orig) => ({
  ...(await orig()),
  redirect: (to: string) => redirectMock(to),
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('@/lib/auth/context', () => ({
  requireTenant: vi.fn(async () => ctx),
}))
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (profileRow ? [profileRow] : []) }) }),
    }),
  },
}))
vi.mock('@/lib/services/leads', () => ({
  listLeads: vi.fn(async () => [
    { id: 'l1', name: 'Sam W.', status: 'new', ageHours: 3, sourcePage: '/' },
  ]),
  getNewLeadsSince: vi.fn(async () => 4),
}))

const { saveLeadFormMock, saveChatMock } = vi.hoisted(() => ({
  saveLeadFormMock: vi.fn(async (_fd: FormData) => ({ ok: true as const })),
  saveChatMock: vi.fn(async (_on: boolean) => ({ ok: true as const })),
}))
vi.mock('@/app/(default)/website/editor/website-actions', () => ({
  saveLeadForm: saveLeadFormMock,
}))
vi.mock('@/app/(default)/website/forms/actions', () => ({
  saveChatWidgetAction: saveChatMock,
}))

import WebsiteFormsPage from '@/app/(default)/website/forms/page'

beforeEach(() => {
  redirectMock.mockClear()
  saveLeadFormMock.mockClear()
  saveChatMock.mockClear()
  ctx = {
    tenantType: 'clinic',
    role: 'owner',
    organizationId: 'org_1',
    organizationSlug: 'acme',
    planTier: 'pro',
  }
  profileRow = {
    // Contact customized (stored key present); insurance on defaults.
    leadForms: {
      contact: [
        { id: 'name', type: 'text', label: 'Full name', required: true, systemKey: 'name' },
        { id: 'custom_q', type: 'select', label: 'How did you hear about us?', options: ['A friend'] },
      ],
    },
    chatWidgetEnabled: true,
  }
})

describe('WebsiteFormsPage', () => {
  it('renders both forms with honest customized/default pills + real stats', async () => {
    render(await WebsiteFormsPage())
    expect(screen.getByText('Contact form')).toBeTruthy()
    expect(screen.getByText('Insurance check form')).toBeTruthy()
    expect(screen.getByText('Customized')).toBeTruthy()
    expect(screen.getByText('Using the standard fields')).toBeTruthy()
    expect(screen.getByText('4 in the last 7 days')).toBeTruthy()
    expect(screen.getByText('Sam W.')).toBeTruthy()
    // Stored custom field pre-filled in the builder.
    expect(screen.getByDisplayValue('How did you hear about us?')).toBeTruthy()
    cleanup()
  })

  it('saving a form posts through the Studio saver with the right formKey', async () => {
    render(await WebsiteFormsPage())
    fireEvent.click(screen.getAllByText('Save form')[0])
    await waitFor(() => expect(saveLeadFormMock).toHaveBeenCalledTimes(1))
    const fd = saveLeadFormMock.mock.calls[0][0]
    expect(fd.get('formKey')).toBe('contact')
    cleanup()
  })

  it('the chat toggle calls the practice action and reverts on error', async () => {
    saveChatMock.mockResolvedValueOnce({ ok: false, error: 'nope' } as never)
    render(await WebsiteFormsPage())
    const toggle = screen.getByRole('switch', {
      name: 'Show the “Message us” bubble on your website',
    })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(toggle)
    await waitFor(() => expect(saveChatMock).toHaveBeenCalledWith(false))
    // Reverted after the error.
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'))
    expect(screen.getByText('nope')).toBeTruthy()
    cleanup()
  })

  it('links out to Leads and Practice settings (booking stays there)', async () => {
    const { container } = render(await WebsiteFormsPage())
    expect(container.querySelector('a[href="/leads"]')).toBeTruthy()
    expect(container.querySelector('a[href="/settings/practice?tab=booking"]')).toBeTruthy()
    cleanup()
  })

  it('members bounce to the hub', async () => {
    ctx = { ...ctx, role: 'member' }
    await expect(WebsiteFormsPage()).rejects.toThrow('REDIRECT:/website')
    cleanup()
  })
})
