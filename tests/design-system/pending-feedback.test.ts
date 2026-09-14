import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tagSites, tsxFiles } from './jsx-attrs'

/**
 * THE BUSY STATE LIVES IN THE PRIMITIVE, NOT IN A TERNARY.
 *
 * `ActionButton` takes `pending` and does the whole job: it disables the
 * button, announces `aria-busy`, and overlays a spinner while KEEPING the
 * label in the layout at `opacity-0` so the width never jumps mid-action.
 *
 * A hand-rolled `{pending ? 'Saving…' : 'Save'}` does none of that. It swaps
 * the text, which reflows the button under the cursor, leaves the control
 * clickable unless the author separately remembered `disabled`, and tells a
 * screen reader nothing — the accessible name simply changes, which is not
 * an announcement. Sixty-seven of them were live across `app/` and
 * `components/` when this guard was written, on buttons that in most cases
 * ALREADY passed `pending` — so the ternary was pure duplication that could
 * only drift from the primitive.
 *
 * TWO RULES, DELIBERATELY DIFFERENT IN SHAPE:
 *
 * 1. On `ActionButton` the count is ZERO and stays zero. The primitive is
 *    right there; there is no case for re-implementing it one level up.
 *
 * 2. On raw `<button>` the count is a CEILING that may only fall. Those are
 *    a mixed population — clinic-branded portal and public-site buttons that
 *    paint `style={{ backgroundColor: brand }}` and cannot become the teal
 *    dashboard primitive, menu rows, and dashboard buttons that genuinely
 *    should be `ActionButton`. Converting them is judgement per site, so the
 *    guard ratchets rather than forbids: every batch that converts a few
 *    lowers CEILING, and nobody can add a new one in the meantime.
 *
 * BATCH 53 added rule 1's siblings. `BrandButton`, `GhostButton` and the
 * visit card's `ActionPill` now take `pending` too — the affordance is the
 * shared `BusyLabel` (components/ui/busy-label.tsx), whose spinner rings in
 * `currentColor` so a clinic's own brand tints it and the dashboard's teal
 * never reaches the portal. Those three are held at ZERO for the same reason
 * ActionButton is: the primitive is right there.
 */

const ROOTS = ['app', 'components']

/** `{cond ? 'Saving…' : 'Save'}` — a JSX child whose two arms are string
 *  literals and whose busy arm carries an ellipsis. */
const LABEL_TERNARY = /\{\s*([^{}?]{1,80}?)\s*\?\s*'([^']*)'\s*:\s*'([^']*)'\s*\}/g

/** Raw `<button>` sites still hand-rolling the swap. Only ever lower this.
 *  78 → 71 in batch 53 (the portal's Send / Save changes / Request my records
 *  / Redeem became BrandButton; the four public-site submits kept their own
 *  skins and took the shared BusyLabel). */
const RAW_BUTTON_CEILING = 71

/** The branded primitives that now carry `pending`, held at zero like
 *  ActionButton. `ActionPill` is file-local to visit-card.tsx — it is a
 *  patient-facing pill on the same contract, so it plays by the same rule. */
const BRANDED_PRIMITIVES = ['BrandButton', 'GhostButton', 'ActionPill']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * The name of the element this expression is a child of — walked backwards
 * from the expression, counting closing tags so a preceding sibling's own
 * children are skipped over. Self-closing siblings are not a nesting level.
 */
function enclosingTag(src: string, at: number): string {
  let depth = 0
  let i = at - 1
  while (i >= 0) {
    if (src[i] !== '>') {
      i--
      continue
    }
    let j = i
    while (j >= 0 && src[j] !== '<') j--
    if (j < 0) return '?'
    const tag = src.slice(j, i + 1)
    if (tag.startsWith('</')) depth++
    else if (!tag.endsWith('/>')) {
      if (depth === 0) return (tag.match(/^<([A-Za-z0-9_.]+)/) ?? [, '?'])[1] as string
      depth--
    }
    i = j - 1
  }
  return '?'
}

interface Site {
  rel: string
  line: number
  tag: string
  busyLabel: string
}

function collect(): Site[] {
  const root = process.cwd()
  const sites: Site[] = []
  for (const file of ROOTS.flatMap((d) => walk(resolve(root, d)))) {
    const src = readFileSync(file, 'utf8')
    const rel = file.slice(root.length + 1).split('\\').join('/')
    LABEL_TERNARY.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = LABEL_TERNARY.exec(src))) {
      const [, , busyArm] = m
      if (!/…|\.\.\./.test(busyArm)) continue
      sites.push({
        rel,
        line: src.slice(0, m.index).split('\n').length,
        tag: enclosingTag(src, m.index),
        busyLabel: busyArm,
      })
    }
  }
  return sites
}

describe('pending feedback comes from the primitive', () => {
  const sites = collect()

  it('finds the ternaries at all (the guard is not silently matching nothing)', () => {
    expect(sites.length).toBeGreaterThan(20)
  })

  it('no ActionButton hand-rolls a pending label — it has a `pending` prop', () => {
    const offenders = sites
      .filter((s) => s.tag === 'ActionButton')
      .map((s) => `${s.rel}:${s.line} → {…? '${s.busyLabel}' : …}`)
    expect(offenders).toEqual([])
  })

  it('no branded primitive hand-rolls a pending label either', () => {
    // The portal and the public site could not adopt ActionButton (its teal
    // gradient would paint over the clinic's own colour), which is exactly
    // why every patient-facing button used to swap its own label. Now that
    // the three branded primitives take `pending`, a ternary on one of them
    // is the same duplication rule 1 forbids on ActionButton.
    const offenders = sites
      .filter((s) => BRANDED_PRIMITIVES.includes(s.tag))
      .map((s) => `${s.rel}:${s.line} <${s.tag}> → {…? '${s.busyLabel}' : …}`)
    expect(
      offenders,
      `Pass pending= instead — a label swap reflows the button under the ` +
        `patient's thumb and announces nothing:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })

  it(`raw <button> pending ternaries only ever go down (ceiling ${RAW_BUTTON_CEILING})`, () => {
    const raw = sites.filter((s) => s.tag === 'button')
    expect(
      raw.length,
      raw.length > RAW_BUTTON_CEILING
        ? `New hand-rolled pending ternary on a raw <button>. Use ActionButton ` +
          `pending= on the dashboard, or add the busy state to the branded ` +
          `primitive on portal/site surfaces.\n` +
          raw.map((s) => `  ${s.rel}:${s.line}`).join('\n')
        : `RAW_BUTTON_CEILING is stale — ${raw.length} left, lower it.`,
    ).toBe(RAW_BUTTON_CEILING)
  })
})

/**
 * THE ESCAPE HATCH IS NEVER THE THING THAT IS BUSY.
 *
 * A spinner is a claim: *this button's work is running*. Putting the shared
 * `pending` flag on Cancel, Back, Keep, or a disclosure toggle makes that
 * claim falsely — and worse, it turns the one control a person reaches for
 * when they want OUT into a second spinner, so the modal reads as though it
 * is saving twice and offering no exit at all.
 *
 * `disabled` is the honest state for these: the exit is unavailable while
 * work runs, and it says so without pretending to be the work.
 *
 * Seventeen of them were live when this guard was written — the punch list
 * had counted six, because it had only looked in modals.
 *
 * The rule is mechanical on purpose, so it cannot be argued with:
 *
 * - An `onClick` that is nothing but a local state setter (`() => setOpen(
 *   false)`, `() => setEditing(true)`) does no work by definition, so it can
 *   never have a busy state.
 * - A button whose whole label is a bare exit word is an escape hatch.
 *   "Cancel appointment", "Cancel scheduled send" and "Cancel add-on" are
 *   real destructive actions and keep their spinner — the exact-match is
 *   what separates them.
 */

const EXIT_LABELS = [
  'Cancel', 'Back', 'Close', 'Keep', 'Dismiss', 'Discard',
  'Never mind', 'Not now', 'Nevermind',
]

/** An onClick that only flips local state — no server action, no handler. */
const PURE_SETSTATE = /^\(\)\s*=>\s*\{?\s*set[A-Z][A-Za-z0-9]*\(/
/**
 * `pending={pending && active === 'save'}` — the discriminating shape from
 * `referral-card.tsx`, which names WHICH of several buttons sharing one flag
 * is the one doing the work. A button spelling that has already thought
 * about the question, so it is out of scope here even if its handler happens
 * to be named `setSomething` (several are: a `setFocus` that opens a
 * transition is a handler, not a `useState` setter).
 *
 * A CALL — `pending={busy(`job:${j.id}`)}` — counts too, and batch 60 added
 * it: a list long enough to need a key per row reads better through a
 * predicate than through the inline conjunction repeated nine times, and it
 * is the same claim about the same question.
 */
const DISCRIMINATING = /&&|===|\(/

/**
 * REBUILT in batch 60 on the shared tag reader. The original pair of regexes
 * read `<ActionButton[^>]*>` and capped the body at 160 characters, which
 * meant a button whose `onClick` was a MULTI-LINE arrow — the exact shape a
 * pure state setter takes when it flips two things — matched neither rule.
 * Two live offenders were sitting behind that gap on the Google review card
 * (an Edit reply and a Cancel, both carrying the card's `pending`).
 */
function actionButtons(): Array<{ rel: string; line: number; onClick: string; label: string; summary: string }> {
  return tagSites(tsxFiles(ROOTS), ['ActionButton'])
    .filter((s) => s.name === 'ActionButton')
    .filter((s) => {
      const p = s.attrs.get('pending')
      return p !== undefined && !DISCRIMINATING.test(p)
    })
    .map((s) => ({
      rel: s.rel,
      line: s.line,
      onClick: (s.attrs.get('onClick') ?? '').replace(/\s+/g, ' ').trim(),
      label: s.children.trim(),
      summary: `${Array.from(s.attrs, ([k, v]) => `${k}={${v}}`).join(' ')} > ${s.children.trim()}`.replace(/\s+/g, ' ').slice(0, 110),
    }))
}

describe('escape hatches disable, they do not spin', () => {
  const buttons = actionButtons()

  it('finds ActionButtons carrying pending at all', () => {
    expect(buttons.length).toBeGreaterThan(20)
  })

  it('a button whose onClick only flips local state never carries `pending`', () => {
    const offenders = buttons
      .filter((b) => PURE_SETSTATE.test(b.onClick))
      .map((b) => `${b.rel}:${b.line} — ${b.summary}`)
    expect(offenders).toEqual([])
  })

  it('a bare Cancel/Back/Keep/Close never carries `pending`', () => {
    const offenders = buttons
      .filter((b) => EXIT_LABELS.includes(b.label))
      .map((b) => `${b.rel}:${b.line} — ${b.summary}`)
    expect(offenders).toEqual([])
  })
})

/**
 * SIBLING ACTIONS DO NOT SHARE ONE `pending` FLAG.
 *
 * Distinct from the escape-hatch class above, and NOT closed by it: those
 * were Cancel/Back buttons carrying somebody else's busy flag, and they
 * became `disabled`. These are siblings that each do REAL work — Mark
 * contacted next to Convert, Check now next to Remove, five bulk actions in
 * one toolbar — all reading one `useTransition`. Press any one and every one
 * of them spins, so the interface says "all of this is running" when exactly
 * one thing is.
 *
 * The fix has been in the repo since batch 46 and is spelled out at
 * `app/(default)/ecommerce/customers/[id]/referral-card.tsx` — a discriminator
 * the transition sets, read per button:
 *
 *     pending={pending && active === 'save'} disabled={pending}
 *
 * `pending` on the one that is working, `disabled` on all of them, because
 * while the transition runs none of them can be used. Both halves matter:
 * without `disabled` the other buttons look idle and clickable.
 *
 * WHAT THIS RULE CANNOT SEE, and why the exemptions below are a LIST OF
 * REASONS rather than a count. Two buttons in mutually exclusive branches —
 * `stage.type === 'upload'` vs `'mapping'`, an early `return` — are never on
 * screen together, so sharing a flag is correct. Deciding that needs a human
 * reading the render, so each one is named here with why. A number would say
 * how many we tolerate; a list says which, and goes stale visibly.
 *
 * Groups whose buttons all run the SAME handler are not offenders and are not
 * listed: one action rendered in two places (a Refresh in the header and the
 * same Refresh in the empty state) is one piece of work, and one flag is the
 * truth about it.
 */

/** Reviewed and correct — the buttons are never on screen at the same time. */
const NOT_SIMULTANEOUS: Record<string, string> = {
  'app/(default)/dashboard/guardian-audience-control.tsx|pending':
    'the `confirming` branch and the un-confirmed branch are the two arms of one ternary',
  'app/(default)/partners/partners-table.tsx|busy':
    '`busy` is already `pendingId === p.id` (per row), and Resend / Suspend / Reactivate are selected by `p.status` — a row shows exactly one',
  'app/(default)/patients/import-patients-modal.tsx|pending':
    'the wizard renders one `stage.type` at a time — Next: match columns and Import are different steps',
  'app/(default)/platform/prospecting/demo/[id]/brief-panel.tsx|pending':
    'Generate returns early when there is no brief yet; Regenerate only renders once there is one',
}

/**
 * Still to fix — the money surfaces, which go through the review gate and so
 * ship as their own PR (DREAMCRM-36). This list may only ever SHRINK, and
 * deleting the last entry deletes the list.
 */
const AWAITING_MONEY_SWEEP = [
  'app/(default)/integrations/integrations-library.tsx|pending',
  'app/(default)/partners/delete-partner-modal.tsx|pending',
  'app/(default)/payments/memberships/memberships-client.tsx|isPending',
  'app/(default)/shop/coupons/coupons-client.tsx|isPending',
  'app/(default)/shop/orders/orders-client.tsx|isPending',
  'app/(default)/shop/shop-client.tsx|isPending',
]

interface SharedGroup {
  rel: string
  flag: string
  lines: number[]
}

interface GroupSite {
  line: number
  handler: string
}

function sharedPendingGroups(): SharedGroup[] {
  const byKey = new Map<string, { rel: string; flag: string; sites: GroupSite[] }>()
  for (const site of tagSites(tsxFiles(ROOTS))) {
    const flag = site.attrs.get('pending')
    if (!flag) continue
    // Already discriminated (`pending && active === 'save'`), or not a bare
    // flag at all — nothing to say about it.
    if (!/^[A-Za-z_$][\w$]*$/.test(flag)) continue
    const key = `${site.rel}|${site.scope}|${flag}`
    const entry = byKey.get(key) ?? { rel: site.rel, flag, sites: [] }
    entry.sites.push({
      line: site.line,
      handler: (site.attrs.get('onClick') ?? site.attrs.get('onToggle') ?? site.attrs.get('onSave') ?? '?').replace(/\s+/g, ' '),
    })
    byKey.set(key, entry)
  }
  return Array.from(byKey.values())
    .filter((g) => g.sites.length > 1 && new Set(g.sites.map((s: GroupSite) => s.handler)).size > 1)
    .map((g) => ({ rel: g.rel, flag: g.flag, lines: g.sites.map((s: GroupSite) => s.line) }))
}

describe('siblings do not share one pending flag', () => {
  const groups = sharedPendingGroups()

  it('the scan sees the shape at all (the exemptions are real groups)', () => {
    // Every exemption must still match something. When a surface is rewritten
    // the entry goes stale silently otherwise, and a stale exemption is a hole.
    const found = new Set(groups.map((g) => `${g.rel}|${g.flag}`))
    const stale = Object.keys(NOT_SIMULTANEOUS).concat(AWAITING_MONEY_SWEEP).filter((k) => !found.has(k))
    expect(stale, `These entries no longer match any group — delete them:\n  ${stale.join('\n  ')}`).toEqual([])
  })

  it('no surface runs two different actions off one undiscriminated flag', () => {
    const offenders = groups
      .map((g) => ({ key: `${g.rel}|${g.flag}`, g }))
      .filter(({ key }) => !(key in NOT_SIMULTANEOUS) && !AWAITING_MONEY_SWEEP.includes(key))
      .map(({ g }) => `${g.rel} — pending={${g.flag}} on lines ${g.lines.join(', ')}`)
    expect(
      offenders,
      `Pressing one of these spins all of them. Name which one is working:\n` +
        `  pending={${'pending'} && active === '<key>'} disabled={${'pending'}}\n` +
        `(see referral-card.tsx). If they are never on screen together, add the\n` +
        `group to NOT_SIMULTANEOUS with the reason:\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })
})
