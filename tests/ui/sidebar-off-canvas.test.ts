/**
 * THE SIDEBAR LEAVES THE PHONE (2026-10-15).
 *
 * Below `lg` the tenant sidebar is an off-canvas drawer: `absolute`, slid out
 * with `-translate-x-64`, so the page takes the whole width. It had not been
 * for months. `.grain` — the chrome's noise overlay — set `position:
 * relative` as an UNLAYERED rule, and an unlayered declaration beats every
 * layered one whatever its order, so Tailwind's `absolute` (in the utilities
 * layer) lost on the one element that carried both classes. The drawer
 * stayed in flow, 256px wide, and EVERY dashboard page on a phone or tablet
 * rendered in the strip to its right — measured at 834 and 390: the main
 * column's left edge was 256 on `/website/content`, `/website` and the rest.
 *
 * Two things hold it:
 *  1. the `.grain` positioning rule lives in `@layer components`, where a
 *     positioning utility on the same element wins;
 *  2. the aside is `absolute` below lg and `lg:relative` (not `lg:static`)
 *     above — relative, so the grain's `::after` keeps the aside as its
 *     containing block instead of spilling across the data canvas.
 * `e2e/dashboard-viewport.spec.ts` measures the result in a browser.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const css = readFileSync(join(ROOT, 'app/css/style.css'), 'utf8')
const sidebar = readFileSync(join(ROOT, 'components/ui/tenant-sidebar.tsx'), 'utf8')

describe('the grain overlay never pins the element it decorates', () => {
  it('declares .grain { position } inside @layer components only', () => {
    // Every `.grain {` block (not `::after`) must sit inside a components layer.
    const blocks = Array.from(css.matchAll(/(@layer\s+components\s*\{\s*)?\.grain\s*\{[^}]*position\s*:\s*relative[^}]*\}/g))
    expect(blocks.length, 'the .grain positioning rule exists').toBeGreaterThan(0)
    for (const m of blocks) {
      expect(m[1], `.grain { position: relative } must be declared inside @layer components:\n${m[0]}`).toBeTruthy()
    }
    // And no unlayered copy survives anywhere else.
    const unlayered = css.replace(/@layer\s+components\s*\{[\s\S]*?\n\}/g, '')
    expect(unlayered).not.toMatch(/\.grain\s*\{[^}]*position\s*:\s*relative/)
  })
})

describe('the tenant sidebar is an off-canvas drawer below lg', () => {
  const asideClass = sidebar.match(/<aside[\s\S]*?className=\{`([^`]*)`/)?.[1] ?? ''
  it('is absolute (slid off) below lg and relative above', () => {
    expect(asideClass).toMatch(/\babsolute\b/)
    expect(asideClass).toMatch(/\blg:relative\b/)
    expect(asideClass, 'lg:static would let the grain ::after escape to the viewport').not.toMatch(/\blg:static\b/)
    expect(asideClass).toContain('-translate-x-64 lg:translate-x-0')
  })
})
