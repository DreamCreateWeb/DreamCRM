import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TONE_PILL, TONE_TEXT, type Tone } from '@/lib/ui/encodings'

/**
 * THE SOURCE-LEVEL CONTRAST GUARD — the one the repo did not have.
 *
 * `tests/a11y/legibility-floor.test.ts` enforces the 12px SIZE floor.
 * `pnpm lint` (jsx-a11y) is static and structurally cannot see colour at all.
 * The runtime axe checks (e2e/axe.ts) DO measure contrast, but only at the 35
 * stops the browser suite happens to walk, only for the states those specs put
 * on screen, and they cost a full E2E run. Nothing anywhere read the design
 * system's own numbers and asked whether they clear 4.5:1 — which is how 176
 * `color-contrast` violations accumulated quietly, and why several of them sat
 * at 4.48–4.49 against a 4.5 requirement: a palette picked by eye passes every
 * gate that never looks.
 *
 * This test computes them. It reads the REAL values from the two files that
 * define them — this repo's `app/css/style.css` for the semantic tokens and
 * the re-tinted ramps, and Tailwind's own `theme.css` for the ramps the app
 * does not override — so it follows a token edit or a Tailwind upgrade instead
 * of pinning a copy that goes stale. Every ratio below is derived, none is
 * transcribed.
 *
 * WHAT IT DOES NOT COVER, so nobody mistakes it for a full contrast gate:
 * only the pairs the design system DECLARES — a semantic ink on a semantic
 * surface, and a tone's ink on that tone's own wash. It cannot see a component
 * that puts `text-gray-400` on a photo, or a dark band hand-built inside a
 * light page (the marketing footer's headings were exactly that, and axe found
 * them, not this). Runtime checks stay the backstop for composition; this is
 * the guard for the palette itself.
 */

const ROOT = resolve(__dirname, '../..')
const AA = 4.5

/* ── colour maths (independent of lib/clinic-site-theme on purpose) ───────── */

function lin(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}
function luminance([r, g, b]: Rgb): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
/** Composite `fg` at `alpha` over `bg` — what a `/15` wash actually paints. */
function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => alpha * fg[i] + (1 - alpha) * bg[i]) as Rgb
}

type Rgb = [number, number, number]

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb
}

/**
 * oklch() → sRGB, the same conversion the browser does.
 *
 * Tailwind 4 defines its ramps in oklch and emits a clamped hex only inside an
 * `@supports not (color: oklch(…))` fallback, so the hex in the compiled sheet
 * is NOT the colour a current browser paints — amber-700 ships as
 * `oklch(0.555 0.163 48.998)`, which resolves to #bb4d00, while the fallback
 * says #b75000. axe measures the rendered one. Reading the fallback would have
 * this guard quietly grading a different palette than the one on screen.
 */
function oklchToRgb(L: number, C: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3]
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return linear.map((v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(c * 255)))
  }) as Rgb
}

function parseColor(value: string): Rgb | null {
  const v = value.trim()
  if (/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(v)) return hexToRgb(v)
  const ok = v.match(/^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)/i)
  if (ok) {
    const L = ok[1].endsWith('%') ? parseFloat(ok[1]) / 100 : parseFloat(ok[1])
    return oklchToRgb(L, parseFloat(ok[2]), parseFloat(ok[3]))
  }
  return null // rgb(… / alpha) hairlines and the like — not text pairs
}

/* ── the two files that define the palette ───────────────────────────────── */

function collect(css: string, block?: RegExp): Map<string, Rgb> {
  const scope = block ? (css.match(block)?.[0] ?? '') : css
  const out = new Map<string, Rgb>()
  const re = /--color-([a-z0-9-]+)\s*:\s*([^;]+);/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(scope)) !== null) {
    const rgb = parseColor(m[2])
    if (rgb) out.set(m[1], rgb)
  }
  return out
}

const APP_CSS = readFileSync(resolve(ROOT, 'app/css/style.css'), 'utf8')
const TAILWIND_CSS = readFileSync(
  require.resolve('tailwindcss/theme.css', { paths: [ROOT] }),
  'utf8',
)

/** Tailwind's ramps, then the app's `@theme` on top (the app wins), then
 *  `.dark`'s overrides for the dark palette. Exactly the cascade a browser
 *  resolves. */
const TAILWIND = collect(TAILWIND_CSS)
const APP_THEME = collect(APP_CSS, /@theme\s*\{[\s\S]*?\n\}/)
const APP_DARK = collect(APP_CSS, /\n\.dark\s*\{[\s\S]*?\n\}/)

/** Later maps win, key by key — the cascade, not a replacement. */
function layer(...maps: Map<string, Rgb>[]): Map<string, Rgb> {
  const out = new Map<string, Rgb>()
  for (const m of maps) m.forEach((v, k) => out.set(k, v))
  return out
}

const LIGHT = layer(TAILWIND, APP_THEME)
const DARK = layer(LIGHT, APP_DARK)

function token(theme: Map<string, Rgb>, name: string): Rgb {
  const v = theme.get(name)
  if (!v) throw new Error(`--color-${name} is not defined in either stylesheet`)
  return v
}

/** The four surfaces a piece of text can land on. `surface-sunk` — wells and
 *  table headers — is the darkest in light mode and decides every light pair. */
const SURFACES = ['canvas', 'surface-1', 'surface-2', 'surface-sunk'] as const

/** Which Tailwind step a tone class names, and the ramp it names it on. */
function inkOf(recipe: string): string {
  const m = recipe.match(/(?:^|\s)text-([a-z]+-\d+)/)
  if (!m) throw new Error(`no light text- class in "${recipe}"`)
  return m[1]
}
function darkInkOf(recipe: string): string {
  const m = recipe.match(/dark:text-([a-z]+-\d+)/)
  if (!m) throw new Error(`no dark:text- class in "${recipe}"`)
  return m[1]
}
/** `bg-amber-500/15` → the ramp step and the alpha it washes at. */
function washOf(recipe: string): { step: string; alpha: number } | null {
  const m = recipe.match(/(?:^|\s)bg-([a-z]+-\d+)\/(\d+)/)
  return m ? { step: m[1], alpha: Number(m[2]) / 100 } : null
}

const TONES = Object.keys(TONE_PILL) as Tone[]

/* ── the guards ──────────────────────────────────────────────────────────── */

describe('the sanity of the palette itself', () => {
  it('parses both stylesheets and resolves oklch the way a browser does', () => {
    // Pins the conversion against values read out of a real Chromium via
    // canvas, so a wrong matrix cannot make everything below pass.
    expect(token(LIGHT, 'amber-700')).toEqual(hexToRgb('#bb4d00'))
    expect(token(LIGHT, 'amber-800')).toEqual(hexToRgb('#973c00'))
    expect(token(LIGHT, 'rose-800')).toEqual(hexToRgb('#a50036'))
    // And that the app's `@theme` really does beat Tailwind's ramp.
    expect(token(LIGHT, 'violet-700')).toEqual(hexToRgb('#5d47de'))
    // And that `.dark` really does beat the light value.
    expect(token(DARK, 'ink-500')).not.toEqual(token(LIGHT, 'ink-500'))
    expect(LIGHT.size).toBeGreaterThan(100)
  })
})

describe('semantic ink on semantic surface clears WCAG AA', () => {
  // ink-400 is absent on purpose: the stylesheet marks it "disabled only",
  // and it measures 2.63 on white. It is not a text colour, and listing it
  // here would either fail forever or license using it as one.
  const INKS = ['ink-900', 'ink-800', 'ink-700', 'ink-600', 'ink-500'] as const

  const passes: [string, Map<string, Rgb>][] = [
    ['light', LIGHT],
    ['dark', DARK],
  ]
  for (const [themeName, theme] of passes) {
    it(`${themeName}: every ink reads on every surface`, () => {
      const failures: string[] = []
      for (const ink of INKS) {
        for (const surface of SURFACES) {
          const ratio = contrast(token(theme, ink), token(theme, surface))
          if (ratio < AA) failures.push(`${ink} on ${surface} = ${ratio.toFixed(2)}`)
        }
      }
      expect(failures, failures.join('\n')).toEqual([])
    })
  }
})

describe('every semantic tone reads on its own wash', () => {
  const passes: [string, Map<string, Rgb>, (recipe: string) => string][] = [
    ['light', LIGHT, inkOf],
    ['dark', DARK, darkInkOf],
  ]
  for (const [themeName, theme, ink] of passes) {
    it(`${themeName}: TONE_PILL ink on the tinted background, on all four surfaces`, () => {
      const failures: string[] = []
      for (const tone of TONES) {
        const recipe = TONE_PILL[tone]
        const wash = washOf(recipe)
        expect(wash, `TONE_PILL.${tone} should carry a bg-<ramp>-<step>/<alpha> wash`).toBeTruthy()
        const fg = token(theme, ink(recipe))
        for (const surface of SURFACES) {
          const bg = over(token(theme, wash!.step), wash!.alpha, token(theme, surface))
          const ratio = contrast(fg, bg)
          if (ratio < AA) {
            failures.push(
              `${tone}: ${ink(recipe)} on ${wash!.step}/${wash!.alpha * 100} over ${surface} = ${ratio.toFixed(2)}`,
            )
          }
        }
      }
      expect(failures, failures.join('\n')).toEqual([])
    })

    it(`${themeName}: TONE_TEXT ink on the plain surfaces`, () => {
      const failures: string[] = []
      for (const tone of TONES) {
        const fg = token(theme, ink(TONE_TEXT[tone]))
        for (const surface of SURFACES) {
          const ratio = contrast(fg, token(theme, surface))
          if (ratio < AA) {
            failures.push(`${tone}: ${ink(TONE_TEXT[tone])} on ${surface} = ${ratio.toFixed(2)}`)
          }
        }
      }
      expect(failures, failures.join('\n')).toEqual([])
    })
  }

  it('a pill and a plain sentence say the same tone in the same colour', () => {
    // The registry exists so one meaning has one appearance. Letting the two
    // recipes drift a step apart is the cheapest way to lose that, and it is
    // exactly what happens when somebody fixes only the pair axe reported.
    for (const tone of TONES) {
      expect(inkOf(TONE_TEXT[tone]), `${tone} light ink`).toBe(inkOf(TONE_PILL[tone]))
    }
  })
})

describe('white-on-brand fills', () => {
  it('names which steps of the blue ramp may carry white text', () => {
    // The brand ramp is a FILL ramp, and only its deep end is a white-text
    // fill: white on teal-500 is 3.82 and on teal-400 is 2.42. Anything
    // painting white on those two is a defect wherever it lives — the axe
    // baseline still carries instances of it, tracked on DREAMCRM-28.
    const white: Rgb = [255, 255, 255]
    for (const step of ['teal-600', 'teal-700', 'teal-800', 'teal-900']) {
      const ratio = contrast(white, token(LIGHT, step))
      expect(ratio, `white on ${step} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(AA)
    }
  })
})
