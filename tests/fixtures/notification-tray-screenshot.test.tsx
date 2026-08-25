import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { writeFileSync, mkdirSync } from 'node:fs'

/**
 * THE TRAY SCREENSHOT FIXTURE (notifications overhaul) — a render rig, not a
 * behavior test; gated on SCREENSHOT=1 like the Dream Team one. Renders the
 * real header bell with a realistic mixed tray (urgent review, patient
 * message, bookings, money, a campaign that erred), clicks it open, and
 * dumps the DOM for the shell + Chromium screenshot loop.
 */

const NOW = Date.now()
const MIN = 60_000
const HOUR = 60 * MIN

const items = [
  {
    id: 1,
    bucket: 'comments',
    type: 'review_low_rating',
    title: '2★ review from Dan H. — reach out before it goes public',
    body: '“Waited 40 minutes past my appointment time. Staff were nice but I was late back to work.”',
    linkPath: '/growth/reviews',
    readAt: null,
    createdAt: new Date(NOW - 12 * MIN).toISOString(),
  },
  {
    id: 2,
    bucket: 'comments',
    type: 'patient_message',
    title: 'New message from Maria Lopez',
    body: 'Hi — can I move Ethan’s cleaning to after 3pm? School pickup runs late on Thursdays.',
    linkPath: '/messages',
    readAt: null,
    createdAt: new Date(NOW - 38 * MIN).toISOString(),
  },
  {
    id: 3,
    bucket: 'comments',
    type: 'online_booking',
    title: 'New booking — Priya Shah',
    body: 'Cleaning & exam, Thursday Aug 27, 10:00 AM.',
    linkPath: '/appointments',
    readAt: null,
    createdAt: new Date(NOW - 2 * HOUR).toISOString(),
  },
  {
    id: 4,
    bucket: 'comments',
    type: 'balance_payment_paid',
    title: 'Balance paid — $214.00',
    body: 'Rob Chen paid their outstanding balance online.',
    linkPath: '/payments/online',
    readAt: new Date(NOW - HOUR).toISOString(),
    createdAt: new Date(NOW - 5 * HOUR).toISOString(),
  },
  {
    id: 5,
    bucket: 'candidates',
    type: 'campaign_sent_with_errors',
    title: 'Recall campaign sent — 3 addresses bounced',
    body: '38 of 41 delivered. The bounced patients are flagged on the campaign page.',
    linkPath: '/growth/outreach',
    readAt: new Date(NOW - 20 * HOUR).toISOString(),
    createdAt: new Date(NOW - 26 * HOUR).toISOString(),
  },
  {
    id: 6,
    bucket: 'comments',
    type: 'intake_submitted',
    title: 'Intake form submitted — Priya Shah',
    body: 'New-patient packet, complete with insurance card photos.',
    linkPath: '/intake-forms',
    readAt: new Date(NOW - 20 * HOUR).toISOString(),
    createdAt: new Date(NOW - 30 * HOUR).toISOString(),
  },
  {
    id: 7,
    bucket: 'comments',
    type: 'appointment_no_show',
    title: 'No-show — Tyler Brooks',
    body: 'Tuesday 2:30 PM hygiene visit. A rebook follow-up was opened automatically.',
    linkPath: '/appointments',
    readAt: new Date(NOW - 40 * HOUR).toISOString(),
    createdAt: new Date(NOW - 2 * 24 * HOUR).toISOString(),
  },
]

vi.mock('@/components/realtime/realtime-provider', () => ({
  useRealtime: () => undefined,
}))
vi.mock('next/navigation', async (orig) => ({
  ...(await orig()),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import DropdownNotifications from '@/components/dropdown-notifications'

describe.runIf(process.env.SCREENSHOT === '1')('tray screenshot fixture', () => {
  it('dumps the open notification tray DOM', async () => {
    const empty = process.env.TRAY_EMPTY === '1'
    const payload = empty ? { items: [], unread: 0 } : { items, unread: 3 }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => payload })),
    )

    render(
      <div className="flex justify-end p-8">
        <DropdownNotifications align="right" />
      </div>,
    )
    await screen.findByRole('button', { name: /notifications/i })
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }))
    if (!empty) await screen.findByText(/2★ review from Dan H\./)
    else await screen.findByText(/All quiet/)

    const dir = process.env.SCREENSHOT_DIR ?? '/tmp/tray-shot'
    mkdirSync(dir, { recursive: true })
    writeFileSync(`${dir}/body${empty ? '-empty' : ''}.html`, document.body.innerHTML)
    expect(document.body.innerHTML.length).toBeGreaterThan(1000)
  })
})
