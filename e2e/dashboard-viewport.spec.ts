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
