import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import React from 'react'
import { ROOT } from './palette'

/**
 * A COMPONENT THAT SWAPS WHAT IS ON SCREEN UNDER ITS OWN STATE MACHINE HAS TO
 * SAY SO.
 *
 * Sighted patients watch the surface change. A screen-reader user gets nothing
 * unless the component makes the change speak, because nothing about a React
 * re-render is an event the assistive tech hears. The repo has two instruments
 * for it and they are not interchangeable:
 *
 *  - **The surface stays mounted** → a polite `role="status"` region narrates
 *    the new phase. The reference is the portal slot picker
 *    (`components/patient-portal/slot-picker.tsx`): checking → what landed.
 *  - **The surface is REPLACED** → move focus into the new content. A live
 *    region cannot carry this one: it mounts already-populated, which is
 *    exactly the case screen readers do not reliably announce, and focus
 *    otherwise falls back to `<body>`. The reference is `BookingSuccess`
 *    (`app/site/[slug]/book/book-form.tsx`): the heading takes `tabIndex={-1}`
 *    and is focused on mount.
 *
 * ── WHAT THIS FILE USED TO BE, AND WHY IT CHANGED (DREAMCRM-116).
 *
 * It pinned TWO components by name. That holds two components. It says nothing
 * at zero — a third file with the same defect is not a failure here, it is
 * simply not looked at — and the `docs/RELEASE.md` Part 5 entry that sent this
 * work over is the proof: the portal's post-visit survey card drove
 * `'ask' → 'comment' → 'done'` in silence for months, one directory away from
 * the slot picker this file already tested, and nothing went red.
 *
 * So the population is DERIVED from the tree now. The rendered contracts below
 * are still here — they grade real behaviour, which no static rule can — but
 * the gate underneath them is a walk.
 */

/* ── the eyes ────────────────────────────────────────────────────────────── */

/**
 * THE PATIENT-FACING TREE, and why this rule stops at its edge.
 *
 * `app/(portal)` and `components/patient-portal` are the patient portal;
 * `app/site` and `components/clinic-site` are the public clinic sites. The
 * single-letter directories are DERIVED rather than listed — every top-level
 * `app/<x>/` whose name is one letter is a token landing page a patient opens
 * from a text message (`app/b` a bill, `app/c` a confirmation, `app/n` a
 * survey, and six more). `dimmed-text.test.ts` had to be widened by hand to
 * reach exactly those after they sat outside a rule with nothing said about
 * them; deriving the family means `app/x` is swept the day it is created,
 * which a list cannot promise.
 *
 * **THE STAFF TREE IS OUT, AND THAT IS A DEFERRAL WITH A NUMBER ON IT, NOT A
 * BLIND SPOT NOBODY MEASURED.** The same walk over `app/(default)`,
 * `app/(double-sidebar)`, `app/(partner)`, `app/(auth)` and `components/`
 * returns 33 more `useState` string-literal unions, and they are dominated by
 * two idioms this contract does not describe:
 *
 *   · **21 are nullable** — `useState<'convert' | 'link' | 'separate' | null>`
 *     is the repo's "which of these buttons is in flight" flag, not a phase.
 *     They are excluded here too, by the SAME content rule (see `isPhase`),
 *     so this is a shape exclusion rather than a directory one.
 *   · **9 are tab or segment selections** — `'roles' | 'applicants'`,
 *     `'monthly' | 'annual'`, `'desktop' | 'mobile'`. A tab strip owes
 *     `aria-selected`/`aria-controls`, which is a different rule with a
 *     different instrument, and writing it as a live region would be wrong.
 *
 * That leaves a handful of genuine staff-side phase machines. They are worth a
 * batch; they are not worth pretending this rule already covers them. The
 * assertion under "the staff tree is deferred, not forgotten" holds that count
 * so the deferral cannot quietly become a pardon.
 */
const PATIENT_ROOTS = [
  'app/(portal)',
  'app/site',
  'components/patient-portal',
  'components/clinic-site',
]

/** Every top-level `app/<letter>/` — the token landings, derived not listed. */
export function tokenLandingRoots(): string[] {
  return readdirSync(join(ROOT, 'app'))
    .filter((e) => /^[a-z]$/.test(e) && statSync(join(ROOT, 'app', e)).isDirectory())
    .map((e) => `app/${e}`)
    .sort()
}

export function scanRoots(): string[] {
  return [...PATIENT_ROOTS, ...tokenLandingRoots()]
}

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.tsx?$/.test(entry)) out.push(path)
  }
  return out
}

/** Every file this rule opens — the instrument's field of view. */
export function sweptFiles(): string[] {
  return scanRoots().flatMap((root) =>
    walk(join(ROOT, root)).map((p) => relative(ROOT, p).replace(/\\/g, '/')),
  )
}

/** A union of two or more string literals, optionally nullable. */
const UNION = /^'[^']*'(?:\s*\|\s*(?:'[^']*'|null))+$/

/**
 * A NULLABLE UNION IS NOT A PHASE MACHINE.
 *
 * `useState<'pay' | 'suspend' | 'resend' | null>(null)` is the repo's
 * which-button-is-in-flight flag: it tracks which of several pills should show
 * a spinner while a shared `pending` disables them all. The busy state is
 * already announced — `aria-busy` on the pressed control, which
 * `components/ui/busy-label.tsx` and the visit card's `ActionPill` both
 * carry — and it has no terminal state to narrate. Two of the files IN this
 * rule's own population carry one alongside their real machine
 * (`visit-card.tsx`'s `active`, the intake runner's `uploading`), which is why
 * this is a per-MACHINE exclusion and not a per-file one.
 */
export function isPhase(union: string): boolean {
  return UNION.test(union) && !/\|\s*null$/.test(union)
}

export type Machine = { file: string; line: number; name: string; setter: string; union: string; via: string }

const DECL = /const\s*\[\s*(\w+)\s*,\s*(set\w+)\s*\]\s*=\s*useState<\s*([^>]+?)\s*>\s*\(/g

/**
 * Every phase machine one file declares.
 *
 * **IT RESOLVES A LOCAL TYPE ALIAS, AND THAT IS NOT A NICETY.** The first
 * derivation written for this rule read `useState<'a' | 'b'>` only, and
 * returned 15 files — the number the issue that commissioned it carried.
 * Three more were writing the identical machine through a one-line alias:
 * `type State = 'pending' | 'confirmed' | 'cancelled' | 'past'` in
 * `app/c/[token]/confirm-form.tsx`, `type Status` in `app/w/[token]/claim-form.tsx`,
 * `type Mode` in `app/site/[slug]/intake-start/intake-start-form.tsx`. The last
 * of those was a real unannounced defect — the clinic-site sign-in form's error
 * paragraph had no `role="alert"` and its mode toggle had no named group — and
 * a rule that reads one spelling of a declaration would have reported the tree
 * clean while it sat there. A guard's EYES are graded separately from its
 * predicate (§2d); this is the eyes.
 */
export function machinesIn(file: string, src: string): Machine[] {
  const out: Machine[] = []
  for (const m of Array.from(src.matchAll(DECL))) {
    const arg = m[3].replace(/\s+/g, ' ').trim()
    const line = src.slice(0, m.index).split('\n').length
    if (UNION.test(arg)) {
      out.push({ file, line, name: m[1], setter: m[2], union: arg, via: 'inline' })
      continue
    }
    if (!/^[A-Z]\w*$/.test(arg)) continue
    const alias = new RegExp(`type\\s+${arg}\\s*=\\s*([^\\n]+)`).exec(src)
    if (!alias) continue
    const resolved = alias[1].replace(/\s+/g, ' ').trim().replace(/;$/, '')
    if (UNION.test(resolved)) {
      out.push({ file, line, name: m[1], setter: m[2], union: resolved, via: `type ${arg}` })
    }
  }
  return out.filter((x) => isPhase(x.union))
}

/* ── the predicate ───────────────────────────────────────────────────────── */

/** A live region, in any of the three spellings the tree actually uses. */
const LIVE = /role=["'](?:status|alert)["']|aria-live=|role=\{[^}]*["'](?:status|alert)["']/

/** A phase swap that REPLACES the surface, announced by moving focus into it. */
const FOCUS_MOVE = /tabIndex=\{-1\}/

/**
 * THE BLIND SPOT A GREP OVER THE CALL SITE HAS, AND WHY THIS RESOLVES IMPORTS.
 *
 * The Part 5 entry that commissioned this work states that
 * `components/patient-portal/survey-card.tsx` contained ZERO live regions,
 * grep-verified. That was true of the FILE, and it was not true of the
 * rendered output: the card's error text was already announced, by
 * `PortalErrorText`, which carries `role="alert"` inside its own body
 * (`components/patient-portal/ui.tsx:307`). "No live region in this file" and
 * "nothing here is announced" are different claims, and a rule that conflates
 * them fails PRs for markup that is already correct.
 *
 * So the predicate resolves one level of import: for each `import { A, B } from
 * '…'` that lands on a repo file, it reads that module and asks which of its
 * exported components render a live region in their OWN body — bounded at the
 * next top-level declaration, not at the next `export`, because an unbounded
 * slice makes every page component in the repo look like a primitive.
 *
 * One level is deliberate and it is the false-NEGATIVE direction: a primitive
 * that announces through a second primitive is not seen, so the rule asks for a
 * region the author has to write. The assertion under "the import resolution
 * reads what it claims" pins the specific hop this paragraph is about, against
 * `ui.tsx`'s real source, so the claim cannot rot into a comment.
 */
function announcingExportsOf(file: string): string[] {
  const src = readFileSync(join(ROOT, file), 'utf8')
  const names: string[] = []
  for (const m of Array.from(src.matchAll(/^export function ([A-Z]\w*)/gm))) {
    const rest = src.slice(m.index! + 1)
    const next = rest.search(/^(?:export |function |const )/m)
    if (LIVE.test(next === -1 ? rest : rest.slice(0, next))) names.push(m[1])
  }
  return names
}

const MODULE_EXTS = ['.tsx', '.ts', '/index.tsx', '/index.ts']

export function announcingPrimitivesUsedBy(file: string, src: string): string[] {
  const found: string[] = []
  for (const m of Array.from(src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g))) {
    const spec = m[2]
    let target: string | null = null
    if (spec.startsWith('@/')) target = spec.slice(2)
    else if (spec.startsWith('.')) target = relative(ROOT, join(ROOT, dirname(file), spec)).replace(/\\/g, '/')
    if (!target) continue
    const resolved = MODULE_EXTS.map((e) => `${target}${e}`).find((c) => existsSync(join(ROOT, c)))
    if (!resolved) continue
    const announcers = announcingExportsOf(resolved)
    if (announcers.length === 0) continue
    for (const named of m[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim())) {
      if (announcers.includes(named) && new RegExp(`<${named}[\\s/>]`).test(src)) found.push(named)
    }
  }
  return found
}

/**
 * THE ONE PARDON, AND IT IS DERIVED FROM THE CODE RATHER THAN FROM A PATH.
 *
 * `components/clinic-site/scroll-reveal.tsx` drives
 * `'static' → 'pre' → 'reveal'` and announces nothing, correctly: the phase
 * decides an `opacity` and a `transform`, and neither is in the accessibility
 * tree. There is no content change to narrate, and a live region there would
 * announce a scroll animation to somebody who is not scrolling.
 *
 * The pardon is the shape of that, not the filename. **A phase whose every
 * reading is an `if` deciding a `CSSProperties` value has nothing to say.**
 * Both halves are required, and each closes the hole the other opens:
 *
 *   · the file must declare a `: CSSProperties` variable — so the exemption
 *     cannot be bought by a component that simply avoids the word `style`;
 *   · the phase identifier must appear ONLY in its own declaration, in a
 *     `setPhase(...)` call, and in `if` / `else if` conditions — so the moment
 *     it reaches a JSX expression, a label, a `className` ternary or anything a
 *     person can read, the pardon is gone and the rule is back.
 *
 * The test under "pardons one site" enumerates who it is actually buying, so a
 * second one arrives as a red diff somebody has to look at rather than as
 * silence — the same lock `dimmed-text.test.ts` puts on its picture-scale
 * pardon.
 */
export function isStyleOnlyPhase(src: string, m: Machine): boolean {
  if (!/:\s*CSSProperties\b/.test(src)) return false
  const uses = src
    .split('\n')
    .map((l, i) => ({ l, i }))
    .filter(({ l, i }) => i + 1 !== m.line && new RegExp(`\\b${m.name}\\b`).test(l))
  return uses.every(({ l }) => /^\s*\}?\s*(?:else\s+)?if\s*\(/.test(l) || l.includes(`${m.setter}(`))
}

export type SilentPhase = Machine & { reason: string }

export function scanForSilentPhases(): { silent: SilentPhase[]; pardoned: Machine[]; all: Machine[] } {
  const silent: SilentPhase[] = []
  const pardoned: Machine[] = []
  const all: Machine[] = []
  for (const file of sweptFiles()) {
    const src = readFileSync(join(ROOT, file), 'utf8')
    if (!/^['"]use client['"]/m.test(src)) continue
    const machines = machinesIn(file, src)
    if (machines.length === 0) continue
    const own = LIVE.test(src)
    const focus = FOCUS_MOVE.test(src)
    const viaImport = own ? [] : announcingPrimitivesUsedBy(file, src)
    for (const m of machines) {
      all.push(m)
      if (isStyleOnlyPhase(src, m)) {
        pardoned.push(m)
        continue
      }
      if (own || focus || viaImport.length > 0) continue
      silent.push({ ...m, reason: 'no live region, no focus move, no announcing primitive' })
    }
  }
  return { silent, pardoned, all }
}

/* ── the rendered contracts ──────────────────────────────────────────────── */

const listBookingSlots = vi.fn()
vi.mock('@/app/site/[slug]/actions', () => ({
  listBookingSlots: (...args: unknown[]) => listBookingSlots(...args),
  submitBookingRequest: vi.fn(async () => ({ ok: true as const, data: null })),
}))

const answerMySurvey = vi.fn()
const commentMySurvey = vi.fn()
vi.mock('@/app/(portal)/patient/actions', () => ({
  answerMySurveyAction: (...args: unknown[]) => answerMySurvey(...args),
  commentMySurveyAction: (...args: unknown[]) => commentMySurvey(...args),
  getPortalSlotsAction: vi.fn(async () => ({ slots: [], closedReason: null })),
}))

import SlotPicker from '@/components/patient-portal/slot-picker'
import SurveyCard from '@/components/patient-portal/survey-card'
import { BookingSuccess } from '@/app/site/[slug]/book/book-form'

beforeEach(() => {
  cleanup()
  listBookingSlots.mockReset()
  answerMySurvey.mockReset()
  commentMySurvey.mockReset()
})

describe('portal slot picker — grouped choices + narrated phases', () => {
  it('names the day strip and the slot grid as groups', async () => {
    const iso = new Date(Date.now() + 86_400_000 * 3).toISOString()
    const loadSlots = vi.fn(async () => ({
      slots: [{ startIso: iso, label: '9:00 AM', available: true }],
      closedReason: null,
    }))

    render(
      <SlotPicker
        loadSlots={loadSlots as never}
        brand="#2A7F8C"
        timeZone="America/Chicago"
        selectedIso={null}
        onSelect={() => {}}
      />,
    )

    // The day strip is a named group of aria-pressed siblings...
    expect(screen.getByRole('group', { name: 'Pick a day' })).toBeTruthy()
    // ...and so is the slot grid, once it lands.
    await waitFor(() => expect(screen.getByRole('group', { name: 'Pick a time' })).toBeTruthy())
  })

  it('announces what landed after a day is picked', async () => {
    const iso = new Date(Date.now() + 86_400_000 * 3).toISOString()
    const loadSlots = vi.fn(async () => ({
      slots: [
        { startIso: iso, label: '9:00 AM', available: true },
        { startIso: new Date(Date.parse(iso) + 1800_000).toISOString(), label: '9:30 AM', available: true },
        { startIso: new Date(Date.parse(iso) + 3600_000).toISOString(), label: '10:00 AM', available: false },
      ],
      closedReason: null,
    }))

    render(
      <SlotPicker
        loadSlots={loadSlots as never}
        brand="#2A7F8C"
        timeZone="America/Chicago"
        selectedIso={null}
        onSelect={() => {}}
      />,
    )

    // Two available, one taken — the count is of what's actually bookable.
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/2 times available/i)
    })
  })

  it('says so when a day has nothing, rather than going silent', async () => {
    const loadSlots = vi.fn(async () => ({ slots: [], closedReason: 'day_closed' as const }))

    render(
      <SlotPicker
        loadSlots={loadSlots as never}
        brand="#2A7F8C"
        timeZone="America/Chicago"
        selectedIso={null}
        onSelect={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/no openings/i)
    })
  })

  it('keeps a text alternative on taken slots (strikethrough is not spoken)', async () => {
    const iso = new Date(Date.now() + 86_400_000 * 3).toISOString()
    // Needs a bookable sibling: an all-taken day renders the empty state
    // instead of the grid, so the taken chip would never mount.
    const loadSlots = vi.fn(async () => ({
      slots: [
        { startIso: iso, label: '9:00 AM', available: false },
        { startIso: new Date(Date.parse(iso) + 1800_000).toISOString(), label: '9:30 AM', available: true },
      ],
      closedReason: null,
    }))

    render(
      <SlotPicker
        loadSlots={loadSlots as never}
        brand="#2A7F8C"
        timeZone="America/Chicago"
        selectedIso={null}
        onSelect={() => {}}
      />,
    )

    await waitFor(() => expect(screen.getByText(/— taken/)).toBeTruthy())
  })
})

/**
 * THE DEFECT THAT SENT THIS WORK OVER, graded as BEHAVIOUR rather than as a
 * grep. The static gate below would pass this file the moment any live region
 * appeared in it; this asks whether the region actually speaks the phase.
 */
describe('portal survey card — the phase swap is spoken', () => {
  it('narrates the swap from the rating row to the comment box', async () => {
    answerMySurvey.mockResolvedValue({ ok: true })
    render(<SurveyCard token="tok" brand="#2A7F8C" />)

    // Nothing to say yet — the region is mounted and empty, which is what makes
    // the first change announce at all.
    expect(screen.getByRole('status').textContent).toBe('')

    fireEvent.click(screen.getByRole('button', { name: 'Rate 9 out of 10' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/rated 9 out of 10/i)
    })
  })

  it('narrates the swap to the thank-you, which is the card’s whole payoff', async () => {
    answerMySurvey.mockResolvedValue({ ok: true })
    render(<SurveyCard token="tok" brand="#2A7F8C" />)

    fireEvent.click(screen.getByRole('button', { name: 'Rate 4 out of 10' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/your rating is in/i)
    })
  })

  it('does not repeat the visible copy word for word', () => {
    // A live region that echoes the text beside it is read twice in a row. The
    // announcement SUMMARISES; it is not a second copy of the sentence. This is
    // also what `tests/patient-portal/survey-card.test.tsx` trips over when the
    // two drift back together — it queries the done copy by text.
    const src = readFileSync(join(ROOT, 'components/patient-portal/survey-card.tsx'), 'utf8')
    expect(src).toContain('Thanks — your rating is in.')
    expect(src).toContain('✓ Got it — thank you for helping us do better.')
  })
})

describe('public booking success — the phase swap moves focus', () => {
  const confirmation = {
    startTimeIso: new Date(Date.now() + 86_400_000 * 3).toISOString(),
    endTimeIso: new Date(Date.now() + 86_400_000 * 3 + 3600_000).toISOString(),
    timeZone: 'America/Chicago',
    visitTypeLabel: 'Cleaning',
    clinicName: 'Bright Smiles',
    clinicPhone: '(555) 555-0100',
    addressText: '1 Main St',
    mapsUrl: null,
    emailStatus: 'sent',
    intakeUrl: null,
  }

  it('focuses the confirmation heading so the outcome is spoken', () => {
    render(<BookingSuccess confirmation={confirmation as never} brand="#2A7F8C" />)

    const heading = screen.getByRole('heading', { name: /you.re booked/i })
    // Focus is the announcement: the submit button just unmounted, so without
    // this the screen reader is parked on <body> with nothing read out.
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute('tabindex')).toBe('-1')
  })
})

/* ── the red run ─────────────────────────────────────────────────────────── */

describe('the derivation — what it catches and what it leaves alone', () => {
  const PHASES: Array<[string, string]> = [
    ['a submission lifecycle', "'idle' | 'pending' | 'success' | 'error'"],
    ['a two-state swap', "'idle' | 'done'"],
    ['the survey card’s own machine', "'ask' | 'comment' | 'done'"],
    ['a share card with four outcomes', "'idle' | 'working' | 'shared' | 'copied' | 'error'"],
  ]
  it.each(PHASES)('reads %s as a phase machine', (_why, union) => {
    expect(isPhase(union)).toBe(true)
  })

  const NOT_PHASES: Array<[string, string]> = [
    ['a which-button-is-busy flag', "'convert' | 'link' | 'separate' | null"],
    ['the visit card’s own in-flight flag', "'confirm' | 'reschedule' | 'cancel' | 'waitlist' | null"],
    ['a single literal, which cannot change', "'idle'"],
    ['a plain string', 'string'],
    ['a nullable string', 'string | null'],
  ]
  it.each(NOT_PHASES)('leaves %s alone', (_why, union) => {
    expect(isPhase(union)).toBe(false)
  })

  it('reads a machine written through a local type alias', () => {
    // The spelling that made the first derivation 15 files instead of 18.
    const src = [
      "type State = 'pending' | 'confirmed' | 'cancelled' | 'past'",
      "const [state, setState] = useState<State>(initialState)",
    ].join('\n')
    const found = machinesIn('x.tsx', src)
    expect(found).toHaveLength(1)
    expect(found[0].union).toBe("'pending' | 'confirmed' | 'cancelled' | 'past'")
    expect(found[0].via).toBe('type State')
    expect(found[0].setter).toBe('setState')
  })

  it('does not invent a machine out of a type it cannot resolve', () => {
    expect(machinesIn('x.tsx', 'const [tab, setTab] = useState<TabId>("all")')).toEqual([])
    expect(machinesIn('x.tsx', "const [n, setN] = useState<number | null>(null)")).toEqual([])
  })

  it('grants the style-only pardon on the shape, and takes it back on a label', () => {
    const m: Machine = { file: 'x.tsx', line: 1, name: 'phase', setter: 'setPhase', union: "'a' | 'b'", via: 'inline' }
    const styleOnly = [
      "  const [phase, setPhase] = useState<'a' | 'b'>('a')",
      '  let composed: CSSProperties',
      "  if (phase === 'a') {",
      '    composed = {}',
      '  } else {',
      '    composed = { opacity: 1 }',
      '  }',
      '  setPhase("b")',
    ].join('\n')
    expect(isStyleOnlyPhase(styleOnly, m)).toBe(true)

    // The same file, with the phase reaching one thing a person can read.
    const readable = `${styleOnly}\n  return <p>{phase === 'a' ? 'Loading' : 'Ready'}</p>`
    expect(isStyleOnlyPhase(readable, m)).toBe(false)

    // ...and without the CSSProperties half, no pardon at all.
    expect(isStyleOnlyPhase(styleOnly.replace(': CSSProperties', ''), m)).toBe(false)
  })
})

/* ── the gate ────────────────────────────────────────────────────────────── */

/**
 * WHAT THIS GATE CHECKS, IN ITS OWN WORDS: every phase machine in the
 * patient-facing tree lives in a component that carries an announcement
 * instrument. Not "every phase change is announced" — read the next paragraph
 * before you trust a green run here, because the difference is the whole
 * defect this rule was written for.
 *
 * **IT CANNOT SEE WHETHER THE INSTRUMENT SPEAKS THE PHASE**, and that is
 * MEASURED rather than suspected: reverting `survey-card.tsx` to the silent
 * form the Part 5 entry describes leaves this gate GREEN, because the card
 * still renders `PortalErrorText` and its error is still announced. The two
 * rendered contracts above are what went red on that mutation. So the static
 * gate catches the shape the defect has actually taken every time — a
 * component with a machine and ZERO instruments, which is what
 * `intake-start-form.tsx` was when this derivation found it — and behaviour is
 * graded by rendering, one component at a time, for the ones that have earned
 * a test. A count is not a substitute for either.
 *
 * Making it phase-aware statically was tried and dropped: the announcement is
 * usually a `const liveStatus = …` the region reads, so the check would have
 * to follow an identifier into its definition and back, guess where a JSX
 * element ends, and it would still be defeated by one more indirection. A
 * heuristic that is wrong in the GREEN direction is worse than a narrow rule
 * that says what it is.
 */
describe('every patient-facing phase machine carries an announcement instrument', () => {
  it('reaches the surfaces an enumeration kept missing', () => {
    // The token landings are DERIVED, not listed — `dimmed-text` and
    // `portal-tokens` both had to be widened by hand to reach exactly these.
    // A patient opens them from a text message.
    const roots = scanRoots()
    for (const r of PATIENT_ROOTS) expect(roots, `${r} must be swept`).toContain(r)
    expect(tokenLandingRoots().length, 'the single-letter token landings').toBeGreaterThanOrEqual(8)
    for (const landing of ['app/b', 'app/c', 'app/i', 'app/n', 'app/r', 'app/w']) {
      expect(roots, `${landing} — a token landing page — must be swept`).toContain(landing)
    }
    // And every root actually matches something, so a renamed directory shows
    // up as a red diff rather than as a rule that quietly stopped reading.
    const files = sweptFiles()
    for (const r of roots) {
      expect(files.some((f) => f.startsWith(`${r}/`)), `${r} matches nothing any more`).toBe(true)
    }
  })

  it('has a population to look at (the derivation is not narrowed to nothing)', () => {
    // An absence assertion only ever gets GREENER as its field of view shrinks,
    // so the count is asserted directly. 18 machines across 16 files when this
    // was written; the floor is what stops a broken regex reporting clean.
    const { all } = scanForSilentPhases()
    expect(all.length, 'phase machines derived from the patient-facing tree').toBeGreaterThanOrEqual(15)
    const files = all.map((m) => m.file)
    // The four the Part 5 entry and its re-derivation name, pinned so a
    // narrowing cannot drop them silently.
    for (const f of [
      'components/patient-portal/survey-card.tsx',
      'components/patient-portal/refer-card.tsx',
      'app/site/[slug]/contact-form.tsx',
      'app/site/[slug]/intake-start/intake-start-form.tsx',
    ]) {
      expect(files, `${f} must be in the population`).toContain(f)
    }
  })

  it('the import resolution reads what it claims', () => {
    // The specific hop the docblock above is about: `PortalErrorText` announces
    // inside its own body, so a card that renders it IS announcing its error
    // even though the card's own source contains no live region. Asserted
    // against `ui.tsx`'s real source — if the primitive loses its role, this
    // goes red here rather than passing a card that has gone silent.
    expect(announcingExportsOf('components/patient-portal/ui.tsx')).toContain('PortalErrorText')
    const card = readFileSync(join(ROOT, 'components/patient-portal/survey-card.tsx'), 'utf8')
    expect(announcingPrimitivesUsedBy('components/patient-portal/survey-card.tsx', card)).toContain(
      'PortalErrorText',
    )
    // And the bound: an unbounded slice makes every page component look like a
    // primitive, which is what makes this resolution safe to trust.
    expect(announcingExportsOf('components/patient-portal/ui.tsx')).not.toContain('PortalCard')
  })

  it('pardons one site, and it is the scroll animation', () => {
    const { pardoned } = scanForSilentPhases()
    expect(
      pardoned.map((p) => `${p.file}:${p.line} — ${p.name} (${p.union})`),
      'the style-only pardon covers a different set than it did. An entry has ' +
        'to be a phase whose every reading is an `if` deciding a CSSProperties ' +
        'value — an opacity and a transform are not in the accessibility tree, ' +
        'so there is nothing to narrate. If a new one puts the phase into ' +
        'anything a person can read, announce it; the pardon is not the place ' +
        'to argue about it.',
    ).toEqual(["components/clinic-site/scroll-reveal.tsx:56 — phase ('static' | 'pre' | 'reveal')"])
  })

  it('the staff tree is deferred, not forgotten', () => {
    // The deferral this rule's scope rests on, held as a number so it cannot
    // rot into a pardon. If the staff tree's phase machines stop being
    // dominated by nullable in-flight flags and tab selections, this goes red
    // and the scope decision gets re-argued rather than inherited.
    const staff = ['app/(default)', 'app/(double-sidebar)', 'app/(partner)', 'app/(auth)']
      .flatMap((r) => walk(join(ROOT, r)).map((p) => relative(ROOT, p).replace(/\\/g, '/')))
      .filter((f) => /^['"]use client['"]/m.test(readFileSync(join(ROOT, f), 'utf8')))

    let nullable = 0
    let phases = 0
    for (const f of staff) {
      const src = readFileSync(join(ROOT, f), 'utf8')
      for (const m of Array.from(src.matchAll(DECL))) {
        const arg = m[3].replace(/\s+/g, ' ').trim()
        if (!UNION.test(arg)) continue
        if (isPhase(arg)) phases++
        else nullable++
      }
    }
    expect(nullable, 'nullable in-flight flags in the staff tree').toBeGreaterThanOrEqual(15)
    expect(phases, 'staff-side string unions this rule does not grade').toBeLessThanOrEqual(20)
  })

  it('leaves no phase machine speaking to nobody', () => {
    const { silent } = scanForSilentPhases()
    expect(
      silent.map((s) => `${s.file}:${s.line} — ${s.name} (${s.union})`),
      'A component that swaps what is on screen under its own state machine ' +
        'has to say so. Pick the instrument by whether the surface SURVIVES ' +
        'the swap: if it stays mounted, add a polite `<p className="sr-only" ' +
        'role="status">` narrating the new phase (the reference is ' +
        'components/patient-portal/slot-picker.tsx). If the swap REPLACES the ' +
        'surface, a live region cannot carry it — it mounts already-populated ' +
        '— so give the new heading tabIndex={-1} and focus it on mount (the ' +
        'reference is BookingSuccess in app/site/[slug]/book/book-form.tsx). ' +
        'An error node takes role="alert" rather than role="status", because ' +
        'it is the one state that has to interrupt.',
    ).toEqual([])
  })
})
