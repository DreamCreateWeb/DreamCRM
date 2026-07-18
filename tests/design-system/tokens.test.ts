import { readFileSync } from 'node:fs'
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
