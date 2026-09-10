import { test, expect } from '@playwright/test'
import { restoresSeedScope } from './reseed'
import { createHmac } from 'node:crypto'

/**
 * Portal reschedule + cancel — the self-serve visit changes docs/E2E.md names
 * next, with the notice window exercised from both sides.
 *
 * The card only offers Reschedule/Cancel OUTSIDE the clinic's notice window
 * (24h by default); INSIDE it both pills give way to a "Need to change it?"
 * fallback — so the journey here is: change freely three weeks out, and see
 * the door honestly closed 20 hours out.
 *
 * Signs in as Morgan Moveable (own session row + own visits, seeded in
 * scripts/e2e-seed.mjs) so nothing here can shadow e2e/portal.spec.ts, which
 * owns Casey's rows in a parallel worker. Cards carry no title — the visit
 * TYPE label (Consultation / Filling / Extraction) is how each is addressed.
 */

const SESSION_TOKEN = 'e2e-move-session-token'
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

function signedSessionCookie(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set — run through scripts/e2e-harness.sh')
  const sig = createHmac('sha256', secret).update(SESSION_TOKEN).digest('base64')
  return encodeURIComponent(`${SESSION_TOKEN}.${sig}`)
}

// This spec CONSUMES its seeded rows, so restore them before every attempt
// (DREAMCRM-19). Without this a Playwright retry starts with the fixture
// already spent and dies on its first assertion, burying the real failure.
// 'portal-reschedule' is the scope THIS file owns — see scripts/e2e-seed.mjs.
restoresSeedScope('portal-reschedule')

test.describe('portal reschedule and cancel', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'better-auth.session_token', value: signedSessionCookie(), url: BASE },
    ])
  })

  /** The VisitCard root — same scoping the portal spec uses (filtering generic
   *  divs picks an inner wrapper that excludes the action row, so .first()). */
  function card(page: import('@playwright/test').Page, label: string | RegExp) {
    return page.locator('div.rounded-2xl').filter({ hasText: label }).first()
  }

  test('inside the notice window the card offers a call, not a change', async ({ page }) => {
    await page.goto('/patient/appointments')
    const soon = card(page, 'Extraction')
    await expect(soon).toBeVisible({ timeout: 30_000 })
    // 20 hours out < the 24h default window: no self-serve pills, the
    // fallback instead (the seeded clinic has no phone, so "Message us").
    await expect(soon.getByText(/Need to change it\?/)).toBeVisible()
    await expect(soon.getByRole('button', { name: 'Reschedule' })).toHaveCount(0)
    await expect(soon.getByRole('button', { name: 'Cancel' })).toHaveCount(0)
  })

  test('a patient moves a visit to a new open time', async ({ page }) => {
    await page.goto('/patient/appointments')
    const visit = card(page, 'Consultation')
    await expect(visit).toBeVisible({ timeout: 30_000 })

    await visit.getByRole('button', { name: 'Reschedule' }).click()
    await expect(visit.getByText(/Pick a new time/)).toBeVisible()

    // The new time must itself clear the 24h notice window, and weekends are
    // closed — walk the panel's day strip from two days out until a day shows
    // an open slot (at most Sat+Sun stand between us and one).
    const slot = visit.getByRole('button', { name: /— available/ }).first()
    const days = visit.getByRole('button', { name: /^(Today, )?[A-Z][a-z]{2} \d+$/ })
    for (let i = 2; i <= 8 && !(await slot.count()); i++) {
      await days.nth(i).click()
      await expect(days.nth(i)).toHaveAttribute('aria-pressed', 'true')
      await expect(
        slot.or(visit.getByText(/closed this day|done seeing patients|taken this day|need a quick call/i)).first(),
      ).toBeVisible({ timeout: 20_000 })
    }
    await expect(slot, 'some weekday in the window should have an opening').toBeVisible()
    // Remember the time the patient actually picked ("9:00 AM"), so the
    // durable assertion below can prove THAT time is what got booked rather
    // than just that some Consultation still exists.
    const pickedTime = ((await slot.getAttribute('aria-label')) ?? '').replace(/\s*—\s*available$/, '').trim()
    expect(pickedTime, 'the slot button should name its time').not.toBe('')
    await slot.click()

    await visit.getByRole('button', { name: 'Move my visit' }).click()

    // NOT asserted here: the "All moved — …" notice. It renders as the last
    // child of the card for the OLD visit, and a reschedule RETIRES that
    // visit — so the action's own revalidate unmounts the very element
    // carrying the message. Whether the browser paints it before that payload
    // lands is a pure race with CI load on one side, and on 2026-09-10 it lost
    // twice in a row: the attempt AND the retry both timed out here while the
    // move had in fact SUCCEEDED both times. The failure snapshots show
    // appt_e2e_move gone and a freshly-minted Consultation sitting at the
    // picked slot — a green journey reported red. Same trap as the cancel spec
    // below; see docs/E2E.md.
    //
    // The settled signal that does NOT race: run() closes the panel only on
    // success, so "Move my visit" detaches either way — with the panel or with
    // the whole card. On a failed action the panel stays open and this times
    // out, which is what we want.
    await expect(visit.getByRole('button', { name: 'Move my visit' })).toHaveCount(0, { timeout: 30_000 })

    // Durable, and the part that actually proves the journey: the seeded visit
    // is retired, and in its place sits a Consultation at the chosen time that
    // needs confirming again. (Asserting only "a Consultation needs
    // confirming" would have passed even if the move had silently done
    // nothing — the seeded row is unconfirmed too.)
    await page.reload()
    const moved = card(page, 'Consultation')
    await expect(moved).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('a[href*="appt_e2e_move"]')).toHaveCount(0)
    await expect(moved).toContainText(pickedTime)
    await expect(moved.getByText('Needs confirming')).toBeVisible()
  })

  test('a patient cancels a visit, no judgment', async ({ page }) => {
    await page.goto('/patient/appointments')
    const visit = card(page, 'Filling')
    await expect(visit).toBeVisible({ timeout: 30_000 })

    await visit.getByRole('button', { name: 'Cancel' }).click()
    await expect(visit.getByText(/no judgment. Want us to cancel this visit\?/)).toBeVisible()
    await visit.getByRole('button', { name: 'Yes, cancel it' }).click()

    // Two outcomes race here and BOTH are correct:
    //   • the action's revalidate re-renders the list without the cancelled
    //     visit and the card vanishes, or
    //   • the card stays put with its in-place confirmation — visit-card's
    //     run() sets the success message and deliberately does NOT call
    //     router.refresh(), so the patient gets to read it.
    // Which one lands first is a coin toss on CI load. An earlier revision of
    // this spec asserted the notice and lost to the re-render; switching to
    // assert the disappearance just loses the race the other way, which is
    // what turned the e2e gate red on 2026-09-09 (the failure screenshot shows
    // the card present, every button disabled, "Cancelled. Whenever you're
    // ready, we'll be here." underneath — a cancel that fully succeeded).
    // So accept either, then let the reload assert the part that is
    // unconditionally true.
    //
    // Debugging a future failure here: this test CONSUMES its seeded row. It
    // used to be that the harness seeded once per RUN, so a retry started with
    // the Filling visit already cancelled, died on the first assertion, and
    // buried the real error under an artifact of the retry — the advice was to
    // read attempt #1 and ignore the second. That is fixed (DREAMCRM-19): the
    // restoresSeedScope('portal-reschedule') at the top of this file puts the
    // row back before every attempt, so BOTH attempts are now real data points
    // and a retry failing the same way means the failure is real.
    const fillingCards = page.locator('div.rounded-2xl').filter({ hasText: 'Filling' })
    await expect
      .poll(
        async () => {
          if ((await fillingCards.count()) === 0) return 'gone'
          return (await page.getByText(/Cancelled\. Whenever/).count()) > 0 ? 'confirmed' : 'pending'
        },
        {
          timeout: 30_000,
          message: 'cancelling should either clear the card or confirm in place',
        },
      )
      .not.toBe('pending')

    // Durable, whichever way it landed: gone from "Coming up" on a fresh load.
    await page.reload()
    await expect(page.getByText('Coming up').first()).toBeVisible({ timeout: 30_000 })
    await expect(fillingCards).toHaveCount(0)
  })
})
