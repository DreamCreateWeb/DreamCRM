/**
 * THE ONE PLACE THIS REPO RESOLVES ITS OWN PALETTE, AND THE ONE PLACE IT DOES
 * COLOUR MATHS.
 *
 * Extracted from `tests/a11y/token-contrast.test.ts` (DREAMCRM-34) when a
 * second source-level contrast guard arrived. The alternative was to copy the
 * oklch conversion, the cascade and the WCAG formula into the new file, and a
 * copy is how two guards start reporting different numbers for the same pair —
 * at which point a red run is an argument about whose maths is right rather
 * than a defect. Quinn's constraint on that issue was "not two lists that can
 * disagree"; this is the same rule one level down, applied to the ratios.
 *
 * Everything here is DERIVED from the two files that define the palette —
 * this repo's `app/css/style.css` for the semantic tokens and re-tinted ramps,
 * and Tailwind's own `theme.css` for the ramps the app does not override — so
 * it follows a token edit or a Tailwind upgrade rather than pinning a copy
 * that goes stale. No ratio in this repo's tests is transcribed.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const ROOT = resolve(__dirname, '../..')

/** WCAG 2.1 AA for normal-size text. */
export const AA = 4.5

export type Rgb = [number, number, number]

/* ── colour maths (independent of lib/clinic-site-theme on purpose) ───────── */

function lin(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Composite `fg` at `alpha` over `bg` — what a `/15` wash actually paints. */
export function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => alpha * fg[i] + (1 - alpha) * bg[i]) as Rgb
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const full =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
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
 * these guards quietly grading a different palette than the one on screen.
 */
export function oklchToRgb(L: number, C: number, hDeg: number): Rgb {
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

export function parseColor(value: string): Rgb | null {
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

const TAILWIND = collect(TAILWIND_CSS)
const APP_THEME = collect(APP_CSS, /@theme\s*\{[\s\S]*?\n\}/)
const APP_DARK = collect(APP_CSS, /\n\.dark\s*\{[\s\S]*?\n\}/)

/** Later maps win, key by key — the cascade, not a replacement. */
function layer(...maps: Map<string, Rgb>[]): Map<string, Rgb> {
  const out = new Map<string, Rgb>()
  for (const m of maps) m.forEach((v, k) => out.set(k, v))
  return out
}

/**
 * Tailwind's ramps, then the app's `@theme` on top (the app wins), then
 * `.dark`'s overrides for the dark palette. Exactly the cascade a browser
 * resolves.
 */
export const LIGHT = layer(TAILWIND, APP_THEME)
export const DARK = layer(LIGHT, APP_DARK)

export type Theme = typeof LIGHT

export function token(theme: Theme, name: string): Rgb {
  const v = theme.get(name)
  if (!v) throw new Error(`--color-${name} is not defined in either stylesheet`)
  return v
}

/**
 * A Tailwind colour word as it appears in a utility class — `gray-700`,
 * `white`, `black` — resolved in one theme, or `null` for anything this
 * repo's palette does not define (an arbitrary `[#abc]`, a `--c-*` clinic
 * brand var, a ramp step that does not exist).
 *
 * `white` and `black` are CSS keywords rather than tokens, so they are not in
 * either stylesheet and have to be spelled out here.
 */
export function utilityColor(theme: Theme, word: string): Rgb | null {
  if (word === 'white') return [255, 255, 255]
  if (word === 'black') return [0, 0, 0]
  return theme.get(word) ?? null
}

/** The four surfaces a piece of text can land on. `surface-sunk` — wells and
 *  table headers — is the darkest in light mode and decides every light pair. */
export const SURFACES = ['canvas', 'surface-1', 'surface-2', 'surface-sunk'] as const
