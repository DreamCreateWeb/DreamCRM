import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import { read, tsxFiles } from '../design-system/jsx-attrs'

/**
 * docs/ACTIVATION.md law 4 — every empty state carries a door: one sentence
 * and one button, the feature's own first action or the door to the feature
 * that would fill the room. S6 (2026-10-06) gave the 50 door-less rooms in
 * the dashboard theirs; this scan holds the count of `<EmptyState>` elements
 * without an `action` at the named exceptions and nothing else.
 *
 * What may stand without a button, each with its reason:
 *  - ALL-CLEAR states. "Every patient is square" is earned emptiness, not an
 *    empty room; a button there would invent work.
 *  - PANE PLACEHOLDERS. The right-hand pane of a two-pane surface before a
 *    row is picked — the list beside it IS the door.
 *  - COMPOSER-ADJACENT. "No messages yet" with the composer directly below;
 *    a button that focuses the box the eye is already on is noise.
 *  - ROOMS THAT FILL FROM OUTSIDE. Feedback arrives from clinics' own
 *    submissions; the platform has nothing to click.
 *  - A DEFENSIVE BRANCH the static catalog can never reach.
 */

const ROOTS = ['app/(default)', 'app/(double-sidebar)', 'components']

/** `file` + a substring of the `title` attribute's SOURCE → why no door. */
const ALLOWED: Array<{ file: string; title: string; reason: string }> = [
  { file: 'app/(default)/my-day/page.tsx', title: "of tomorrow's visits are prepped", reason: 'all clear' },
  { file: 'app/(default)/payments/collections/page.tsx', title: 'No open balances', reason: 'all clear' },
  { file: 'app/(default)/dashboard/fintech/platform-revenue.tsx', title: 'No outstanding receivables', reason: 'all clear' },
  { file: 'app/(default)/dashboard/platform-overview.tsx', title: 'All clear', reason: 'all clear' },
  { file: 'app/(default)/ecommerce/invoices/subscriptions-attention.tsx', title: 'No subscriptions need attention', reason: 'all clear' },
  { file: 'app/(default)/platform/service-library/review-board.tsx', title: 'No pending submissions', reason: 'all clear' },
  { file: 'app/(double-sidebar)/messages/messages-body.tsx', title: 'No conversation selected', reason: 'pane placeholder' },
  { file: 'app/(double-sidebar)/inbox/components/thread-view.tsx', title: 'Nothing selected', reason: 'pane placeholder' },
  { file: 'app/(double-sidebar)/messages/clinic-thread-detail-panel.tsx', title: 'No messages yet', reason: 'composer directly below' },
  { file: 'app/(default)/settings/feedback/feedback-admin.tsx', title: 'No feedback yet', reason: 'fills from clinics’ own submissions' },
  { file: 'app/(default)/settings/apps/integrations-panel.tsx', title: 'No integrations available', reason: 'defensive branch — the catalog is static' },
]

interface Site {
  file: string
  title: string
  hasAction: boolean
}

/**
 * Read with the TypeScript parser rather than the design-system tag reader:
 * an apostrophe in JSX TEXT inside a prop's braces ("Who's ready to ask" as
 * a button label) opens a quote that reader never sees closed, and a door
 * is exactly the kind of prop that carries a label.
 */
function scan(): Site[] {
  const out: Site[] = []
  for (const file of tsxFiles(ROOTS)) {
    const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const visit = (node: ts.Node) => {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(sf) === 'EmptyState') {
        let title = ''
        let hasAction = false
        for (const prop of node.attributes.properties) {
          if (!ts.isJsxAttribute(prop)) continue
          const name = prop.name.getText(sf)
          if (name === 'action') hasAction = true
          if (name === 'title') title = prop.initializer?.getText(sf) ?? ''
        }
        out.push({ file, title, hasAction })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return out
}

describe('law 4 — every empty state carries a door', () => {
  const sites = scan()

  it('finds the dashboard’s empty states at all', () => {
    expect(sites.length).toBeGreaterThan(80)
  })

  it('every <EmptyState> without an action is a named exception', () => {
    const doorless = sites
      .filter((s) => !s.hasAction)
      .filter((s) => !ALLOWED.some((a) => a.file === s.file && s.title.includes(a.title)))
      .map((s) => `${s.file} :: ${s.title.slice(0, 60)}`)
    expect(
      doorless,
      'an empty state has no door — give it the feature’s first action or the door to the feature that fills it (docs/ACTIVATION.md law 4), or add it to ALLOWED with a reason',
    ).toEqual([])
  })

  it('every exception still exists and is still door-less (no stale entries)', () => {
    for (const a of ALLOWED) {
      const hit = sites.find((s) => s.file === a.file && s.title.includes(a.title))
      expect(hit, `${a.file} :: ${a.title} — remove the stale ALLOWED entry`).toBeDefined()
      expect(hit?.hasAction, `${a.file} :: ${a.title} has a door now — remove it from ALLOWED`).toBe(false)
    }
  })
})
