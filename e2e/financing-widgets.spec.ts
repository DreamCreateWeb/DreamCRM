import { test, expect, type Page } from '@playwright/test'
import { CHERRY_FLOATING_Z_INDEX } from '../lib/financing-providers'

/**
 * THE FINANCING WIDGETS, IN A BROWSER (2026-10-12).
 *
 * The seeded live clinic (scripts/e2e-seed.mjs) offers Cherry with the
 * full-page widget and the site-wide floating button on. happy-dom proves
 * the containers and the queued init; only a browser can prove WHERE the
 * floating button lands — and the thing it must not land on is the site's
 * own floating Call / Book stack, which every template parks bottom-right.
 *
 * Cherry's script is a third-party network fetch. The structural checks
 * (our containers, the one script tag, the print rule) never need it; the
 * geometry check waits for Cherry's container briefly and is skipped out
 * loud when the script could not be reached, so an air-gapped runner
 * degrades to "not proven here" rather than to a red that means nothing.
 */

const LIVE = '/site/e2e-dental'
const CHERRY_CONTAINER = '[class*="floatingEstimator-floatingContainer"]'

async function cherryContainer(page: Page) {
  const el = page.locator(CHERRY_CONTAINER).first()
  try {
    await el.waitFor({ state: 'attached', timeout: 8_000 })
    return el
  } catch {
    return null
  }
}

for (const width of [390, 1440] as const) {
  test(`at ${width}: the floating button mounts once, off the Call / Book stack and the chat bubble`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const res = await page.goto(LIVE)
    expect(res?.status()).toBe(200)

    // Ours: one loader script, one mount, the print rule.
    await expect(page.locator('script#_hw')).toHaveCount(1)
    await expect(page.locator('script#_hw')).toHaveAttribute('src', 'https://files.withcherry.com/widgets/widget.js')
    await expect(page.locator('#floatingEstimator')).toHaveCount(1)
    const css = await page.locator('style').evaluateAll((els) => els.map((e) => e.textContent ?? '').join(''))
    expect(css).toContain('@media print{#floatingEstimator{display:none !important}}')

    // Scroll past the hero so the site's own floating stack reveals itself.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
    await page.waitForTimeout(400)

    const cherry = await cherryContainer(page)
    if (process.env.E2E_SHOTS_DIR) {
      await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/financing-home-${width}.png` })
    }
    if (!cherry) {
      test.info().annotations.push({ type: 'skipped-check', description: "Cherry's script did not load here; placement not proven on this runner" })
      return
    }
    const box = await cherry.boundingBox()
    expect(box, "Cherry's floating container has a box").not.toBeNull()
    // Bottom-LEFT …
    expect(box!.x).toBeLessThan(width / 2)

    // … and touching neither the site's own floating Call / Book stack (the
    // seeded clinic wears the default template, whose stack is the shared
    // `.floating-cta-stack`; the other templates' bars are covered by the
    // per-template unit test and the measured geometry recorded in
    // lib/financing-providers.ts) nor the chat bubble it sits above.
    const disjoint = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
      a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
    for (const [label, loc] of [
      ['the site’s floating stack', page.locator('.floating-cta-stack').first()],
      ['the chat bubble', page.getByTestId('site-chat-widget')],
    ] as const) {
      if ((await loc.count()) === 0) continue
      const other = await loc.boundingBox()
      if (other) expect(disjoint(box!, other), `the Cherry button overlaps ${label}`).toBe(true)
    }
    const z = await cherry.evaluate((el) => getComputedStyle(el).zIndex)
    expect(z).toBe(String(CHERRY_FLOATING_Z_INDEX))
  })
}

test('the financing page leads with Cherry’s widget and links the apply page', async ({ page }) => {
  const res = await page.goto(`${LIVE}/payment-financing`)
  expect(res?.status()).toBe(200)
  await expect(page.locator('body')).not.toContainText('Application error')
  // Attached, not visible: the shell collapses until Cherry's script mounts
  // its containers, and a runner without a route to Cherry never sees that.
  await expect(page.getByTestId('financing-primary-widget')).toHaveCount(1)
  for (const id of ['hero', 'calculator', 'howitworks', 'faq']) {
    await expect(page.locator(`#${id}`)).toHaveCount(1)
  }
  await expect(page.getByTestId('financing-apply-cherry')).toHaveAttribute(
    'href',
    'https://pay.withcherry.com/soult-swanson-family-dentistry-and-implant-center?utm_source=merchant&utm_medium=website',
  )
  // The loader is on this page too — and still exactly once.
  await expect(page.locator('script#_hw')).toHaveCount(1)
  if (process.env.E2E_SHOTS_DIR) {
    await page.getByTestId('financing-primary-widget').scrollIntoViewIfNeeded()
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${process.env.E2E_SHOTS_DIR}/financing-page.png` })
  }
})
