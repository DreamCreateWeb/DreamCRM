/**
 * Hand-grade the night band against the ground it ACTUALLY paints, and take
 * the screenshots.
 *
 * Why this exists rather than a unit test. `tests/a11y/token-contrast.test.ts`
 * grades the band's ink against the FLAT ground (`gray-950`), which is what
 * BRAND.md Part 7's table records — but the band also paints a blueprint grid,
 * an aurora wash, two orbit rings, an orb and a star field on top of that
 * ground, every one of them a `background-image`. axe reads
 * `background-color` and cannot see any of them; neither can a source scanner.
 * So the only way to know a wash has not walked the ink under 4.5:1 is to
 * render the page and measure the pixels.
 *
 * Method: measure where the GLYPHS are (a Range over each text node, so a
 * centred caption is its words and not the full-width block it sits in), hide
 * the band's content, screenshot the decorative layers alone, then take the
 * BRIGHTEST pixel inside those rectangles — the worst case for light ink on a
 * dark ground.
 *
 * Two deliberate choices, both of which move the number:
 *
 *   - BRIGHTEST, never average. An average hides a bright lobe crossing one
 *     corner of a caption, which is exactly the failure this is looking for.
 *   - TEXT RECTS, not element boxes. The first draft sampled the `<p>`'s box
 *     and reported the caption at 3.40 — but the caption is `text-center` in a
 *     full-width block, and the bright pixel was 400px away from the nearest
 *     letter, under the phone mock's shadow. Ground with no ink on it is not a
 *     contrast pair; this is what axe measures too. It is NOT a softening: the
 *     same change left a real 4.18 standing on the caption until the design
 *     moved.
 *
 * RUN IT AGAINST ANYTHING THAT SERVES THE PAGE:
 *
 *   BASE_URL=https://www.dreamcreatestudio.com node scripts/night-band-grade.mjs
 *   BETTER_AUTH_SECRET=anything npx next dev -p 3112   # then BASE_URL=http://127.0.0.1:3112
 *
 * The local case needs only that one env var — it is what the homepage's
 * signed-in redirect checks reach for before they ever touch the database, so
 * without it every page is a 500 error shell. It does NOT need a database, and
 * it does not need the page edited: an earlier version of this harness stubbed
 * the auth guard out of `app/(marketing)/page.tsx` and put it back afterwards,
 * which was a scary amount of machinery for a missing environment variable.
 *
 * A sample that does not resolve FAILS the run rather than being skipped. A
 * measurement that has quietly stopped measuring looks exactly like a clean
 * one — the `deadExclusions` lesson, pointed at this.
 */
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:3100'
const OUT = process.env.OUT_DIR ?? '.'

const lin = (v) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const contrast = (a, b) => {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
const hex = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16))

/**
 * Every text block on the band, with the ink it is written in — read straight
 * off its own className rather than kept in a second list that can disagree.
 * Selectors are the entrance-animation hooks the hero already carries, so this
 * needs no test-only attributes shipped to production.
 */
const SAMPLES = [
  ['the eyebrow badge (teal-400)', 'section.bg-gray-950 p.mkt-enter.mb-5', '#7ca5ff'],
  ['the headline (white)', 'section.bg-gray-950 h1.mkt-d1', '#ffffff'],
  ['the body copy (gray-300)', 'section.bg-gray-950 p.mkt-d2', '#c3d0e8'],
  ['the trust row (gray-300)', 'section.bg-gray-950 div.mkt-d4.mt-7', '#c3d0e8'],
  ['the caption (gray-400)', 'section.bg-gray-950 p.text-center.font-mono-num', '#93a0bc'],
  ['the ticker labels (gray-400)', '[aria-label="Everything included"] span.flex', '#93a0bc'],
]
const HIDE_CONTENT = SAMPLES.map(([, s]) => `${s} { visibility: hidden !important; }`).join('\n')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
// Entrance animations are opacity fades; measuring mid-fade measures a blend
// (the lesson `e2e/axe.ts`'s settleAnimations note records).
await page.waitForTimeout(3500)

/* ── 1. the screenshots a person looks at ─────────────────────────────── */
await page.screenshot({ path: `${OUT}/night-band.png`, clip: { x: 0, y: 0, width: 1440, height: 1000 } })
// The whole band, hero + ticker, down to where daylight starts again.
const bandEnd = await page.evaluate(() => {
  const ticker = document.querySelector('[aria-label="Everything included"]')
  const r = ticker?.getBoundingClientRect()
  return r ? Math.ceil(r.bottom + window.scrollY + 8) : 1600
})
// `clip` alone is capped at the viewport — it needs `fullPage` to reach past it.
await page.screenshot({ path: `${OUT}/night-band-full.png`, fullPage: true, clip: { x: 0, y: 0, width: 1440, height: bandEnd } })
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/night-band-reduced-motion.png`, clip: { x: 0, y: 0, width: 1440, height: 1000 } })
await page.emulateMedia({ reducedMotion: 'no-preference' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(3500)

/* ── 2. the measurement ───────────────────────────────────────────────── */
/** Where the ink actually is: one rect per line of text, not the block's box. */
const rects = await page.evaluate((selectors) => {
  const out = {}
  for (const selector of selectors) {
    const el = document.querySelector(selector)
    if (!el) continue
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const found = []
    let node
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || !node.nodeValue.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const r of range.getClientRects()) {
        if (r.width > 0 && r.height > 0) {
          found.push({ x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height })
        }
      }
    }
    if (found.length) out[selector] = found
  }
  return out
}, SAMPLES.map(([, s]) => s))

// Hide the content, leaving only the decorative layers painted. The shot is
// FULL PAGE: the caption and the ticker sit below the fold at this viewport,
// and a clipped shot silently drops them — which reads as "selector not
// found", i.e. exactly the shape of a measurement that quietly stopped
// measuring. `boundingBox()` is document-relative while scrollY is 0, so the
// boxes map straight onto it.
await page.addStyleTag({ content: HIDE_CONTENT })
await page.waitForTimeout(150)
const shot = await page.screenshot({ fullPage: true })

const probe = await browser.newPage()
await probe.setContent('<canvas id="c"></canvas>')
const brightest = await probe.evaluate(
  async ([dataUrl, boxes]) => {
    const img = new Image()
    await new Promise((res) => {
      img.onload = res
      img.src = dataUrl
    })
    const c = document.getElementById('c')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const scale = img.width / 1440
    const out = {}
    for (const [key, list] of Object.entries(boxes)) {
      let best = null
      let bestSum = -1
      for (const b of list) {
        const x = Math.max(0, Math.round(b.x * scale))
        const y = Math.max(0, Math.round(b.y * scale))
        const w = Math.min(img.width - x, Math.round(b.width * scale))
        const h = Math.min(img.height - y, Math.round(b.height * scale))
        if (w <= 0 || h <= 0) continue
        const d = ctx.getImageData(x, y, w, h).data
        for (let i = 0; i < d.length; i += 4) {
          const sum = d[i] + d[i + 1] + d[i + 2]
          if (sum > bestSum) {
            bestSum = sum
            best = [d[i], d[i + 1], d[i + 2]]
          }
        }
      }
      if (best) out[key] = best
    }
    return out
  },
  [`data:image/png;base64,${shot.toString('base64')}`, rects],
)

const lines = []
let worst = Infinity
for (const [label, selector, ink] of SAMPLES) {
  const bg = brightest[selector]
  // A sample that did not resolve is a FAILURE of the instrument, not a pass.
  // Reported loudly and it fails the run, for the reason `deadExclusions`
  // exists: a measurement that has stopped measuring looks like a clean one.
  if (!bg) {
    lines.push(`NOT MEASURED  ${label}  (${selector})`)
    worst = -1
    continue
  }
  const ratio = contrast(hex(ink), bg)
  worst = Math.min(worst, ratio)
  const flat = contrast(hex(ink), hex('#10182e'))
  lines.push(
    `${ratio >= 4.5 ? 'PASS' : 'FAIL'}  ${label}\n` +
      `        ink ${ink} · brightest ground under it rgb(${bg.join(',')})\n` +
      `        ${ratio.toFixed(2)} rendered   (${flat.toFixed(2)} on the flat ground)`,
  )
}
lines.push(
  '',
  worst < 0
    ? 'AT LEAST ONE SAMPLE DID NOT RESOLVE — the grade above is incomplete.'
    : `worst rendered pair on the band: ${worst.toFixed(2)} against a 4.5 floor`,
)
const report = lines.join('\n')
console.log(report)
writeFileSync(`${OUT}/night-band-grade.txt`, report + '\n')

await browser.close()
process.exit(worst >= 4.5 ? 0 : 1)
