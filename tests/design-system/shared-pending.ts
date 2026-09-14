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

import {
  isTransitionFlag,
  startsTransition,
  tagSites,
  transitionStarter,
  tsxFiles,
  type TagSite,
} from './jsx-attrs'

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

/**
 * THE CONVERSE: A PRIMITIVE THAT ONLY GREYS OUT SAYS NOTHING.
 *
 * The rules above, and the ternary rule in `pending-feedback.test.ts`, all
 * assert that a hand-rolled busy state is GONE. None of them asserts the
 * primitive's own one is THERE — and that gap is not hypothetical. Batch 60
 * widened `LABEL_TERNARY`, found 18 `ActionButton` label swaps, and deleted
 * them all on the premise rule 1 states out loud: "the button already passes
 * `pending`, so the ternary is pure duplication."
 *
 * Seven of them did. ELEVEN DID NOT, and for those the ternary was the only
 * busy feedback the button had. They came out of that round greying on
 * `disabled` and saying nothing at all — no spinner, no `aria-busy`, no
 * label — which is worse than the "Sending…" they started with. One was the
 * referral partner's Withdraw button: the single control in the product that
 * moves money to somebody's own bank account, going silent for the length of
 * a Stripe Connect payout.
 *
 * So this rule is the other half of the pair. A branded primitive whose
 * `disabled` expression reads a busy flag, and which has no `pending` of its
 * own, is an offender: it has been told work is running and declines to say
 * so. `disabled` alone stays correct for an ESCAPE HATCH (Cancel, Back) —
 * those are covered by their own rule and never carry `pending` — so the
 * exit labels are excluded here for the same reason they are required there.
 *
 * WHAT IT REACHES, precisely — because a rule whose stated reach exceeds its
 * actual reach is what cost this repo four days once already. The flag must be
 * a LOCAL `useTransition` in the button's own component scope: `startsTransition`
 * needs a starter to check the `onClick` against, and a flag that arrived as a
 * PROP has none to check. So a prop (`gbp-sync-card.tsx`'s `busy`) or a
 * props-object member (`integrations-library.tsx`'s `handlers.pending`) is out
 * of reach — both are live examples, both were among the eleven this rule was
 * written for, and both were fixed by hand rather than by the guard.
 *
 * That is deliberately the OPPOSITE view of the same expression from
 * `isBareFlag`, which counts `handlers.pending` as bare for rules 1 and 2 on
 * the grounds that a passthrough has narrowed nothing. Rules 1 and 2 ask "is
 * this flag narrowed?" and a passthrough is not; this rule asks "does THIS
 * button start the work?" and a passthrough cannot answer. Widening it would
 * mean giving up the narrowing that makes it shippable at all.
 *
 * NARROWED to buttons whose OWN `onClick` reaches the transition's starter.
 * The first draft asked only "does `disabled` read a busy flag", and it named
 * 22 sites to catch the 11 — because a button can be unavailable while a
 * SIBLING works (the lead drawer's Archive beside a running Convert), or hand
 * its transition to a parent that closes the surface on the spot (Mark
 * contacted), or do nothing but flip local state (Edit reply). None of those
 * owes anybody a spinner, and a guard with a twenty-entry allowlist on day
 * one is the shape this repo already rejected once.
 */

/** Identifiers that mean "work is running" rather than "this is unavailable". */
const BUSY_FLAG = /^(?:[\w$]*\.)?(?:pending|isPending|busy|isBusy|saving|sending|loading|submitting|[\w$]*Pending|[\w$]*ing(?:All)?)$/

const EXIT_LABELS = new Set([
  'Cancel', 'Back', 'Close', 'Keep', 'Dismiss', 'Discard',
  'Never mind', 'Not now', 'Nevermind',
])

/** Primitives whose busy state is the shared BusyLabel — the ones with a
 *  `pending` prop to leave out in the first place. */
const BUSY_CAPABLE = ['ActionButton', 'BrandButton', 'GhostButton', 'ActionPill']

export interface SilentButton {
  rel: string
  line: number
  tag: string
  flag: string
  label: string
}

export function silentlyDisabled(): SilentButton[] {
  const out: SilentButton[] = []
  for (const s of tagSites(tsxFiles(ROOTS), BUSY_CAPABLE)) {
    if (!BUSY_CAPABLE.includes(s.name)) continue
    if (s.attrs.has('pending')) continue
    const disabled = s.attrs.get('disabled')
    if (!disabled) continue
    // The first term of the `disabled` expression is the flag, if any:
    // `pending || !canWithdraw` → `pending`.
    const first = disabled.split('||')[0].trim()
    if (!BUSY_FLAG.test(first)) continue
    const starter = transitionStarter(s.src, s.scope, first)
    if (!starter) continue
    if (!startsTransition(s.src, s.scope, s.attrs.get('onClick') ?? '', starter)) continue
    const label = s.children.replace(/\s+/g, ' ').trim()
    if (EXIT_LABELS.has(label)) continue
    out.push({ rel: s.rel, line: s.line, tag: s.name, flag: first, label: label.slice(0, 48) })
  }
  return out
}
