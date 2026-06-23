import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * Render guards for the redesigned clinic thread-list rows (left pane, v2):
 * avatar chip + initials, unread bolding + amber count, the channel pill,
 * the aging rot left-border (functional), and the teal selection ring on the
 * active row. The detail panel is stubbed so this stays focused on the rows.
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
  getInboxStats: inboxStats,
  getPatientThreadById: threadById,
  getThreadPatientContext: patientContext,
  listMessagesInThread: listMessages,
  listPatientThreads: listThreads,
  markThreadRead: markRead,
  renderTemplate: (s: string) => s,
}))
vi.mock('@/lib/services/message-templates', () => ({ listMessageTemplates: async () => [] }))
vi.mock('@/lib/services/patient-tags', () => ({ getTagsForPatient: async () => [] }))
vi.mock('@/lib/services/patient-followups', () => ({ listAssignableStaff: async () => [] }))
vi.mock('@/lib/services/scheduled-messages', () => ({ listScheduledForPatient: async () => [] }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
// The selectable thread list is a client component; stub its bulk actions so
// rendering the list doesn't pull the server-only auth/db graph.
vi.mock('@/app/(double-sidebar)/messages/clinic-actions', () => ({
  bulkArchiveThreadsAction: vi.fn(),
  bulkSnoozeThreadsAction: vi.fn(),
  bulkMarkReadThreadsAction: vi.fn(),
}))
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

function row(over: Record<string, unknown> = {}) {
  return {
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
    lastMessagePreview: 'hi there',
    unreadCount: 0,
    createdAt: new Date(),
    ...over,
  }
}

beforeEach(() => {
  inboxStats.mockResolvedValue({ open: 1, unread: 0, snoozedAvailable: 0, archived: 0 })
  listMessages.mockResolvedValue([])
  patientContext.mockResolvedValue(null)
  markRead.mockResolvedValue(undefined)
  threadById.mockResolvedValue(null)
})

describe('Thread list rows (v2)', () => {
  it('renders an avatar chip with the patient initials', async () => {
    listThreads.mockResolvedValue([row()])
    render(await ClinicMessagesView({ ctx, searchParams: {} }))
    expect(screen.getByText('MN')).toBeInTheDocument()
  })

  it('bolds the patient name and shows the amber count when there are unread messages', async () => {
    listThreads.mockResolvedValue([row({ unreadCount: 3 })])
    render(await ClinicMessagesView({ ctx, searchParams: {} }))
    expect(screen.getByText('Mia Nguyen').className).toContain('font-bold')
    expect(screen.getByTitle('3 unread messages')).toBeInTheDocument()
  })

  it('keeps the name at medium weight when fully read', async () => {
    listThreads.mockResolvedValue([row({ unreadCount: 0 })])
    render(await ClinicMessagesView({ ctx, searchParams: {} }))
    const name = screen.getByText('Mia Nguyen')
    expect(name.className).toContain('font-medium')
    expect(name.className).not.toContain('font-bold')
  })

  it('shows the channel pill and a "You:" prefix on outbound previews', async () => {
    listThreads.mockResolvedValue([row({ lastMessageDirection: 'outbound', lastMessagePreview: 'see you Thu' })])
    render(await ClinicMessagesView({ ctx, searchParams: {} }))
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.getByText('You:')).toBeInTheDocument()
  })

  it('paints the aging rot left-border on a long-unanswered inbound thread', async () => {
    const oldInbound = new Date(Date.now() - 48 * 60 * 60 * 1000) // 48h → overdue
    listThreads.mockResolvedValue([row({ lastMessageAt: oldInbound, lastMessageDirection: 'inbound' })])
    const { container } = render(await ClinicMessagesView({ ctx, searchParams: {} }))
    expect(container.querySelector('aside li')!.className).toMatch(/border-l-rose-600/)
  })

  it('does not rot when the ball is in the patient court (last message outbound)', async () => {
    listThreads.mockResolvedValue([row({ lastMessageDirection: 'outbound' })])
    const { container } = render(await ClinicMessagesView({ ctx, searchParams: {} }))
    expect(container.querySelector('aside li')!.className).toMatch(/border-l-transparent/)
  })

  it('marks the active row with the teal selection ring', async () => {
    listThreads.mockResolvedValue([row()])
    threadById.mockResolvedValue({ ...row(), unreadCount: 0 })
    const { container } = render(await ClinicMessagesView({ ctx, searchParams: { thread: 'thr_1' } }))
    const link = container.querySelector('aside a[aria-current="true"]')!
    expect(link.className).toMatch(/bg-teal-500\/5/)
  })

  it('renders a star marker on a starred row', async () => {
    listThreads.mockResolvedValue([row({ starred: true })])
    render(await ClinicMessagesView({ ctx, searchParams: {} }))
    expect(screen.getByLabelText('Starred')).toBeInTheDocument()
  })

  it('shows the warm empty state when there are no conversations', async () => {
    listThreads.mockResolvedValue([])
    render(await ClinicMessagesView({ ctx, searchParams: {} }))
    expect(screen.getByText('No conversations yet')).toBeInTheDocument()
  })

  it('shows a filter-aware empty state when filters exclude everything', async () => {
    listThreads.mockResolvedValue([])
    render(await ClinicMessagesView({ ctx, searchParams: { status: 'archived' } }))
    expect(screen.getByText('No conversations match')).toBeInTheDocument()
  })
})
