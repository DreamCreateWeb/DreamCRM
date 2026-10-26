import { test, expect } from '@playwright/test'
import { createHmac } from 'node:crypto'

/**
 * THE DASHBOARD TAKES THE WHOLE PHONE.
 *
 * A bounded journey over three signed-in pages at the three widths the brand
 * book names. Below `lg` the sidebar is an off-canvas drawer, so the page's
 * `<main>` must start at x = 0 and the document must not scroll sideways; at
 * 1440 the sidebar is in flow and `<main>` starts where it ends. This is the
 * measurement that found the 256px gutter `tests/ui/sidebar-off-canvas.
 * test.ts` explains — every dashboard page on a phone rendered in the strip
 * to the right of an invisible drawer, and no source-reading test could see
 * it because the cause was cascade LAYERING, not a class.
 *
 * The path list is typed by hand on purpose (a bounded journey, not a
 * registry expansion): the shell is one component, so three pages prove it.
 */

const SESSION_TOKEN = 'e2e-staff-session-token'
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

function signedSessionCookie(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET not set — run through scripts/e2e-harness.sh')
  const sig = createHmac('sha256', secret).update(SESSION_TOKEN).digest('base64')
  return encodeURIComponent(`${SESSION_TOKEN}.${sig}`)
}

const PAGES = ['/dashboard', '/website', '/website/content']

test.describe('the dashboard shell at phone, tablet and desktop widths', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'better-auth.session_token', value: signedSessionCookie(), url: BASE },
    ])
  })

  for (const width of [390, 834]) {
    test(`at ${width} the sidebar is off-canvas and <main> starts at the left edge`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      for (const path of PAGES) {
        await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
        const m = await page.evaluate(() => {
          const main = document.querySelector('main')!
          const aside = document.getElementById('sidebar')!
          return {
            mainLeft: Math.round(main.getBoundingClientRect().left),
            asideRight: Math.round(aside.getBoundingClientRect().right),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          }
        })
        expect(m.mainLeft, `${path} @${width}: <main> must start at x=0`).toBe(0)
        expect(m.asideRight, `${path} @${width}: the drawer must be slid fully off-canvas`).toBeLessThanOrEqual(0)
        expect(m.overflow, `${path} @${width}: no horizontal document scroll`).toBe(0)
      }
    })
  }

  test('at 1440 the sidebar is in flow and <main> starts where it ends', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    for (const path of PAGES) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
      const m = await page.evaluate(() => {
        const main = document.querySelector('main')!
        const aside = document.getElementById('sidebar')!
        const a = aside.getBoundingClientRect()
        return { mainLeft: Math.round(main.getBoundingClientRect().left), asideLeft: Math.round(a.left), asideWidth: Math.round(a.width) }
      })
      expect(m.asideLeft, `${path} @1440: the sidebar is on screen`).toBe(0)
      expect(m.asideWidth).toBeGreaterThanOrEqual(64)
      expect(m.mainLeft, `${path} @1440: <main> starts at the sidebar's edge`).toBe(m.asideWidth)
    }
  })
})

/**
 * THE SHELL IS USABLE ON THE PHONE, NOT JUST LAID OUT ON IT (2026-10-26).
 *
 * Four measurements at 390 that no source-reading test can take:
 *  - focus order: Tab from the skip link must land inside <main>, never in the
 *    closed drawer (`inert` on the aside — before it, ~20 hidden links came
 *    first);
 *  - the bell's panel sits inside the viewport (the Mosaic `-mr-48` hack put
 *    88px of it past the right edge);
 *  - the BulkBar's region and its primary action sit inside the viewport once
 *    a row is selected (it was ~130px off EACH edge);
 *  - every header icon control is at least 40×40 (DESIGN-SYSTEM §2.2).
 */
test.describe('the dashboard shell is usable at phone width', () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: 'better-auth.session_token', value: signedSessionCookie(), url: BASE },
    ])
  })

  test('at 390 the closed drawer is out of the tab order and the header controls are 40px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })

    await expect(page.locator('#sidebar')).toHaveAttribute('inert', '')

    // The fixture clinic is on its first visit, so the Overview opens the
    // welcome dialog, which holds focus inside itself by design. Dismiss it
    // and drop focus back to the document before walking the tab order —
    // the question here is the SHELL's order, not the dialog's.
    const letsGo = page.getByRole('button', { name: /let.s go/i })
    if (await letsGo.isVisible().catch(() => false)) {
      await letsGo.click()
      await expect(page.getByRole('dialog', { name: /welcome/i })).toBeHidden()
    }

    // Start the walk AT the skip link (the shell's first tabbable, rendered
    // before the drawer) rather than from wherever the dialog left the
    // browser's sequential-focus starting point. Tab from it → the first
    // focusable AFTER it. The drawer's nav is next in DOM order, so with the
    // drawer inert that is the header, never a nav link in the drawer.
    await page.getByRole('link', { name: 'Skip to content' }).focus()
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
    await page.keyboard.press('Tab')
    const landed = await page.evaluate(() => ({
      inDrawer: !!document.activeElement?.closest('#sidebar'),
      inHeader: !!document.activeElement?.closest('header'),
    }))
    expect(landed.inDrawer, 'Tab from the skip link must not land inside the closed drawer').toBe(false)
    expect(landed.inHeader, 'Tab from the skip link lands in the header').toBe(true)

    for (const name of ['Open sidebar', 'Search', 'Notifications', 'Need help?', 'Dark mode']) {
      const box = await page.getByRole(name === 'Dark mode' ? 'switch' : 'button', { name }).boundingBox()
      expect(box, `${name} is rendered`).not.toBeNull()
      expect(box!.width, `${name} is at least 40px wide`).toBeGreaterThanOrEqual(40)
      expect(box!.height, `${name} is at least 40px tall`).toBeGreaterThanOrEqual(40)
    }
  })

  test('at 390 the opened drawer takes focus and hands it back', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
    const hamburger = page.getByRole('button', { name: 'Open sidebar' })
    await hamburger.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Close sidebar' })).toBeFocused()
    await expect(page.locator('#sidebar')).not.toHaveAttribute('inert', '')
    await page.keyboard.press('Escape')
    await expect(hamburger).toBeFocused()
    await expect(page.locator('#sidebar')).toHaveAttribute('inert', '')
  })

  test('at 390 the notification tray sits inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Notifications' }).click()
    const panel = page.locator('[id^="headlessui-popover-panel"]')
    await expect(panel).toBeVisible()
    const box = (await panel.boundingBox())!
    expect(Math.round(box.x), 'the panel starts inside the left edge').toBeGreaterThanOrEqual(0)
    expect(Math.round(box.x + box.width), 'the panel ends inside the right edge').toBeLessThanOrEqual(390)
  })

  test('at 390 the bulk bar and its primary action are reachable once a row is selected', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    // The agenda is never network-idle for long (badge polling, the live
    // trail), so wait for its own content like staff-day.spec.ts does rather
    // than for the network — the first run of this test timed out at 60s on
    // `networkidle` with the page fully painted.
    await page.goto(`${BASE}/appointments`)
    const boxes = page.getByRole('checkbox', { name: /^Select / })
    await expect(boxes.first()).toBeVisible({ timeout: 30_000 })
    const n = Math.min(await boxes.count(), 2)
    for (let i = 0; i < n; i++) await boxes.nth(i).check()

    const region = page.getByRole('region', { name: 'Bulk actions' })
    await expect(region).toBeVisible()
    const r = (await region.boundingBox())!
    expect(Math.round(r.x), 'the bar starts inside the left edge').toBeGreaterThanOrEqual(0)
    expect(Math.round(r.x + r.width), 'the bar ends inside the right edge').toBeLessThanOrEqual(390)

    const primary = region.getByRole('button', { name: /^Send \d+ reminder/ })
    await expect(primary).toBeVisible()
    const p = (await primary.boundingBox())!
    expect(Math.round(p.x)).toBeGreaterThanOrEqual(0)
    expect(Math.round(p.x + p.width)).toBeLessThanOrEqual(390)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, 'no horizontal document scroll with the bar mounted').toBe(0)
  })
})
