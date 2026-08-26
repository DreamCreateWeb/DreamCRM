import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

/**
 * THE TRAY MUST SURVIVE ITS OWN CLICKS (2026-08-25, owner: "I can't click
 * anything without just closing the notification tray — not a notification,
 * not Clear all, not Preferences").
 *
 * Root cause: the tray was a headlessui <Menu>, whose outside-click handler
 * treats anything outside <MenuItems> — the Mark-all-read header, the whole
 * footer — as outside the menu, dismissing the panel on mousedown before
 * those buttons received their click. Rebuilt as a <Popover>: one panel,
 * everything inside it clickable. These tests pin the contract:
 *  - Mark all read / Clear all / per-item ✕ act AND keep the panel open
 *    (you're tidying the tray, not leaving it).
 *  - Clicking a notification marks it read, navigates, and closes.
 */

const pushes: string[] = []
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (p: string) => pushes.push(p), refresh: vi.fn() }),
}))
vi.mock('@/components/realtime/realtime-provider', () => ({
  useRealtime: () => undefined,
}))

import DropdownNotifications from '@/components/dropdown-notifications'

const items = [
  {
    id: 1,
    bucket: 'comments',
    type: 'patient_message',
    title: 'New message from Maria Lopez',
    body: 'Can I move Ethan’s cleaning?',
    linkPath: '/messages',
    readAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    bucket: 'comments',
    type: 'online_booking',
    title: 'New booking — Priya Shah',
    body: null,
    linkPath: '/appointments',
    readAt: null,
    createdAt: new Date().toISOString(),
  },
]

const fetchCalls: Array<{ url: string; body: unknown }> = []
let served: typeof items = []

beforeEach(() => {
  pushes.length = 0
  fetchCalls.length = 0
  served = items.map((i) => ({ ...i }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null
      fetchCalls.push({ url: String(url), body })
      // Dismissals stick, so the tray's follow-up refresh can't resurrect
      // the row it just removed (mirrors the real API).
      if (String(url).includes('/api/notifications/dismiss')) {
        const ids: number[] = (body as { ids?: number[] })?.ids ?? []
        served = (body as { all?: boolean })?.all ? [] : served.filter((i) => !ids.includes(i.id))
      }
      return {
        ok: true,
        json: async () => ({ items: served, unread: served.filter((i) => !i.readAt).length }),
      }
    }),
  )
})

async function openTray() {
  render(<DropdownNotifications align="right" />)
  fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
  await screen.findByText('New message from Maria Lopez')
}

describe('notification tray (popover contract)', () => {
  it('Clear all fires the dismiss call and the panel STAYS OPEN', async () => {
    await openTray()
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }))
    await waitFor(() =>
      expect(fetchCalls.some((c) => c.url.includes('/api/notifications/dismiss'))).toBe(true),
    )
    // The panel survived its own button.
    expect(screen.getByText(/preferences/i)).toBeInTheDocument()
    expect(screen.getByText('All quiet')).toBeInTheDocument()
  })

  it('Mark all read fires the read call and the panel stays open', async () => {
    await openTray()
    fireEvent.click(screen.getByRole('button', { name: /mark all read/i }))
    await waitFor(() =>
      expect(
        fetchCalls.some((c) => c.url.includes('/api/notifications/read') && (c.body as { all?: boolean })?.all === true),
      ).toBe(true),
    )
    expect(screen.getByText(/preferences/i)).toBeInTheDocument()
  })

  it('dismissing one notification keeps the panel open to dismiss more', async () => {
    await openTray()
    fireEvent.click(screen.getAllByRole('button', { name: /dismiss notification/i })[0])
    await waitFor(() =>
      expect(fetchCalls.some((c) => c.url.includes('/api/notifications/dismiss'))).toBe(true),
    )
    // Row 1 gone locally, row 2 still there, panel still open.
    expect(screen.queryByText('New message from Maria Lopez')).toBeNull()
    expect(screen.getByText('New booking — Priya Shah')).toBeInTheDocument()
  })

  it('clicking a notification marks it read, navigates, and closes the panel', async () => {
    await openTray()
    fireEvent.click(screen.getByText('New message from Maria Lopez'))
    await waitFor(() => expect(pushes).toContain('/messages'))
    expect(
      fetchCalls.some((c) => {
        const b = c.body as { ids?: number[] } | null
        return c.url.includes('/api/notifications/read') && b?.ids?.includes(1)
      }),
    ).toBe(true)
    // Navigation closes the tray.
    await waitFor(() => expect(screen.queryByText(/preferences/i)).toBeNull())
  })

  it('Preferences is a real link to the settings page', async () => {
    await openTray()
    const link = screen.getByRole('link', { name: /preferences/i })
    expect(link.getAttribute('href')).toBe('/settings/notifications')
  })
})
