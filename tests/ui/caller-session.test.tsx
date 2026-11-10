import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

/**
 * THE CALLER'S OUTCOME KEYS (P-02 fix pass, C11 / C12).
 *
 *   - a bare digit logs an outcome; a MODIFIED combo (Ctrl/Cmd/Alt+digit —
 *     "switch to tab 4") never does, and neither does a digit typed into
 *     the note box;
 *   - after a deployment-skew failure every picker's commit button is
 *     disabled and only Refresh is offered — runAction's contract: never a
 *     retry of a dead action id.
 */
const actions = vi.hoisted(() => ({
  log: vi.fn(async (_input: unknown) => ({ ok: true as const, released: false })),
  book: vi.fn(async (_input: unknown) => ({ ok: true as const })),
  skip: vi.fn(async (_input: unknown) => ({ ok: true as const })),
  script: vi.fn(async (_id: string) => ({ ok: true as const, script: null })),
}))
vi.mock('@/app/(caller)/calls/actions', () => ({
  logCallerOutcomeAction: (i: unknown) => actions.log(i),
  bookDemoAsCallerAction: (i: unknown) => actions.book(i),
  skipProspectAction: (i: unknown) => actions.skip(i),
  getCallerScriptAction: (id: string) => actions.script(id),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))

import CallerSession from '@/app/(caller)/calls/caller-session'
import type { CallerQueueItem } from '@/lib/services/prospect-callers'

const ITEM: CallerQueueItem = {
  id: 'p1',
  name: 'Smile Dental',
  phone: '4045551212',
  city: 'Atlanta',
  state: 'GA',
  timezone: 'America/New_York',
  websiteUrl: null,
  googleRatingTenths: null,
  reviewCount: null,
  authorizedOfficialName: null,
  phoneStatus: null,
  phoneLineType: null,
  qualityScore: 80,
  qualityBand: 'best',
  talkingPoints: [],
  callWindow: { score: 3, good: true, label: 'good time to call' },
  callbackAt: null,
  followUpReason: null,
  attempts: [],
}

beforeEach(() => {
  cleanup()
  actions.log.mockClear()
  actions.book.mockClear()
  actions.skip.mockClear()
  actions.script.mockClear()
  actions.log.mockImplementation(async () => ({ ok: true as const, released: false }))
  actions.book.mockImplementation(async () => ({ ok: true as const }))
})

describe('the hot keys', () => {
  it('a bare "4" logs a voicemail', async () => {
    render(<CallerSession items={[ITEM]} hostTimeZone="America/New_York" />)
    fireEvent.keyDown(window, { key: '4' })
    await waitFor(() => expect(actions.log).toHaveBeenCalledTimes(1))
    expect(actions.log).toHaveBeenCalledWith(expect.objectContaining({ prospectId: 'p1', outcome: 'voicemail' }))
  })

  it('Ctrl / Cmd / Alt + digit is the browser’s, never an outcome', async () => {
    render(<CallerSession items={[ITEM]} hostTimeZone="America/New_York" />)
    fireEvent.keyDown(window, { key: '4', ctrlKey: true })
    fireEvent.keyDown(window, { key: '4', metaKey: true })
    fireEvent.keyDown(window, { key: '7', altKey: true })
    fireEvent.keyDown(window, { key: '9', ctrlKey: true })
    await new Promise((r) => setTimeout(r, 20))
    expect(actions.log).not.toHaveBeenCalled()
    // The card did not advance either.
    expect(screen.getByText('Smile Dental')).toBeTruthy()
  })

  it('a digit typed into the note box is text, not an outcome', async () => {
    render(<CallerSession items={[ITEM]} hostTimeZone="America/New_York" />)
    const note = screen.getByLabelText('Note')
    fireEvent.keyDown(note, { key: '4' })
    await new Promise((r) => setTimeout(r, 20))
    expect(actions.log).not.toHaveBeenCalled()
  })
})

describe('after a deployment-skew failure', () => {
  /** The shape lib/deployment-skew.ts classifies as a redeploy under the tab. */
  const skew = () => Object.assign(new Error('Failed to find Server Action "abc123". This request might be from an older or newer deployment.'), { name: 'UnrecognizedActionError' })

  it('the demo picker’s Book it is disabled and Refresh is offered — never a retry', async () => {
    actions.book.mockImplementation(async () => {
      throw skew()
    })
    render(<CallerSession items={[ITEM]} hostTimeZone="America/New_York" />)
    fireEvent.keyDown(window, { key: '1' }) // opens the demo picker
    fireEvent.change(screen.getByLabelText('Demo day'), { target: { value: '2099-01-05' } })
    fireEvent.change(screen.getByLabelText('Demo time'), { target: { value: '14:00' } })
    const bookIt = screen.getByText('Book it').closest('button')!
    expect(bookIt.disabled).toBe(false)
    fireEvent.click(bookIt)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByText('Refresh')).toBeTruthy()
    expect(bookIt.disabled).toBe(true)
    expect(actions.book).toHaveBeenCalledTimes(1)
    // A second click is dead: nothing re-sends the stale action id.
    fireEvent.click(bookIt)
    await new Promise((r) => setTimeout(r, 20))
    expect(actions.book).toHaveBeenCalledTimes(1)
    // And the hot keys are off too.
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: '4' })
    await new Promise((r) => setTimeout(r, 20))
    expect(actions.log).not.toHaveBeenCalled()
  })

  it('the pass, callback and skip pickers are disabled as well', async () => {
    actions.log.mockImplementation(async () => {
      throw skew()
    })
    render(<CallerSession items={[ITEM]} hostTimeZone="America/New_York" />)
    fireEvent.keyDown(window, { key: '4' }) // a voicemail → the skew throw
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    // Every outcome button in the dock is disabled now; the pickers cannot
    // even open from the keys — open them by their buttons and check.
    for (const label of ['Reached — not interested', 'Callback']) {
      const btn = screen.getByText(new RegExp(label)).closest('button')!
      expect(btn.disabled, label).toBe(true)
    }
    expect((screen.getByText('Skip →') as HTMLButtonElement).disabled).toBe(true)
  })
})
