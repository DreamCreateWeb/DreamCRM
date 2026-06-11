import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Below lg the two-pane inbox collapses to ONE pane: the thread list when
 * nothing is selected, the detail (with a back link) once a thread is open.
 * At lg+ both panes show. We render the real RSC with mocked services and
 * assert the responsive class contract on the list aside + detail section.
 */
const { listThreads, inboxStats, threadById, listMessages, patientContext, markRead } = vi.hoisted(() => ({
  listThreads: vi.fn(),
  inboxStats: vi.fn(),
  threadById: vi.fn(),
  listMessages: vi.fn(),
  patientContext: vi.fn(),
  markRead: vi.fn(),
}))

vi.mock('@/lib/services/patient-messaging', () => ({
  CANNED_TEMPLATES: [],
  getInboxStats: inboxStats,
  getPatientThreadById: threadById,
  getThreadPatientContext: patientContext,
  listMessagesInThread: listMessages,
  listPatientThreads: listThreads,
  markThreadRead: markRead,
  renderTemplate: (s: string) => s,
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
// The client detail panel pulls server actions + router; stub it to a marker
// so this test stays focused on the layout shell, not the panel internals.
vi.mock('@/app/(double-sidebar)/messages/clinic-thread-detail-panel', () => ({
  default: () => <div data-testid="detail-panel">panel</div>,
}))

import ClinicMessagesView from '@/app/(double-sidebar)/messages/clinic-messages-view'
import type { TenantContext } from '@/lib/auth/context'

const ctx = {
  tenantType: 'clinic',
  role: 'owner',
  organizationId: 'org_1',
  userId: 'u1',
  userName: 'Dr. Reyes',
} as unknown as TenantContext

const threadRow = {
  id: 'thr_1',
  patientId: 'pat_1',
  patientFirstName: 'Mia',
  patientLastName: 'Nguyen',
  patientEmail: 'mia@example.com',
  patientPhone: '5125550101',
  status: 'open',
  assignedUserId: null,
  assignedUserName: null,
  snoozedUntil: null,
  lastMessageAt: new Date(),
  lastMessageDirection: 'inbound',
  lastMessageChannel: 'email',
  lastMessagePreview: 'hi',
  unreadCount: 0,
  createdAt: new Date(),
}

beforeEach(() => {
  listThreads.mockResolvedValue([threadRow])
  inboxStats.mockResolvedValue({ open: 1, unread: 0, snoozedAvailable: 0, archived: 0 })
  listMessages.mockResolvedValue([])
  patientContext.mockResolvedValue(null)
  markRead.mockResolvedValue(undefined)
  threadById.mockResolvedValue({ ...threadRow, unreadCount: 0 })
})

describe('messages two-pane responsive collapse', () => {
  it('no thread selected → list shows, detail hidden below lg', async () => {
    const ui = await ClinicMessagesView({ ctx, searchParams: {} })
    const { container } = render(ui)
    const aside = container.querySelector('aside')!
    const section = container.querySelector('section')!
    // List is visible (not hidden) on mobile.
    expect(aside.className).toContain('flex')
    expect(aside.className).not.toContain('hidden lg:flex')
    // Detail is hidden on mobile, shows at lg+.
    expect(section.className).toContain('hidden lg:flex')
  })

  it('thread selected → detail shows, list hidden below lg', async () => {
    const ui = await ClinicMessagesView({ ctx, searchParams: { thread: 'thr_1' } })
    const { container } = render(ui)
    const aside = container.querySelector('aside')!
    const section = container.querySelector('section')!
    // List collapses on mobile, returns at lg+.
    expect(aside.className).toContain('hidden lg:flex')
    // Detail is visible on mobile.
    expect(section.className).toContain('flex')
    expect(section.className).not.toContain('hidden lg:flex')
  })

  it('keeps the fixed list-column width at lg+ (desktop unchanged)', async () => {
    const ui = await ClinicMessagesView({ ctx, searchParams: {} })
    const { container } = render(ui)
    expect(container.querySelector('aside')!.className).toContain('lg:w-[22rem]')
  })
})

describe('messages surface header — Mailbox (Gmail) tab', () => {
  it('renders a quiet "Mailbox" tab linking to /inbox (Inbox folds into Messages at nav level)', async () => {
    const ui = await ClinicMessagesView({ ctx, searchParams: {} })
    const { getByRole } = render(ui)
    const mailbox = getByRole('link', { name: /Mailbox/ })
    expect(mailbox).toHaveAttribute('href', '/inbox')
    // It is a tab in the surface header, not a primary action — no teal fill.
    expect(mailbox.className).not.toContain('bg-teal-500')
  })

  it('labels the active "Patients" tab with aria-current and a teal underline', async () => {
    const ui = await ClinicMessagesView({ ctx, searchParams: {} })
    const { container } = render(ui)
    const nav = container.querySelector('nav[aria-label="Messages surfaces"]')!
    expect(nav).toBeTruthy()
    const current = nav.querySelector('[aria-current="page"]')!
    expect(current.textContent).toContain('Patients')
    expect(current.className).toContain('border-teal-500')
  })
})
