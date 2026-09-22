/**
 * THE LIVING STAGE'S PURE HALF — the particle and beat mathematics behind the
 * homepage's cinematic spine (`BRAND.md` Part 6, amended 2026-09-22 on the
 * owner's directive: "it needs polished fx like genuine particle effects, and
 * visual interactions, it needs to showcase the app").
 *
 * No React, no DOM, no timers: every function here is a pure function of its
 * inputs, which is what lets `cinematic-spine.tsx` keep Part 6's law that ONE
 * scroll position drives everything. A burst is not an animation that plays
 * when a beat is reached — it is a picture of where its particles ARE at the
 * chapter's local progress `t`, so reversing the wheel un-bursts it along the
 * same curve and nothing is left running that the reader scrolled away from.
 *
 * The one thing that runs on time rather than on scroll is the AMBIENT layer
 * (`stepMotes`): a handful of large, soft bokeh circles drifting on the stage.
 * Part 6 allows exactly that class ("ambient, one loop per band"), and the
 * spine only steps it while the pin is on screen and the cinematic class is
 * live — under reduced motion the whole layer does not exist.
 *
 * THE CONTRAST LAW IS ARITHMETIC HERE, NOT A HOPE. The motes drift UNDER
 * nothing — the canvas sits above the stage's panels — so a mote can cross a
 * panel's text. `MOTE_ALPHA_MAX` is the ceiling that keeps every graded pair
 * on the stage legal underneath one: at 0.12 the darkest tint this file uses
 * (violet-700) walks a white ground to ~#ECE9FC, where the stage's body ink
 * (gray-600, #4C5A78) still measures 5.8 and its display ink (gray-950) 14.8.
 * Two motes overlapping (0.24 worst case) leave gray-600 at 4.7 — still above
 * 4.5 — and the sizes below make a triple overlap geometrically rare. Burst
 * particles are brighter but tiny (≤ 7px) and live for a fraction of a
 * chapter; they never form a ground under a run of glyphs.
 */

/* ── Beats ──────────────────────────────────────────────────────────────── */

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Quadratic ease-out — the same curve the scene CSS computes in `calc()`
 *  (`k * (2 - k)`), so a JS-driven beat and a CSS-driven one land together. */
export const easeOutQuad = (k: number): number => k * (2 - k)

/**
 * Where a beat is at local chapter progress `t`: 0 before it starts at `b`,
 * 1 once it has run for `d`, eased in between. Pure, monotonic in `t`.
 */
export function beatK(t: number, b: number, d: number): number {
  if (d <= 0) return t >= b ? 1 : 0
  return easeOutQuad(clamp01((t - b) / d))
}

/** A number counting from `from` to `to` — living data, never text. */
export function countAt(from: number, to: number, k: number): number {
  return Math.round(from + (to - from) * clamp01(k))
}

/* ── Seeded randomness ──────────────────────────────────────────────────── */

/** mulberry32 — small, fast, deterministic. A burst has to look the same on
 *  the way back down as it did on the way up. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ── Palette (decoration only — never ink) ──────────────────────────────── */

export type FxHue = 'teal' | 'violet' | 'fuchsia' | 'emerald' | 'amber'

/** Luminous steps of the brand ramps. These paint PARTICLES, which carry no
 *  text, so the "white text starts at teal-600" rule does not apply — and
 *  they are the steps that read as light rather than as ink. */
export const FX_RGB: Record<FxHue, readonly [number, number, number]> = {
  teal: [124, 165, 255], // teal-400
  violet: [139, 120, 240], // violet-400
  fuchsia: [232, 121, 249], // fuchsia-400
  emerald: [52, 211, 153], // emerald-400
  amber: [251, 191, 36], // amber-400
}

/* ── Ambient motes ──────────────────────────────────────────────────────── */

/** The sticky site header's lane at the top of the pinned frame (5.5rem in
 *  `SPINE_CSS`); motes never spawn or drift into it, so the stage's own
 *  chrome line keeps a clean ground. */
export const HEADER_BAND_PX = 88

/** See the file header for the arithmetic behind this number. */
export const MOTE_ALPHA_MAX = 0.12

export const MOTE_COUNT = 18

export interface Mote {
  x: number
  y: number
  /** Radius, px. Large and soft: bokeh, not confetti. */
  r: number
  hue: FxHue
  vx: number
  vy: number
  /** Per-mote phase so the alpha breathing is not in lockstep. */
  phase: number
  /** Resting alpha, ≤ MOTE_ALPHA_MAX. */
  a: number
}

const MOTE_HUES: readonly FxHue[] = ['teal', 'violet', 'fuchsia', 'teal', 'violet']

export function seedMotes(w: number, h: number, seed = 7, n = MOTE_COUNT): Mote[] {
  const rng = seeded(seed)
  const out: Mote[] = []
  for (let i = 0; i < n; i++) {
    out.push({
      x: rng() * w,
      y: HEADER_BAND_PX + rng() * Math.max(1, h - HEADER_BAND_PX),
      r: (40 + rng() * 80) * fxScale(h),
      hue: MOTE_HUES[i % MOTE_HUES.length],
      vx: (rng() - 0.5) * 12,
      vy: -6 - rng() * 10,
      phase: rng() * Math.PI * 2,
      a: MOTE_ALPHA_MAX * (0.55 + rng() * 0.45),
    })
  }
  return out
}

export interface MoteField {
  w: number
  h: number
  /** Scroll velocity, px per second — a fast wheel pushes the field. */
  scrollV: number
  /** Pointer position in px, or null when there is no fine pointer over the stage. */
  px: number | null
  py: number | null
}

/**
 * One tick of the ambient field. Drift up and sideways, sway, wrap at the
 * edges, get pushed by scroll velocity, and step aside for the pointer.
 * Mutates in place (this runs every frame; allocating is the enemy).
 */
export function stepMotes(motes: Mote[], dtSeconds: number, f: MoteField, now: number): void {
  const dt = Math.min(dtSeconds, 0.05)
  const push = clamp01(Math.abs(f.scrollV) / 2400) * Math.sign(f.scrollV) * -140
  for (const m of motes) {
    const sway = Math.sin(now * 0.00035 + m.phase) * 6
    m.x += (m.vx + sway) * dt
    m.y += (m.vy + push) * dt
    if (f.px != null && f.py != null) {
      const dx = m.x - f.px
      const dy = m.y - f.py
      const d2 = dx * dx + dy * dy
      const reach = 160 + m.r
      if (d2 < reach * reach && d2 > 1) {
        const d = Math.sqrt(d2)
        const force = ((reach - d) / reach) * 90 * dt
        m.x += (dx / d) * force
        m.y += (dy / d) * force
      }
    }
    // Wrap, keeping the header lane clear.
    if (m.y < HEADER_BAND_PX - m.r) m.y = f.h + m.r
    if (m.y > f.h + m.r) m.y = HEADER_BAND_PX + m.r
    if (m.x < -m.r) m.x = f.w + m.r
    if (m.x > f.w + m.r) m.x = -m.r
  }
}

/** The alpha a mote paints at `now` — breathing gently around its rest. */
export function moteAlpha(m: Mote, now: number): number {
  const breath = 0.8 + 0.2 * Math.sin(now * 0.0009 + m.phase)
  return Math.min(MOTE_ALPHA_MAX, m.a * breath)
}

/* ── Bursts ─────────────────────────────────────────────────────────────── */

export type BurstKind = 'bubbles' | 'sparks' | 'stars' | 'coins'

export interface BurstDef {
  /** Which scene (chapter index) it belongs to. */
  scene: number
  /** Local chapter progress at which it fires, 0..1. */
  at: number
  /** Origin, as a fraction of the stage's width and height — the FALLBACK
   *  when the anchor below cannot be measured. */
  x: number
  y: number
  /** The element the burst comes from (`data-anchor` in the scene markup),
   *  and where inside its box: `ax`/`ay` as fractions of the box (0.5, 0.5
   *  is its centre). Measured at runtime, so a 32" monitor and a laptop
   *  both put the sparks on the button. */
  anchor?: string
  ax?: number
  ay?: number
  kind: BurstKind
  hue: FxHue
  n: number
  seed: number
}

/** A measured element, as fractions of the frame it will be drawn in. */
export interface AnchorBox {
  x: number
  y: number
  w: number
  h: number
}
export type AnchorMap = Readonly<Record<string, AnchorBox>>

/** Where a burst starts, in frame fractions: the anchor when it was measured,
 *  the fallback otherwise. */
export function burstOrigin(b: BurstDef, anchors: AnchorMap | null): { x: number; y: number } {
  const a = b.anchor && anchors ? anchors[b.anchor] : undefined
  if (!a) return { x: b.x, y: b.y }
  return { x: a.x + a.w * (b.ax ?? 0.5), y: a.y + a.h * (b.ay ?? 0.5) }
}

/**
 * How much bigger the particles and their travel should be on a larger
 * frame: 1 at the 900px-tall frame they were designed on, growing with the
 * frame's height and clamped so a 4K monitor gets bigger sparks rather than
 * a blizzard. Height, not width — an ultrawide is not a bigger scene.
 */
export function fxScale(frameHeight: number): number {
  return Math.min(1.9, Math.max(0.8, frameHeight / 900))
}

/** How much of a chapter's scroll a burst lives for. Short: a burst is a
 *  punctuation mark on a beat, not a weather system. */
export const BURST_LIFE = 0.16

export interface Particle {
  x: number
  y: number
  /** Radius / half-size, px. */
  r: number
  a: number
  /** Rotation, radians — stars and coins spin. */
  rot: number
  hue: FxHue
  kind: BurstKind
}

/**
 * The particles of one burst at local progress `t`, in stage pixels. Empty
 * before the beat and after its life. Each particle's whole path is a
 * function of `(t - at)` and a seeded draw, so the picture at any `t` is
 * the same on the way down as on the way up.
 */
export function burstParticles(
  b: BurstDef,
  t: number,
  w: number,
  h: number,
  out: Particle[] = [],
  anchors: AnchorMap | null = null,
  scale = 1,
): Particle[] {
  out.length = 0
  const life = (t - b.at) / BURST_LIFE
  if (life <= 0 || life >= 1) return out
  const rng = seeded(b.seed)
  const o = burstOrigin(b, anchors)
  const ox = o.x * w
  const oy = o.y * h
  const e = easeOutQuad(life)
  const fade = 1 - life * life
  for (let i = 0; i < b.n; i++) {
    const ang = rng() * Math.PI * 2
    const speed = (40 + rng() * 110) * scale
    const size = (b.kind === 'sparks' ? 1.5 + rng() * 2 : 2.5 + rng() * 4.5) * scale
    const spin = (rng() - 0.5) * 6
    const lift = (b.kind === 'bubbles' ? -60 : b.kind === 'coins' ? 30 : 0) * scale
    const dist = speed * e
    out.push({
      x: ox + Math.cos(ang) * dist,
      y: oy + Math.sin(ang) * dist + lift * e + (b.kind === 'coins' ? 90 * scale * life * life : 0),
      r: size * (b.kind === 'bubbles' ? 1 + e * 0.6 : 1 - life * 0.5),
      a: fade * (b.kind === 'bubbles' ? 0.42 : 0.9),
      rot: spin * e,
      hue: b.hue,
      kind: b.kind,
    })
  }
  return out
}

/**
 * THE BURST SCRIPT — one per beat that earns punctuation. Coordinates are
 * fractions of the stage frame and point at where the scene puts the thing
 * that just happened (the reply bubble, the paid chip, the fifth star). They
 * are approximate by design: a burst is a glow around a moment, not a
 * hit-tested overlay, and a scene reflowing a few pixels must not need this
 * table edited.
 */
export const BURSTS: readonly BurstDef[] = [
  // 01 · the texts are queued — the pill that says so
  { scene: 0, at: 0.64, x: 0.68, y: 0.17, anchor: 'queued', kind: 'sparks', hue: 'emerald', n: 16, seed: 11 },
  // 02 · her "yes" lands — the top-right corner of the reply bubble
  { scene: 1, at: 0.44, x: 0.8, y: 0.34, anchor: 'reply', ax: 0.95, ay: 0.05, kind: 'bubbles', hue: 'violet', n: 24, seed: 21 },
  // 03 · the machine's card is approved — the Approve button
  { scene: 2, at: 0.57, x: 0.385, y: 0.51, anchor: 'approve', kind: 'sparks', hue: 'teal', n: 36, seed: 33 },
  // 04 · paid — the phone's Pay button
  { scene: 3, at: 0.48, x: 0.79, y: 0.33, anchor: 'pay', ax: 0.5, ay: 0.3, kind: 'coins', hue: 'amber', n: 18, seed: 44 },
  // 05 · five stars — the star row's right end
  { scene: 4, at: 0.4, x: 0.5, y: 0.19, anchor: 'stars', ax: 0.9, ay: 0.5, kind: 'stars', hue: 'fuchsia', n: 28, seed: 55 },
  // 06 · the week, seen — where the line reaches this week
  { scene: 5, at: 0.54, x: 0.8, y: 0.24, anchor: 'spark', ax: 1, ay: 0.12, kind: 'bubbles', hue: 'teal', n: 22, seed: 66 },
]

/** Every burst that has particles at scene `scene`, progress `t`. */
export function activeBursts(scene: number, t: number): BurstDef[] {
  return BURSTS.filter((b) => b.scene === scene && t > b.at && t < b.at + BURST_LIFE)
}

/* ── The cursor ghost ───────────────────────────────────────────────────── */

/**
 * Where the drawn cursor is at local progress `t`: a path of waypoints in
 * stage fractions, each reached at its `at`, with an ease between. Pure, so
 * the ghost walks back along the same path when the reader scrolls up.
 */
export interface CursorStop {
  at: number
  /** Fallback position, as fractions of the stage body. */
  x: number
  y: number
  /** The element to go to (`data-anchor`), a point inside its box (`ax`/`ay`
   *  fractions, centre by default) and an offset from there in body
   *  fractions — a stop that approaches the button from below-right is
   *  `{ anchor: 'approve', dx: 0.12, dy: 0.18 }`. */
  anchor?: string
  ax?: number
  ay?: number
  dx?: number
  dy?: number
  /** The stop is a click — the ring pulses here. */
  click?: boolean
}

/** A stop's position, in body fractions, given what was measured. */
export function stopPoint(s: CursorStop, anchors: AnchorMap | null): { x: number; y: number } {
  const a = s.anchor && anchors ? anchors[s.anchor] : undefined
  if (!a) return { x: s.x, y: s.y }
  return { x: a.x + a.w * (s.ax ?? 0.5) + (s.dx ?? 0), y: a.y + a.h * (s.ay ?? 0.5) + (s.dy ?? 0) }
}

export function cursorAt(
  stops: readonly CursorStop[],
  t: number,
  anchors: AnchorMap | null = null,
): { x: number; y: number; press: number; visible: boolean } {
  if (stops.length === 0) return { x: 0, y: 0, press: 0, visible: false }
  const p0 = stopPoint(stops[0], anchors)
  if (t < stops[0].at) return { x: p0.x, y: p0.y, press: 0, visible: false }
  let i = 0
  while (i < stops.length - 1 && t >= stops[i + 1].at) i++
  const a = stops[i]
  const b = stops[i + 1]
  const pa = stopPoint(a, anchors)
  if (!b) return { x: pa.x, y: pa.y, press: a.click ? 1 : 0, visible: t < a.at + 0.3 }
  const pb = stopPoint(b, anchors)
  const k = easeOutQuad(clamp01((t - a.at) / (b.at - a.at)))
  // A click "presses" for a short window after arrival at a click stop.
  const press = a.click ? 1 - clamp01((t - a.at) / 0.06) : 0
  return { x: pa.x + (pb.x - pa.x) * k, y: pa.y + (pb.y - pa.y) * k, press, visible: true }
}
