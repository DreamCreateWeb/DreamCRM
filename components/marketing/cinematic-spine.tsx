'use client'

import { useCallback, useEffect, useRef } from 'react'
import { MONO_LABEL, DAY_WIRE } from '@/components/marketing/ui'
import { CinemaStage, CURSOR_STOPS, formatCount } from '@/components/marketing/cinema-scenes'
import {
  BURSTS,
  FX_RGB,
  MOTE_ALPHA_MAX,
  burstParticles,
  clamp01,
  countAt,
  cursorAt,
  easeOutQuad,
  fxScale,
  moteAlpha,
  seedMotes,
  stepMotes,
  type AnchorMap,
  type Mote,
  type Particle,
} from '@/components/marketing/cinema-fx'

/**
 * THE CINEMATIC SPINE — `BRAND.md` Part 6, built on Part 8 move 2
 * (DREAMCRM-70), given its four-scene picture on DREAMCRM-82, and made a
 * LIVING SHOWCASE on the owner's 2026-09-22 directive:
 *
 *   "it needs polished fx like genuine particle effects, and visual
 *    interactions, like it needs to showcase the app"
 *
 * The sequence, per Part 6: the product sits in its frame under the headline
 * → the frame grows toward full bleed while the headline fades behind it →
 * the page pins and the chapter cards scroll OVER the product one at a time,
 * with a chapter rail tracking position → after the last chapter the section
 * unpins. What is new is that the product now PLAYS each chapter while its
 * card is up — see `cinema-scenes.tsx` — and a particle layer punctuates it.
 *
 * ── THE LAWS, AND HOW THE NEW LAYERS KEEP THEM ──────────────────────────
 *
 * 1. THE STACKED LAYOUT IS THE DEFAULT, not the fallback. The server HTML is
 *    six ordinary sections, each a card and its finished picture; the pin is
 *    added by `.is-cinematic` and every pinned rule lives behind ONE media
 *    gate in `SPINE_CSS`. The canvas and the cursor ghost are `display: none`
 *    outside that gate — under reduced motion they do not exist.
 *
 * 2. ONE SCROLL POSITION DRIVES EVERYTHING. One `scroll` listener, one
 *    `getBoundingClientRect()` per frame, one normalised `p`. Every beat on
 *    the stage reads `--mkt-t` (the chapter's local progress) from the scene
 *    layer and computes its own eased state in CSS `calc()`; every burst is
 *    a pure function of the same `t` (`burstParticles`); the counters and
 *    the cursor are derived from it here. Nothing queues, nothing is a CSS
 *    transition or animation, so reversing the wheel un-does it all along
 *    the same curve with no state to unwind.
 *
 *    THE ONE TIME-DRIVEN THING is the ambient mote field (Part 6: "ambient,
 *    one loop per band"), and it is gated three ways: the cinematic class is
 *    live, the track is on screen (IntersectionObserver), and the document
 *    is visible. The loop draws the canvas; `paint` never does.
 *
 * 3. THE PIN CANNOT TRAP A KEYBOARD OR SCREEN-READER USER. `position:
 *    sticky`, no `preventDefault`, no `scrollTo`; nothing inside the pinned
 *    region is focusable (the cursor ghost and every drawn control are
 *    `<span>`s) — `tests/marketing/cinematic-spine.test.tsx` holds that.
 *
 * 4. THE POINTER IS A SECOND INPUT, NOT A SECOND CLOCK. A fine pointer over
 *    the pin parallaxes the panels by a few pixels (`--mkt-px/--mkt-py`) and
 *    the motes step aside for it. It is one `pointermove` listener writing
 *    two custom properties, it exists only under the gate, and it drives
 *    nothing the scroll position also drives.
 *
 * 5. TRANSFORM, OPACITY AND A CANVAS. The canvas is the one layer axe cannot
 *    grade, so its arithmetic is in `cinema-fx.ts`: `MOTE_ALPHA_MAX` keeps
 *    every graded ink on the stage above 4.5 under a mote, and bursts are
 *    tiny and short-lived.
 */

/** How much of the scroll the opening move (frame grows, headline fades) gets. */
export const OPEN = 0.12

/** Rest scale of the stage — the "frame under the headline" of Part 6 step 1. */
const REST_SCALE = 0.56

/** How far down the viewport the resting frame sits, in vh. */
const REST_SHIFT_VH = 15

/** How far a chapter card travels on its way in and out, in px. */
const CARD_TRAVEL = 44

/**
 * The six chapters. `rail` is the short form the indicator carries; `eyebrow`
 * is the card's own, which is the one a screen reader reads.
 *
 * `BRAND.md` Part 4, owner veto on DREAMCRM-67: there is no oversized
 * outlined numeral — the number lives here twice at reading size. Copy voice
 * is Part 5: plain, declarative, a time of day instead of an adjective, the
 * scene narrated rather than the benefit asserted. No emoji over a product
 * mock.
 */
export const CHAPTERS: ReadonlyArray<{
  n: string
  rail: string
  eyebrow: string
  title: React.ReactNode
  body: string
}> = [
  {
    n: '01',
    rail: 'THE QUEUE',
    eyebrow: 'THE MORNING QUEUE',
    title: (
      <>
        Four patients still need a text. <span className="text-violet-700">Nobody had to go looking.</span>
      </>
    ),
    body: '7:45am. One screen opens on who is in the chair, who has not confirmed, and which review landed overnight. Your front desk reads the morning in one breath.',
  },
  {
    n: '02',
    rail: 'THE TEXT',
    eyebrow: 'THE TEXT THAT BOOKS',
    title: (
      <>
        She replies <span className="text-violet-700">&ldquo;yes&rdquo;</span> and the chair fills itself.
      </>
    ),
    body: '4:12pm. Nobody at the desk picked up a phone, opened a spreadsheet, or remembered anything. The confirmation went out, came back, and landed in your PMS under its own audit trail.',
  },
  {
    n: '03',
    rail: 'THE CHAIR',
    eyebrow: 'THE CHAIR THAT FILLS ITSELF',
    title: (
      <>
        Thursday had two empty chairs. <span className="text-violet-700">The machine wrote the invitation.</span>
      </>
    ),
    body: 'Monday, 6:14am. Your Dream Team saw the gap, drafted the email in your voice, picked the 38 patients who were due, and waited for one tap. That tap is the whole job.',
  },
  {
    n: '04',
    rail: 'THE BALANCE',
    eyebrow: 'THE BALANCE THAT CLEARS',
    title: (
      <>
        The balance is paid <span className="text-violet-700">before she reaches the car.</span>
      </>
    ),
    body: 'Her portal already knew what she owed, in her own branding, on her own phone. The money moves into your bank account — not ours, and not next month.',
  },
  {
    n: '05',
    rail: 'THE REVIEW',
    eyebrow: 'THE REVIEW THAT ARRIVES',
    title: (
      <>
        The visit asks for <span className="text-violet-700">its own review.</span>
      </>
    ),
    body: 'She writes it in her own words, two days later, without anyone chasing her. You put the best ones on your website by clicking them.',
  },
  {
    n: '06',
    rail: 'THE WEEK',
    eyebrow: 'THE WEEK, SEEN',
    title: (
      <>
        Nine new patients this week, <span className="text-violet-700">and you can name where each one came from.</span>
      </>
    ),
    body: 'Friday. The numbers are receipts — every one opens the list behind it — and Monday’s summary was written before you got in. Nobody at the desk ran a report.',
  },
]

/** Scroll length of the pinned track in viewport heights. Less than one
 *  screen per chapter: each chapter is scrubbed through its beats in about
 *  0.7 of a viewport of scroll, which is long enough to read and short enough
 *  not to feel held. */
const TRACK_STEPS = 5.8

/** Ease-out, the only curve `BRAND.md` Part 6 allows on marketing. */
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t)

/**
 * WHETHER THE PINNED LAYOUT HAS ROOM FOR ITS TALLEST CHAPTER CARD — measured,
 * not assumed, because the reader's text size sets it and no media query
 * reports that. The fix for not fitting is to UN-PIN, never to make the card
 * scrollable (a scrollable region needs `tabindex="0"`, a focus stop inside
 * the pin).
 */
export function pinnedCardFits(tallestCard: number, viewportHeight: number): boolean {
  return tallestCard + CARD_TRAVEL * 2 <= viewportHeight
}

/**
 * THE FRAME FIT — how much to zoom the stage's composition so a large
 * monitor shows what a 1440x900 window shows, bigger. Width and height both
 * bound it (an ultrawide is not a taller scene) and it never shrinks below
 * 1, so the laptop layout the sequence was designed on is untouched.
 */
export function frameZoom(width: number, height: number): number {
  return Math.min(1.8, Math.max(1, Math.min(width / 1440, height / 900)))
}

/** Which scene the stage plays at normalised scroll position `p` — the same
 *  expression the rail reads, so the picture and the indicator cannot drift. */
export function sceneAt(p: number): number {
  const slot = (1 - OPEN) / CHAPTERS.length
  return Math.min(CHAPTERS.length - 1, Math.max(0, Math.floor((p - OPEN) / slot)))
}

/** A chapter's local progress at `p`: <0 before it, 0..1 during, >1 after. */
export function chapterT(p: number, i: number): number {
  const slot = (1 - OPEN) / CHAPTERS.length
  return (p - OPEN - i * slot) / slot
}

type Counter = { el: HTMLElement; from: number; to: number; b: number; d: number; format: 'int' | 'usd' | 'pct'; last: string }

/** A scene's measured anchors: in STAGE fractions (what the canvas draws
 *  in — at full bleed the stage is the pin) and in BODY fractions (what the
 *  cursor overlay translates in). Both are ratios, so the opening move's
 *  scale does not change them. */
type SceneAnchors = { stage: AnchorMap; body: AnchorMap }

const DPR_CAP = 2

export default function CinematicSpine() {
  const rootRef = useRef<HTMLElement | null>(null)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const pinRef = useRef<HTMLDivElement | null>(null)
  const introRef = useRef<HTMLDivElement | null>(null)
  const stagesRef = useRef<HTMLOListElement | null>(null)
  const railRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneRefs = useRef<Array<HTMLDivElement | null>>([])
  const cardRefs = useRef<Array<HTMLDivElement | null>>([])
  const countersRef = useRef<Counter[][]>([])
  const anchorsRef = useRef<Array<SceneAnchors | null>>([])
  const railAt = useRef(-1)
  const frame = useRef(0)

  /** What the ambient loop needs from the last paint: the scroll position
   *  and its velocity. `paint` writes these; the loop reads them. */
  const fx = useRef({
    p: 0,
    scrollV: 0,
    lastY: 0,
    lastT: 0,
    px: null as number | null,
    py: null as number | null,
    motes: [] as Mote[],
    loop: 0,
    onScreen: false,
    lastFrame: 0,
    live: false,
    w: 0,
    h: 0,
    scratch: [] as Particle[],
  })

  /**
   * ONE FRAME. One scroll read, one normalised progress value, every DOM
   * write derived from it. The canvas is NOT drawn here — see `draw`.
   */
  const paint = useCallback(() => {
    frame.current = 0
    const root = rootRef.current
    const track = trackRef.current
    if (!root || !track) return
    if (!root.classList.contains('is-cinematic')) return

    const rect = track.getBoundingClientRect()
    const travel = rect.height - window.innerHeight
    const p = travel > 0 ? clamp01(-rect.top / travel) : 0
    const s = fx.current
    const now = performance.now()
    if (s.lastT) {
      const dt = Math.max(1, now - s.lastT) / 1000
      // Instantaneous scroll velocity in px/s, lightly smoothed.
      s.scrollV = s.scrollV * 0.5 + ((window.scrollY - s.lastY) / dt) * 0.5
    }
    s.lastY = window.scrollY
    s.lastT = now
    s.p = p

    // ── The opening move: the frame grows, the headline fades behind it.
    const open = easeOut(clamp01(p / OPEN))
    const stages = stagesRef.current
    if (stages) {
      stages.style.setProperty('--mkt-ss', String(REST_SCALE + (1 - REST_SCALE) * open))
      stages.style.setProperty('--mkt-sy', String(REST_SHIFT_VH * (1 - open)))
    }
    const intro = introRef.current
    if (intro) {
      intro.style.setProperty('--mkt-io', String(1 - clamp01(p / (OPEN * 0.85))))
      intro.style.setProperty('--mkt-iy', String(-18 * open))
    }

    // ── The chapters: each one a slot of the scroll, over the pinned product.
    for (let i = 0; i < CHAPTERS.length; i++) {
      const t = chapterT(p, i)

      // THE SCENE BEHIND THIS CHAPTER rises to 1 on arrival and STAYS: every
      // scene paints an opaque canvas, so the next fades in ON TOP. Scene 0
      // is the base the opening move grows to full bleed.
      const scene = sceneRefs.current[i]
      if (scene) {
        scene.style.setProperty('--mkt-so', String(i === 0 ? 1 : t <= 0 ? 0 : t < 0.2 ? easeOut(t / 0.2) : 1))
        // The chapter's local progress, which every beat on the stage reads.
        // Written for EVERY scene every frame (six cheap writes), never only
        // the neighbours: a fast wheel can carry a scene from "not yet" to
        // "long gone" in one frame, and a scene skipped that way would hold
        // a half-played picture under the next chapter's fade.
        {
          scene.style.setProperty('--mkt-t', String(clamp01(t)))
          const stops = CURSOR_STOPS[i]
          if (stops) {
            const c = cursorAt(stops, clamp01(t), anchorsRef.current[i]?.body ?? null)
            scene.style.setProperty('--mkt-cx', String(c.x))
            scene.style.setProperty('--mkt-cy', String(c.y))
            scene.style.setProperty('--mkt-cp', String(c.press))
            scene.style.setProperty('--mkt-cv', c.visible ? '1' : '0')
          }
          for (const k of countersRef.current[i] ?? []) {
            const n = countAt(k.from, k.to, easeOutQuad(clamp01((clamp01(t) - k.b) / k.d)))
            const text = formatCount(n, k.format)
            if (text !== k.last) {
              k.last = text
              k.el.textContent = text
            }
          }
        }
      }

      const card = cardRefs.current[i]
      if (!card) continue
      let o: number
      let y: number
      if (t <= 0) {
        o = 0
        y = CARD_TRAVEL
      } else if (t < 0.22) {
        const e = easeOut(t / 0.22)
        o = e
        y = CARD_TRAVEL * (1 - e)
      } else if (t < 0.8 || i === CHAPTERS.length - 1) {
        // ARRIVED, and dead still: "a chapter card's copy is static once the
        // card has arrived". The last chapter holds to the end of the track.
        o = 1
        y = 0
      } else if (t < 1) {
        const e = easeOut((t - 0.8) / 0.2)
        o = 1 - e
        y = -CARD_TRAVEL * e
      } else {
        o = 0
        y = -CARD_TRAVEL
      }
      card.style.setProperty('--mkt-co', String(o))
      card.style.setProperty('--mkt-cy', String(y))
      card.style.setProperty('--mkt-prog', String(clamp01(t)))
    }

    // ── The rail: which chapter the reader is in.
    const rail = railRef.current
    if (rail) {
      rail.style.setProperty('--mkt-ro', String(easeOut(clamp01((p - OPEN * 0.6) / (OPEN * 0.4)))))
      const at = sceneAt(p)
      if (at !== railAt.current) {
        railAt.current = at
        rail.dataset.active = String(at)
      }
    }
  }, [])

  /**
   * THE CANVAS, once per animation frame while the pin is live and on screen.
   * Motes step on time; bursts are read off the last scroll position.
   */
  const draw = useCallback((now: number) => {
    const s = fx.current
    s.loop = 0
    const canvas = canvasRef.current
    if (!canvas || !s.live || !s.onScreen) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dt = s.lastFrame ? (now - s.lastFrame) / 1000 : 0.016
    s.lastFrame = now
    // Velocity decays between scroll events, so a stopped wheel stops pushing.
    s.scrollV *= 0.86

    const w = s.w
    const h = s.h
    if (w === 0 || h === 0) return
    stepMotes(s.motes, dt, { w, h, scrollV: s.scrollV, px: s.px, py: s.py }, now)

    ctx.clearRect(0, 0, w, h)

    // Only past the opening move: at rest the frame is small and the motes
    // would hang in the white around it.
    const open = clamp01((s.p - OPEN * 0.7) / (OPEN * 0.3))
    if (open > 0) {
      for (const m of s.motes) {
        const [r, g, b] = FX_RGB[m.hue]
        const a = Math.min(MOTE_ALPHA_MAX, moteAlpha(m, now) * open)
        const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r)
        grad.addColorStop(0, `rgba(${r},${g},${b},${a})`)
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Bursts: pure functions of the chapter's local progress, from the
    // measured element they belong to, sized to the frame.
    const scale = fxScale(h)
    for (const b of BURSTS) {
      const t = chapterT(s.p, b.scene)
      const parts = burstParticles(b, t, w, h, s.scratch, anchorsRef.current[b.scene]?.stage ?? null, scale)
      for (const q of parts) {
        const [r, g, bl] = FX_RGB[q.hue]
        ctx.fillStyle = `rgba(${r},${g},${bl},${q.a})`
        ctx.strokeStyle = `rgba(255,255,255,${q.a * 0.9})`
        ctx.lineWidth = 1
        if (q.kind === 'sparks') {
          ctx.save()
          ctx.translate(q.x, q.y)
          ctx.rotate(Math.atan2(q.y - b.y * h, q.x - b.x * w))
          ctx.fillRect(-q.r * 3, -q.r / 2, q.r * 6, q.r)
          ctx.restore()
        } else if (q.kind === 'stars') {
          ctx.save()
          ctx.translate(q.x, q.y)
          ctx.rotate(q.rot)
          ctx.beginPath()
          for (let i = 0; i < 10; i++) {
            const rad = i % 2 === 0 ? q.r * 1.6 : q.r * 0.7
            const ang = (Math.PI / 5) * i - Math.PI / 2
            ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad)
          }
          ctx.closePath()
          ctx.fill()
          ctx.restore()
        } else {
          ctx.beginPath()
          ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2)
          ctx.fill()
          if (q.kind === 'bubbles' || q.kind === 'coins') ctx.stroke()
        }
      }
    }

    s.loop = requestAnimationFrame(draw)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    const pin = pinRef.current
    const track = trackRef.current
    if (!root || !pin || !track) return
    const s = fx.current

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')

    /** Whether the pin is legal here, per `BRAND.md` Parts 6 and 10 — a fine
     *  pointer (the touch test), a wide enough window, and a height floor
     *  (760: header lane + the tallest scene's panels + the card). */
    const legal = () => !reduced.matches && fine.matches && window.innerWidth >= 1024 && window.innerHeight >= 760

    const fits = () => {
      // The glass is zoomed on a large frame, and `offsetHeight` reports the
      // un-zoomed layout box — so the VISUAL height is that times the zoom.
      const zoom = frameZoom(window.innerWidth, window.innerHeight)
      let tallest = 0
      for (const card of cardRefs.current) if (card && card.offsetHeight * zoom > tallest) tallest = card.offsetHeight * zoom
      return pinnedCardFits(tallest, window.innerHeight)
    }

    // The counters, read once from the markup.
    countersRef.current = sceneRefs.current.map((scene) => {
      if (!scene) return []
      return Array.from(scene.querySelectorAll<HTMLElement>('[data-count-to]')).map((el) => ({
        el,
        from: Number(el.dataset.countFrom ?? 0),
        to: Number(el.dataset.countTo ?? 0),
        b: Number(el.dataset.countB ?? 0),
        d: Number(el.dataset.countD ?? 0.2),
        format: (el.dataset.countFormat as Counter['format']) ?? 'int',
        last: el.textContent ?? '',
      }))
    })

    /**
     * MEASURE THE ANCHORS — where each scene actually put the button, the
     * bubble, the switch — as fractions of the stage and of the stage body.
     * The first version carried coordinates measured once at 1440x900, and
     * the owner's 32" monitor put the sparks a panel away from the button:
     * the panels have fixed widths, so a fraction of the frame is not a
     * fraction of the layout. Measured here on mount, on resize and once
     * the fonts settle, with every scene's `--mkt-t` forced to 1 so the
     * beats sit where they FINISH (a beat mid-rise is 14px off). `paint`
     * writes the real `--mkt-t` back on the next frame.
     */
    const measureAnchors = () => {
      const out: Array<SceneAnchors | null> = []
      for (const scene of sceneRefs.current) {
        if (!scene) {
          out.push(null)
          continue
        }
        scene.style.setProperty('--mkt-t', '1')
        const stage = scene.querySelector<HTMLElement>('.mkt-stage')
        const body = scene.querySelector<HTMLElement>('.mkt-stage-body')
        if (!stage || !body) {
          out.push(null)
          continue
        }
        const sr = stage.getBoundingClientRect()
        const br = body.getBoundingClientRect()
        if (sr.width === 0 || sr.height === 0 || br.width === 0 || br.height === 0) {
          out.push(null)
          continue
        }
        const stageMap: Record<string, AnchorMap[string]> = {}
        const bodyMap: Record<string, AnchorMap[string]> = {}
        for (const el of Array.from(scene.querySelectorAll<HTMLElement>('[data-anchor]'))) {
          const name = el.dataset.anchor
          if (!name) continue
          const r = el.getBoundingClientRect()
          if (r.width === 0 && r.height === 0) continue
          stageMap[name] = { x: (r.left - sr.left) / sr.width, y: (r.top - sr.top) / sr.height, w: r.width / sr.width, h: r.height / sr.height }
          bodyMap[name] = { x: (r.left - br.left) / br.width, y: (r.top - br.top) / br.height, w: r.width / br.width, h: r.height / br.height }
        }
        out.push({ stage: stageMap, body: bodyMap })
      }
      anchorsRef.current = out
    }

    const sizeCanvas = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1)
      s.w = pin.clientWidth
      s.h = pin.clientHeight
      // Written on resize only — a layout token, never a per-frame one.
      pin.style.setProperty('--mkt-zoom', frameZoom(s.w, s.h).toFixed(3))
      canvas.width = Math.round(s.w * dpr)
      canvas.height = Math.round(s.h * dpr)
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (s.motes.length === 0) s.motes = seedMotes(s.w, s.h)
    }

    const startLoop = () => {
      if (!s.loop && s.live && s.onScreen) {
        s.lastFrame = 0
        s.loop = requestAnimationFrame(draw)
      }
    }
    const stopLoop = () => {
      if (s.loop) cancelAnimationFrame(s.loop)
      s.loop = 0
    }

    const sync = () => {
      const eligible = legal()
      root.classList.toggle('is-cinematic', eligible)
      const on = eligible && fits()
      if (on !== eligible) root.classList.toggle('is-cinematic', on)

      if (on) {
        sizeCanvas()
        measureAnchors()
      }
      if (on === s.live) {
        if (on) paint()
        return
      }
      s.live = on
      if (on) {
        paint()
        startLoop()
      } else {
        stopLoop()
        // Back to the stacked layout: drop every custom property this
        // component wrote, and put every counter back on its final value.
        for (const el of [introRef.current, stagesRef.current, railRef.current, pin, ...sceneRefs.current, ...cardRefs.current]) {
          if (!el) continue
          for (const prop of ['--mkt-ss', '--mkt-sy', '--mkt-io', '--mkt-iy', '--mkt-so', '--mkt-co', '--mkt-cy', '--mkt-ro', '--mkt-t', '--mkt-cx', '--mkt-cp', '--mkt-cv', '--mkt-prog', '--mkt-px', '--mkt-py']) {
            el.style.removeProperty(prop)
          }
        }
        for (const list of countersRef.current) {
          for (const k of list) {
            k.last = formatCount(k.to, k.format)
            k.el.textContent = k.last
          }
        }
        railAt.current = -1
        delete root.dataset.active
      }
    }

    const onScroll = () => {
      if (frame.current) return
      frame.current = requestAnimationFrame(paint)
    }

    // The pointer: parallax + the motes stepping aside. Fine pointers only —
    // the gate already excludes coarse ones from the pin.
    const onPointerMove = (e: PointerEvent) => {
      if (!s.live || e.pointerType !== 'mouse') return
      const r = pin.getBoundingClientRect()
      s.px = e.clientX - r.left
      s.py = e.clientY - r.top
      pin.style.setProperty('--mkt-px', String(((s.px / r.width) * 2 - 1).toFixed(3)))
      pin.style.setProperty('--mkt-py', String(((s.py / r.height) * 2 - 1).toFixed(3)))
    }
    const onPointerLeave = () => {
      s.px = null
      s.py = null
      pin.style.setProperty('--mkt-px', '0')
      pin.style.setProperty('--mkt-py', '0')
    }

    // The ambient loop runs only while the track is on screen.
    const io = new IntersectionObserver(
      (entries) => {
        s.onScreen = entries.some((en) => en.isIntersecting)
        if (s.onScreen) startLoop()
        else stopLoop()
      },
      { threshold: 0 },
    )
    io.observe(track)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stopLoop()
      else startLoop()
    }

    sync()
    // Web fonts arriving after mount reflow the stage; measure again once.
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts
    let fontsSettled = true
    if (fonts?.ready) {
      fontsSettled = false
      fonts.ready.then(() => {
        fontsSettled = true
        if (s.live) {
          measureAnchors()
          paint()
        }
      })
    }
    void fontsSettled
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', sync)
    reduced.addEventListener('change', sync)
    fine.addEventListener('change', sync)
    pin.addEventListener('pointermove', onPointerMove, { passive: true })
    pin.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      stopLoop()
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', sync)
      reduced.removeEventListener('change', sync)
      fine.removeEventListener('change', sync)
      pin.removeEventListener('pointermove', onPointerMove)
      pin.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      root.classList.remove('is-cinematic')
    }
  }, [paint, draw])

  return (
    <section ref={rootRef} className="mkt-spine relative" aria-labelledby="spine-title">
      <div ref={trackRef} className="mkt-spine-track" style={{ '--mkt-spine-steps': TRACK_STEPS } as React.CSSProperties}>
        <div ref={pinRef} className="mkt-spine-pin">
          {/* ── Step 1: the headline the product sits under. No link in it —
                 see law 3. ── */}
          <div ref={introRef} className="mkt-spine-intro">
            <p className={`mb-3 text-teal-700 ${MONO_LABEL}`}>What it feels like</p>
            <h2
              id="spine-title"
              className="text-[1.85rem] font-bold leading-[1.08] tracking-[-0.02em] text-gray-950 sm:text-[2.4rem] lg:text-[3.1rem]"
            >
              A Tuesday that runs itself
              <br />
              is the whole product.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[1rem] leading-relaxed text-gray-600">
              Keep scrolling. The screen below is the real thing, and six moments of an ordinary week
              happen on top of it — at the speed of your own hand.
            </p>
          </div>

          {/* ── The chapters: each one a card AND the picture it narrates.
                 Stacked (the base): six sections top to bottom. Pinned: six
                 full-viewport layers in chapter order. Each scene is
                 `aria-hidden` (the card carries every word) and NOT in
                 `DECORATIVE_MOCKS`, so axe grades every pair inside it. ── */}
          <ol ref={stagesRef} className="mkt-spine-cards">
            {CHAPTERS.map((c, i) => (
              <li key={c.n} className="mkt-spine-card">
                <div
                  ref={(el) => {
                    cardRefs.current[i] = el
                  }}
                  className="mkt-spine-card-glass"
                >
                  <p className={`text-violet-700 ${MONO_LABEL}`}>
                    {c.n} · {c.eyebrow}
                  </p>
                  <h3 className="mt-4 text-[1.5rem] font-bold leading-[1.12] tracking-[-0.02em] text-gray-950 sm:text-[1.9rem]">
                    {c.title}
                  </h3>
                  <p className="mt-4 text-[1rem] leading-relaxed text-gray-600">{c.body}</p>
                </div>
                <div
                  ref={(el) => {
                    sceneRefs.current[i] = el
                  }}
                  className="mkt-spine-stage"
                  aria-hidden="true"
                >
                  <CinemaStage scene={i} />
                </div>
              </li>
            ))}
          </ol>

          {/* ── The particle layer: between the scenes and the cards, so a
                 burst never crosses the copy a reader is reading. Exists only
                 under the gate. ── */}
          {/* `role="presentation"` rather than `aria-hidden`: jsx-a11y counts a
                 canvas among the focusable elements, and the canvas is empty of
                 content in every tree anyway — it paints only. */}
          <canvas ref={canvasRef} className="mkt-fx" role="presentation" />

          {/* ── The chapter rail. A position indicator, not navigation, and
                 `aria-hidden` because every word in it is already in the card
                 eyebrow. Hand-graded (BRAND.md Part 7). ── */}
          <div ref={railRef} className="mkt-spine-rail" data-active="0" aria-hidden="true">
            <ol className="mkt-spine-rail-list" style={{ borderColor: DAY_WIRE }}>
              {CHAPTERS.map((c) => (
                <li key={c.n} className={`mkt-spine-rail-item ${MONO_LABEL}`}>
                  <span className="mkt-spine-rail-label">
                    {c.n} · {c.rail}
                  </span>
                  <span className="mkt-spine-rail-dot" />
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* ── Step 4: release. Ordinary page content again, and the only
             focusable thing the section owns. ── */}
      <div className="mx-auto max-w-6xl px-4 pb-4 pt-12 text-center sm:px-6 lg:pt-16">
        <a
          href="/why"
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-[0.92rem] font-semibold text-gray-800 transition-all hover:-translate-y-px hover:border-gray-400 hover:shadow-sm"
        >
          What this platform believes
        </a>
      </div>
    </section>
  )
}
