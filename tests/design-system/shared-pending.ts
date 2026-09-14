/**
 * ONE BUTTON'S BUSY STATE IS NOT EVERY BUTTON'S.
 *
 * Distinct from the escape-hatch class in `pending-feedback.test.ts`, and NOT
 * closed by it: those were Cancel/Back buttons carrying somebody else's busy
 * flag, and they became `disabled`. These are controls that each do REAL work
 * — Mark contacted next to Convert, Check now next to Remove, five bulk
 * actions in one toolbar, a Send on every row of a list — all reading one
 * `useTransition`. Press any one and every one of them spins, so the
 * interface says "all of this is running" when exactly one thing is.
 *
 * The fix has been in the repo since batch 46 and is spelled out at
 * `app/(default)/ecommerce/customers/[id]/referral-card.tsx` — a
 * discriminator the transition sets, read per control:
 *
 *     pending={pending && active === 'save'} disabled={pending}
 *
 * `pending` on the one that is working, `disabled` on all of them, because
 * while the transition runs none of them can be used. Both halves matter:
 * without `disabled` the others look idle and clickable.
 *
 * TWO RULES, BECAUSE THE DEFECT HAS TWO SHAPES AND ONLY ONE OF THEM HAS
 * SIBLINGS IN THE SOURCE.
 *
 *   1. SIBLINGS — two or more source sites in one component reading the same
 *      bare flag, running different handlers.
 *
 *   2. PER ROW — ONE source site inside a `.map()` callback, reading a flag
 *      that IS the component's `useTransition`. It has no sibling to group
 *      with, so rule 1 is structurally blind to it: it is one line of source
 *      and N buttons on screen. This is the commonest form of the defect —
 *      "acting on one product spins every row on the page" — and it is what
 *      a sibling-only version of this scan let through on
 *      `growth/reviews/eligible-list.tsx`, a site DREAMCRM-36 named by hand.
 *
 * Rule 2 is restricted to a flag destructured from `useTransition()` in the
 * same scope, and that restriction is load-bearing rather than incidental.
 * A flag that IS the transition means "something in this component is
 * running", which is exactly the claim that goes wrong once per row. A prop,
 * or a derived `const busy = pendingId === row.id`, has already been narrowed
 * by whoever wrote it. Without the restriction the rule matches 10 in-map
 * sites to catch 2, and a guard that reports eight correct sites is a guard
 * people switch off.
 *
 * WHAT NEITHER RULE CAN SEE, and why the exemptions are a LIST OF REASONS
 * rather than a count. Two controls in mutually exclusive branches —
 * `stage.type === 'upload'` vs `'mapping'`, an early `return`, the arms of a
 * ternary — are never on screen together, so sharing a flag is correct.
 * Deciding that needs a human reading the render, so each one is named with
 * why. A number would say how many we tolerate; a list says which, and goes
 * stale visibly.
 *
 * Groups whose controls all run the SAME handler are not offenders and are
 * not listed: one action rendered in two places (a Refresh in the header and
 * the same Refresh in the empty state) is one piece of work, and one flag is
 * the truth about it.
 */

import { isTransitionFlag, tagSites, tsxFiles, type TagSite } from './jsx-attrs'

export const ROOTS = ['app', 'components']

/**
 * A flag with nothing narrowing it. `pending && active === 'save'` and
 * `busy('row:1')` have both answered the question; `handlers.pending` and
 * `props.pending` have NOT — a passthrough is as bare as a local, so a member
 * expression counts here rather than being waved through as "not an
 * identifier".
 */
export function isBareFlag(expr: string): boolean {
  return /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(expr)
}

function handlerOf(attrs: Map<string, string>): string {
  return (attrs.get('onClick') ?? attrs.get('onToggle') ?? attrs.get('onSave') ?? '?').replace(/\s+/g, ' ')
}

export interface Offender {
  /** `file|Component|flag` — stable across edits, unlike a byte offset. */
  key: string
  rel: string
  flag: string
  lines: number[]
  rule: 'siblings' | 'per-row'
}

function bareFlagSites(): TagSite[] {
  return tagSites(tsxFiles(ROOTS)).filter((s) => {
    const flag = s.attrs.get('pending')
    return flag !== undefined && isBareFlag(flag)
  })
}

/** Rule 1 — two or more source sites, same scope, same flag, different work. */
export function siblingGroups(sites = bareFlagSites()): Offender[] {
  const byKey = new Map<string, TagSite[]>()
  for (const s of sites) {
    const key = `${s.rel}|${s.scope.name}|${s.attrs.get('pending')}`
    byKey.set(key, (byKey.get(key) ?? []).concat(s))
  }
  const out: Offender[] = []
  for (const [key, group] of Array.from(byKey)) {
    if (group.length < 2) continue
    if (new Set(group.map((s: TagSite) => handlerOf(s.attrs))).size < 2) continue
    out.push({
      key,
      rel: group[0].rel,
      flag: group[0].attrs.get('pending')!,
      lines: group.map((s: TagSite) => s.line),
      rule: 'siblings',
    })
  }
  return out
}

/** Rule 2 — one source site inside a `.map()`, reading the transition itself. */
export function perRowSites(sites = bareFlagSites()): Offender[] {
  return sites
    .filter((s) => s.inMap && isTransitionFlag(s.src, s.scope, s.attrs.get('pending')!))
    .map((s) => ({
      key: `${s.rel}|${s.scope.name}|${s.attrs.get('pending')}`,
      rel: s.rel,
      flag: s.attrs.get('pending')!,
      lines: [s.line],
      rule: 'per-row' as const,
    }))
}

export function allOffenders(): Offender[] {
  const sites = bareFlagSites()
  const merged = new Map<string, Offender>()
  for (const o of siblingGroups(sites).concat(perRowSites(sites))) {
    const prior = merged.get(o.key)
    if (prior) prior.lines = Array.from(new Set(prior.lines.concat(o.lines))).sort((a, b) => a - b)
    else merged.set(o.key, { ...o })
  }
  return Array.from(merged.values())
}
