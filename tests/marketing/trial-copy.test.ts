import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { TRIAL } from '@/lib/marketing/site'
import { TRIAL_DAYS } from '@/lib/trial'

/**
 * WHAT THE PUBLIC SITE MAY SAY ABOUT THE TRIAL.
 *
 * Owner ruling 2026-11-23: the free trial is 14 days, and a card is required
 * to sign up. On the day of the ruling the public surfaces said "7 days free,
 * no card" in about forty places — hero chips, page-closing bands, the pricing
 * FAQ, the comparison FAQ's JSON-LD, the help docs, the signup form, the
 * practice-grade report, the ad copy, and the knowledge file every outreach
 * email is written from. Each was typed by hand, so each had to be found.
 *
 * Two rules, both held at ZERO over every public tree, so the next ruling is
 * one constant and one sentence rather than another forty edits:
 *
 *  1. NOTHING SAYS "NO CARD" ABOUT OUR OWN TRIAL, in any spelling. It is the
 *     one promise a visitor can check for themselves four screens later, and
 *     an ad that makes it lands on a page that contradicts it.
 *  2. NO TRIAL LENGTH IS TYPED. The length is `TRIAL_DAYS` — the number
 *     Stripe is actually given at checkout — reached through `TRIAL` in
 *     `lib/marketing/site.ts`. A digit beside "free" or "trial" is a second
 *     source for it.
 *
 * COMMENTS ARE NOT COPY and are stripped first: several of these files
 * explain the old wording in a comment, which is where it belongs.
 *
 * THE PARDONS ARE STRUCTURAL, NOT A LIST OF PATHS. "No card" is also what the
 * insurance module says about a patient who arrives without their INSURANCE
 * card, and that is a product feature the same pages advertise. Those lines
 * are told apart by their own vocabulary (see `aboutSomethingElse`), and the
 * matchers are exercised on planted strings below — an absence assertion over
 * a clean tree cannot tell a working detector from a blind one.
 */

const ROOT = resolve(__dirname, '../..')

/** Every tree a prospect, a signing-up practice or an outreach email reads. */
const ROOTS = ['app/(marketing)', 'app/(auth)', 'app/(onboarding)', 'app/g', 'components/marketing', 'lib/marketing']
/** Single files with public words in them that live outside those trees. */
const FILES = ['lib/prospect-product-knowledge.ts']

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p.slice(ROOT.length + 1).split('\\').join('/'))
  }
  return out
}

const SOURCES = [...ROOTS.flatMap((r) => walk(join(ROOT, r))), ...FILES].sort()

/** Comments replaced by spaces, so line numbers still point at the source. */
function stripComments(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead: string) => lead + ' '.repeat(m.length - lead.length))
}

/** "No card", in the spellings the site actually used and the obvious next ones. */
const NO_CARD =
  /\bno[- ]?(?:credit[- ])?card\b|\bcard[- ]free\b|\bwithout a (?:credit )?card\b|\bcardless\b|\bcard (?:is not|isn['’]t|not) (?:required|needed)\b/i

/**
 * The same two words about something that is NOT our trial:
 *  - the insurance module's no-card door (a PATIENT without their insurance
 *    card), which the product, pricing and changelog pages describe;
 *  - the card step reporting a cancelled checkout ("No card was added…");
 *  - the outreach knowledge file's instruction NOT to say it.
 */
function aboutSomethingElse(line: string): boolean {
  return (
    /\bon hand\b|\bcoverage\b|\bpayers?\b|\binsurance\b|\ba patient with no card\b/i.test(line) ||
    /\bno card was added\b/i.test(line) ||
    /\bnever say\b/i.test(line)
  )
}

/** A digit-typed length beside the words that make it a trial length. */
const TYPED_LENGTH =
  /\b\d+[- ]days?\b[^.\n]{0,30}\b(?:free|trial)\b|\b(?:free|trial)\b[^.\n]{0,30}\b\d+[- ]days?\b/i
/** …and the spelled-out form the page-closing bands used. */
const SPELLED_LENGTH = /\b(?:seven|ten|fourteen|thirty) days of (?:everything|the whole platform|premium)\b/i

function offenders(test: (line: string) => boolean): string[] {
  const hits: string[] = []
  for (const file of SOURCES) {
    const text = stripComments(readFileSync(join(ROOT, file), 'utf8'))
    for (const [i, line] of Array.from(text.split('\n').entries())) {
      if (test(line)) hits.push(`${file}:${i + 1}  ${line.trim().slice(0, 140)}`)
    }
  }
  return hits
}

describe('the matchers see what they are for (planted — the tree is clean, so it cannot say)', () => {
  it('every spelling of "no card" the site used on 2026-11-23 is caught', () => {
    for (const was of [
      "['7 days free', 'No card to start', 'Month-to-month']",
      'Start free — 7 days, no card',
      '7-day free trial — no credit card required. Set up billing anytime in Settings.',
      'Seven days of everything, no card, no call.',
      'with a no-card 7-day trial, so you can run it alongside',
      '<p>No card required</p>',
      '`${trial}, No Card`',
      'Try it card-free for two weeks',
      'start without a card',
      'a card is not required',
    ]) {
      expect(NO_CARD.test(was) && !aboutSomethingElse(was), was).toBe(true)
    }
  })

  it('the true statements about the card are NOT caught', () => {
    for (const ok of [TRIAL.cardChip, TRIAL.cardTerms, 'Card to start, not charged until the trial ends.', 'You add a card on the last step']) {
      expect(NO_CARD.test(ok), ok).toBe(false)
    }
  })

  it('the insurance module’s no-card door, a cancelled checkout and the "never say it" instruction are told apart', () => {
    for (const other of [
      '`No card on hand? Plan discovery has its own 20 a month`',
      'finding a plan with no card on hand has its own allowance',
      "title: 'No card? Find their coverage',",
      'A patient with no card, or an expired one, used to mean phoning payers one by one.',
      'No card was added and nothing was charged. Add one whenever you are ready.',
      'never say "no card" or "no credit card"',
    ]) {
      expect(NO_CARD.test(other), other).toBe(true)
      expect(aboutSomethingElse(other), other).toBe(true)
    }
    // …and the pardon does not swallow a trial claim that merely sits near one.
    expect(aboutSomethingElse('7 days free, no card')).toBe(false)
  })

  it('a typed trial length is caught in digits and in words; a count that is not a trial length is not', () => {
    for (const was of ['7 days free', 'Start your 7-day free trial', 'a free 7-day trial, a published price', 'free for 14 days', 'trial of 30 days']) {
      expect(TYPED_LENGTH.test(was), was).toBe(true)
    }
    expect(SPELLED_LENGTH.test('Seven days of the whole platform on your own practice')).toBe(true)
    expect(SPELLED_LENGTH.test('Fourteen days of everything')).toBe(true)
    for (const ok of ['today’s visits, tomorrow’s visits, the next 7 days', '{TRIAL.days} days free', '`${TRIAL_DAYS}-Day Free Trial`']) {
      expect(TYPED_LENGTH.test(ok), ok).toBe(false)
    }
  })

  it('a comment is not copy', () => {
    const src = ['// the old "7 days free, no card" chip', '/* no card required */ const a = 1', "const b = 'kept'"].join('\n')
    const stripped = stripComments(src)
    expect(NO_CARD.test(stripped)).toBe(false)
    expect(stripped).toContain("const b = 'kept'")
  })
})

describe('the field of view', () => {
  it('reads every public tree — a root that moved fails here rather than going quiet', () => {
    for (const r of ROOTS) expect(SOURCES.some((f) => f.startsWith(`${r}/`)), `${r} matched no files`).toBe(true)
    // The surfaces that carried the old wording, by name.
    for (const f of [
      'app/(marketing)/page.tsx',
      'app/(marketing)/pricing/page.tsx',
      'app/(marketing)/pricing/price-card.tsx',
      'app/(marketing)/compare/[vendor]/page.tsx',
      'app/(auth)/signup/signup-form.tsx',
      'app/(onboarding)/onboarding-02/page.tsx',
      'app/g/[token]/report-view.tsx',
      'lib/marketing/comparisons.ts',
      'lib/marketing/docs.ts',
      'lib/marketing/ad-campaigns.ts',
      'lib/marketing/site.ts',
      'lib/prospect-product-knowledge.ts',
    ]) {
      expect(SOURCES, f).toContain(f)
    }
    expect(SOURCES.length).toBeGreaterThan(40)
  })

  it('the pardons still have something to pardon — a pardon over nothing is a hole waiting for a use', () => {
    const pardoned = offenders((l) => NO_CARD.test(l) && aboutSomethingElse(l))
    expect(pardoned.some((h) => /on hand/i.test(h)), 'the insurance no-card door left the marketing copy').toBe(true)
    expect(pardoned.some((h) => /no card was added/i.test(h)), 'the cancelled-checkout line left the card step').toBe(true)
    expect(pardoned.some((h) => /never say/i.test(h)), 'the outreach knowledge no longer forbids the phrase').toBe(true)
  })
})

describe('rule 1 — nothing says "no card" about our own trial', () => {
  it('holds at zero across every public tree', () => {
    expect(offenders((l) => NO_CARD.test(l) && !aboutSomethingElse(l))).toEqual([])
  })
})

describe('rule 2 — no trial length is typed', () => {
  it('no digit-typed or spelled-out length sits beside "free" or "trial"', () => {
    expect(offenders((l) => TYPED_LENGTH.test(l) || SPELLED_LENGTH.test(l))).toEqual([])
  })
})

describe('the one home says it plainly', () => {
  it('the length everywhere is the number Stripe is given', () => {
    expect(TRIAL.days).toBe(TRIAL_DAYS)
    for (const s of [TRIAL.name, TRIAL.chip, TRIAL.cta, TRIAL.ctaLong]) expect(s).toContain(String(TRIAL_DAYS))
  })

  it('the card is said out loud: required, when it is charged, and the way out', () => {
    expect(TRIAL.cardChip).toMatch(/card required/i)
    expect(TRIAL.cardTerms).toMatch(/card starts the trial/i)
    expect(TRIAL.cardTerms).toMatch(/not charged until the trial ends/i)
    expect(TRIAL.cardTerms).toMatch(/cancel before then you pay nothing/i)
  })

  it('wherever the length is shown as a chip, the card is beside it', () => {
    // "14 days free" alone would be true and would still leave a practice to
    // find the card field on the fourth screen.
    const lonely: string[] = []
    for (const file of SOURCES) {
      const src = stripComments(readFileSync(join(ROOT, file), 'utf8'))
      if (!/\bTRIAL\.chip\b/.test(src)) continue
      if (!/\bTRIAL\.cardChip\b/.test(src) && !/Card to start/.test(src)) lonely.push(file)
    }
    expect(lonely).toEqual([])
  })
})
