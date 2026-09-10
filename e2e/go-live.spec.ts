import { test, expect } from '@playwright/test'
import { restoresSeedScope } from './reseed'
import { expectNoA11yViolations } from './axe'
import { createHmac } from 'node:crypto'

/**
 * THE GO-LIVE LEVER, PULLED FOR REAL.
 *
 * `e2e/clinic-site.spec.ts` reads a published clinic and a pre-live clinic as
 * two static fixtures: it proves the GATE renders correctly on each side, and
 * nothing more. Nothing anywhere — unit suite included — has ever pulled the
 * lever inside a live request. That matters more than it sounds, because
 * `goLiveAction` does two things and only one of them is a database write:
 *
 *   1. it stamps `clinic_profile.site_live_at`, and
 *   2. it calls `invalidateClinicSiteEverywhere`, which reaches
 *      `revalidateTag(tag, { expire: 0 })`.
 *
 * Step 2 has only ever run under a mocked `next/cache`. In production it needs
 * a request scope, and `lib/services/clinic-site-cache.ts` deliberately swallows
 * exactly one error code (E263, "no request scope") and RE-THROWS every other —
 * a revalidate called during render, inside a `'use cache'`, inside an
 * `unstable_cache` callback. Any of those throws lands inside `goLiveAction`'s
 * own try/catch, which turns it into `{ ok: false }`: the clinic's site would
 * be live in the database while the hub told them "Could not take the site live
 * — try again". A mock cannot produce that failure; only a real request can.
 * This spec is the only place the pairing is executed the way a customer
 * executes it, and both directions of the lever are driven so the rollback path
 * gets the same request scope the publish path does.
 *
 * The clinic under test is its OWN seeded clinic (`e2e-golive`), not the shared
 * `e2e-prelive` one. That is not tidiness: `clinic-site.spec.ts` asserts
 * `e2e-prelive` serves coming-soon, spec files run in parallel workers, and a
 * lever pulled here would turn that spec red over there. See "Row ownership
 * matters" in docs/E2E.md.
 *
 * WHY EVERY HUB ASSERTION COMES AFTER A RELOAD. Clicking the lever used to
 * leave the Website hub's own button reading "Going live…" for up to about
 * SIXTY SECONDS before the page caught up — measured, twice, with no
 * `GET /website` going out at all in that window — even though the server
 * action itself finishes in ~100ms and the public site is live ~300ms after
 * that. Sometimes `router.refresh()` landed promptly instead. That defect was
 * reported from here and FIXED in batch 53 (DREAMCRM-26): the refresh was
 * nested inside the action's own `startTransition`, where the router's
 * transition could be starved, and the card now confirms "Your site is
 * online." the moment the action returns rather than waiting on any refresh
 * at all (`tests/website/go-live-feedback.test.tsx`).
 *
 * The reloads STAY. They were never a workaround for the stall — they are how
 * this spec asserts the lever's effect where it is unconditionally true, with
 * no dependence on client-side refresh timing of any kind. Keeping them means
 * this file cannot start passing for a reason it did not intend.
 *
 * So the lever's effect is asserted only where it is unconditionally true: on
 * the public site's next request, and on the hub after a fresh load. Nothing
 * here depends on which way the race goes, and nothing here changes if the
 * stall is fixed.
 */

const SITE = '/site/e2e-golive'
const CLINIC_NAME = 'E2E Golive Dental'
const SESSION_TOKEN = 'e2e-golive-session-token'
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

// This spec SPENDS its fixture — pulling the lever is the whole point, and the
// lever's card only exists while `site_live_at` is null. Restore before every
// attempt (DREAMCRM-19), or the second test in this file and every retry find a
// clinic that is already live and no button to press. 'go-live' is the scope
// THIS file owns — see scripts/e2e-seed.mjs.
restoresSeedScope('go-live')

function signedSessionCookie(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set — run through scripts/e2e-harness.sh')
  const sig = createHmac('sha256', secret).update(SESSION_TOKEN).digest('base64')
  return encodeURIComponent(`${SESSION_TOKEN}.${sig}`)
}

/**
 * What a member of the public gets, right now.
 *
 * A SEPARATE browser context every time, and that is load-bearing rather than
 * hygiene: an owner signed into the clinic bypasses the coming-soon gate on
 * purpose (`shouldShowComingSoon`'s `canEdit` exemption — it is how they inspect
 * the site before publishing it). Asserting the flip from the owner's own page
 * would therefore pass before the lever was ever pulled.
 *
 * One `goto` per call, with no reload loop and no waiting: "the site appears
 * immediately" means the NEXT request, and a retry loop here would quietly turn
 * the 60-second cache TTL into a pass.
 */
async function whatTheWorldSees(browser: import('@playwright/test').Browser, path = SITE) {
  const context = await browser.newContext({ baseURL: BASE })
  try {
    const page = await context.newPage()
    const res = await page.goto(path)
    return { status: res?.status(), body: await page.locator('body').innerText() }
  } finally {
    await context.close()
  }
}

const goLiveCard = (page: import('@playwright/test').Page) =>
  page.locator('section', { hasText: 'Your site is ready when you are' })

/**
 * Click the lever's confirm button and wait for the server action itself to
 * come back.
 *
 * The barrier is the action's own POST rather than anything on screen, because
 * the hub does not update for a minute (see the file header) — without it the
 * public-site read below would race the database write and fail for a reason
 * that has nothing to do with the lever. A 200 here does NOT mean the action
 * succeeded: a Next server action returns 200 carrying `{ ok: false }` too.
 * What it means is "the request is finished, now it is safe to ask".
 */
async function pullAndWait(page: import('@playwright/test').Page, confirmLabel: string) {
  const actionDone = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/website',
  )
  await page.getByRole('button', { name: confirmLabel }).click()
  const res = await actionDone
  expect(res.status(), 'the go-live server action must not error out').toBe(200)
}

test.describe('the go-live lever', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'better-auth.session_token', value: signedSessionCookie(), url: BASE },
    ])
  })

  test('pulling it puts the site online for the very next visitor', async ({ page, browser }) => {
    // Before: the public sees the coming-soon page, and /book is behind the
    // lever with it — "booking included" is the lever's whole promise.
    expect((await whatTheWorldSees(browser)).body).toMatch(/coming soon/i)
    expect((await whatTheWorldSees(browser, `${SITE}/book`)).body).toMatch(/coming soon/i)

    await page.goto('/website')
    const card = goLiveCard(page)
    await expect(card).toBeVisible({ timeout: 30_000 })

    // The website hub before the lever is pulled: a checklist, a progress
    // ring and a scaled preview frame, all built from the clinic's own data.
    await expectNoA11yViolations(page, 'staff: website hub, site not yet published')

    await card.getByRole('button', { name: 'Go live' }).click()
    // Two-step on purpose — both directions of this lever are deliberate acts.
    await pullAndWait(page, 'Yes — put my site online')

    // After: one request, from a browser that has never seen this site.
    const after = await whatTheWorldSees(browser)
    expect(after.status).toBe(200)
    expect(after.body).toContain(CLINIC_NAME)
    expect(after.body, 'the site must not still be behind the lever').not.toMatch(/coming soon/i)

    // Booking came online with it — the page the lever exists to protect.
    const booking = await whatTheWorldSees(browser, `${SITE}/book`)
    expect(booking.status).toBe(200)
    expect(booking.body).not.toMatch(/coming soon/i)

    // THE FAILURE THIS SPEC EXISTS FOR: the write lands, the tag revalidation
    // throws, `goLiveAction` catches it, and the clinic is told their site did
    // not go live while it quietly did.
    //
    // Asserted against the whole page, not against the card: by now the card
    // may already be gone (the hub sometimes catches up on its own, sometimes
    // not — see the header), and a negated text assertion on a locator that
    // matches nothing FAILS rather than passes. The body is there either way.
    await expect(page.locator('body')).not.toContainText('Could not take the site live')

    // And the durable half: on a fresh load the hub agrees the site is live —
    // the lever card is gone and the reverse gear is offered in its place.
    await page.reload()
    await expect(page.getByRole('button', { name: 'Take site offline' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(goLiveCard(page)).toHaveCount(0)

    // The same hub in its other state — a different card, a different lever.
    await expectNoA11yViolations(page, 'staff: website hub, site published')
  })

  test('and the reverse gear takes it back down', async ({ page, browser }) => {
    // A lever that cannot be un-pulled is a trap: "we found a problem, hide the
    // site while we fix it" is a legitimate ask, and it runs the same
    // invalidation through the same request scope in the opposite direction.
    await page.goto('/website')
    await expect(goLiveCard(page)).toBeVisible({ timeout: 30_000 })
    await goLiveCard(page).getByRole('button', { name: 'Go live' }).click()
    await pullAndWait(page, 'Yes — put my site online')
    expect((await whatTheWorldSees(browser)).body).toContain(CLINIC_NAME)

    await page.reload()
    await page.getByRole('button', { name: 'Take site offline' }).click()
    await pullAndWait(page, 'Take it offline')

    // Back behind the curtain for the public, on the next request.
    const after = await whatTheWorldSees(browser)
    expect(after.body).toMatch(/coming soon/i)

    // And the hub offers the lever again, so the clinic can re-publish.
    await page.reload()
    await expect(goLiveCard(page)).toBeVisible({ timeout: 30_000 })
  })
})
