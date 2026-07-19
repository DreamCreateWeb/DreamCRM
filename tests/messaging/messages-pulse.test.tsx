import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

/**
 * The Messages inbox's ONE heartbeat (Design System law 7): the 14-day
 * conversation-pulse sparkline in the thread-list header. Render guards:
 *
 *   - Shows when ≥2 days carry any messages: the "14-day pulse" label,
 *     the aria-hidden decorative sparkline, and the explanatory title.
 *   - Hidden entirely for an all-zero series AND for a single-blip series
 *     (a flat or one-point line says nothing worth drawing) — honest empty.
 *
 * Mock scaffolding mirrors messages-responsive-collapse.test.tsx (real RSC,
 * services mocked, client detail panel stubbed).
 */
const { listThreads, inboxStats, threadById, listMessages, patientContext, markRead, perDay } = vi.hoisted(() => ({
  listThreads: vi.fn(),
  inboxStats: vi.fn(),
  threadById: vi.fn(),
  listMessages: vi.fn(),
  patientContext: vi.fn(),
  markRead: vi.fn(),
  perDay: vi.fn(),
}))

vi.mock('@/lib/services/patient-messaging', () => ({
  getInboxStats: inboxStats,
  getMessagesPerDay14: perDay,
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

function series(values: number[]) {
  return Array.from({ length: 14 }, (_, i) => ({ bucket: `Jul ${i + 1}`, value: values[i] ?? 0 }))
}

beforeEach(() => {
  listThreads.mockResolvedValue([])
  inboxStats.mockResolvedValue({ open: 0, unread: 0, snoozedAvailable: 0, archived: 0 })
  listMessages.mockResolvedValue([])
  patientContext.mockResolvedValue(null)
  markRead.mockResolvedValue(undefined)
  threadById.mockResolvedValue(null)
})

describe('Messages inbox — 14-day pulse heartbeat', () => {
  it('renders the labeled, aria-hidden sparkline when ≥2 days carry messages', async () => {
    perDay.mockResolvedValue(series([0, 3, 0, 1, 0, 0, 2]))
    render(await ClinicMessagesView({ ctx, searchParams: {} }))
    const label = screen.getByText('14-day pulse')
    expect(label).toBeInTheDocument()
    // 12px floor — the label rides text-xs, never smaller.
    expect(label.className).toContain('text-xs')
    const row = label.closest('div')!
    // Plain-language explanation for staff who hover.
    expect(row.getAttribute('title')).toMatch(/last 14 days/i)
    // Decorative: the svg itself is inside an aria-hidden wrapper.
    const wrapper = row.querySelector('[aria-hidden="true"]')!
    expect(wrapper).toBeTruthy()
    expect(wrapper.querySelector('svg')).toBeTruthy()
  })

  it('renders nothing for an all-zero series (honest empty)', async () => {
    perDay.mockResolvedValue(series([]))
    render(await ClinicMessagesView({ ctx, searchParams: {} }))
    expect(screen.queryByText('14-day pulse')).toBeNull()
  })

  it('renders nothing when only ONE day carries messages (a single blip is not a pulse)', async () => {
    perDay.mockResolvedValue(series([0, 0, 5]))
    render(await ClinicMessagesView({ ctx, searchParams: {} }))
    expect(screen.queryByText('14-day pulse')).toBeNull()
  })
})
