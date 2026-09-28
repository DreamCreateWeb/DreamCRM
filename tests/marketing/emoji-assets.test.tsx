import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { render, screen } from '@testing-library/react'
import React from 'react'

import {
  MARKETING_EMOJI,
  MARKETING_EMOJI_NAMES,
  CUT,
  REJECTED,
} from '@/lib/marketing/emoji'
import { MarketingEmoji } from '@/components/marketing/emoji'
import { MarketingFooter } from '@/components/marketing/ui'

/**
 * Guards for the curated animated-emoji set (`BRAND.md` Part 5, DREAMCRM-56).
 *
 * These exist because every failure mode below was observed while building the
 * set, not imagined afterwards:
 *
 * - `build-emoji.mjs` wrote SIX static 96x960 strips that passed every "file
 *   exists" and "file is a webp" check and were broken in a browser. Hence the
 *   frame-count assertion, which is the only one that catches it.
 * - The 512px sources are 181 KB - 1.17 MB. A size ceiling is the difference
 *   between shipping the set and shipping 3 MB by accident on a re-encode.
 * - The CC BY 4.0 credit is a licence term. Without a test, it is one tidy-up
 *   commit away from being deleted as clutter.
 */

const DIR = path.join(process.cwd(), 'public', 'images', 'emoji')
/** Comfortably above the largest file today (popper, 55 KB) and far below an
 *  un-resized source. A re-encode that blows this has regressed the pipeline. */
const MAX_ANIMATED_BYTES = 80 * 1024
const MAX_STILL_BYTES = 12 * 1024

/** Minimal animated-WebP frame count: an extended WebP (RIFF/WEBPVP8X) whose
 *  ANMF chunks are the frames. Enough to tell "animated" from "one still". */
function webpFrameCount(buf: Buffer): number {
  expect(buf.subarray(0, 4).toString('ascii')).toBe('RIFF')
  expect(buf.subarray(8, 12).toString('ascii')).toBe('WEBP')
  let frames = 0
  let off = 12
  while (off + 8 <= buf.length) {
    const fourcc = buf.subarray(off, off + 4).toString('ascii')
    const size = buf.readUInt32LE(off + 4)
    if (fourcc === 'ANMF') frames++
    off += 8 + size + (size % 2)
  }
  return frames
}

describe('animated emoji assets', () => {
  it('ships an animated file and a still for every registry entry', () => {
    for (const name of MARKETING_EMOJI_NAMES) {
      expect(fs.existsSync(path.join(DIR, `${name}.webp`)), `${name}.webp`).toBe(true)
      expect(fs.existsSync(path.join(DIR, `${name}-still.webp`)), `${name}-still.webp`).toBe(true)
    }
  })

  it('has no orphan files in public/emoji — the registry is the whole set', () => {
    const expected = new Set(
      MARKETING_EMOJI_NAMES.flatMap((n) => [`${n}.webp`, `${n}-still.webp`]),
    )
    const actual = fs.readdirSync(DIR).filter((f) => f.endsWith('.webp'))
    expect(actual.slice().sort()).toEqual(Array.from(expected).sort())
  })

  it('every animated file is really animated, and every still is really one frame', () => {
    for (const name of MARKETING_EMOJI_NAMES) {
      const anim = webpFrameCount(fs.readFileSync(path.join(DIR, `${name}.webp`)))
      expect(anim, `${name}.webp must be an animated WebP, not a static strip`).toBeGreaterThan(1)

      const still = webpFrameCount(fs.readFileSync(path.join(DIR, `${name}-still.webp`)))
      expect(still, `${name}-still.webp must not animate — it IS the reduced-motion fallback`).toBe(0)
    }
  })

  it('keeps every file under the re-encode ceiling', () => {
    for (const name of MARKETING_EMOJI_NAMES) {
      const a = fs.statSync(path.join(DIR, `${name}.webp`)).size
      const s = fs.statSync(path.join(DIR, `${name}-still.webp`)).size
      expect(a, `${name}.webp is ${Math.round(a / 1024)} KB`).toBeLessThan(MAX_ANIMATED_BYTES)
      expect(s, `${name}-still.webp is ${Math.round(s / 1024)} KB`).toBeLessThan(MAX_STILL_BYTES)
    }
  })

  it('records its licence and provenance beside the assets', () => {
    const licence = fs.readFileSync(path.join(DIR, 'LICENSE.md'), 'utf8')
    expect(licence).toContain('CC BY 4.0')
    expect(licence).toContain('google/fonts#7011')
    for (const name of MARKETING_EMOJI_NAMES) {
      expect(licence, `${name} is undocumented`).toContain(MARKETING_EMOJI[name].codepoint)
    }
  })

  it('credits what it ships and no more', () => {
    // The same licence-accuracy rule as the case above, pointed the other way.
    // Attribution is an obligation over the files actually DISTRIBUTED, so a
    // credit left behind for an asset we deleted is the provenance table
    // describing a directory that no longer exists. Found by DREAMCRM-118's
    // cut, where three credited glyphs stopped shipping.
    const licence = fs.readFileSync(path.join(DIR, 'LICENSE.md'), 'utf8')
    const provenance = licence.slice(0, licence.indexOf('**This table is what we ship'))
    for (const c of CUT) {
      expect(
        provenance,
        `${c.glyph} is credited in the provenance table but no longer ships`,
      ).not.toContain(c.codepoint)
    }
  })

  it('keeps the curated set at three under a ceiling of six, with the reasons for both kinds of cut', () => {
    // THREE, and six is the ceiling (`BRAND.md` Part 5, DREAMCRM-118). This
    // read six until three of the six reached 1.0 marking nothing; the number
    // is what the site USES, and the ceiling is the separate rule.
    expect(MARKETING_EMOJI_NAMES).toHaveLength(3)
    expect(MARKETING_EMOJI_NAMES.length + CUT.length).toBeLessThanOrEqual(6)

    // Two lists, because they answer different questions. `CUT` passed the
    // audition and had nowhere to go, so a real moment is a reason to restore
    // one; `REJECTED` failed on the merits, so nothing there should be
    // re-auditioned. Collapsing them loses exactly that.
    const registered = new Set<string>(
      MARKETING_EMOJI_NAMES.map((n) => MARKETING_EMOJI[n].codepoint),
    )
    for (const c of CUT) {
      expect(registered, `${c.glyph} is both cut and registered`).not.toContain(c.codepoint)
      expect(c.why.length).toBeGreaterThan(20)
      // The re-encode parameters are the expensive part of a restore -- the
      // still frame was picked by looking at the strip, and frame 0 is not
      // always usable (popper's is the cone before the burst).
      expect(c.build.name.length).toBeGreaterThan(0)
    }

    // The rejects are the expensive half of the research. Losing them means
    // someone re-downloads 1.2 MB to rediscover that the milky way is a square.
    expect(REJECTED.length).toBeGreaterThanOrEqual(10)
    for (const r of REJECTED) expect(r.why.length).toBeGreaterThan(20)
  })
})

describe('the middleware does not eat the assets', () => {
  /**
   * THE DEFECT THIS EXISTS FOR. The assets first shipped at `public/emoji/`
   * and every one of them 404'd in a running app, while every unit test
   * passed — `middleware.ts`'s matcher excludes a CLOSED list of static
   * prefixes (`_next/static`, `_next/image`, `favicon.ico`, `images`, `css`,
   * `fonts`), so a new top-level directory under `public/` goes through auth
   * and is rewritten. Nothing that reads the filesystem or renders a
   * component can see that; only the matcher can.
   */
  const EXCLUDED = (() => {
    const src = fs.readFileSync(path.join(process.cwd(), 'middleware.ts'), 'utf8')
    const m = src.match(/matcher:\s*\['\/\(\(\?!([^)]+)\)/)
    expect(m, 'could not read the middleware matcher — this guard has gone blind').toBeTruthy()
    return m![1].split('|')
  })()

  it('serves the emoji from a prefix the middleware matcher skips', () => {
    const { container } = render(<MarketingEmoji name="rocket" />)
    const src = container.querySelector('img')!.getAttribute('src')!
    const prefix = src.replace(/^\//, '').split('/')[0]
    expect(
      EXCLUDED,
      `/${prefix}/... is not excluded by the middleware matcher, so these will 404 in a real request`,
    ).toContain(prefix)
  })
})

describe('MarketingEmoji', () => {
  it('is silent to screen readers by default', () => {
    const { container } = render(<MarketingEmoji name="planet" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('aria-hidden')).toBe('true')
  })

  it('announces itself only when given a label', () => {
    render(<MarketingEmoji name="rocket" label="Shipped this week" />)
    const img = screen.getByAltText('Shipped this week')
    expect(img.getAttribute('aria-hidden')).toBeNull()
  })

  it('offers the still frame to prefers-reduced-motion before fetching the animation', () => {
    const { container } = render(<MarketingEmoji name="popper" />)
    const source = container.querySelector('source')!
    expect(source.getAttribute('media')).toBe('(prefers-reduced-motion: reduce)')
    expect(source.getAttribute('srcSet') ?? source.getAttribute('srcset')).toBe(
      '/images/emoji/popper-still.webp',
    )
    expect(container.querySelector('img')!.getAttribute('src')).toBe('/images/emoji/popper.webp')
  })

  it('reserves its box so a late image cannot reflow the text around it', () => {
    const { container } = render(<MarketingEmoji name="popper" size={32} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('width')).toBe('32')
    expect(img.getAttribute('height')).toBe('32')
  })
})

describe('attribution', () => {
  it('the marketing footer carries the CC BY 4.0 credit on every page', () => {
    render(<MarketingFooter />)
    expect(screen.getByText(/Noto Animated Emoji/i)).toBeTruthy()
    const licenceLink = screen.getByText(/CC BY 4.0/i)
    expect(licenceLink.getAttribute('href')).toBe('https://creativecommons.org/licenses/by/4.0/')
  })
})

// The changelog placement rule needs a stubbed multi-week changelog to be
// testable at all — see tests/marketing/emoji-changelog-placement.test.tsx.
