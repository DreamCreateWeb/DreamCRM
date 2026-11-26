import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import HuddleBoard from '@/app/(default)/huddle/huddle-board'
import { toFlagView, type HuddleView, type HuddleVisitView } from '@/lib/huddle'

/**
 * THE HUDDLE's page (docs/daily-tools.md, slice H1). It is a report, so
 * what is held here is how it is SHOWN: the order a team would run the
 * meeting in, the source line, and the two controls — Present (a
 * whole-screen dialog a room can read) and Hide details (nothing private
 * left on a screen a patient could see).
 */

function visit(over: Partial<HuddleVisitView> = {}): HuddleVisitView {
  return {
    id: 'a1',
    patientId: 'p1',
    name: 'Maria Ramirez',
    shortName: 'Maria R.',
    time: '9:00 AM',
    type: 'New patient exam',
    provider: 'Dr. Lee',
    state: 'ahead',
    flags: [],
    ...over,
  }
}

function makeView(over: Partial<HuddleView> = {}): HuddleView {
  const visits = [
    visit({
      flags: [
        toFlagView({ key: 'medical_alert', label: 'Heads-up from their intake: penicillin allergy', href: '/intake-forms/submissions/s1' }),
        toFlagView({ key: 'new_patient', label: 'First visit — roll out the welcome' }),
        toFlagView({ key: 'balance', label: 'Owes $350 — worth settling at the visit' }),
      ],
    }),
    visit({ id: 'a2', patientId: 'p2', name: 'Sam Tran', shortName: 'Sam T.', time: '10:00 AM', type: 'Cleaning', provider: null }),
    visit({ id: 'a3', patientId: 'p3', name: 'Dana Wu', shortName: 'Dana W.', time: '8:00 AM', type: 'Cleaning', state: 'done' }),
  ]
  return {
    asOf: '7:42 AM',
    source: { text: 'The schedule and balances come from Open Dental, last synced 12 minutes ago.' },
    recap: {
      dayLabel: 'Tuesday, November 24',
      isYesterday: true,
      lines: [
        { key: 'happened', tone: 'ok', text: 'All 12 visits happened.' },
        { key: 'first_visits', tone: 'special', text: 'Riley Fox had a first visit — a new patient in the practice.', quiet: '1 first visit seated — a new patient in the practice.' },
        { key: 'unmarked', tone: 'warn', text: '1 visit still says scheduled — did it happen?', href: '/appointments?window=past_30d&attention=unmarked', cta: 'Mark what happened' },
      ],
    },
    today: {
      dayKey: '2026-11-25',
      dayLabel: 'Wednesday, November 25',
      visits,
      tally: [
        { key: 'new_patient', tone: 'special', text: '1 first visit' },
        { key: 'medical_alert', tone: 'warn', text: '1 intake heads-up' },
      ],
    },
    next: {
      dayKey: '2026-11-26',
      dayLabel: 'Thursday, November 26',
      isTomorrow: true,
      visits: [
        visit({ id: 'b1', patientId: 'p4', name: 'Alex Kim', shortName: 'Alex K.', time: '9:30 AM', flags: [toFlagView({ key: 'unconfirmed', label: 'Not confirmed yet' })] }),
        visit({ id: 'b2', patientId: 'p5', name: 'Jo Park', shortName: 'Jo P.', time: '11:00 AM', flags: [toFlagView({ key: 'birthday', label: 'Birthday this week 🎂' })] }),
        visit({ id: 'b3', patientId: 'p6', name: 'Lee Cho', shortName: 'Lee C.', time: '1:00 PM' }),
      ],
      tally: [],
    },
    headsUp: [{ key: 'followups', tone: 'warn', text: '3 follow-ups are due.', href: '/followups', cta: 'Open follow-ups' }],
    ...over,
  }
}

const renderBoard = (view = makeView(), pmsConnected = true) =>
  render(<HuddleBoard view={view} clinicName="Acme Dental" pmsConnected={pmsConnected} />)

beforeEach(() => {
  window.localStorage.clear()
})
afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

describe('the Huddle page', () => {
  it('runs in meeting order: the last day, today, the next day, what is waiting', () => {
    renderBoard()
    expect(screen.getByRole('heading', { level: 1, name: 'The Huddle' })).toBeInTheDocument()
    expect(screen.getByText('Daily · Acme Dental')).toBeInTheDocument()
    const sections = screen.getAllByRole('region').map((s) => s.getAttribute('aria-label'))
    expect(sections).toEqual(['Yesterday', 'Today', 'Tomorrow', 'Before you go'])
    // The header reads the day in one line.
    expect(screen.getByText('Wednesday, November 25 · 3 visits today — 1 needs a little prep.')).toBeInTheDocument()
  })

  it('says where the facts come from and when they were read (law 2)', () => {
    renderBoard()
    expect(screen.getByText(/As of 7:42 AM\. The schedule and balances come from Open Dental, last synced 12 minutes ago\./)).toBeInTheDocument()
  })

  it('opens the door when nothing is connected, and an empty day says what it is — never “a quiet morning”', () => {
    const view = makeView({
      source: { text: 'This shows only the visits booked through your website and front desk here.', href: '/integrations/pms', cta: 'Connect it' },
      today: { dayKey: '2026-11-25', dayLabel: 'Wednesday, November 25', visits: [], tally: [] },
    })
    renderBoard(view, false)
    expect(screen.getByRole('link', { name: 'Connect it' })).toHaveAttribute('href', '/integrations/pms')
    expect(screen.getByText('No visits booked here for today')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect your practice software' })).toHaveAttribute('href', '/integrations/pms')
    expect(screen.queryByText(/quiet one/i)).toBeNull()
  })

  it('with practice software connected, an empty day IS a quiet one — and still carries a door', () => {
    renderBoard(makeView({ today: { dayKey: '2026-11-25', dayLabel: 'Wednesday, November 25', visits: [], tally: [] } }), true)
    expect(screen.getByText('Nothing on the books today')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Book a visit' })).toHaveAttribute('href', '/appointments?new=1')
  })

  it('walks today patient by patient: the visit, where it stands, and its flags in their tones', () => {
    renderBoard()
    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getByRole('link', { name: 'Maria Ramirez' })).toHaveAttribute('href', '/patients/p1')
    expect(within(today).getByText('New patient exam · Dr. Lee')).toBeInTheDocument()
    // No provider on file → no dangling separator.
    expect(within(today).getAllByText('Cleaning').length).toBeGreaterThan(0)
    // A visit already marked done stays on the page, and says so.
    expect(within(today).getByText('Seen').getAttribute('data-tone')).toBe('ok')
    expect(within(today).getByText('First visit — roll out the welcome').getAttribute('data-tone')).toBe('special')
    expect(within(today).getByText('Owes $350 — worth settling at the visit').getAttribute('data-tone')).toBe('warn')
    // The heartbeat: how much of what is still ahead is ready (1 of 2).
    expect(within(today).getByRole('img', { name: '1 of 2 ready' })).toBeInTheDocument()
    expect(within(today).getByText('1 of 2 ready')).toBeInTheDocument()
  })

  it('the next day lists only who needs prep, and says the rest are set', () => {
    renderBoard()
    const next = screen.getByRole('region', { name: 'Tomorrow' })
    expect(within(next).getByText(/Thursday, November 26 · 3 visits/)).toBeInTheDocument()
    expect(within(next).getByRole('link', { name: 'Alex Kim' })).toBeInTheDocument()
    // A birthday is a celebration, not prep; a clean visit needs nothing.
    expect(within(next).queryByText('Jo Park')).toBeNull()
    expect(within(next).queryByText('Lee Cho')).toBeNull()
    expect(within(next).getByText('The other 2 are all set.')).toBeInTheDocument()
  })

  it('titles the days honestly when they are not yesterday and tomorrow', () => {
    const view = makeView()
    renderBoard({ ...view, recap: { ...view.recap!, isYesterday: false }, next: { ...view.next!, isTomorrow: false } })
    expect(screen.getAllByRole('region').map((s) => s.getAttribute('aria-label'))).toEqual(['Last time in', 'Today', 'Next on the books', 'Before you go'])
  })

  it('says so when nothing is waiting, and leaves out a day it has nothing to say about', () => {
    renderBoard(makeView({ recap: null, next: null, headsUp: [] }))
    expect(screen.getAllByRole('region').map((s) => s.getAttribute('aria-label'))).toEqual(['Today', 'Before you go'])
    expect(screen.getByText('Nothing else is waiting on the team.')).toBeInTheDocument()
  })
})

describe('Hide details', () => {
  it('shortens names and drops amounts, medical detail and the names in the recap — and remembers the choice on this device', () => {
    renderBoard()
    expect(screen.getByText(/penicillin allergy/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }))

    expect(screen.queryByText('Maria Ramirez')).toBeNull()
    expect(screen.getByRole('link', { name: 'Maria R.' })).toBeInTheDocument()
    expect(screen.queryByText(/penicillin/)).toBeNull()
    expect(screen.queryByText(/\$350/)).toBeNull()
    expect(screen.getByText('Heads-up on their intake form')).toBeInTheDocument()
    expect(screen.getByText('A balance worth settling at the visit')).toBeInTheDocument()
    expect(screen.queryByText(/Riley Fox/)).toBeNull()
    expect(screen.getByText('1 first visit seated — a new patient in the practice.')).toBeInTheDocument()

    expect(window.localStorage.getItem('dc:huddle:hide-details')).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Show details' }))
    expect(screen.getByText('Maria Ramirez')).toBeInTheDocument()
    expect(window.localStorage.getItem('dc:huddle:hide-details')).toBeNull()
  })

  it('comes back hidden on a device that chose it', () => {
    window.localStorage.setItem('dc:huddle:hide-details', '1')
    renderBoard()
    expect(screen.getByRole('button', { name: 'Show details' })).toBeInTheDocument()
    expect(screen.queryByText('Maria Ramirez')).toBeNull()
  })
})

describe('Present', () => {
  it('opens a whole-screen dialog a room can read, with nothing to click but the two controls', () => {
    renderBoard()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Present' }))

    const dialog = screen.getByRole('dialog', { name: 'The Huddle, on the big screen' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // The app's ONE Modal primitive, at its whole-screen size — never a
    // second hand-rolled overlay (tests/ui/no-hand-rolled-modal.test.ts).
    expect(dialog).toHaveAttribute('data-modal')
    expect(dialog.className).toContain('h-[100dvh]')
    expect(dialog.querySelector('[data-modal-handle]')).toBeNull()
    expect(within(dialog).getByText('Wednesday, November 25 · as of 7:42 AM')).toBeInTheDocument()
    // Names are text on the wall, not links; the doors stay on the page.
    expect(within(dialog).getByText('Maria Ramirez').tagName).toBe('SPAN')
    expect(within(dialog).queryAllByRole('link')).toEqual([])
    expect(within(dialog).queryByText('Mark what happened')).toBeNull()
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['Hide details', 'Done'])
    // The page behind does not scroll under it.
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('Escape leaves it, and Hide details works from the wall too', () => {
    renderBoard()
    fireEvent.click(screen.getByRole('button', { name: 'Present' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hide details' }))
    expect(within(dialog).getByText('Maria R.')).toBeInTheDocument()
    expect(within(dialog).queryByText(/penicillin/)).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
