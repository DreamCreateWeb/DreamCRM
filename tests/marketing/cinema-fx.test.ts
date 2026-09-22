import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  BURSTS,
  BURST_LIFE,
  HEADER_BAND_PX,
  MOTE_ALPHA_MAX,
  beatK,
  burstOrigin,
  burstParticles,
  countAt,
  cursorAt,
  fxScale,
  moteAlpha,
  seedMotes,
  seeded,
  stepMotes,
  stopPoint,
} from '@/components/marketing/cinema-fx'
import { CinemaStage, CURSOR_STOPS, SCENE_ANCHORS, SCENE_COUNT } from '@/components/marketing/cinema-scenes'
import { contrast, hexToRgb, over } from '../a11y/palette'

/**
 * THE LIVING STAGE'S PURE HALF — what makes the particle layer shippable
 * under `BRAND.md` Part 6 rather than a demo:
 *
 *  - a burst is a PICTURE of where its particles are at a scroll position,
 *    so it is the same on the way down as on the way up (interruptible, and
 *    nothing to unwind);
 *  - the ambient motes never enter the header lane and never exceed the
 *    alpha the contrast arithmetic allows;
 *  - the cursor ghost walks a path that is a function of the same position.
 */

describe('beats', () => {
  it('beatK is 0 before, 1 after, eased and monotonic between', () => {
    expect(beatK(0.1, 0.2, 0.1)).toBe(0)
    expect(beatK(0.35, 0.2, 0.1)).toBe(1)
    let last = 0
    for (let t = 0.2; t <= 0.3; t += 0.005) {
      const k = beatK(t, 0.2, 0.1)
      expect(k).toBeGreaterThanOrEqual(last)
      last = k
    }
    // Ease-out: past halfway by the midpoint.
    expect(beatK(0.25, 0.2, 0.1)).toBeGreaterThan(0.5)
  })

  it('countAt lands exactly on both ends', () => {
    expect(countAt(31, 38, 0)).toBe(31)
    expect(countAt(31, 38, 1)).toBe(38)
    expect(countAt(9480, 9664, 2)).toBe(9664)
  })
})

describe('bursts', () => {
  it('every burst points at a scene the stage has, inside the frame', () => {
    for (const b of BURSTS) {
      expect(b.scene).toBeGreaterThanOrEqual(0)
      expect(b.scene).toBeLessThan(SCENE_COUNT)
      expect(b.at).toBeGreaterThan(0)
      expect(b.at + BURST_LIFE).toBeLessThanOrEqual(1)
      expect(b.x).toBeGreaterThan(0)
      expect(b.x).toBeLessThan(1)
      expect(b.y).toBeGreaterThan(0)
      expect(b.y).toBeLessThan(1)
    }
  })

  it('is empty before the beat and after its life, and populated inside', () => {
    const b = BURSTS[0]
    expect(burstParticles(b, b.at - 0.01, 1440, 900)).toHaveLength(0)
    expect(burstParticles(b, b.at + BURST_LIFE + 0.01, 1440, 900)).toHaveLength(0)
    expect(burstParticles(b, b.at + BURST_LIFE / 2, 1440, 900)).toHaveLength(b.n)
  })

  it('is the same picture at the same position — a pure function, so scrolling back un-bursts it', () => {
    const b = BURSTS[1]
    const t = b.at + 0.05
    const a = burstParticles(b, t, 1440, 900, []).map((p) => ({ ...p }))
    // …after visiting a later position and coming back.
    burstParticles(b, t + 0.08, 1440, 900, [])
    const c = burstParticles(b, t, 1440, 900, []).map((p) => ({ ...p }))
    expect(c).toEqual(a)
  })

  it('fades out and stays small', () => {
    const b = BURSTS[3]
    const early = burstParticles(b, b.at + 0.01, 1440, 900, [])
    const late = burstParticles(b, b.at + BURST_LIFE - 0.005, 1440, 900, [])
    expect(Math.max(...late.map((p) => p.a))).toBeLessThan(Math.max(...early.map((p) => p.a)))
    for (const p of [...early, ...late]) expect(p.r).toBeLessThanOrEqual(12)
  })

  it('reuses the scratch array rather than allocating per frame', () => {
    const scratch: ReturnType<typeof burstParticles> = []
    const out = burstParticles(BURSTS[0], BURSTS[0].at + 0.02, 100, 100, scratch)
    expect(out).toBe(scratch)
  })
})

describe('motes', () => {
  it('seeds deterministically, outside the header lane, under the alpha ceiling', () => {
    const a = seedMotes(1440, 900)
    const b = seedMotes(1440, 900)
    expect(b).toEqual(a)
    for (const m of a) {
      expect(m.y).toBeGreaterThanOrEqual(HEADER_BAND_PX)
      expect(m.a).toBeLessThanOrEqual(MOTE_ALPHA_MAX)
      expect(moteAlpha(m, 12345)).toBeLessThanOrEqual(MOTE_ALPHA_MAX)
    }
  })

  it('drifts, wraps, and never drifts into the header lane', () => {
    const motes = seedMotes(1440, 900)
    for (let i = 0; i < 4000; i++) {
      stepMotes(motes, 0.016, { w: 1440, h: 900, scrollV: i % 50 === 0 ? 3000 : 0, px: 700, py: 450 }, i * 16)
      for (const m of motes) {
        expect(m.y).toBeGreaterThanOrEqual(HEADER_BAND_PX - m.r)
        expect(Number.isFinite(m.x)).toBe(true)
      }
    }
  })

  it('steps aside for the pointer', () => {
    const motes = seedMotes(1440, 900)
    const target = motes[0]
    const px = target.x + 5
    const py = target.y + 5
    const d0 = Math.hypot(target.x - px, target.y - py)
    for (let i = 0; i < 60; i++) stepMotes(motes, 0.016, { w: 1440, h: 900, scrollV: 0, px, py }, i * 16)
    expect(Math.hypot(target.x - px, target.y - py)).toBeGreaterThan(d0)
  })

  /**
   * THE CONTRAST ARITHMETIC, asserted rather than written in a comment. The
   * canvas sits above the stage's panels, so a mote can cross panel text. The
   * darkest tint the field paints, at the alpha ceiling, over white, must
   * leave the stage's body ink (gray-600) and display ink (gray-950) legal —
   * and at TWICE the ceiling (two motes overlapping) gray-600 must still
   * clear 4.5.
   */
  it('keeps the stage’s graded inks legal under a mote, and under two', () => {
    const white = hexToRgb('#FFFFFF')
    const gray600 = hexToRgb('#4C5A78')
    const gray950 = hexToRgb('#10182E')
    for (const tint of ['#7CA5FF', '#8B78F0', '#E879F9']) {
      const one = over(hexToRgb(tint), MOTE_ALPHA_MAX, white)
      expect(contrast(gray600, one)).toBeGreaterThanOrEqual(5.5)
      expect(contrast(gray950, one)).toBeGreaterThanOrEqual(13)
      const two = over(hexToRgb(tint), MOTE_ALPHA_MAX * 2, white)
      expect(contrast(gray600, two)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('the cursor ghost', () => {
  it('is hidden before its first stop, walks the path, and presses at a click', () => {
    const stops = CURSOR_STOPS[2]
    expect(stops).toBeTruthy()
    expect(cursorAt(stops, 0).visible).toBe(false)
    const mid = cursorAt(stops, (stops[0].at + stops[1].at) / 2)
    expect(mid.visible).toBe(true)
    expect(mid.x).not.toBe(stops[0].x)
    const click = stops.find((s) => s.click)!
    expect(cursorAt(stops, click.at + 0.001).press).toBeGreaterThan(0.9)
    expect(cursorAt(stops, click.at + 0.1).press).toBe(0)
  })

  it('every scripted scene exists and every stop is inside the frame', () => {
    for (const [scene, stops] of Object.entries(CURSOR_STOPS)) {
      expect(Number(scene)).toBeLessThan(SCENE_COUNT)
      let last = -1
      for (const s of stops) {
        expect(s.at).toBeGreaterThan(last)
        last = s.at
        expect(s.x).toBeGreaterThan(0)
        expect(s.x).toBeLessThan(1)
        expect(s.y).toBeGreaterThan(0)
        expect(s.y).toBeLessThan(1)
      }
    }
  })
})

describe('anchors — the cursor and the bursts land on the element, on any monitor', () => {
  /**
   * The first version carried coordinates measured once at 1440x900 as
   * fractions of the frame. The panels have fixed widths, so on the owner's
   * 32" monitor the sparks landed a panel away from the Approve button. Every
   * path and burst now names the ELEMENT it belongs to, the spine measures
   * it at runtime, and the fraction is only the fallback.
   */
  it('every anchor a path or a burst names is in that scene’s markup', () => {
    for (let i = 0; i < SCENE_COUNT; i++) {
      const html = renderToStaticMarkup(React.createElement(CinemaStage, { scene: i }))
      const named = new Set<string>()
      for (const s of CURSOR_STOPS[i] ?? []) if (s.anchor) named.add(s.anchor)
      for (const b of BURSTS) if (b.scene === i && b.anchor) named.add(b.anchor)
      for (const name of Array.from(named)) {
        expect(html, `scene ${i} must render data-anchor="${name}"`).toContain(`data-anchor="${name}"`)
      }
    }
    // …and every registered anchor is used by something, so the list cannot
    // quietly outlive its purpose.
    const used = new Set<string>()
    for (const stops of Object.values(CURSOR_STOPS)) for (const s of stops) if (s.anchor) used.add(s.anchor)
    for (const b of BURSTS) if (b.anchor) used.add(b.anchor)
    for (const a of SCENE_ANCHORS) expect(used.has(a), `anchor ${a} is registered but nothing uses it`).toBe(true)
  })

  it('a measured anchor beats the fallback; a missing one falls back', () => {
    const anchors = { approve: { x: 0.3, y: 0.6, w: 0.1, h: 0.04 } }
    const stop = { at: 0.5, x: 0.9, y: 0.9, anchor: 'approve' as const, dx: 0.02, dy: 0.01 }
    expect(stopPoint(stop, anchors)).toEqual({ x: 0.3 + 0.05 + 0.02, y: 0.6 + 0.02 + 0.01 })
    expect(stopPoint(stop, null)).toEqual({ x: 0.9, y: 0.9 })
    expect(stopPoint({ ...stop, anchor: 'pay' }, anchors)).toEqual({ x: 0.9, y: 0.9 })
    const burst = { ...BURSTS[1], anchor: 'approve' as const, ax: 0, ay: 1 }
    expect(burstOrigin(burst, anchors)).toEqual({ x: 0.3, y: 0.64 })
    expect(burstOrigin(burst, null)).toEqual({ x: BURSTS[1].x, y: BURSTS[1].y })
    // The cursor path follows the anchors too.
    const stops = [{ at: 0.1, x: 0, y: 0, anchor: 'approve' as const }, { at: 0.5, x: 1, y: 1, anchor: 'approve' as const, click: true }]
    const c = cursorAt(stops, 0.3, anchors)
    expect(c.x).toBeCloseTo(0.35, 5)
    expect(c.y).toBeCloseTo(0.62, 5)
  })

  it('particles scale with the frame’s height, within bounds', () => {
    expect(fxScale(900)).toBe(1)
    expect(fxScale(1440)).toBeCloseTo(1.6, 5)
    expect(fxScale(4000)).toBe(1.9)
    expect(fxScale(400)).toBe(0.8)
    const b = BURSTS[1]
    const small = burstParticles(b, b.at + 0.08, 1440, 900, [], null, 1).map((p) => p.r)
    const big = burstParticles(b, b.at + 0.08, 2560, 1440, [], null, fxScale(1440)).map((p) => p.r)
    expect(Math.max(...big)).toBeGreaterThan(Math.max(...small))
  })
})

describe('seeded', () => {
  it('is deterministic and uniform-ish', () => {
    const a = seeded(9)
    const b = seeded(9)
    const xs = Array.from({ length: 1000 }, () => a())
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs)
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length
    expect(mean).toBeGreaterThan(0.4)
    expect(mean).toBeLessThan(0.6)
  })
})
