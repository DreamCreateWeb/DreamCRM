import { describe, it, expect } from 'vitest'
import ts from 'typescript'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, normalize, resolve } from 'node:path'
import { read, tsxFiles } from '../design-system/jsx-attrs'

/**
 * A CLIENT COMPONENT NEVER BARE-AWAITS A SERVER ACTION (CLAUDE.md, the
 * 2026-10-23 convention). A server action is addressed by a per-BUILD id and
 * every merge to `main` is a new build, so a tab opened before a deploy has
 * its next action REFUSED by Next with a thrown Error — never an
 * `{ ok: false }` result. Unhandled, the throw leaves the person on a button
 * that does nothing: "Saving…" forever, the busy flag never reset. 1,624 such
 * refusals in 14 days of prod logs; the Studio got `runAction` on
 * 2026-10-23, the public forms got a brace-tracker guard, and every other
 * panel in the dashboard went on awaiting its actions bare.
 *
 * THE RULE, read with the TypeScript parser rather than a regex (the
 * empty-state-doors pattern), over every `.tsx` under `app` and `components`:
 *
 *   every `await <binding>(…)` where `<binding>` is imported from a module
 *   whose directive prologue says `'use server'` must sit inside
 *   `runAction(() => …)` (lib/run-action.ts) or inside the `try` block of a
 *   `try` statement — with NO function boundary between the await and that
 *   `try`. An outer `try` around `startTransition(async () => { await x() })`
 *   catches nothing: the rejection belongs to the inner async function.
 *
 * Today's offenders sit in a DATED ALLOWLIST keyed by file with the count of
 * bare sites in it, and the list MAY ONLY SHRINK: a file whose count rises
 * fails, a file whose count falls must have its entry edited down, a file at
 * zero must be removed, and `ALLOWLIST_CEILING` pins the total so a new
 * entry cannot be slipped in beside a sweep. The cluster slices after ML-01
 * each shrink their own files.
 *
 * WHAT IT DOES NOT COVER (the same list lives on the INTAKE_RULES entry in
 * scripts/review-gate.mjs, where the rulebook reads it):
 *   - `.ts` files: `tsxFiles` walks `.tsx` only. No `'use client'` `.ts`
 *     under either root awaits anything today; a test below asserts that
 *     population is empty so the gap announces itself when it opens.
 *   - an action reached without a direct await (`.then()`, `Promise.all`,
 *     a form `action={fn}` prop, a local alias of the import).
 *   - a SERVER component awaiting a `'use server'` export during render — a
 *     direct call that cannot skew, but one the parser cannot tell apart, so
 *     it owes a `try` or an allowlist line with its reason.
 *   - a module declaring `'use server'` below its prologue, or per function.
 */

const ROOTS = ['app', 'components']

/** The day the allowlist was taken. Entries after this date are not new
 *  offenders being admitted — they are a count being edited DOWN. */
export const ALLOWLIST_DATED = '2026-10-26'

/**
 * `file` → bare sites in it on ALLOWLIST_DATED. Exact: more fails, fewer
 * must be edited down, zero must be removed.
 */
export const ALLOWED: Array<[file: string, sites: number]> = [
  ['app/(default)/appointments/agenda-view.tsx', 1],
  ['app/(default)/appointments/appointment-drawer.tsx', 9],
  ['app/(default)/appointments/book-from-patient-drawer.tsx', 1],
  ['app/(default)/appointments/waitlist-panel.tsx', 1],
  ['app/(default)/dashboard/guardian-audience-control.tsx', 1],
  ['app/(default)/ecommerce/customers/customers-table.tsx', 1],
  ['app/(default)/ecommerce/customers/delete-customers-button.tsx', 1],
  ['app/(default)/ecommerce/invoices/delete-invoices-button.tsx', 1],
  ['app/(default)/ecommerce/invoices/invoices-table-item.tsx', 2],
  ['app/(default)/ecommerce/orders/delete-orders-button.tsx', 1],
  ['app/(default)/ecommerce/orders/orders-table-item.tsx', 1],
  ['app/(default)/followups/followup-rules-card.tsx', 2],
  ['app/(default)/followups/followups-board.tsx', 3],
  ['app/(default)/growth/audiences/audiences-client.tsx', 2],
  ['app/(default)/growth/campaigns/[id]/campaign-editor.tsx', 6],
  ['app/(default)/growth/campaigns/cancel-scheduled-button.tsx', 1],
  ['app/(default)/growth/outreach/automations/[kind]/message-editor.tsx', 2],
  ['app/(default)/growth/reviews/received/facebook-reviews-section.tsx', 1],
  ['app/(default)/growth/reviews/received/google-reviews-section.tsx', 4],
  ['app/(default)/growth/reviews/review-config-panel.tsx', 1],
  ['app/(default)/growth/social/composer.tsx', 1],
  ['app/(default)/growth/social/connect-channels.tsx', 3],
  ['app/(default)/insurance/discovery-panel.tsx', 2],
  ['app/(default)/insurance/insurance-tool.tsx', 6],
  ['app/(default)/insurance/intro.tsx', 1],
  ['app/(default)/insurance/payer-notebook-card.tsx', 1],
  ['app/(default)/intake-forms/packets-manager.tsx', 1],
  ['app/(default)/integrations/google-business/gbp-detail-controls.tsx', 2],
  ['app/(default)/integrations/google-business/location-picker.tsx', 1],
  ['app/(default)/integrations/integrations-library.tsx', 5],
  ['app/(default)/integrations/pms/connect-request.tsx', 1],
  ['app/(default)/integrations/sms/registration-panel.tsx', 1],
  ['app/(default)/integrations/sync-controls.tsx', 4],
  ['app/(default)/leads/lead-drawer.tsx', 2],
  ['app/(default)/leads/leads-view.tsx', 1],
  ['app/(default)/marketing/retention-automations-card.tsx', 1],
  ['app/(default)/my-day/digest-toggle.tsx', 1],
  ['app/(default)/my-day/my-day-followups.tsx', 3],
  ['app/(default)/partners/[id]/partner-actions.tsx', 1],
  ['app/(default)/patients/[id]/documents-panel.tsx', 2],
  ['app/(default)/patients/[id]/edit-modal.tsx', 1],
  ['app/(default)/patients/[id]/followups-panel.tsx', 4],
  ['app/(default)/patients/[id]/loyalty-panel.tsx', 1],
  ['app/(default)/patients/[id]/merge-duplicate.tsx', 1],
  ['app/(default)/patients/[id]/notes-panel.tsx', 2],
  ['app/(default)/patients/[id]/patient-detail.tsx', 5],
  ['app/(default)/patients/[id]/tags-panel.tsx', 3],
  ['app/(default)/patients/add-patient-modal.tsx', 1],
  ['app/(default)/patients/bulk-message-modal.tsx', 1],
  ['app/(default)/patients/import-patients-modal.tsx', 2],
  ['app/(default)/patients/patients-list.tsx', 3],
  ['app/(default)/patients/saved-views-bar.tsx', 5],
  ['app/(default)/patients/send-intake-inline.tsx', 1],
  ['app/(default)/payments/collections/plans-card.tsx', 1],
  ['app/(default)/payments/collections/propose-plan-cell.tsx', 1],
  ['app/(default)/payments/collections/send-link-cell.tsx', 1],
  ['app/(default)/payments/online/balance-outreach-card.tsx', 1],
  ['app/(default)/platform/first-week/pms-request-actions.tsx', 1],
  ['app/(default)/platform/prospecting/add-clinic-button.tsx', 1],
  ['app/(default)/platform/prospecting/call-list/call-card.tsx', 3],
  ['app/(default)/platform/prospecting/call-mode/practice-panel.tsx', 4],
  ['app/(default)/platform/prospecting/contacts-panel.tsx', 4],
  ['app/(default)/platform/prospecting/copilot-bar.tsx', 7],
  ['app/(default)/platform/prospecting/demo-followup-drafter.tsx', 1],
  ['app/(default)/platform/prospecting/demo/[id]/brief-panel.tsx', 1],
  ['app/(default)/platform/prospecting/demo/[id]/prep-actions.tsx', 2],
  ['app/(default)/platform/prospecting/demo/[id]/track-picker.tsx', 1],
  ['app/(default)/platform/prospecting/drawer-actions.tsx', 5],
  ['app/(default)/platform/prospecting/events/[id]/attach-photo.tsx', 2],
  ['app/(default)/platform/prospecting/events/event-form.tsx', 1],
  ['app/(default)/platform/prospecting/focus-banner.tsx', 1],
  ['app/(default)/platform/prospecting/sequences/sequence-editor.tsx', 1],
  ['app/(default)/platform/prospecting/settings/settings-panel.tsx', 1],
  ['app/(default)/platform/prospecting/territory/territory-table.tsx', 1],
  ['app/(default)/settings/apps/integrations-panel.tsx', 1],
  ['app/(default)/settings/automations/emails/emails-hub.tsx', 1],
  ['app/(default)/settings/billing/subscription-panel.tsx', 2],
  ['app/(default)/settings/clinic/calendar-feed-card.tsx', 2],
  ['app/(default)/settings/clinic/gbp-sync-card.tsx', 3],
  ['app/(default)/settings/message-templates/templates-editor.tsx', 4],
  ['app/(default)/settings/notifications/notifications-panel.tsx', 2],
  ['app/(default)/settings/portal/portal-settings-form.tsx', 1],
  ['app/(default)/settings/practice/page.tsx', 1],
  ['app/(default)/settings/practice/practice-panel.tsx', 7],
  ['app/(default)/settings/security/security-panel.tsx', 2],
  ['app/(default)/shop/coupons/coupons-client.tsx', 1],
  ['app/(default)/shop/loyalty-config-card.tsx', 1],
  ['app/(default)/shop/orders/orders-client.tsx', 1],
  ['app/(default)/website/blog/[id]/blog-editor.tsx', 7],
  ['app/(default)/website/blog/calendar/calendar-view.tsx', 3],
  ['app/(default)/website/design/powered-by-card.tsx', 1],
  ['app/(default)/website/domain/buy-domain-card.tsx', 1],
  ['app/(default)/website/domain/custom-domain-card.tsx', 4],
  ['app/(default)/website/editor/brand-color-popover.tsx', 1],
  ['app/(default)/website/forms/forms-panel.tsx', 2],
  ['app/(default)/website/go-live-card.tsx', 1],
  ['app/(default)/website/pages/pages-manager.tsx', 1],
  ['app/(default)/website/pages/seo-meta-form.tsx', 1],
  ['app/(default)/website/publish-card.tsx', 2],
  ['app/(double-sidebar)/inbox/components/thread-view.tsx', 4],
  ['app/(double-sidebar)/inbox/settings/settings-panel.tsx', 1],
  ['app/(double-sidebar)/messages/broadcast-button.tsx', 1],
  ['app/(double-sidebar)/messages/support/support-view.tsx', 1],
  ['app/(partner)/partner/partner-payout.tsx', 1],
  ['app/(portal)/patient/book/book-form.tsx', 1],
  ['app/(portal)/patient/book/request-form.tsx', 1],
  ['app/(portal)/patient/invoices/pay-form.tsx', 1],
  ['app/(portal)/patient/invoices/plan-offer.tsx', 1],
  ['app/(portal)/patient/messages/messages-view.tsx', 1],
  ['app/(portal)/patient/profile/profile-form.tsx', 2],
  ['app/(portal)/patient/records/request-records.tsx', 1],
  ['app/d/[token]/booking-form.tsx', 2],
  ['app/e/[token]/capture-form.tsx', 1],
  ['app/i/[token]/plan-form.tsx', 1],
  ['app/n/[token]/survey-form.tsx', 2],
  ['app/r/[token]/review-form.tsx', 1],
  ['app/site/[slug]/shop/cart-view.tsx', 1],
  ['components/clinic-site/insurance-verifier-form.tsx', 1],
  ['components/feature-switch/feature-footer.tsx', 1],
  ['components/followups/followup-quick-add.tsx', 1],
  ['components/onboarding/getting-started.tsx', 1],
  ['components/onboarding/module-hint-banner.tsx', 1],
  ['components/onboarding/welcome-modal.tsx', 1],
  ['components/patient-portal/family-link-request.tsx', 1],
  ['components/patient-portal/loyalty-card.tsx', 1],
  ['components/patient-portal/refer-card.tsx', 1],
  ['components/patient-portal/survey-card.tsx', 2],
  ['components/patient-portal/visit-card.tsx', 1],
  ['components/search-modal.tsx', 1],
  ['components/social-posts/post-comments-panel.tsx', 1],
  ['components/tags/patient-tag-control.tsx', 3],
]

/** The sum of ALLOWED's counts the day it was taken. LOWER it as you sweep;
 *  never raise it — a raise is a new offender admitted by hand. */
export const ALLOWLIST_CEILING = 247

/* ───────────────────────── the detector ───────────────────────── */

export interface AwaitSite {
  file: string
  line: number
  /** `saveThing` or `actions.saveThing` — the binding as written. */
  callee: string
  guarded: boolean
}

/** Does this module's directive prologue say `'use server'`? The prologue is
 *  the run of string-literal statements at the very top; a comment above it
 *  is fine, an import above it ends it. */
export function hasUseServerPrologue(sf: ts.SourceFile): boolean {
  for (const st of sf.statements) {
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) {
      if (st.expression.text === 'use server') return true
      continue
    }
    break
  }
  return false
}

const CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

/** Resolve a relative or `@/` specifier to a file in this tree, or null for
 *  a package import. */
export function resolveSpecifier(fromFile: string, spec: string, root = process.cwd()): string | null {
  let base: string
  if (spec.startsWith('.')) base = normalize(join(dirname(fromFile), spec))
  else if (spec.startsWith('@/')) base = spec.slice(2)
  else return null
  base = base.split('\\').join('/')
  for (const ext of CANDIDATES) {
    const rel = `${base}${ext}`
    try {
      if (statSync(resolve(root, rel)).isFile()) return rel
    } catch {
      /* not this spelling */
    }
  }
  return null
}

const serverModuleCache = new Map<string, boolean>()

/** Is the module at `rel` (a tree-relative path) a `'use server'` module? */
export function isServerActionModule(rel: string, root = process.cwd()): boolean {
  const hit = serverModuleCache.get(rel)
  if (hit !== undefined) return hit
  const src = readFileSync(resolve(root, rel), 'utf8')
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, false, rel.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const yes = hasUseServerPrologue(sf)
  serverModuleCache.set(rel, yes)
  return yes
}

function unwrap(e: ts.Expression): ts.Expression {
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isTypeAssertionExpression(e)) {
      e = e.expression
    } else if (typeof ts.isSatisfiesExpression === 'function' && ts.isSatisfiesExpression(e)) {
      e = e.expression
    } else return e
  }
}

function isRunActionCallee(e: ts.Expression): boolean {
  const c = unwrap(e)
  if (ts.isIdentifier(c)) return c.text === 'runAction'
  if (ts.isPropertyAccessExpression(c)) return c.name.text === 'runAction'
  return false
}

/**
 * Walk UP from the await. A `try` guards it only when the await is in its
 * `tryBlock` (not its catch or finally) and no function boundary was crossed
 * on the way — except the one function that IS the guard: the callback
 * handed to `runAction(...)`.
 */
export function isGuardedAwait(node: ts.AwaitExpression): boolean {
  let child: ts.Node = node
  let parent: ts.Node | undefined = node.parent
  while (parent) {
    if (ts.isTryStatement(parent)) {
      if (child === parent.tryBlock) return true
      // Inside the catch or finally: an OUTER try may still cover it.
    } else if (ts.isFunctionLike(parent)) {
      const gp: ts.Node | undefined = parent.parent
      if (gp && ts.isCallExpression(gp) && isRunActionCallee(gp.expression)) {
        if (gp.arguments.some((a) => unwrap(a) === parent)) return true
      }
      return false
    }
    child = parent
    parent = parent.parent
  }
  return false
}

/**
 * Every `await <action>(…)` in `src`, with whether it is guarded.
 * `isActionModule` answers for an import specifier as written, so the
 * detector can be exercised on fixtures without a tree.
 */
export function scanSource(file: string, src: string, isActionModule: (spec: string) => boolean): AwaitSite[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const named = new Set<string>()
  const namespaces = new Set<string>()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue
    const clause = st.importClause
    if (!clause || clause.isTypeOnly) continue
    if (!isActionModule(st.moduleSpecifier.text)) continue
    if (clause.name) named.add(clause.name.text)
    const nb = clause.namedBindings
    if (!nb) continue
    if (ts.isNamespaceImport(nb)) namespaces.add(nb.name.text)
    else for (const el of nb.elements) if (!el.isTypeOnly) named.add(el.name.text)
  }
  if (named.size === 0 && namespaces.size === 0) return []

  const calleeOf = (e: ts.Expression): string | null => {
    const call = unwrap(e)
    if (!ts.isCallExpression(call)) return null
    const c = unwrap(call.expression)
    if (ts.isIdentifier(c) && named.has(c.text)) return c.text
    if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && namespaces.has(c.expression.text)) {
      return `${c.expression.text}.${c.name.text}`
    }
    return null
  }

  const out: AwaitSite[] = []
  const visit = (node: ts.Node) => {
    if (ts.isAwaitExpression(node)) {
      const callee = calleeOf(node.expression)
      if (callee) {
        out.push({
          file,
          line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          callee,
          guarded: isGuardedAwait(node),
        })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

/** The whole tree: every await of a `'use server'` import under ROOTS. */
export function scanTree(root = process.cwd()): AwaitSite[] {
  const out: AwaitSite[] = []
  for (const file of tsxFiles(ROOTS, root)) {
    const src = read(file, root)
    // Cheap pre-filter: a file with no `await` has no site.
    if (!/\bawait\b/.test(src)) continue
    const isActionModule = (spec: string) => {
      const rel = resolveSpecifier(file, spec, root)
      return rel !== null && isServerActionModule(rel, root)
    }
    out.push(...scanSource(file, src, isActionModule))
  }
  return out
}

/* ───────────────────────── the detector, on fixtures ───────────────────────── */

const fromActions = (spec: string) => spec === './actions'

const bare = (src: string) =>
  scanSource('x.tsx', src, fromActions)
    .filter((s) => !s.guarded)
    .map((s) => `${s.line}:${s.callee}`)

describe('the detector itself', () => {
  it('reads the directive prologue, not the file', () => {
    const parse = (s: string) => ts.createSourceFile('m.ts', s, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
    expect(hasUseServerPrologue(parse("'use server'\nexport async function f() {}"))).toBe(true)
    expect(hasUseServerPrologue(parse('"use server"\nexport async function f() {}'))).toBe(true)
    expect(hasUseServerPrologue(parse("// a comment first\n'use server'\nexport async function f() {}"))).toBe(true)
    expect(hasUseServerPrologue(parse("'use client'\nexport function F() {}"))).toBe(false)
    expect(hasUseServerPrologue(parse('export async function f() {}'))).toBe(false)
    // Below an import it is a string expression, not a directive.
    expect(hasUseServerPrologue(parse("import x from 'y'\n'use server'\nexport async function f() {}"))).toBe(false)
  })

  it('flags a bare await of an action import, by line and callee', () => {
    expect(bare("import { saveThing } from './actions'\nasync function go() {\n  const r = await saveThing(1)\n}")).toEqual([
      '3:saveThing',
    ])
  })

  it('ignores an await of something that is not an action import', () => {
    expect(bare("import { saveThing } from './not-actions'\nasync function go() { await saveThing(1) }")).toEqual([])
    expect(bare("import { saveThing } from './actions'\nasync function go() { await other(1) }")).toEqual([])
    expect(bare("import type { Thing } from './actions'\nasync function go() { await Thing(1) }")).toEqual([])
    expect(bare("import { type Thing, saveThing } from './actions'\nasync function go() { await Thing(1) }")).toEqual([])
  })

  it('passes an await inside the try block of a try/catch or a try/finally', () => {
    expect(bare("import { saveThing } from './actions'\nasync function go() {\n  try {\n    await saveThing(1)\n  } catch {}\n}")).toEqual([])
    expect(bare("import { saveThing } from './actions'\nasync function go() {\n  try {\n    await saveThing(1)\n  } finally { setBusy(false) }\n}")).toEqual([])
  })

  it('does not let a try cover an await in its own catch or finally without an outer try', () => {
    expect(
      bare("import { saveThing } from './actions'\nasync function go() {\n  try {\n    a()\n  } catch {\n    await saveThing(1)\n  }\n}"),
    ).toEqual(['6:saveThing'])
    expect(
      bare("import { saveThing } from './actions'\nasync function go() {\n  try {\n    try { a() } catch { await saveThing(1) }\n  } catch {}\n}"),
    ).toEqual([])
  })

  it('does NOT let an outer try cover an await inside a nested async function — the rejection is the inner function’s', () => {
    // The welcome-modal shape: `startTransition(async () => { await x() })`.
    const src =
      "import { saveThing } from './actions'\nfunction F() {\n  try {\n    startTransition(async () => {\n      await saveThing(1)\n    })\n  } catch {}\n}"
    expect(bare(src)).toEqual(['5:saveThing'])
    // Same with a plain nested function.
    expect(
      bare("import { saveThing } from './actions'\nfunction F() {\n  try {\n    async function inner() { await saveThing(1) }\n  } catch {}\n}"),
    ).toEqual(['4:saveThing'])
  })

  it('treats the callback handed to runAction as guarded, and `await runAction(() => x())` as no site at all', () => {
    expect(
      bare("import { saveThing } from './actions'\nasync function go() {\n  const r = await runAction(async () => {\n    const inner = await saveThing(1)\n    return inner\n  })\n}"),
    ).toEqual([])
    // No inner await: the action call is not awaited by this file, runAction awaits it.
    expect(scanSource('x.tsx', "import { saveThing } from './actions'\nasync function go() { await runAction(() => saveThing(1)) }", fromActions)).toEqual([])
    // A wrapper by any other name is not the guard.
    expect(
      bare("import { saveThing } from './actions'\nasync function go() {\n  await wrap(async () => {\n    await saveThing(1)\n  })\n}"),
    ).toEqual(['4:saveThing'])
  })

  it('reads namespace and default imports, and unwraps parens / as / non-null', () => {
    expect(bare("import * as actions from './actions'\nasync function go() { await actions.saveThing(1) }")).toEqual(['2:actions.saveThing'])
    expect(bare("import save from './actions'\nasync function go() { await save(1) }")).toEqual(['2:save'])
    expect(bare("import { saveThing } from './actions'\nasync function go() { await (saveThing(1) as Promise<X>) }")).toEqual(['2:saveThing'])
    expect(bare("import { saveThing } from './actions'\nasync function go() { await saveThing(1)! }")).toEqual(['2:saveThing'])
  })

  it('resolves relative and alias specifiers to files in this tree, never packages', () => {
    expect(resolveSpecifier('app/(default)/website/editor/website-studio.tsx', './website-actions')).toBe(
      'app/(default)/website/editor/website-actions.ts',
    )
    expect(resolveSpecifier('app/(default)/website/design/design-panel.tsx', '../editor/run-action')).toBe('app/(default)/website/editor/run-action.ts')
    expect(resolveSpecifier('components/ui/x.tsx', '@/lib/run-action')).toBe('lib/run-action.ts')
    expect(resolveSpecifier('components/ui/x.tsx', 'react')).toBeNull()
    expect(resolveSpecifier('components/ui/x.tsx', '@radix-ui/react-dialog')).toBeNull()
  })

  it('recognises a real action module and a real non-action module', () => {
    expect(isServerActionModule('app/(default)/website/editor/website-actions.ts')).toBe(true)
    expect(isServerActionModule('lib/run-action.ts')).toBe(false)
    expect(isServerActionModule('lib/deployment-skew.ts')).toBe(false)
  })
})

/* ───────────────────────── the tree ───────────────────────── */

describe('a client component never bare-awaits a server action', () => {
  const sites = scanTree()
  const bareSites = sites.filter((s) => !s.guarded)

  it('is looking at the tree at all — the instrument check', () => {
    // A detector narrowed until it matches nothing reports CLEAN forever.
    // Both halves must be populated: awaits of actions exist, and some are
    // already guarded (the Studio, the template gallery, the social history).
    expect(sites.length).toBeGreaterThan(150)
    expect(sites.filter((s) => s.guarded).length).toBeGreaterThan(20)
  })

  it('sees the files already written to the law as clean, and sees their guards', () => {
    // The Studio and the design panel go through `runAction(() => x())` —
    // the action is never awaited directly, so they have no site at all,
    // which is the shape the fixture tests pin. The gallery and the social
    // history await inside a try; those sites must be SEEN and seen as
    // guarded, or the detector has lost the `try` half.
    for (const f of [
      'app/(default)/website/editor/website-studio.tsx',
      'app/(default)/website/design/design-panel.tsx',
      'app/(default)/website/templates/templates-gallery.tsx',
      'app/(default)/growth/social/post-history.tsx',
    ]) {
      const here = bareSites.filter((s) => s.file === f)
      expect(here, `${f} has bare awaits: ${here.map((s) => `${s.line}:${s.callee}`).join(', ')}`).toEqual([])
    }
    expect(sites.some((s) => s.file === 'app/(default)/website/templates/templates-gallery.tsx' && s.guarded)).toBe(true)
  })

  it('every bare await is in the dated allowlist at exactly its recorded count', () => {
    const byFile = new Map<string, AwaitSite[]>()
    for (const s of bareSites) byFile.set(s.file, [...(byFile.get(s.file) ?? []), s])
    const allowed = new Map(ALLOWED)

    const detail = (f: string) =>
      (byFile.get(f) ?? []).map((s) => `    ${f}:${s.line} await ${s.callee}(`).join('\n')

    const unlisted = Array.from(byFile.keys())
      .filter((f) => !allowed.has(f))
      .sort()
    const risen = Array.from(byFile.entries())
      .filter(([f, list]) => allowed.has(f) && list.length > allowed.get(f)!)
      .map(([f]) => f)
      .sort()
    const fallen = Array.from(byFile.entries())
      .filter(([f, list]) => allowed.has(f) && list.length < allowed.get(f)!)
      .map(([f, list]) => `${f} (${allowed.get(f)} → ${list.length})`)
      .sort()
    const stale = ALLOWED.filter(([f]) => !byFile.has(f))
      .map(([f]) => f)
      .sort()

    expect(
      unlisted,
      'a client component bare-awaits a server action (CLAUDE.md 2026-10-23): wrap it in runAction(() => …) from lib/run-action.ts, ' +
        'reset busy flags in a finally, and offer Refresh on a stale result — never a retry. The allowlist is dated ' +
        ALLOWLIST_DATED +
        ' and only shrinks.\n' +
        unlisted.map(detail).join('\n') +
        '\n  paste-ready (only on the day the list is taken):\n' +
        unlisted.map((f) => `  ['${f}', ${byFile.get(f)!.length}],`).join('\n'),
    ).toEqual([])
    expect(
      risen,
      'a file on the allowlist gained a bare await — the list only shrinks:\n' + risen.map(detail).join('\n'),
    ).toEqual([])
    expect(fallen, 'a file on the allowlist has FEWER bare awaits than recorded — edit its count down (the ratchet)').toEqual([])
    expect(stale, 'a file on the allowlist has no bare await left — remove its entry').toEqual([])
  })

  it('the allowlist total never rises above the ceiling it was taken at', () => {
    const total = ALLOWED.reduce((n, [, c]) => n + c, 0)
    expect(total, 'lower ALLOWLIST_CEILING as you sweep; never raise it').toBeLessThanOrEqual(ALLOWLIST_CEILING)
    expect(new Set(ALLOWED.map(([f]) => f)).size, 'a file is listed twice').toBe(ALLOWED.length)
  })

  it('the `.ts` gap is still closed: no client `.ts` module under the roots awaits anything', () => {
    // `tsxFiles` walks `.tsx` only. The day a `'use client'` hook in a `.ts`
    // file awaits an action, this fails and the walk must widen.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) {
          const src = readFileSync(full, 'utf8')
          if (/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use client['"]/.test(src) && /\bawait\b/.test(src)) offenders.push(full)
        }
      }
    }
    for (const r of ROOTS) walk(resolve(process.cwd(), r))
    expect(offenders).toEqual([])
  })
})
