import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards the v2 token layer + component utilities in app/css/style.css. These
 * are the keystone everything else references; if a token name drifts, the
 * primitives that resolve `var(--…)` silently lose their skin. We parse the
 * raw CSS rather than the compiled output so the source of truth is checked.
 */
const ROOT = resolve(__dirname, '../..')
const css = readFileSync(resolve(ROOT, 'app/css/style.css'), 'utf8')
const utilityPatterns = readFileSync(
  resolve(ROOT, 'app/css/additional-styles/utility-patterns.css'),
  'utf8',
)

describe('v2 color + surface tokens', () => {
  const required = [
    '--color-canvas',
    '--color-surface-1',
    '--color-surface-2',
    '--color-surface-sunk',
    '--color-hairline',
    '--color-hairline-strong',
    '--color-ink-900',
    '--color-ink-500',
    '--color-ink-400',
  ]
  it.each(required)('defines %s', (token) => {
    expect(css).toContain(token)
  })

  it('re-points the teal-* ramp to the v3 dream blue (teal-500 = #4c7df0)', () => {
    expect(css).toContain('--color-teal-500: #4c7df0')
    expect(css).toContain('--color-teal-700: #2f52b3') // deep dream / focus anchor
    expect(css).toContain('--color-teal-400: #7ca5ff') // dream sky / dark fill
  })

  it('re-tints the legacy gray ramp to the blue-cool values', () => {
    expect(css).toContain('--color-gray-50: #f3f7fe')
    expect(css).toContain('--color-gray-900: #1a2440')
    expect(css).toContain('--color-gray-950: #10182e')
  })

  it('ships radius + elevation + focus + motion tokens', () => {
    for (const t of ['--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-pill']) {
      expect(css).toContain(t)
    }
    for (const t of ['--shadow-xs', '--shadow-card', '--shadow-pop', '--shadow-modal', '--focus-ring']) {
      expect(css).toContain(t)
    }
    for (const t of ['--dur-fast', '--dur-base', '--ease-out', '--ease-ios', '--spring-gentle', '--spring-pop']) {
      expect(css).toContain(t)
    }
  })

  it('the bubble radius scale is soft (buttons 12px, cards 16px, panels 22px)', () => {
    expect(css).toContain('--r-sm: 12px')
    expect(css).toContain('--r-md: 16px')
    expect(css).toContain('--r-lg: 22px')
  })

  it('overrides the same semantic tokens under .dark (no parallel palette)', () => {
    const darkBlock = css.slice(css.indexOf('.dark {'))
    expect(darkBlock).toContain('--color-canvas: #10182e')
    expect(darkBlock).toContain('--color-surface-2: #1b2544')
    expect(darkBlock).toContain('--color-hairline: rgb(124 163 255 / 0.1)')
  })

  it('self-hosts Nunito and maps it + Geist to dashboard/numeral font utilities', () => {
    expect(css).toContain('--font-sans-dashboard')
    expect(css).toContain('--font-mono-num')
    expect(css).toContain('--font-geist-sans')
    expect(css).toContain('--font-geist-mono')
    // v3 face: self-hosted variable Nunito, latin + latin-ext subsets, ahead
    // of Geist in the dashboard stack. A Google Fonts URL would be a build/
    // flash regression — pin the same-origin paths.
    expect(css).toContain("--font-sans-dashboard: \"Nunito\"")
    expect(css).toContain("/fonts/nunito-latin-var.woff2")
    expect(css).toContain("/fonts/nunito-latin-ext-var.woff2")
    expect(css).toContain('font-weight: 200 1000')
  })

  it('self-hosts Inter too — no render-blocking @import anywhere in the sheet', () => {
    // Inter is the base body face (`font-inter` on <body>). It used to arrive
    // via `@import url(fonts.googleapis.com/…)` on line 1, which blocks first
    // paint on a third-party round trip that can't even be preloaded. Same
    // same-origin variable-woff2 contract as Nunito.
    expect(css).toContain('/fonts/inter-latin-var.woff2')
    expect(css).toContain('/fonts/inter-latin-ext-var.woff2')
    expect(css).toContain('font-weight: 100 900')
    // The regression this guards: any remote @import returning to the sheet.
    expect(css).not.toContain('fonts.googleapis.com')
    expect(css).not.toMatch(/@import\s+url\(/)
  })

  it('never falls back to a QUOTED generic, which is a family name and not the generic', () => {
    // DREAMCRM-127. `--font-inter` shipped as `"Inter", "sans-serif"` for
    // months. A quoted generic is a request for a family literally NAMED
    // "sans-serif"; no such family exists, so Chrome fell through to its
    // default standard font — Times New Roman. Every pre-swap frame on the
    // marketing site was set in a serif, and Times being 8.2% narrower than
    // Arial is most of the font-swap reflow that defect was opened for:
    // 7 of 11 PageHero sub paragraphs rewrapped, against 1 once this was
    // unquoted. One character of CSS, invisible in review, worth 27-38px of
    // layout shift per surface.
    const interStack = css.match(/--font-inter:\s*([^;]+);/)
    expect(interStack, '--font-inter is declared').not.toBeNull()
    expect(interStack![1]).toMatch(/(^|,)\s*sans-serif\s*$/)
    expect(interStack![1]).not.toContain('"sans-serif"')
  })

  it('gives the pre-swap fallback Inter\'s metrics, in bands covering 100-900', () => {
    // The other half of DREAMCRM-127, and the half that survives a copy edit:
    // `font-display: swap` means the first frame is a DIFFERENT face, so the
    // fallback is given Inter's advance widths and vertical metrics and wraps
    // where Inter wraps. Reserving a line box instead was measured and
    // rejected — it hard-codes a line count per breakpoint AND per string,
    // and five PageHero call sites pass dynamic copy.
    //
    // WHAT THIS ASSERTS: the face exists, every band carries all four
    // descriptors, and the bands tile 100-900 with no gap and no overlap. A
    // gap is the failure that does not look like one — the weights inside it
    // silently match a NEIGHBOURING band's size-adjust, which is how a single
    // mistuned face made the 800-weight display headline rewrap 38px while
    // fixing the body copy.
    //
    // WHAT IT DOES NOT ASSERT, named rather than left to be discovered: that
    // the CONSTANTS are still correct. Deriving those needs a browser with
    // the local faces installed, and CI has neither — per conventions section
    // 2d, a guard's environment is part of its correctness, so this one
    // grades the structure it can actually see. Re-derive the numbers with
    // the procedure in the style.css comment after any change to the Inter
    // woff2 or the fallback face.
    // THE WIRING FIRST, because it is the failure that looks like nothing.
    // Declaring the bands and not naming the family in `--font-inter` leaves
    // a page that renders exactly as it did before the fix, with 80 lines of
    // @font-face above it saying otherwise. Found by mutation: deleting the
    // family from the stack left the rest of this test green.
    const interStack = css.match(/--font-inter:\s*([^;]+);/)![1]
    expect(interStack, 'the stack actually uses the fallback family').toContain('"Inter Fallback"')
    expect(
      interStack.indexOf('"Inter"'),
      'real Inter is still ahead of the fallback',
    ).toBeLessThan(interStack.indexOf('"Inter Fallback"'))

    const faces = Array.from(css.matchAll(/@font-face\s*\{([^}]*)\}/g))
      .map((m) => m[1])
      .filter((b) => /font-family:\s*'Inter Fallback'/.test(b))
    expect(faces.length, 'Inter Fallback bands').toBeGreaterThanOrEqual(2)

    const ranges: Array<[number, number]> = []
    for (const band of faces) {
      for (const d of ['size-adjust', 'ascent-override', 'descent-override', 'line-gap-override']) {
        expect(band, `${d} in band`).toContain(d)
      }
      // `local()` and not a url(): the point is a face already on the device,
      // fetched zero bytes, available on the very first frame. A downloaded
      // fallback would arrive no earlier than Inter and fix nothing.
      expect(band).toMatch(/src:\s*local\(/)
      expect(band).not.toMatch(/src:[^;]*url\(/)
      const w = band.match(/font-weight:\s*(\d+)\s+(\d+)/)
      expect(w, 'band declares a weight range').not.toBeNull()
      ranges.push([Number(w![1]), Number(w![2])])
    }
    ranges.sort((a, b) => a[0] - b[0])
    expect(ranges[0][0], 'bands start at 100').toBe(100)
    expect(ranges[ranges.length - 1][1], 'bands end at 900').toBe(900)
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i][0], `band ${i} abuts band ${i - 1} with no gap or overlap`).toBe(
        ranges[i - 1][1] + 1,
      )
    }
  })

  it('ships every self-hosted woff2 the sheet points at', () => {
    // A missing font file 404s silently — the page just renders the fallback
    // face, which is exactly the flash self-hosting was meant to remove.
    for (const file of [
      'inter-latin-var.woff2',
      'inter-latin-ext-var.woff2',
      'nunito-latin-var.woff2',
      'nunito-latin-ext-var.woff2',
    ]) {
      expect(existsSync(resolve(ROOT, 'public/fonts', file)), file).toBe(true)
    }
  })
})

describe('v2 component + motion utility classes', () => {
  const classes = [
    '.v2-app',
    '.v2-card',
    '.v2-card-interactive',
    '.v2-panel',
    '.v2-well',
    '.aura-chrome',
    '.grain',
    '.skeleton',
    '.section-enter',
    '.slide-up-fast',
    '.breath',
  ]
  it.each(classes)('defines %s', (cls) => {
    expect(css).toContain(cls)
  })

  it('the v3 card floats on the soft resting shadow (etched inset ring retired)', () => {
    const block = css.slice(css.indexOf('.v2-card {'), css.indexOf('.v2-card {') + 200)
    expect(block).toContain('box-shadow: var(--shadow-card)')
    expect(block).not.toContain('inset 0 0 0 1px')
  })

  it('the skeleton shimmers (~1.4s) and stills under reduced-motion', () => {
    expect(css).toContain('@keyframes v2-shimmer')
    expect(css).toContain('1.4s')
    const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(rm).toContain('.skeleton::after')
    expect(rm).toContain('.breath')
  })

  it('the grain overlay is a low-opacity feTurbulence noise data-URI', () => {
    const block = css.slice(css.indexOf('.grain::after'))
    expect(block).toContain('feTurbulence')
    expect(block).toMatch(/opacity:\s*0\.0[0-9]/) // 2–4%
  })
})

describe('re-skinned base controls', () => {
  it('buttons use the 6px control radius + press scale, no resting shadow', () => {
    expect(utilityPatterns).toContain('border-radius: var(--r-sm)')
    expect(utilityPatterns).toContain('transform: scale(0.97)')
    // The old `shadow-sm` on the resting button base is gone.
    expect(utilityPatterns).not.toMatch(/\.btn[\s\S]{0,120}shadow-sm/)
  })

  it('text inputs focus to the teal ring; checked controls + switch go teal', () => {
    expect(utilityPatterns).toContain('box-shadow: var(--focus-ring)')
    expect(utilityPatterns).toContain('checked:bg-teal-500')
    expect(utilityPatterns).toContain('bg-teal-500')
    expect(utilityPatterns).not.toContain('checked:bg-violet-500')
  })
})
