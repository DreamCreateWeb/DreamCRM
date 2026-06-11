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

  it('replaces the teal ramp with the brand aqua (teal-500 = #28b3ad)', () => {
    expect(css).toContain('--color-teal-500: #28b3ad')
    expect(css).toContain('--color-teal-700: #2a7f8c') // logo deep / focus anchor
    expect(css).toContain('--color-teal-400: #4dcdc4') // logo aqua / dark fill
  })

  it('re-tints the legacy gray ramp to the cool-navy values', () => {
    expect(css).toContain('--color-gray-50: #f6f8f9')
    expect(css).toContain('--color-gray-900: #141a2e')
    expect(css).toContain('--color-gray-950: #0e1320')
  })

  it('ships radius + elevation + focus + motion tokens', () => {
    for (const t of ['--r-xs', '--r-sm', '--r-md', '--r-lg', '--r-pill']) {
      expect(css).toContain(t)
    }
    for (const t of ['--shadow-xs', '--shadow-pop', '--shadow-modal', '--focus-ring']) {
      expect(css).toContain(t)
    }
    for (const t of ['--dur-fast', '--dur-base', '--ease-out', '--ease-ios', '--spring-gentle']) {
      expect(css).toContain(t)
    }
  })

  it('overrides the same semantic tokens under .dark (no parallel palette)', () => {
    const darkBlock = css.slice(css.indexOf('.dark {'))
    expect(darkBlock).toContain('--color-canvas: #0e1320')
    expect(darkBlock).toContain('--color-surface-2: #1b2336')
    expect(darkBlock).toContain('--color-hairline: rgb(255 255 255 / 0.06)')
  })

  it('maps Geist families to dashboard + numeral font utilities', () => {
    expect(css).toContain('--font-sans-dashboard')
    expect(css).toContain('--font-mono-num')
    expect(css).toContain('--font-geist-sans')
    expect(css).toContain('--font-geist-mono')
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

  it('the etched card has an inset hairline ring and no resting drop-shadow', () => {
    const block = css.slice(css.indexOf('.v2-card {'), css.indexOf('.v2-card {') + 200)
    expect(block).toContain('inset 0 0 0 1px var(--color-hairline)')
    // box-shadow is the inset ring only — no "0 Npx" outer offset on rest.
    expect(block).not.toMatch(/box-shadow:[^;]*\b[1-9]\d*px\b[^;]*rgb/)
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
