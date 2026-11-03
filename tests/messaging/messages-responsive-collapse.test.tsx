import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

/**
 * Below lg the two-pane inbox collapses to ONE pane: the thread list when
 * nothing is selected, the detail (with a back link) once a thread is open.
 * At lg+ both panes show. We render the real RSC with mocked services and
 * assert the responsive class contract on the list aside + detail section.
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
  // The view reads the PAGED variants (the queries are capped now); both wrap
  // the same fixtures, so the existing stubs stay the source of truth.
  listMessagesInThreadPage: async (...args: unknown[]) => ({
    messages: await listMessages(...(args as [])),
    hasMore: false,
  }),
  listPatientThreadsPage: async (...args: unknown[]) => ({
    rows: await listThreads(...(args as [])),
    hasMore: false,
  }),
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
  // Quiet heartbeat by default — all-zero series renders no sparkline, so the
  // layout assertions stay focused on the panes (pulse render guards live in
  // messages-pulse.test.tsx).
  perDay.mockResolvedValue(Array.from({ length: 14 }, (_, i) => ({ bucket: `Jul ${i + 1}`, value: 0 })))
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

/**
 * THE FILTERS FIT A PHONE (2026-10-26). Nine chips at text-xs in a
 * `flex-wrap` row stacked four deep at 390px, above a list that had not yet
 * started. The chips are now ONE STRIP that scrolls sideways below lg and
 * wraps above it (the content-workspace rail recipe), the strip is a named,
 * focusable scroll region, and the two doors that are not filters — the
 * megaphone and the Key — move to the list header's right edge below lg.
 */
describe('messages filter bar — a strip below lg', () => {
  async function renderView(searchParams: Record<string, string> = {}) {
    const ui = await ClinicMessagesView({ ctx, searchParams })
    return render(ui)
  }

  it('wraps the chips in a sideways-scrolling, focusable, named strip that wraps at lg', async () => {
    const { container } = await renderView()
    const strip = container.querySelector('[aria-label="Conversation filters"]') as HTMLElement
    expect(strip).not.toBeNull()
    expect(strip.getAttribute('tabindex')).toBe('0')
    for (const cls of ['overflow-x-auto', 'no-scrollbar', 'lg:flex-wrap', 'lg:overflow-visible', 'min-w-0']) {
      expect(strip.className, cls).toContain(cls)
    }
    // The bar itself no longer wraps — the strip does the wrapping at lg.
    expect(strip.parentElement!.className).not.toMatch(/(^|\s)flex-wrap(\s|$)/)
    // Every chip refuses to shrink, so the strip scrolls instead of squeezing.
    const chips = Array.from(strip.querySelectorAll('a'))
    expect(chips.length).toBeGreaterThanOrEqual(9)
    for (const chip of chips) expect(chip.className).toContain('shrink-0')
  })

  it('keeps the megaphone + Key at the bar’s right edge at lg and moves them to the list header below it', async () => {
    const { container } = await renderView()
    const strip = container.querySelector('[aria-label="Conversation filters"]') as HTMLElement
    const barTools = strip.nextElementSibling as HTMLElement
    expect(barTools.className).toContain('hidden')
    expect(barTools.className).toContain('lg:flex')
    expect(barTools.className).toContain('ml-auto')
    const listTools = container.querySelector('[data-testid="list-header-tools"]') as HTMLElement
    expect(listTools).not.toBeNull()
    expect(listTools.className).toContain('lg:hidden')
    expect(listTools.closest('aside')).not.toBeNull()
    // Both groups carry the key and (for an owner) the megaphone.
    for (const group of [barTools, listTools]) {
      expect(group.textContent).toContain('Key')
      expect(group.textContent).toContain('Broadcast')
    }
  })

  it('marks the chips the URL names so the strip can scroll to the selection just made; nothing by default', async () => {
    const plain = await renderView()
    expect(plain.container.querySelectorAll('[data-keep-in-view]')).toHaveLength(0)
    plain.unmount()
    const { container } = await renderView({ unread: '1', assignedTo: 'me' })
    const marked = Array.from(container.querySelectorAll('[data-keep-in-view]')).map((el) => el.textContent?.trim())
    expect(marked).toEqual(['Mine', 'Unread only'])
  })
})

/**
 * THE LONGEST-WAITING SORT IS A CHIP (2026-10-26). `ThreadFilters.sort` had
 * no caller; the pair at the strip's end is the first. "Newest" is the
 * default everywhere except "Unread only", which exists to answer people and
 * so opens on the patient who has waited longest. An explicit ?sort= wins.
 */
describe('messages sort chips', () => {
  async function renderView(searchParams: Record<string, string> = {}) {
    listThreads.mockClear()
    const ui = await ClinicMessagesView({ ctx, searchParams })
    return render(ui)
  }
  const current = (container: HTMLElement, label: string) =>
    (Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.trim() === label) as HTMLAnchorElement).getAttribute('aria-current')

  it('defaults to Newest and asks the service for the recent sort', async () => {
    const { container } = await renderView()
    expect(current(container, 'Newest')).toBe('page')
    expect(current(container, 'Longest waiting')).toBeNull()
    expect(listThreads).toHaveBeenCalledWith('org_1', 'u1', expect.objectContaining({ sort: 'recent' }))
  })

  it('under Unread only defaults to Longest waiting', async () => {
    const { container } = await renderView({ unread: '1' })
    expect(current(container, 'Longest waiting')).toBe('page')
    expect(listThreads).toHaveBeenCalledWith('org_1', 'u1', expect.objectContaining({ sort: 'oldest_unanswered', hasUnread: true }))
  })

  it('an explicit ?sort= beats the Unread-only default, and the chips carry the sort in their hrefs', async () => {
    const { container } = await renderView({ unread: '1', sort: 'newest' })
    expect(current(container, 'Newest')).toBe('page')
    expect(listThreads).toHaveBeenCalledWith('org_1', 'u1', expect.objectContaining({ sort: 'recent' }))
    const waiting = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.trim() === 'Longest waiting')!
    expect(waiting.getAttribute('href')).toContain('sort=waiting')
    expect(waiting.getAttribute('href')).toContain('unread=1')
  })
})
