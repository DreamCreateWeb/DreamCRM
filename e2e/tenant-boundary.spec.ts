import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'

/**
 * THE MULTI-TENANT BOUNDARY, IN A REAL BROWSER.
 *
 * DreamCRM is one application serving many dental practices, and the promise
 * underneath all of it is that a clinic sees its own patients and nobody
 * else's. `docs/RELEASE.md` and CLAUDE.md both call tenant scoping sacred;
 * ~6,900 unit tests check it one query at a time, by passing an organizationId
 * into a service and reading what comes back.
 *
 * What none of them can check is the whole request. A leak does not have to be
 * a missing `where` clause — it can be a page that resolves the tenant from a
 * URL segment instead of the session, a route handler that trusts a client-sent
 * org id, a cached response served to the next visitor, a redirect that lands
 * somewhere it shouldn't. Those are properties of a REQUEST, and a request is
 * exactly what happy-dom cannot make. This file is the browser's answer to
 * "prove it", and it is a security check in the same family as the signed-out
 * auth gate in `e2e/smoke.spec.ts`.
 *
 * Two seeded clinics, one signed-in owner each (scripts/e2e-seed.mjs, `base`):
 *
 *   E2E Dental (org_e2e_live)     — Dana Frontdesk, patient Sam Ourpatient
 *   E2E Prelive (org_e2e_prelive) — Avery Rivaldesk, patient Jamie Rivalclinic
 *
 * EVERY ASSERTION HERE IS PAIRED. A test that only proves the other clinic's
 * data is absent would also pass against a page that renders nothing, a search
 * that always returns empty, or an export that is broken — the three most
 * likely ways this spec could quietly stop testing anything. So each negative
 * is run beside the positive that proves the surface actually works: the list
 * shows Sam, the search finds Sam, the export contains Sam, the API answers for
 * Sam's visit. Then, and only then, does Jamie's absence mean something.
 *
 * The spec is READ-ONLY on purpose — every assertion is a not-found page, an
 * absence, or a control read — which is why its fixture lives in `base` and it
 * claims no seed scope. There is nothing for a retry to restore, and nothing
 * another worker's restore can take out from under it.
 *
 * ONE ASSERTION THIS FILE DELIBERATELY DOES NOT MAKE: that `/patients/[id]`
 * answers 404 for a record you may not see. It does not — it answers **200**
 * and renders the not-found page. That is not a scoping bug and it is not
 * specific to the cross-tenant case: `/patients/nope_zzz` behaves identically,
 * because `app/(default)/patients/loading.tsx` puts the route behind a Suspense
 * boundary, so the shell (and its status line) is flushed before
 * `notFound()` is ever reached. Written down here rather than left as a gap,
 * because a future reader will otherwise "fix" this spec by asserting the
 * status and get a red suite for a reason that has nothing to do with tenancy.
 * The ROUTE HANDLER below has no such boundary and its 404 is asserted for
 * real.
 */

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

/** The two clinics' seeded rows, named so an assertion reads like a sentence. */
const DENTAL = {
  sessionToken: 'e2e-staff-session-token', // Dana Frontdesk, owner of E2E Dental
  patientId: 'pat_e2e_ours',
  patientName: 'Ourpatient',
  patientEmail: 'sam.ourpatient@example.com',
  appointmentId: 'appt_e2e_ours',
}
const PRELIVE = {
  sessionToken: 'e2e-rival-session-token', // Avery Rivaldesk, owner of E2E Prelive
  patientId: 'pat_e2e_rival',
  patientName: 'Rivalclinic',
  patientEmail: 'jamie.rivalclinic@example.com',
  appointmentId: 'appt_e2e_rival',
}

/**
 * Mint the signed session cookie better-auth would have set, the same way
 * `e2e/staff-day.spec.ts` and the portal specs do — the fixture seeds the
 * session row, and the harness exports the secret that signs it.
 */
function signedSessionCookie(token: string): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set — run through scripts/e2e-harness.sh')
  const sig = createHmac('sha256', secret).update(token).digest('base64')
  return encodeURIComponent(`${token}.${sig}`)
}

function signIn(context: import('@playwright/test').BrowserContext, token: string) {
  return context.addCookies([
    { name: 'better-auth.session_token', value: signedSessionCookie(token), url: BASE },
  ])
}

/**
 * The patient's row link in the patients list, keyed by id.
 *
 * Returns ALL matches, not one: the list renders a patient twice at some
 * viewports (the responsive card and the table row are separate nodes with the
 * same href). Absence is therefore `toHaveCount(0)` — which is what this spec
 * mostly asks — and the presence checks take `.first()`.
 */
const patientLinks = (page: import('@playwright/test').Page, id: string) =>
  page.locator(`a[href="/patients/${id}"]`)

test.describe('one clinic cannot reach another clinic (signed in as E2E Dental)', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, DENTAL.sessionToken)
  })

  test('another clinic’s patient URL renders the not-found page, not the patient', async ({
    page,
  }) => {
    // The strongest shape of the leak: a real, existing patient id — just not
    // one of ours. A page that resolved the record from the URL rather than
    // from the session would render Jamie here and look entirely correct.
    await page.goto(`/patients/${PRELIVE.patientId}`)
    await expect(page.locator('body')).toContainText("We couldn't find that", { timeout: 30_000 })
    await expect(page.locator('body')).not.toContainText(PRELIVE.patientName)
    await expect(page.locator('body')).not.toContainText(PRELIVE.patientEmail)

    // The rendered DOM is only half of what a response carries. Read the raw
    // bytes too: a server component that fetched the record and then declined
    // to display it would still have serialised it into the RSC payload, and
    // that payload is sitting in the HTML the browser was handed.
    const raw = await page.request.get(`/patients/${PRELIVE.patientId}`)
    const html = await raw.text()
    expect(html, 'no trace of another clinic’s patient may reach the wire').not.toContain(
      PRELIVE.patientName,
    )
    expect(html).not.toContain(PRELIVE.patientEmail)

    // The control: the SAME route, our own patient, renders the record.
    // Without this the assertions above would also pass if /patients/[id] were
    // broken for everyone.
    const ours = await page.goto(`/patients/${DENTAL.patientId}`)
    expect(ours?.status()).toBe(200)
    await expect(page.locator('body')).toContainText(DENTAL.patientEmail, { timeout: 30_000 })
  })

  test('the patient list is this clinic’s list and no one else’s', async ({ page }) => {
    await page.goto('/patients')
    await expect(patientLinks(page, DENTAL.patientId).first()).toBeVisible({ timeout: 30_000 })
    await expect(patientLinks(page, PRELIVE.patientId)).toHaveCount(0)
    // Not just the link — the name must not appear anywhere on the page, which
    // also covers a leak into a count, a chart, or an autocomplete payload.
    await expect(page.locator('body')).not.toContainText(PRELIVE.patientName)
  })

  test('search cannot reach across the boundary', async ({ page }) => {
    // Search is where scoping leaks tend to hide: the filter is the thing the
    // developer is thinking about, and the org predicate is the thing they add
    // afterwards. Asserted on the row link rather than page text because the
    // query itself is echoed back into the search box.
    await page.goto(`/patients?q=${PRELIVE.patientName}`)
    await expect(patientLinks(page, PRELIVE.patientId)).toHaveCount(0)

    // The control: searching for a name in OUR clinic does find it, so the
    // empty result above is the boundary and not a broken search.
    await page.goto(`/patients?q=${DENTAL.patientName}`)
    await expect(patientLinks(page, DENTAL.patientId).first()).toBeVisible({ timeout: 30_000 })
  })

  test('the appointment API answers for our visit and 404s for theirs', async ({ page }) => {
    // A JSON route handler, not a page — a separate tenant-resolution path from
    // everything above, and the shape most likely to be called with an id that
    // came from somewhere other than our own UI.
    const ours = await page.request.get(`/api/appointments/${DENTAL.appointmentId}`)
    expect(ours.status()).toBe(200)
    expect(await ours.text()).toContain(DENTAL.patientName)

    const theirs = await page.request.get(`/api/appointments/${PRELIVE.appointmentId}`)
    expect(theirs.status(), 'a cross-tenant appointment id must not resolve').toBe(404)
    expect(await theirs.text()).not.toContain(PRELIVE.patientName)
  })

  test('the patient CSV export carries only this clinic’s patients', async ({ page }) => {
    // The bulk-egress surface: one request that hands a human a file of
    // contact details. If scoping fails anywhere, failing HERE is the version
    // that leaves the building.
    const res = await page.request.get('/patients/export')
    expect(res.status()).toBe(200)
    const csv = await res.text()
    expect(csv).toContain(DENTAL.patientEmail)
    expect(csv, 'the export must not contain another clinic’s patients').not.toContain(
      PRELIVE.patientEmail,
    )
  })
})

test.describe('and the boundary runs the other way too (signed in as E2E Prelive)', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context, PRELIVE.sessionToken)
  })

  /**
   * The mirror. Without it every assertion above is also satisfied by a system
   * that simply hides `org_e2e_prelive` from everyone — a fixture quirk dressed
   * up as a security property. Driving the same three surfaces from the other
   * side is what makes this a statement about the CODE.
   */
  test('E2E Prelive sees its own patient and cannot reach E2E Dental’s', async ({ page }) => {
    await page.goto(`/patients/${DENTAL.patientId}`)
    await expect(page.locator('body')).toContainText("We couldn't find that", { timeout: 30_000 })
    await expect(page.locator('body')).not.toContainText(DENTAL.patientName)

    await page.goto('/patients')
    await expect(patientLinks(page, PRELIVE.patientId).first()).toBeVisible({ timeout: 30_000 })
    await expect(patientLinks(page, DENTAL.patientId)).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(DENTAL.patientName)

    const csv = await page.request.get('/patients/export')
    expect(csv.status()).toBe(200)
    const body = await csv.text()
    expect(body).toContain(PRELIVE.patientEmail)
    expect(body).not.toContain(DENTAL.patientEmail)
  })
})
