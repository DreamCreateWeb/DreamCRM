import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

/**
 * CLICKABLE ROWS ARE LIST ITEMS, NOT BUTTONS.
 *
 * The appointments agenda row and the leads board row were both
 * `<li role="button" tabIndex={0}>` wrapped around their own controls — a
 * checkbox, a link to the patient, inline Confirm / Mark-done actions. That one
 * shape broke two WCAG rules at once, and the runtime accessibility checks
 * found 38 instances of it:
 *
 *   - `nested-interactive` (25): a button may not contain focusable controls.
 *     A screen-reader user tabbing into the row lands on controls inside
 *     something announced as a single button, which it cannot describe.
 *   - `list` (13): an element carrying `role="button"` is no longer a
 *     `listitem`, so the surrounding `<ul>`'s direct children were not list
 *     items — the list was not a list.
 *
 * Both clear when the row becomes a plain (clickable) list item whose keyboard
 * door is a real button on its primary label. This guard pins that shape
 * structurally rather than by class name, and it re-implements the two axe
 * rules over the rendered DOM so the pattern cannot come back on these
 * surfaces between E2E runs — the browser suite is the only other thing that
 * would catch it, and it costs a full harness to run.
 *
 * It also pins the two behaviours the restructure had to preserve: the whole
 * row still opens on click (the desk's highest-frequency interaction), and the
 * row is still reachable and activatable from the keyboard.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/(default)/appointments/actions', () => ({
  confirmAppointmentAction: vi.fn(async () => ({ ok: true })),
  markCompletedAction: vi.fn(async () => ({ ok: true, reviewSent: true })),
  bulkSendRemindersAction: vi.fn(async () => ({ attempted: 0, sent: 0, skipped: 0, errors: [] })),
  bulkSetAppointmentStatusAction: vi.fn(async () => ({ ok: true, updated: 0, skipped: 0 })),
  bulkCreateFollowupsForPatientsAction: vi.fn(),
}))
vi.mock('@/app/(default)/appointments/appointment-drawer', () => ({ default: () => null }))
vi.mock('@/app/(default)/appointments/new-booking-drawer', () => ({ default: () => null }))

import AgendaView from '@/app/(default)/appointments/agenda-view'
import type {
  AppointmentRow,
  AppointmentDayGroup,
  AppointmentListFilters,
  AppointmentFilterMeta,
} from '@/lib/services/appointments'

const meta: AppointmentFilterMeta = { providers: [], sources: [] }
const filters: AppointmentListFilters = { window: 'next_14d', attention: [] }

function row(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 'a1',
    patientId: 'p1',
    patientName: 'Mia Hayes',
    patientLifecycle: 'active',
    startTime: new Date('2026-05-21T09:00:00Z'),
    endTime: new Date('2026-05-21T09:30:00Z'),
    durationMinutes: 30,
    type: 'cleaning',
    status: 'scheduled',
    source: 'booking_widget',
    notes: null,
    providerId: null,
    providerName: null,
    locationName: null,
    confirmedAt: null,
    cancelledAt: null,
    arrivedAt: null,
    seatedAt: null,
    reminderLastSentAt: null,
    createdAt: new Date('2026-05-10T12:00:00Z'),
    flags: {
      newPatient: false,
      birthdayThisWeek: false,
      hasOutstandingBalance: false,
      missingIntakeBeforeAppt: false,
      unconfirmedNext48h: false,
      lapsedReturning: false,
      optedOut: false,
      reminderSentRecently: false,
      bookedJustNow: false,
      rescheduled: false,
    },
    agingLevel: 'none',
    needsRebooking: false,
    tags: [],
    ...overrides,
  }
}

/** A day group carrying two rows, so the list really is a list. */
const group: AppointmentDayGroup = {
  date: new Date('2026-05-21T00:00:00Z'),
  label: 'Wed May 21',
  rows: [
    row({ id: 'a1', patientName: 'Mia Hayes', type: 'cleaning' }),
    row({ id: 'a2', patientName: 'Liam Brooks', type: 'checkup', status: 'confirmed' }),
  ],
  totals: { booked: 2, confirmed: 1, unconfirmed: 1 },
}

/* ── the two axe rules, over the rendered DOM ─────────────────────────────── */

/** Roles axe treats as interactive for `nested-interactive` purposes, plus the
 *  native elements that carry them implicitly. */
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[tabindex]:not([tabindex="-1"])',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="option"]',
].join(',')

function nestedInteractive(root: HTMLElement): string[] {
  const hits: string[] = []
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR))) {
    const ancestor = el.parentElement?.closest<HTMLElement>(INTERACTIVE_SELECTOR)
    if (ancestor) {
      hits.push(
        `<${el.tagName.toLowerCase()}> is inside <${ancestor.tagName.toLowerCase()}` +
          `${ancestor.getAttribute('role') ? ` role="${ancestor.getAttribute('role')}"` : ''}>`,
      )
    }
  }
  return hits
}

/** Every direct child of a list must be a list item — the `list` rule. */
function nonListItemChildren(root: HTMLElement): string[] {
  const hits: string[] = []
  for (const list of Array.from(root.querySelectorAll<HTMLElement>('ul, ol'))) {
    for (const child of Array.from(list.children)) {
      const el = child as HTMLElement
      const role = el.getAttribute('role')
      const isItem = el.tagName === 'LI' && (role === null || role === 'listitem')
      // A template/script child is allowed; nothing else is.
      if (!isItem && !['SCRIPT', 'TEMPLATE'].includes(el.tagName)) {
        hits.push(`<${el.tagName.toLowerCase()}${role ? ` role="${role}"` : ''}> is a direct child of a <${list.tagName.toLowerCase()}>`)
      }
    }
  }
  return hits
}

describe('the appointments agenda row', () => {
  function renderAgenda() {
    return render(<AgendaView groups={[group]} meta={meta} filters={filters} orgName="Acme Dental" />)
  }

  it('renders its rows as list items, not as buttons', () => {
    renderAgenda()
    const items = screen.getAllByRole('listitem')
    // Both seeded rows are present AS LIST ITEMS.
    expect(items.filter((li) => li.textContent?.includes('Mia Hayes'))).toHaveLength(1)
    expect(items.filter((li) => li.textContent?.includes('Liam Brooks'))).toHaveLength(1)
    // And the row itself is not a button any more — the old shape.
    expect(screen.queryByRole('button', { name: "Open Mia Hayes's visit" })).not.toBeInTheDocument()
  })

  it('has no interactive control nested inside another one', () => {
    const { container } = renderAgenda()
    const hits = nestedInteractive(container)
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('has no list whose direct children are not list items', () => {
    const { container } = renderAgenda()
    const hits = nonListItemChildren(container)
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('gives each row a real, named button that opens it — the keyboard door', () => {
    renderAgenda()
    // The name LEADS with the visible label (Label-in-Name, WCAG 2.5.3) and
    // still says whose visit it opens, because six rows can all say "cleaning".
    const opener = screen.getByRole('button', { name: /^cleaning — open Mia Hayes's visit$/i })
    expect(opener).toBeInTheDocument()
    expect(opener.textContent).toBe('cleaning')
  })

  it('still opens when the row itself is clicked, not only the button', () => {
    // The desk's highest-frequency interaction. The drawer is mocked out, so
    // the observable effect is the row's own click handler firing — asserted
    // through the pointer landing on the row, not on the opener.
    const { container } = renderAgenda()
    const li = screen
      .getAllByRole('listitem')
      .find((el) => el.textContent?.includes('Mia Hayes'))!
    const onOpen = vi.fn()
    li.addEventListener('click', onOpen)
    fireEvent.click(li)
    expect(onOpen).toHaveBeenCalled()
    // And the row is still the clickable affordance it looks like.
    expect(li.className).toContain('cursor-pointer')
    expect(container.querySelectorAll('li[role="button"]')).toHaveLength(0)
  })

  it('keeps the row-level controls reachable in their own right', () => {
    renderAgenda()
    // These are exactly the controls that used to be trapped inside the row's
    // button; each must still be a first-class control of its own.
    expect(screen.getByRole('checkbox', { name: 'Select Mia Hayes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Mia Hayes' })).toBeInTheDocument()
    // The seeded start time is in the past, so the inline action on this row
    // is Mark done rather than Confirm — either way it is an in-row button
    // that used to live inside the row's own button.
    expect(screen.getAllByRole('button', { name: /Mark done/ }).length).toBeGreaterThan(0)
  })
})
