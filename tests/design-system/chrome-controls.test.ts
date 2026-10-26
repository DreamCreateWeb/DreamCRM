import { describe, it, expect } from 'vitest'
import { openingTag, ownAttrs, read } from './jsx-attrs'

/**
 * EVERY ICON-ONLY CONTROL IN THE DASHBOARD CHROME IS A 40px BOX (2026-10-26).
 *
 * DESIGN-SYSTEM.md §2.2: hit targets ≥40px for primary controls. The header
 * shipped the Mosaic template's sizes and nobody re-skinned them: the
 * hamburger — the ONLY door to navigation on a phone — was a bare 24px svg
 * with no padding, the drawer's Close the same, search / bell / help / theme
 * were `w-8 h-8`, and the quick-create caret `h-8 w-7`. The sidebar's own
 * collapse caret already did it right at `h-10 w-10`. A front desk opens the
 * nav and the bell dozens of times a day from a phone; at 24px the stroke
 * alone misses WCAG 2.5.8's 24×24, let alone the system's rule.
 *
 * WHAT COUNTS AS ICON-ONLY, stated so the rule is checkable: a `<button>`,
 * `<PopoverButton>` or `<MenuButton>` whose own tag carries `aria-label`, or
 * whose body carries an `sr-only` name. A control with a visible label gets
 * its width from the label; the one such control that ALSO carries an
 * aria-label (the trail-back chip) is named below with its reason, and the
 * rule still asks it for the 40px HEIGHT. The 40px is the BOX — padding, not
 * icon size — so the glyphs stay 16px and the header keeps its rhythm.
 *
 * `e2e/dashboard-viewport.spec.ts` measures the rendered boxes at 390; this
 * is the source half, so the size cannot regress between browser runs.
 */

/** The chrome files that carry icon-only controls. */
export const CHROME_CONTROL_FILES = [
  'components/ui/header.tsx',
  'components/ui/tenant-sidebar.tsx',
  'components/ui/trail-back.tsx',
  'components/ui/quick-create-menu.tsx',
  'components/ui/flash-toast.tsx',
  'components/dropdown-notifications.tsx',
  'components/dropdown-help.tsx',
  'components/theme-toggle.tsx',
]

/** Controls that carry an aria-label AND a visible label: height only. */
const TEXT_BEARING: Array<{ file: string; name: string; why: string }> = [
  {
    file: 'components/ui/trail-back.tsx',
    name: '`Back to ${previous.label}`',
    why: 'the "← {came-from}" chip — its width is the label; it declares min-h-10',
  },
]

const HEIGHT = /(^|[\s'"`])(h-10|min-h-10)(?![\w-])/
const WIDTH = /(^|[\s'"`])(w-10|min-w-10)(?![\w-])/

export type ChromeControl = {
  file: string
  line: number
  /** The aria-label source, or the sr-only text. */
  name: string
  className: string
  iconOnly: boolean
}

/** Every button-like control in one source file, with what the rule needs to know about it. */
export function chromeControls(src: string, file: string): ChromeControl[] {
  const out: ChromeControl[] = []
  const re = /<(button|PopoverButton|MenuButton)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const tag = openingTag(src, m.index)
    if (!tag) continue
    const attrs = ownAttrs(tag)
    const selfClosing = /\/>\s*$/.test(tag)
    const close = selfClosing ? -1 : src.indexOf(`</${m[1]}>`, m.index + tag.length)
    const inner = close === -1 ? '' : src.slice(m.index + tag.length, close)
    const srOnly = inner.match(/className="sr-only">\s*([^<]+?)\s*</)?.[1]
    const ariaLabel = attrs.get('aria-label')
    out.push({
      file,
      line: src.slice(0, m.index).split('\n').length,
      name: ariaLabel ?? srOnly ?? '',
      className: attrs.get('className') ?? '',
      iconOnly: ariaLabel !== undefined || srOnly !== undefined,
    })
  }
  return out
}

function shortfalls(controls: ChromeControl[]): string[] {
  const out: string[] = []
  for (const c of controls) {
    if (!c.iconOnly) continue
    const textBearing = TEXT_BEARING.find((t) => t.file === c.file && t.name === c.name)
    if (!HEIGHT.test(c.className)) out.push(`${c.file}:${c.line} (${c.name}) — no h-10 / min-h-10 in "${c.className}"`)
    if (!textBearing && !WIDTH.test(c.className)) out.push(`${c.file}:${c.line} (${c.name}) — no w-10 / min-w-10 in "${c.className}"`)
  }
  return out
}

describe('chrome controls — the red run', () => {
  it('reports an icon-only button under the floor, in either spelling of its name', () => {
    const planted = [
      '<button aria-label="Close" className="w-8 h-8 rounded-full" />',
      '<PopoverButton className={`w-8 h-8 ${open && "bg"}`}><span className="sr-only">Notifications</span></PopoverButton>',
      '<button className="text-ink-500 lg:hidden" onClick={() => setOpen(!open)}><span className="sr-only">Open sidebar</span><svg /></button>',
    ].join('\n')
    const found = shortfalls(chromeControls(planted, 'planted.tsx'))
    expect(found).toHaveLength(6)
    expect(found[0]).toContain('planted.tsx:1 (Close)')
    expect(found[2]).toContain('(Notifications)')
    expect(found[4]).toContain('(Open sidebar)')
  })

  it('leaves a 40px icon-only control and a text button alone', () => {
    const planted = [
      '<button aria-label="Close" className="inline-flex h-10 w-10 items-center" />',
      '<button type="button" className="px-3 py-1 text-sm" onClick={save}>Save</button>',
      '<MenuButton className="h-10 min-w-10"><span className="sr-only">Need help?</span></MenuButton>',
    ].join('\n')
    expect(shortfalls(chromeControls(planted, 'planted.tsx'))).toEqual([])
  })

  it('an `=>` inside a handler does not end the tag early (the jsx-attrs lesson)', () => {
    const planted = '<button onClick={() => go()} aria-label="Go" className="h-10 w-10" />'
    const [c] = chromeControls(planted, 'planted.tsx')
    expect(c.iconOnly).toBe(true)
    expect(c.className).toBe('h-10 w-10')
  })
})

describe('chrome controls — the product', () => {
  const controls = CHROME_CONTROL_FILES.flatMap((file) => chromeControls(read(file), file))

  it('still finds the icon-only controls it exists to grade (the field of view)', () => {
    const names = controls.filter((c) => c.iconOnly).map((c) => c.name)
    for (const expected of ['Open sidebar', 'Close sidebar', 'Search', 'Notifications', 'Need help?', 'Dark mode', 'More create options', 'Dismiss']) {
      expect(names, `${expected} is a chrome control this rule should see`).toContain(expected)
    }
  })

  it('every icon-only chrome control declares a 40px box', () => {
    expect(shortfalls(controls)).toEqual([])
  })

  it('the TEXT_BEARING exemptions are all still live', () => {
    for (const t of TEXT_BEARING) {
      expect(
        controls.some((c) => c.file === t.file && c.name === t.name),
        `${t.file} no longer has a control named ${t.name} — drop the exemption`,
      ).toBe(true)
    }
  })
})
