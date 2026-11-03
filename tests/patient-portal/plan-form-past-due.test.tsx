import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planPastDueNotice, isPlanParked } from '@/lib/payment-plan-copy'

/**
 * The past_due payment plan, as the PATIENT reads it. The /i/[token] landing
 * and the portal Billing page share one sentence (`planPastDueNotice`): "we'll
 * try again on <day>" ONLY while a retry is on the calendar, "we've paused
 * the plan" once it is parked — never "we'll retry" with nothing scheduled.
 * Both carry the "Update my card" door; the landing's button goes through
 * `runAction` (a redeploy under the tab offers Refresh, never a dead button).
 */

const { startMock, runActionMock } = vi.hoisted(() => ({
  startMock: vi.fn(),
  runActionMock: vi.fn(),
}))
vi.mock('@/app/i/[token]/actions', () => ({ startPlanSetupAction: (t: string) => startMock(t) }))
vi.mock('@/lib/run-action', () => ({
  runAction: runActionMock,
  isStaleFailure: (r: { ok: boolean; stale?: true }) => !r.ok && r.stale === true,
}))

import PlanForm from '@/app/i/[token]/plan-form'

const BASE = {
  token: 'pl_x',
  brand: '#2F6D62',
  clinicName: 'Acme Dental',
  clinicPhone: '(555) 000-1111',
  patientFirstName: 'Marcus',
  totalCents: 60_000,
  installments: 6,
  installmentCents: 10_000,
  lastInstallmentCents: 10_000,
  installmentsPaid: 2,
  nextChargeAtIso: null as string | null,
  canPay: true,
  justAccepted: false,
}

const location = { assign: vi.fn(), reload: vi.fn() }

beforeEach(() => {
  startMock.mockReset()
  runActionMock.mockReset()
  // The real wrapper's shape: run the action, hand back its result.
  runActionMock.mockImplementation((fn: () => Promise<unknown>) => fn())
  location.assign.mockReset()
  location.reload.mockReset()
  Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true })
})

describe('planPastDueNotice (the one sentence both surfaces share)', () => {
  it('names the retry day only when one is scheduled', () => {
    const retrying = planPastDueNotice('Sat, Jul 5')
    expect(retrying).toMatch(/we’ll try again on Sat, Jul 5/)
    expect(retrying).toMatch(/Update your card/i)
    expect(retrying).not.toMatch(/paused/)
  })

  it('a parked plan says it is paused and never promises a retry', () => {
    const parked = planPastDueNotice(null)
    expect(parked).toMatch(/We’ve paused the plan — update your card to pick it back up/)
    expect(parked).not.toMatch(/retry|try again/)
  })

  it('isPlanParked: past_due with nothing scheduled', () => {
    expect(isPlanParked('past_due', null)).toBe(true)
    expect(isPlanParked('past_due', new Date())).toBe(false)
    expect(isPlanParked('active', null)).toBe(false)
  })
})

describe('PlanForm past_due', () => {
  it('retrying: names the day, offers "Update my card" through runAction', async () => {
    startMock.mockResolvedValue({ ok: true, url: 'https://stripe.test/setup' })
    render(<PlanForm {...BASE} state="past_due" nextChargeAtIso="2026-07-05T15:00:00Z" />)
    expect(screen.getByText(/we’ll try again on July 5/)).toBeTruthy()
    expect(screen.queryByText(/paused/)).toBeNull()

    const btn = screen.getByRole('button', { name: 'Update my card' })
    fireEvent.click(btn)
    await waitFor(() => expect(location.assign).toHaveBeenCalledWith('https://stripe.test/setup'))
    expect(runActionMock).toHaveBeenCalledTimes(1)
    expect(startMock).toHaveBeenCalledWith('pl_x')
    // Still busy while the browser leaves — never a second tap.
    expect((btn as HTMLButtonElement).disabled).toBe(true)
  })

  it('parked: says the plan is paused, no retry promised, same door', () => {
    render(<PlanForm {...BASE} state="past_due" nextChargeAtIso={null} />)
    expect(screen.getByText(/We’ve paused the plan — update your card to pick it back up/)).toBeTruthy()
    expect(screen.queryByText(/retry|try again/)).toBeNull()
    expect(screen.queryByText(/next one/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Update my card' })).toBeTruthy()
  })

  it('no Connect → no button, the phone instead', () => {
    render(<PlanForm {...BASE} state="past_due" canPay={false} />)
    expect(screen.queryByRole('button', { name: 'Update my card' })).toBeNull()
    expect(screen.getByText(/call Acme Dental at \(555\) 000-1111/)).toBeTruthy()
  })

  it('a refused action shows its error and frees the button', async () => {
    startMock.mockResolvedValue({ ok: false, error: 'Too many attempts — please wait a minute and try again.' })
    render(<PlanForm {...BASE} state="past_due" />)
    fireEvent.click(screen.getByRole('button', { name: 'Update my card' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Too many attempts/))
    expect((screen.getByRole('button', { name: 'Update my card' }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull()
  })

  it('a redeploy under the tab offers Refresh, never a dead button', async () => {
    runActionMock.mockResolvedValue({ ok: false, error: 'This page is out of date.', stale: true })
    render(<PlanForm {...BASE} state="past_due" />)
    fireEvent.click(screen.getByRole('button', { name: 'Update my card' }))
    const refresh = await screen.findByRole('button', { name: 'Refresh' })
    fireEvent.click(refresh)
    expect(location.reload).toHaveBeenCalledTimes(1)
    expect(location.assign).not.toHaveBeenCalled()
  })

  it('the card-update return trip lands on a thank-you', () => {
    render(<PlanForm {...BASE} state="active" nextChargeAtIso="2026-08-05T15:00:00Z" justResumed />)
    expect(screen.getByText(/Thanks, Marcus — your card is updated/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Update my card' })).toBeNull()
  })

  it('the proposed path still accepts through runAction', async () => {
    startMock.mockResolvedValue({ ok: true, url: 'https://stripe.test/setup' })
    render(<PlanForm {...BASE} state="proposed" />)
    fireEvent.click(screen.getByRole('button', { name: /Accept — first \$100\.00 today/ }))
    await waitFor(() => expect(location.assign).toHaveBeenCalledWith('https://stripe.test/setup'))
    expect(runActionMock).toHaveBeenCalledTimes(1)
  })
})

describe('no surface says "we’ll retry" with nothing scheduled', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

  it('the landing and the portal Billing page render the shared sentence', () => {
    for (const file of ['app/i/[token]/plan-form.tsx', 'app/(portal)/patient/invoices/page.tsx']) {
      const src = read(file)
      expect(src, file).toMatch(/planPastDueNotice\(/)
      expect(src, file).not.toMatch(/we’ll retry|we'll retry|retry automatically/)
    }
  })

  it('the portal Billing page carries the "Update my card" door to the plan page', () => {
    const src = read('app/(portal)/patient/invoices/page.tsx')
    expect(src).toMatch(/openPlan\.status === 'past_due' && \(\s*<a\s+href=\{`\/i\/\$\{openPlan\.token\}`\}/)
    expect(src).toMatch(/Update my card →/)
  })
})
