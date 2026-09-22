import { test, expect } from '@playwright/test'
import { restoresSeedScope } from './reseed'
import { expectNoA11yViolations } from './axe'

/**
 * THE PAGES SOMEBODY OPENS FROM A TEXT MESSAGE (DREAMCRM-98).
 *
 * Ten routes in this app are a single letter. Two of them — `/c` one-click
 * confirm and `/n` the post-visit survey — have been walked since the first
 * batch of stops (`e2e/token-journeys.spec.ts`). The other eight had never
 * been scanned at all:
 *
 *   /b  pay your balance          /g  your practice's online grade
 *   /i  your payment plan         /d  book a demo
 *   /r  leave a review            /e  the conference floor's capture page
 *   /w  an earlier opening        /h  the attendee's headshot
 *
 * WHY THIS POPULATION IS WORTH ITS OWN FILE. Every page here is opened from a
 * text or an email, on a phone, by somebody with no account and no session —
 * and usually once, about one thing, with no way to go anywhere else if it
 * does not work. There is no chrome to fall back on, no sidebar to navigate
 * by, no support surface in reach. Two of them take money. That makes them
 * the population where a machine-checkable accessibility defect costs the most
 * and is seen by us the least: nobody on the team ever opens these pages
 * except on purpose, and the person who does open them cannot tell us.
 *
 * WHAT THIS FILE IS AND IS NOT. It is the axe instrument the punch list asked
 * for — more STOPS, not another source rule — plus the one assertion per page
 * that proves the state under test is really on screen before the scan runs.
 * It is not a functional test of these journeys: it deliberately never claims
 * a slot, accepts a plan, starts a checkout or books a demo. Each of those is
 * a real write on a real money or scheduling path, and a scan does not need
 * one. The only write any of these pages performs on a GET is
 * `recordReviewClick`, and the `token-pages` scope restores it.
 *
 * The state each stop is taken in is chosen, not incidental — see the comment
 * above each one. An empty page and a working one are different pages as far
 * as a screen reader is concerned, and scanning the empty one would be a stop
 * over markup no patient ever sees.
 */

// The scope THIS file owns — see scripts/e2e-seed.mjs. Restored before every
// attempt (DREAMCRM-19).
restoresSeedScope('token-pages')

/**
 * The fixture tokens, spelled here to match `scripts/e2e-seed.mjs`.
 *
 * The three hex ones are not a style choice. `/g`, `/e` and `/h` validate the
 * token against `/^[a-f0-9]{32}$/` BEFORE they touch the database, so a
 * readable `e2e-…-token` there 404s without ever looking anything up — and a
 * 404 is exactly what this spec would report if the row were missing, so the
 * two failures would be indistinguishable. The seed builds them from a
 * hex-only mnemonic prefix zero-padded to 32; these are the results.
 */
const PAY_TOKEN = 'e2e-pay-balance-token'
const PLAN_TOKEN = 'e2e-payment-plan-token'
const REVIEW_TOKEN = 'e2e-review-token'
const FASTPASS_TOKEN = 'e2e-fastpass-token'
const DEMO_TOKEN = 'e2e-demo-booking-token'
const GRADE_TOKEN = 'e2e60ade000000000000000000000000'
const EVENT_TOKEN = 'e2ecafe0000000000000000000000000'
const CAPTURE_TOKEN = 'e2eface0000000000000000000000000'

test.describe('the clinic-branded landings a patient opens from a text', () => {
  /**
   * /b in the state that takes money — a live balance, a clinic that can
   * charge for it. The seed gives this clinic an active connected account for
   * exactly that reason: without one the page renders a one-paragraph "call
   * us" apology, and the controls worth scanning (the quick-amount chips,
   * which are `aria-pressed` toggles inside a named `role=group`, and the
   * bare number input that carries its own `aria-label`) never render at all.
   */
  test('/b — pay your balance', async ({ page }) => {
    await page.goto(`/b/${PAY_TOKEN}`)
    await expect(page.getByRole('button', { name: 'Pay securely' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('group', { name: 'Quick amounts' })).toBeVisible()

    await expectNoA11yViolations(page, 'token: pay your balance, an amount owing')
  })

  /**
   * /i while the plan is still 'proposed' — the one state with terms and an
   * Accept button. Every later state ('active', 'completed', …) is a status
   * page the same link turns into for the rest of the plan's life, so the
   * proposed state is both the richest and the only one a patient is ever
   * asked to act on.
   */
  test('/i — your payment plan, still waiting on a yes', async ({ page }) => {
    await page.goto(`/i/${PLAN_TOKEN}`)
    await expect(page.getByRole('button', { name: /^Accept —/ })).toBeVisible({ timeout: 30_000 })

    await expectNoA11yViolations(page, 'token: payment plan, proposed')
  })

  /**
   * /r with the star gate on. The gate is a custom five-button
   * `role=group` whose members are named at runtime ("3 out of 5 stars") —
   * precisely the shape `pnpm lint`'s static JSX rules have to take on trust,
   * and precisely why this stop is worth more than a source assertion.
   */
  test('/r — leave a review, the star gate', async ({ page }) => {
    await page.goto(`/r/${REVIEW_TOKEN}`)
    await expect(page.getByRole('group', { name: 'How was your visit?' })).toBeVisible({ timeout: 30_000 })

    await expectNoA11yViolations(page, 'token: leave a review, star gate')
  })

  /**
   * /w on a PENDING offer. The seed puts the freed slot in the future on every
   * restore because `getOfferByToken` reads a pending offer whose slot has
   * already started as expired — which would silently swap this stop's page
   * for the "sorry, it's gone" one and go on passing.
   */
  test('/w — an earlier opening, still claimable', async ({ page }) => {
    await page.goto(`/w/${FASTPASS_TOKEN}`)
    await expect(page.getByRole('button', { name: 'Claim this time' })).toBeVisible({ timeout: 30_000 })

    await expectNoA11yViolations(page, 'token: an earlier opening, claimable')
  })
})

test.describe('the platform landings a stranger opens', () => {
  /**
   * /g — the grade report. Not a patient page: this is a practice owner who
   * typed their details into the public grader and got a link back. The whole
   * body is one framework-free component with a hand-built score dial
   * (`<svg role=img>` with a runtime `aria-label`) and a star rating drawn the
   * same way.
   */
  test('/g — your practice’s online grade', async ({ page }) => {
    await page.goto(`/g/${GRADE_TOKEN}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('body')).toContainText('Cedar Hollow Family Dental')

    await expectNoA11yViolations(page, 'token: practice grade report')
  })

  /**
   * /d with booking ENABLED — the slot picker. The seed turns
   * `prospecting_config.booking.enabled` on for this reason alone: the feature
   * ships off, and off this page is a single sentence saying no times are
   * open. The picker is the control worth scanning, and it is the one a
   * prospect actually meets.
   */
  test('/d — book a demo, slots on offer', async ({ page }) => {
    await page.goto(`/d/${DEMO_TOKEN}`)
    await expect(page.getByRole('button', { name: 'Book my demo' })).toBeVisible({ timeout: 30_000 })

    await expectNoA11yViolations(page, 'token: book a demo, slots offered')
  })

  /**
   * /e — the conference floor's capture page. The EVENT's token is the auth
   * and the page lives on the owner's own phone, so it is the one page in this
   * file typed into rather than read: name, email, practice, a required
   * release tick and an optional opt-in.
   */
  test('/e — the conference floor’s capture page', async ({ page }) => {
    await page.goto(`/e/${EVENT_TOKEN}`)
    await expect(page.getByRole('heading', { name: 'Your free headshot' })).toBeVisible({ timeout: 30_000 })

    await expectNoA11yViolations(page, 'token: conference capture form')
  })

  /**
   * /h — the attendee's own page, with the photo attached AND a scan to show.
   * Both halves are seeded deliberately: with no photo the page is a
   * placeholder paragraph, and with no linked grade the scan card and its door
   * through to /g never render.
   */
  test('/h — the attendee’s headshot', async ({ page }) => {
    await page.goto(`/h/${CAPTURE_TOKEN}`)
    await expect(page.getByRole('link', { name: 'Download full size' })).toBeVisible({ timeout: 30_000 })

    await expectNoA11yViolations(page, 'token: attendee headshot and scan')
  })
})
