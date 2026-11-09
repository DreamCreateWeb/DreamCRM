import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import { read, tsxFiles } from '../design-system/jsx-attrs'

/**
 * ONE MODAL PRIMITIVE (ML-56). Every centred dialog / phone bottom sheet in
 * the app is `components/ui/modal.tsx` — the focus trap, the close rules
 * (Escape / backdrop / the X; a busy state refuses all three), the scroll lock
 * and the dialog law live in that one file. A hand-rolled
 * `role="dialog"` shell beside it forks them, and a fork is how a phone ended
 * up with a centred card the keyboard pushed off-screen.
 *
 * THE RULE, read with the TypeScript parser over every `.tsx` under `app` and
 * `components`: a JSX `role="dialog"` attribute, or an `import { Dialog }`
 * from Headless UI, may appear only inside the primitive itself — or in a file
 * on the DATED, SHRINK-ONLY allowlist below. The allowlist is every overlay
 * that is deliberately NOT a modal (a side drawer, a popover, a lightbox, the
 * mobile menu, the command palette); each carries its reason.
 * A file whose count rises fails; one whose count falls must be edited down; a
 * file at zero must be removed; `ALLOWLIST_CEILING` pins the total.
 *
 * Blind spots (also on the INTAKE_RULES entry): a fixed-position overlay that
 * carries no `role="dialog"` and no Headless `Dialog` is not seen; a dialog
 * role built through a spread or a variable is not seen.
 */

const ROOTS = ['app', 'components']
export const ALLOWLIST_DATED = '2026-11-09'

/** `file` → [dialog sites, why it is not a Modal]. Exact; shrink-only. */
export const ALLOWED: Array<[file: string, sites: number, why: string]> = [
  ['app/(default)/appointments/appointment-drawer.tsx', 2, 'side drawer (a panel, not a modal) — shares the focus trap'],
  ['app/(default)/appointments/new-booking-drawer.tsx', 1, 'side drawer'],
  ['app/(default)/growth/social/composer.tsx', 1, 'channel picker popover'],
  ['app/(default)/leads/lead-drawer.tsx', 1, 'side drawer'],
  ['app/(default)/platform/prospecting/copilot-bar.tsx', 1, 'top-aligned command palette'],
  ['app/(default)/platform/prospecting/prospect-drawer-shell.tsx', 1, 'side drawer'],
  ['app/(default)/platform/service-library/library-entry-editor.tsx', 1, 'side drawer'],
  ['app/(default)/shop/orders/orders-client.tsx', 1, 'side drawer'],
  ['app/(default)/website/editor/website-studio.tsx', 1, 'Studio icon side drawer'],
  ['app/site/[slug]/coloring/coloring-gallery.tsx', 1, 'public-site lightbox'],
  ['components/clinic-site/site-chat-widget.tsx', 1, 'public-site chat popover'],
  ['components/clinic-site/site-header.tsx', 1, 'public-site mobile menu'],
  ['components/patient-portal/portal-chrome.tsx', 1, 'portal "More" bottom nav sheet'],
  ['components/social-posts/post-comments-panel.tsx', 1, 'side panel'],
  ['components/ui/emoji-picker.tsx', 1, 'popover'],
  ['components/ui/encoding-legend.tsx', 1, 'popover'],
  ['components/ui/keyboard-shortcuts.tsx', 1, 'deliberately NOT aria-modal (it owns the keys that close it)'],
  ['components/ui/drawer.tsx', 1, 'Headless side drawer primitive'],
  ['components/search-modal.tsx', 1, 'Headless command palette'],
]
export const ALLOWLIST_CEILING = 20

const PRIMITIVE = 'components/ui/modal.tsx'

export function countDialogSites(file: string, source: string): number {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let n = 0
  const visit = (node: ts.Node) => {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'role' &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      node.initializer.text === 'dialog'
    ) {
      n += 1
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === '@headlessui/react' &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings) &&
      node.importClause.namedBindings.elements.some((e) => e.name.text === 'Dialog')
    ) {
      n += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return n
}

describe('one Modal primitive', () => {
  const counts = new Map<string, number>()
  for (const f of tsxFiles(ROOTS)) {
    if (f === PRIMITIVE) continue
    const n = countDialogSites(f, read(f))
    if (n > 0) counts.set(f, n)
  }
  const allowed = new Map(ALLOWED.map(([f, n]) => [f, n]))

  it('detector sees a hand-rolled dialog and a Headless Dialog', () => {
    expect(countDialogSites('x.tsx', 'export const A = () => <div role="dialog" aria-modal="true" />')).toBe(1)
    expect(countDialogSites('x.tsx', "import { Dialog } from '@headlessui/react'")).toBe(1)
    expect(countDialogSites('x.tsx', '// <div role="dialog" />\nexport const A = () => <div />')).toBe(0)
  })

  it('no file outside the primitive hand-rolls a dialog beyond its allowlist entry', () => {
    const offenders = Array.from(counts).filter(([f, n]) => n > (allowed.get(f) ?? 0)).map(([f, n]) => `${f} (${n})`)
    expect(offenders, `use <Modal> from components/ui/modal.tsx:\n${offenders.join('\n')}`).toEqual([])
  })

  it('the allowlist only shrinks: every entry is exact and still needed', () => {
    const stale = ALLOWED.filter(([f, n]) => (counts.get(f) ?? 0) !== n).map(
      ([f, n]) => `${f}: allowlisted ${n}, found ${counts.get(f) ?? 0}`,
    )
    expect(stale, 'edit the count DOWN (remove at zero) and lower ALLOWLIST_CEILING').toEqual([])
    expect(ALLOWED.reduce((a, [, n]) => a + n, 0)).toBeLessThanOrEqual(ALLOWLIST_CEILING)
  })
})
