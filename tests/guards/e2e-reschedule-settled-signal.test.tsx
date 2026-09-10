import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, configure } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A PENDING ACTION MUST NOT SATISFY A "THE ACTION FINISHED" ASSERTION.
 *
 * `e2e/portal-reschedule.spec.ts` moves a visit, waits for the move to settle,
 * reloads, and then asserts the durable truth (the seeded appointment id is
 * gone from the page). The wait in the middle is load-bearing: without it the
 * reload races the server action, and a reload that wins re-renders the page
 * out of a database where the move has not landed — a green journey reported
 * red, at the assertion FURTHEST from the cause.
 *
 * That is exactly what DREAMCRM-21 was. The wait had been "the 'Move my visit'
 * button is gone", which looks like a settled signal and is not: the pill
 * relabels to "Moving…" the moment the transition starts, so its accessible
 * name disappears on the CLICK, while the request is still in the air. Three
 * full-suite runs failed on a loaded box; three isolated runs passed; each
 * failing run burned ~10s re-polling a post-reload DOM that could never
 * change. CI's `retries: 1` absorbed it, which is how it survived.
 *
 * This guard runs in the normal vitest suite — no database, no browser —
 * because the E2E job is the wrong place to learn that an E2E assertion is
 * vacuous. It pins BOTH halves:
 *
 *   1. the component behaviour the spec's wait depends on — the pill's name
 *      goes away mid-flight (so it can never be the signal again) while the
 *      reschedule panel stays until the action RETURNS, and closes only on
 *      success;
 *   2. that the spec has not drifted back to waiting on the pill's name.
 *
 * If someone later closes the panel optimistically, half 1 goes red here
 * rather than intermittently on a loaded CI box.
 */

// This card drives a React transition around an async server action; the
// library's 1s default for findBy*/waitFor is tight enough that a full-suite
// run under parallel load can time out on a phase change that is working
// fine. Same reasoning as tests/patient-portal/survey-card.test.tsx.
configure({ asyncUtilTimeout: 5_000 })

const rescheduleMock = vi.fn()
const slotsMock = vi.fn()

vi.mock('@/app/(portal)/patient/actions', () => ({
  confirmMyVisitAction: vi.fn(async () => ({ ok: true })),
  joinMyWaitlistAction: vi.fn(async () => ({ ok: true })),
  cancelMyVisitAction: vi.fn(async () => ({ ok: true })),
  rescheduleMyVisitAction: (id: string, iso: string) => rescheduleMock(id, iso),
  getPortalSlotsAction: (dateKey: string) => slotsMock(dateKey),
}))

import VisitCard from '@/components/patient-portal/visit-card'

const HOUR = 3_600_000
/** The open slot the picker offers — comfortably outside the 24h window. */
const SLOT_ISO = new Date(Date.now() + 72 * HOUR).toISOString()

/** A promise this test decides when (and how) to settle. */
function deferred<T>() {
  let settle!: (value: T) => void
  const promise = new Promise<T>((res) => {
    settle = res
  })
  return { promise, settle }
}

function renderCard() {
  return render(
    <VisitCard
      visit={{
        id: 'appt_e2e_move',
        type: 'consultation',
        typeLabel: 'Consultation',
        status: 'scheduled',
        startIso: new Date(Date.now() + 21 * 24 * HOUR).toISOString(),
        providerName: null,
        providerPhotoUrl: null,
        patientFirstName: 'Morgan',
        isDependent: false,
      }}
      brand="#2F6D62"
      timeZone="America/New_York"
      clinicPhone={null}
      mapsQuery={null}
      canModify
      canJoinWaitlist={false}
      minNoticeHours={24}
      showFace={false}
    />,
  )
}

/** Walk the journey the E2E spec walks, up to and including the submit. */
async function submitTheMove() {
  renderCard()
  fireEvent.click(screen.getByRole('button', { name: 'Reschedule' }))
  fireEvent.click(await screen.findByRole('button', { name: '9:00 AM — available' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Move my visit' }))
  await waitFor(() => expect(rescheduleMock).toHaveBeenCalledWith('appt_e2e_move', SLOT_ISO))
}

beforeEach(() => {
  rescheduleMock.mockReset()
  slotsMock.mockReset()
  slotsMock.mockResolvedValue({
    slots: [{ startIso: SLOT_ISO, label: '9:00 AM', available: true }],
    closedReason: null,
  })
})

describe('the reschedule journey has a settled signal that a pending action cannot fake', () => {
  it('mid-flight: the pill has already lost its name, and the panel has not', async () => {
    const move = deferred<{ ok: boolean; error?: string }>()
    rescheduleMock.mockReturnValueOnce(move.promise)
    await submitTheMove()

    // The pill under its PENDING name — the whole point. The E2E spec used to
    // wait for 'Move my visit' to reach count 0, and here it already has,
    // with the server action still unresolved.
    expect(await screen.findByRole('button', { name: 'Moving…' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move my visit' })).toBeNull()

    // The signal the spec waits on instead, correctly saying "not yet".
    expect(screen.getByText(/Pick a new time/)).toBeInTheDocument()

    move.settle({ ok: true })
    await waitFor(() => expect(screen.queryByText(/Pick a new time/)).toBeNull())
  })

  it('a refused move keeps the panel open and says why', async () => {
    const move = deferred<{ ok: boolean; error?: string }>()
    rescheduleMock.mockReturnValueOnce(move.promise)
    await submitTheMove()

    move.settle({ ok: false, error: 'That time was just taken — pick another one.' })

    // The reason reaches an assertive live region, which is what lets the E2E
    // poll report the server's own words instead of a bare 30s timeout.
    expect(await screen.findByRole('alert')).toHaveTextContent('That time was just taken')
    expect(screen.getByText(/Pick a new time/)).toBeInTheDocument()
    // And the pill comes back under its idle name — so "the pill is gone"
    // would not even stay true through a failure.
    //
    // findBy, not getBy: the error message and the cleared `pending` flag are
    // two different commits (run() calls setMessage INSIDE the transition), so
    // the alert can be on screen while the pill still reads "Moving…". A
    // synchronous read here passed locally and lost the race once on CI — the
    // same "what does this do while the request is in flight?" mistake this
    // whole guard exists to pin, one level down.
    expect(await screen.findByRole('button', { name: 'Move my visit' })).toBeInTheDocument()
  })

  it('a successful move closes the panel, and only then', async () => {
    const move = deferred<{ ok: boolean; error?: string }>()
    rescheduleMock.mockReturnValueOnce(move.promise)
    await submitTheMove()

    expect(screen.getByText(/Pick a new time/)).toBeInTheDocument()
    move.settle({ ok: true })

    await waitFor(() => expect(screen.queryByText(/Pick a new time/)).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('the E2E spec still waits on the settled signal', () => {
  const spec = readFileSync(
    resolve(process.cwd(), 'e2e/portal-reschedule.spec.ts'),
    'utf8',
  ).replace(/\s+/g, '')

  it('does not gate the reload on the pill going away', () => {
    // Whitespace-stripped so a reformat cannot smuggle the old wait back in.
    expect(
      spec.includes("name:'Movemyvisit'}))" + '.toHaveCount(0'),
      'the reschedule spec is waiting on the "Move my visit" name again — it is ' +
        'satisfied the moment the pill relabels to "Moving…", so the reload ' +
        'below it races the server action (DREAMCRM-21). Wait for the panel ' +
        'to close instead.',
    ).toBe(false)
  })

  it('still reloads before asserting the durable truth', () => {
    // The two halves are a pair: the wait is only worth having because a
    // reload follows it, and the reload is only trustworthy because the wait
    // does. If the reload goes, re-read the reasoning above before trusting
    // this guard.
    expect(spec.includes('awaitpage.reload()'), 'the durable half lost its reload').toBe(true)
  })
})
