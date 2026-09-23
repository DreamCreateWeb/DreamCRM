import { test, expect, type Page } from '@playwright/test'
import { createHmac } from 'node:crypto'
import { restoresSeedScope } from './reseed'
import { expectNoA11yViolations } from './axe'
import { DEMO_TRACKS, DEMO_TRACK_LIST } from '@/lib/types/demo-script'
import { getQuotedPlan, PLANS, PURCHASABLE_PLANS } from '@/lib/stripe-config'

/**
 * THE SURFACE A PROSPECT WATCHES DURING A SALES CALL (DREAMCRM-124).
 *
 * Nothing in `e2e/` had ever loaded `/platform/prospecting` or the branded
 * demo, and that is not a coincidence about coverage — it is the reason two
 * plan-price defects survived three sweeps on it. `docs/RELEASE.md` Part 5
 * carries both: the track picker's "closes on Premium · $500/mo", and the
 * demo script's closing line quoting $500 a month for a plan that costs $200.
 * The second one is the LAST NUMBER a prospect hears before being asked to
 * sign, and both were found by reading source rather than by anything that
 * ran.
 *
 * WHAT THIS WALKS, end to end, in one browser:
 *
 *   1. the demo PREP page — the story picker's cards, each carrying the plan
 *      the story closes on;
 *   2. a live BRANDED DEMO, started from the picker, driven from the pop-out
 *      presenter script over its BroadcastChannel;
 *   3. the WRAP-UP — the close reminder the presenter reads out;
 *   4. the demo clinic's REFERRAL COMMISSION ledger, which the demo seeder
 *      writes from the same `getQuotedPlan()` and which used to pay a partner
 *      10% of the struck-through list price.
 *
 * EVERY PRICE ASSERTION IS BY VALUE, RESOLVED FROM `lib/stripe-config.ts`, and
 * that is the whole point of the file rather than a detail of it. The unit
 * test that covered these surfaces asserted `/\$\d+/` — a SHAPE — and stayed
 * green for the entire life of both defects. A shape check on a money surface
 * is a test that has agreed in advance to accept any number.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never CONVERTS the prospect: that runs
 * managed provisioning, reserves a plan and sends an owner invite, which is a
 * real money path and a scan does not need one. The demo is ended with a
 * follow-up outcome, which is the least destructive of the three the wrap-up
 * offers.
 */

const SESSION_TOKEN = 'e2e-presenter-session-token'
const PROSPECT_ID = 'pros_e2e_demojourney'
const PROSPECT_NAME = 'Ridgeline Family Dental'
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

/** The one plan anybody can buy, and how the presenter says it out loud. */
const PLAN = getQuotedPlan()
const PLAN_LABEL = `closes on ${PLAN.name} · $${PLAN.price.toLocaleString('en-US')}/mo`
const PLAN_SPOKEN = `$${PLAN.price.toLocaleString('en-US')} a month`

/**
 * The prices that must NOT be on any of these screens: the struck-through
 * list price, and the two legacy tiers that have not been purchasable since
 * the 2026-07-19 single-plan collapse. Derived from the config rather than
 * typed, so a reprice moves the assertion with it.
 */
const FORBIDDEN_PRICES = [
  ...(PLAN.listPrice ? [`$${PLAN.listPrice.toLocaleString('en-US')}`] : []),
  ...PLANS.filter((p) => !PURCHASABLE_PLANS.some((q) => q.id === p.id)).map(
    (p) => `$${p.price.toLocaleString('en-US')}`,
  ),
]

/**
 * THE STORY THIS SPEC PICKS, and why it is this one.
 *
 * `frontdesk` is a NON-FULL track (the full tour is the only one DREAMCRM-38
 * ever pinned), it is never auto-suggested — the picker exists so a presenter
 * can make a discovery-driven choice on the call — and every one of its beats
 * is an ordinary dashboard route. That last part is load-bearing: the
 * `website` track opens on `/demo/compare`, which is a chrome-less (preview)
 * page and therefore does not mount the presenter conductor, so the remote
 * cannot drive from it. That is a product quirk, not this spec's to fix, and
 * routing around it is why the choice is written down here.
 */
const TRACK = DEMO_TRACKS.frontdesk

// The scope THIS file owns — see scripts/e2e-seed.mjs.
restoresSeedScope('demo-journey')

/**
 * The signed session cookie better-auth itself would set — same construction
 * as `e2e/partner-portal.spec.ts` and `e2e/portal.spec.ts`. The seed creates
 * the platform-admin user and a live session row; this mints the cookie that
 * names it.
 */
function signedSessionCookie(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set — run through scripts/e2e-harness.sh')
  const sig = createHmac('sha256', secret).update(SESSION_TOKEN).digest('base64')
  return encodeURIComponent(`${SESSION_TOKEN}.${sig}`)
}

/** Nothing on this screen may quote a price nobody can pay. */
async function expectNoRetiredPrice(page: Page, where: string): Promise<void> {
  const body = await page.locator('body').innerText()
  for (const price of FORBIDDEN_PRICES) {
    expect(
      body.includes(price),
      `${where} quotes ${price}, which is either the struck-through list price or a tier that ` +
        `has not been purchasable since the single-plan collapse`,
    ).toBe(false)
  }
}

test.describe('the demo presenter journey', () => {
  // Starting a branded demo calls `createDemoClinic()`, which seeds (or
  // self-heals) the whole demo practice against a cold throwaway Postgres.
  // That is the real path and it is slow; the default 60s is sized for a page
  // load, not for a seeder.
  test.setTimeout(300_000)

  test('prep → a live demo → the wrap-up close → the commission ledger, every price from stripe-config', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: BASE })
    await context.addCookies([
      { name: 'better-auth.session_token', value: signedSessionCookie(), url: BASE },
    ])
    const page = await context.newPage()

    // ── 1. THE PREP PAGE ────────────────────────────────────────────────
    await page.goto(`/platform/prospecting/demo/${PROSPECT_ID}`)
    await expect(page.getByRole('heading', { name: PROSPECT_NAME })).toBeVisible({
      timeout: 30_000,
    })

    // Every story card carries the plan it closes on, by VALUE. Before
    // DREAMCRM-124 four of these five said Basic · $150/mo or Pro · $250/mo —
    // plans checkout cannot sell, at a price Stripe has never held.
    for (const track of DEMO_TRACK_LIST) {
      // ANCHORED at the card's own opening `<emoji> <label>`: the start button
      // below carries the selected track's label too (lower-cased), and an
      // unanchored match would be ambiguous the moment a label's casing moves.
      const card = storyCard(page, track.emoji, track.label)
      await expect(card, `the ${track.id} story card is missing`).toBeVisible()
      await expect(
        card,
        `the ${track.id} card does not say "${PLAN_LABEL}"`,
      ).toContainText(PLAN_LABEL)
    }
    await expectNoRetiredPrice(page, 'the demo prep page')

    await expectNoA11yViolations(page, 'demo: prep page, story picker with a brief')

    // ── 2. START THE DEMO ───────────────────────────────────────────────
    // Pick the discovery-driven story, then start. The picker pre-opens the
    // presenter script window inside the click gesture and points it at
    // /demo/script once the demo cookies exist.
    await storyCard(page, TRACK.emoji, TRACK.label).click()
    const [script] = await Promise.all([
      context.waitForEvent('page'),
      page
        .getByRole('button', { name: new RegExp(`Start the ${escapeRe(TRACK.label.toLowerCase())} demo`, 'i') })
        .click(),
    ])

    // The demo tab lands on the story's FIRST beat — a website demo would open
    // on the side-by-side, this one opens on the morning huddle.
    await page.waitForURL(new RegExp(`${escapeRe(TRACK.beats[0].href)}$`), { timeout: 240_000 })
    await script.waitForURL(/\/demo\/script/, { timeout: 60_000 })

    // ── 3. THE PRESENTER SCRIPT, DRIVING THE DEMO TAB ───────────────────
    // The script window owns no state: it mirrors the demo tab over a
    // BroadcastChannel and sends commands back. "Presenting to <clinic>" only
    // renders from the skin cookie, so it is also the proof the brand
    // composition survived the round trip.
    await expect(script.getByText(`Presenting to ${PROSPECT_NAME}`)).toBeVisible({
      timeout: 60_000,
    })
    await expect(script.getByText(`1. ${TRACK.beats[0].title}`)).toBeVisible()
    // The channel is connected — the amber "waiting for the demo tab" notice
    // is the state where nothing this spec does next would work.
    await expect(script.getByText(/Waiting for the demo tab/)).toHaveCount(0, { timeout: 30_000 })

    await expectNoA11yViolations(script, 'demo: presenter script, beat 1 of a live demo')

    // Advance a beat FROM THE SCRIPT WINDOW and watch the demo tab follow.
    // That round trip is the whole mechanism — a presenter reads here and the
    // prospect's screen moves there — and no unit test can see it.
    await script.getByRole('button', { name: new RegExp(`2\\. ${escapeRe(TRACK.beats[1].title)}`) }).click()
    await page.waitForURL(new RegExp(`${escapeRe(TRACK.beats[1].href)}$`), { timeout: 60_000 })

    // ── 4. THE WRAP-UP — THE LAST NUMBER A PROSPECT HEARS ───────────────
    await script.getByRole('button', { name: /Wrap up/ }).click()
    const wrapUp = script.getByTestId('demo-wrapup')
    await expect(wrapUp).toBeVisible({ timeout: 30_000 })
    await expect(wrapUp).toContainText(`That’s the pitch for ${PROSPECT_NAME}`)

    // THE ASSERTION THIS FILE EXISTS FOR. The close reminder is the registry's
    // own sentence, and the registry resolves the plan from stripe-config —
    // so this fails if the copy ever hard-codes a number again, and it fails
    // by NAME rather than by shape.
    await expect(wrapUp, 'the wrap-up does not read the track its own pitch').toContainText(
      TRACK.planPitch,
    )
    await expect(wrapUp).toContainText(PLAN.name)
    await expect(wrapUp).toContainText(PLAN_SPOKEN)
    await expectNoRetiredPrice(script, 'the demo wrap-up')

    await expectNoA11yViolations(script, 'demo: the wrap-up, outcome not yet chosen')

    // The owner's evidence: the beat a prospect never sees and everything
    // rests on. Attached rather than only asserted — `dreamcrm-conventions`
    // §9 wants the picture, not a sentence describing it.
    await test.info().attach('demo-wrap-up', {
      body: await script.screenshot({ fullPage: true }),
      contentType: 'image/png',
    })

    // ── 5. END IT HONESTLY ──────────────────────────────────────────────
    // "Follow up" rather than "They're in": a win runs conversion, which is a
    // real money path. The script window closes itself once the outcome is
    // logged, so the demo tab is what we wait on.
    await script.getByRole('button', { name: /Follow up/ }).click()
    await script.getByRole('button', { name: /Log & end demo/ }).click()
    await page.waitForURL(/\/platform\/prospecting\/call-list/, { timeout: 60_000 })

    // ── 6. WHAT THE DEMO PAID ITS PARTNER ───────────────────────────────
    // `createDemoClinic()` ran for real above, which means `seedDemoReferralPartner`
    // ran with it. Its commission rows used to carry a literal 50000 cents —
    // the LIST price — so the showcase paid a demo partner 10% of $500 while
    // `/partner-program` published "$20 per practice per month" from
    // `getQuotedPlan()` on the same rate. A prospect could open both in one
    // sitting. Reading it here, off the page, is what closes the loop: the
    // unit test renders the healing UPDATE's SQL, and rendering a statement is
    // not the same as a row being right.
    const partnerShare = Math.floor((PLAN.price * 100 * 1000) / 10000) / 100
    await page.goto('/partners')
    await expect(page.getByRole('heading', { name: 'Referral partners' })).toBeVisible({
      timeout: 30_000,
    })
    await page.getByRole('link', { name: /Brightline IT \(Demo MSP\)/ }).click()

    const ledger = page.locator('div.v2-card', { hasText: 'Commission ledger' })
    await expect(ledger).toBeVisible({ timeout: 30_000 })
    await expect(
      ledger,
      'the demo commission ledger does not read 10% of the plan a clinic actually pays',
    ).toContainText(`10% of $${PLAN.price.toLocaleString('en-US')}`)
    await expect(
      ledger.getByText(`$${partnerShare.toFixed(2)}`).first(),
      'the demo commission rows do not pay $20 a practice',
    ).toBeVisible()
    await expectNoRetiredPrice(page, 'the demo partner detail page')

    await expectNoA11yViolations(page, 'demo: the demo clinic on its referral partner')

    await context.close()
  })
})

/** Escape a registry string for use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** One story card in the picker, anchored at its own `<emoji> <label>` opening. */
function storyCard(page: Page, emoji: string, label: string) {
  return page.getByRole('button', {
    name: new RegExp(`^${escapeRe(emoji)}\\s+${escapeRe(label)}\\b`),
  })
}
