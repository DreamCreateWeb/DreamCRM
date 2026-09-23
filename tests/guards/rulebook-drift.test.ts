import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CENSUS_FLOORS,
  CLAIMS,
  INTAKE_ORDINAL_FLOOR,
  ORDINAL_WORDS,
  CLAIMED_GATE_AREAS,
  CLAIMED_REQUIRED_CHECKS,
  WORKFLOW_CENSUS,
  drift,
  effectiveContexts,
  namedInRulebook,
  readLocalReality,
  readRulebook,
  runsOnPullRequest,
} from '../../scripts/rulebook-drift.mjs'

/**
 * The drift check, checked.
 *
 * `scripts/rulebook-drift.mjs` transcribes what the `dreamcrm-conventions`
 * skill claims about this repository so a scheduled job can diff the two. Two
 * different things need guarding and they are easy to conflate:
 *
 *   1. THE LOCAL CLAIMS, graded here, in the `test` gate. Everything that can
 *      be read off the checked-out tree — the workflow census, which files may
 *      publish a required context, the review gate's area list — is asserted
 *      on every PR. Add a workflow file or a gate area without updating its
 *      claim and this goes red in the same PR that introduced it, which is
 *      strictly better than a scheduled job telling somebody the next morning.
 *
 *   2. THE INSTRUMENT ITSELF. A drift detector whose claims can no longer fail
 *      reports CLEAN forever, and it is the most plausible way this decays: a
 *      claim rewritten to be vacuously true looks exactly like a claim that
 *      holds. So every claim is perturbed below and must be SEEN to fail. That
 *      is the `dreamcrm-conventions` "a test counts only once you have watched
 *      it fail" rule applied to a guard whose subject is a document.
 *
 * The network-dependent claims (branch protection, the repo's merge settings)
 * cannot be graded from a test process, and are deliberately not faked into
 * looking graded — they are driven here from fixtures that pin the SHAPE of
 * the API response the workflow feeds in.
 */

/**
 * `scripts/rulebook-drift.mjs` is plain JS, so these shapes are stated once
 * here rather than inferred as `{}` at every call site.
 */
type Census = Record<string, { gates: string; publishes: string[]; note: string }>
type Live = {
  workflows: Record<string, string>
  gateAreas: string[]
  guards: string[]
  guardDir: string[]
  rulebook: { files: string[]; text: string }
  protection: Record<string, any> | null
  repo: Record<string, any> | null
}

const CENSUS = WORKFLOW_CENSUS as Census
const localReality = () =>
  readLocalReality(process.cwd()) as Pick<Live, 'workflows' | 'gateAreas' | 'guards' | 'guardDir' | 'rulebook'>

/** The live protection/repo shape, as `gh api` returns it today, claims holding. */
const HEALTHY = {
  protection: {
    required_status_checks: { strict: true, contexts: ['test', 'e2e'] },
    enforce_admins: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  },
  repo: { allow_update_branch: true },
}

// structuredClone, not a spread: every perturbation below mutates a NESTED
// field (`required_status_checks.contexts`, `enforce_admins.enabled`), and a
// shallow copy shares those objects between cases. The first version of this
// file did exactly that, and each perturbation then inherited every earlier
// one — six cases reporting six findings apiece and none of them isolated.
function liveNow(): Live {
  return { ...localReality(), ...structuredClone(HEALTHY) }
}

describe('the rulebook drift check', () => {
  it('finds nothing to report against the repo as it stands', () => {
    const { findings, unchecked } = drift(liveNow())

    expect(
      unchecked.map((u) => u.id),
      'every claim must be gradeable from the tree plus the two API reads. A claim needing an ' +
        'input nothing supplies is a claim that is never actually checked.',
    ).toEqual([])

    expect(
      findings.map((f) => `${f.id}: ${f.actual}`),
      'the skill and the repo disagree. Route the change into dreamcrm-conventions and update the ' +
        'matching claim in scripts/rulebook-drift.mjs — see the finding text for which side moved.',
    ).toEqual([])
  })

  // THE LOAD-BEARING TEST. A claim that cannot fail is worse than no claim:
  // something authoritative now says the rulebook is current. Each case breaks
  // exactly the fact its claim describes, in the shape it would really arrive
  // in, and asserts that claim — and only that claim — objects.
  const PERTURBATIONS: Record<string, (live: Live) => void> = {
    'intake-ordinals': (live) => {
      // THE 2026-09-23 SHAPE, and it is a duplicate rather than a gap because
      // that is the one that actually happened: #712, #713 and #714 each took
      // FIFTY-SEVENTH off the same base and git called all three mergeable.
      // Appending a second marker for a number already present is exactly what
      // the second of those PRs would have merged.
      live.rulebook.text += String.raw`

  **THE FIFTY-SEVENTH: #999, a second entry nobody noticed.**
`
    },
    'required-checks': (live) => {
      // The DREAMCRM-19 shape: somebody makes review-gate required, or drops e2e.
      live.protection!.required_status_checks.contexts = ['test']
    },
    'strict-and-allow-update-branch': (live) => {
      // The #524 shape: strict stays on, branch auto-update goes off.
      live.repo!.allow_update_branch = false
    },
    'enforce-admins': (live) => {
      // The state this repo was actually in until 2026-09-14.
      live.protection!.enforce_admins.enabled = false
    },
    'force-push-and-deletion-bars': (live) => {
      live.protection!.allow_force_pushes.enabled = true
    },
    'workflow-census': (live) => {
      // A new workflow file, which is exactly how the census goes stale.
      live.workflows['brand-new.yml'] = 'name: Brand new\non:\n  schedule:\n    - cron: "0 0 * * *"\njobs:\n  scan:\n    runs-on: ubuntu-latest\n'
    },
    'who-can-publish-a-required-check': (live) => {
      // The dangerous one, and the reason `name:` is what gets graded rather
      // than the job key: this job is keyed `review-gate` and would report a
      // green `test` onto a commit the real suite never ran against.
      live.workflows['review-gate.yml'] = live.workflows['review-gate.yml'].replace(
        /^ {4}name: review-gate .*$/m,
        '    name: test',
      )
    },
    'every-required-check-has-a-producer': (live) => {
      // The producer stops running on PRs. Branch protection still requires
      // `test` and `e2e`, ci.yml still defines both jobs — so the census claim
      // is untouched and nothing else in CI would say a word — but no PR ever
      // reports either context again and every pull request in the repo
      // becomes permanently unmergeable.
      //
      // Chosen over the obvious perturbation (adding `lint` to the required
      // set) because that one is genuinely two findings: a required set that
      // is no longer exactly `test` and `e2e` AND an orphaned context. Both
      // claims objecting there is correct behaviour, but it would leave this
      // claim never seen failing on its own.
      live.workflows['ci.yml'] = live.workflows['ci.yml'].replace(
        /^ {2}pull_request: \{\}$/m,
        '  push:\n    branches: [main]',
      )
    },
    'gate-areas': (live) => {
      // An area leaving GATE_RULES: the quiet direction, where something stops
      // needing a review and no PR goes red.
      live.gateAreas = live.gateAreas.filter((a) => a !== 'money')
    },
    'guards-census': (live) => {
      // THE SHAPE THIS ACTUALLY ARRIVES IN: a new guard lands in
      // `tests/guards/` and its PR says nothing to the rulebook. #534 took
      // three days that way, #598 was found only by an unscoped sweep pass.
      // Deliberately a plausible NAME rather than `zzz.test.ts` — the failure
      // message quotes it, and a reader who sees a realistic name learns what
      // the check is about.
      live.guards = [...live.guards, 'new-alarm-wiring.test.ts']
      live.guardDir = [...live.guardDir, 'new-alarm-wiring.test.ts']
    },
  }

  it('has a perturbation for every claim, so none of them ships ungraded', () => {
    expect(Object.keys(PERTURBATIONS).sort()).toEqual(CLAIMS.map((c: { id: string }) => c.id).sort())
  })

  it('still makes all ten claims, spelled out', () => {
    // SPELLED OUT RATHER THAN COUNTED. The test above compares two lists that
    // MOVE TOGETHER: delete a claim and its perturbation and it stays green,
    // which makes the one edit that weakens this check the one edit nothing
    // objects to. Sentinel found that reviewing #571. Same reasoning as
    // `MUST_BE_GATED` in the review-gate guard — an enumeration's failure mode
    // is a quiet one, so the expected list is written by hand.
    expect(CLAIMS.map((c: { id: string }) => c.id).sort()).toEqual([
      'enforce-admins',
      'every-required-check-has-a-producer',
      'force-push-and-deletion-bars',
      'gate-areas',
      'guards-census',
      'intake-ordinals',
      'required-checks',
      'strict-and-allow-update-branch',
      'who-can-publish-a-required-check',
      'workflow-census',
    ])
  })

  it('pins the required-check set, which nothing local can otherwise grade', () => {
    // `CLAIMED_REQUIRED_CHECKS` is graded only against branch protection, i.e.
    // only on the daily run, i.e. only once a credential exists. Until then an
    // edit here would change what the census means with nothing to notice. The
    // pin does not make it TRUE — only the API can — it makes changing it a
    // deliberate act with a second file to edit.
    expect([...CLAIMED_REQUIRED_CHECKS].sort()).toEqual(['e2e', 'test'])
  })

  it.each(Object.keys(PERTURBATIONS))('notices when "%s" stops being true', (id) => {
    // Each case starts from the REAL tree, so when the repo genuinely drifts
    // the first test above is the one that says so — and these do not pile
    // eight duplicate failures on top of it. Whatever is already drifting is
    // subtracted; the perturbation still has to produce its own finding on top.
    const baseline = drift(liveNow()).findings.map((f) => f.id)
    expect(
      baseline,
      `the repo already drifts on '${id}', so this case cannot prove the perturbation did ` +
        'anything. Fix the drift the first test reported, then come back.',
    ).not.toContain(id)

    const live = liveNow()
    PERTURBATIONS[id](live)
    const { findings, unchecked } = drift(live)

    expect(unchecked).toEqual([])
    expect(
      findings.map((f) => f.id),
      `breaking the fact behind '${id}' must make that claim object. If this reports nothing, the ` +
        'claim is vacuous and the daily run has been reporting CLEAN about a fact it cannot see.',
    ).toContain(id)
    expect(
      findings.map((f) => f.id).filter((f) => f !== id && !baseline.includes(f)),
      `breaking '${id}' should not implicate any OTHER claim. A claim that fires on a fact it does ` +
        'not describe makes every drift report ambiguous about which sentence to go and fix.',
    ).toEqual([])
  })

  it('reports a missing input as ungradeable rather than as a pass', () => {
    // The whole bargain. When the protection read comes back empty, the five
    // claims that need it must be named as UNGRADED. Counting them as held is
    // the failure this check exists to prevent, aimed at itself.
    const live = { ...liveNow(), protection: null }
    const { findings, unchecked } = drift(live)

    const NEEDS_PROTECTION = [
      'enforce-admins',
      'every-required-check-has-a-producer',
      'force-push-and-deletion-bars',
      'required-checks',
      'strict-and-allow-update-branch',
    ]
    expect(unchecked.map((u) => u.id).sort()).toEqual(NEEDS_PROTECTION)
    expect(
      findings.map((f) => f.id).filter((id) => NEEDS_PROTECTION.includes(id)),
      'an ungradeable claim is not a finding either — it is its own category, and blurring the two ' +
        'is how a check starts reporting on a fact it never read',
    ).toEqual([])
  })

  it('names the skill section to open for every claim', () => {
    // The claim↔skill hop is the one this cannot mechanise, so the least it
    // can do is hand the reader the section rather than 700 lines of prose.
    for (const claim of CLAIMS) {
      expect(claim.section, `${claim.id} must name where the skill states it`).toMatch(/^§\d/)
      expect(claim.states.length, `${claim.id} must quote what the skill says`).toBeGreaterThan(10)
    }
  })
})

describe('the guards census, and its own eyes', () => {
  // §2d: a guard's READER is a guard, and nothing downstream can grade it.
  // Every assertion in this claim is an ABSENCE assertion — "no guard file is
  // unnamed" — so a reader that silently narrows makes the census GREENER.
  // The floors are the only thing standing between that and a check that
  // reports a clean census about a directory it never opened.

  it('reads the real directories, not an empty pair', () => {
    const live = liveNow()
    expect(
      live.guards.length,
      'the guard directory came back nearly empty. Every assertion in `guards-census` is an ' +
        'absence assertion, so an empty read reports a clean census forever.',
    ).toBeGreaterThanOrEqual(CENSUS_FLOORS.guardFiles)
    expect(live.rulebook.files.length).toBeGreaterThanOrEqual(CENSUS_FLOORS.rulebookFiles)
    expect(live.rulebook.text.length).toBeGreaterThanOrEqual(CENSUS_FLOORS.rulebookBytes)
    // The walk is RECURSIVE, and that is load-bearing rather than incidental:
    // eight of the nine rulebook files live under `references/`, so a
    // non-recursive walk would read SKILL.md alone and report 30-odd guards
    // unregistered — a red `test` run naming thirty innocent files.
    expect(live.rulebook.files.filter((f) => f.includes('/')).length).toBeGreaterThan(0)
  })

  it('goes red when its own reader is blinded, in either half', () => {
    // BLINDING THE GUARD SIDE. Not merely "does it find nothing to report" —
    // it must OBJECT, naming the reader rather than the tree. Since #701's
    // review this is caught by the exact comparison against the unfiltered
    // listing rather than by the floor, so the finding NAMES the guards that
    // fell out instead of reporting a count — strictly more than the floor
    // said, and the floor below is no longer the thing standing here.
    const blindGuards = liveNow()
    blindGuards.guards = []
    const a = drift(blindGuards).findings.find((f) => f.id === 'guards-census')
    expect(a, 'an empty guard list must be a finding, not a clean census').toBeTruthy()
    expect(a!.actual).toContain('the census grades 0')
    expect(a!.actual).toContain('control-bytes.ts')

    // BLINDING THE RULEBOOK SIDE is the more dangerous direction and the one
    // an absence assertion cannot feel: with no rulebook text every guard
    // reads unregistered, which is loud. With a TRUNCATED rulebook the census
    // is quietly wrong in whichever direction the truncation lands. The floor
    // catches both because it is about bytes read, not about matches found.
    const blindBook = liveNow()
    blindBook.rulebook = { files: ['SKILL.md'], text: '# tiny' }
    // guardDir stays in step here on purpose: this case is about the RULEBOOK
    // side, and letting the guard-side comparison fire first would prove
    // nothing about the floors.
    const b = drift(blindBook).findings.find((f) => f.id === 'guards-census')
    expect(b, 'a truncated rulebook read must be a finding about the READER').toBeTruthy()
    expect(b!.actual).toContain('rulebook files')
  })

  it('needs a FILE NAME, not a stem — the `migration-check` trap', () => {
    // MEASURED, not hypothetical. `scripts/migration-check.mjs` and
    // `migration-check.yml` are both written up at length in §2a and §3, so a
    // stem matcher reported `tests/guards/migration-check.test.ts` registered
    // when what was registered was a script and a workflow. Three of the
    // eleven guards backfilled on DREAMCRM-114 were hidden exactly this way.
    const text = 'we run `scripts/migration-check.mjs` from `migration-check.yml`.'
    expect(namedInRulebook(text, 'migration-check.test.ts')).toBe(false)
    expect(namedInRulebook(`and ${'migration-check.test.ts'} holds it in place.`, 'migration-check.test.ts')).toBe(true)
  })

  it('accepts a citation with or without its directory, and nothing looser', () => {
    expect(namedInRulebook('see `tests/guards/control-bytes.ts`', 'control-bytes.ts')).toBe(true)
    expect(namedInRulebook('see `control-bytes.ts`', 'control-bytes.ts')).toBe(true)
    // TRAILING BOUNDARY. `x.ts` is a prefix of `x.tsx`, so a rulebook naming
    // only the `.tsx` sibling would otherwise report the `.ts` one registered
    // — §2d's a-prefix-is-not-a-name trap, in the one place it would be
    // silent. Both directions, because a matcher is only pinned by the case
    // it must REFUSE plus the case it must accept.
    expect(namedInRulebook('see `widget.test.tsx`', 'widget.test.ts')).toBe(false)
    expect(namedInRulebook('see `widget.test.tsx`', 'widget.test.tsx')).toBe(true)
    // LEADING BOUNDARY: a longer name must not satisfy a shorter one that
    // happens to end it.
    expect(namedInRulebook('see `portal-brand.test.ts`', 'brand.test.ts')).toBe(false)
  })

  it('names every unregistered guard in the finding, not just the count', () => {
    const live = liveNow()
    live.guards = [...live.guards, 'alpha-guard.test.ts', 'beta-guard.test.ts']
    const f = drift(live).findings.find((c) => c.id === 'guards-census')
    expect(f, 'two unregistered guards must be a finding').toBeTruthy()
    // The whole value of this check is the follow-up being mechanical: a
    // report saying "2 guards unregistered" sends the reader back to diff two
    // directories by hand, which is the work the check exists to remove.
    expect(f!.actual).toContain('alpha-guard.test.ts')
    expect(f!.actual).toContain('beta-guard.test.ts')
  })

  it('goes red when the reader narrows PARTIALLY — the mutation a floor cannot catch', () => {
    // SENTINEL'S MUTATION, reviewing #701, reproduced as a test rather than
    // remembered as a note. A floor only catches a reader that lands on ZERO.
    // Skipping `e2e-*` and `axe-*` — the shape a plausible refactor actually
    // takes — dropped TWELVE of thirty-four guards, landed at 22, cleared a
    // floor of 20, and left the claim green with every test passing.
    const live = liveNow()
    live.guards = live.guards.filter((f) => !/^(e2e|axe)-/.test(f))

    expect(
      live.guards.length,
      'this mutation has to land ABOVE the floor or it is just the empty-reader case again',
    ).toBeGreaterThan(CENSUS_FLOORS.guardFiles)
    expect(live.guardDir.length - live.guards.length).toBeGreaterThan(10)

    const f = drift(live).findings.find((c) => c.id === 'guards-census')
    expect(
      f,
      'a reader that silently drops a third of the census must object. A floor cannot see this ' +
        'and that is the whole reason the unfiltered listing is compared.',
    ).toBeTruthy()
    // And it must NAME them, so the next reader is not left diffing two
    // directory listings by hand.
    expect(f!.actual).toContain('e2e-flaky-digest.test.ts')
    expect(f!.actual).toContain('axe-headroom-table.test.ts')
  })

  it('sees a guard in a subdirectory, which the listing is not recursive enough to grade', () => {
    // The non-recursive/recursive mismatch: `readdirSync` on the guard
    // directory does not descend, while `readRulebook`'s walk does. Before
    // the unfiltered comparison a guard at `tests/guards/<subdir>/x.test.ts`
    // was invisible to the census AND silent about it.
    const live = liveNow()
    live.guardDir = [...live.guardDir, 'nested']
    const f = drift(live).findings.find((c) => c.id === 'guards-census')
    expect(f, 'a directory entry the census does not grade must object').toBeTruthy()
    expect(f!.actual).toContain('nested')
  })

  it('refuses a name that is only a PREFIX of the text, on both sides alike', () => {
    // The two boundaries are the same class now. Every case below reported
    // the real file REGISTERED before that fix — the false-green direction,
    // which for an absence assertion is the one that matters.
    expect(namedInRulebook('see `widget.test.ts-old`', 'widget.test.ts')).toBe(false)
    expect(namedInRulebook('see `widget.test.ts_bak`', 'widget.test.ts')).toBe(false)
    expect(namedInRulebook('see `widget.test.ts.snap`', 'widget.test.ts')).toBe(false)
    expect(namedInRulebook('see `snap.control-bytes.ts`', 'control-bytes.ts')).toBe(false)
    expect(namedInRulebook('see `_control-bytes.ts`', 'control-bytes.ts')).toBe(false)
  })

  it('still accepts a citation that ends a sentence, which is why `.` is not in the class', () => {
    // The dot points both ways, so it is refused only when something
    // name-shaped follows it. Putting `.` in the boundary class outright
    // would refuse every citation at the end of a sentence — a false
    // NEGATIVE, i.e. a red `test` naming a correctly-registered guard.
    expect(namedInRulebook('graded by control-bytes.ts.', 'control-bytes.ts')).toBe(true)
    expect(namedInRulebook('graded by control-bytes.ts, and others', 'control-bytes.ts')).toBe(true)
    expect(namedInRulebook('graded by `control-bytes.ts`)', 'control-bytes.ts')).toBe(true)
  })

  it('files the census as UNGRADEABLE when its directory listing is missing, never as a pass', () => {
    // THE DEFECT SENTINEL FOUND REVIEWING #707, frozen as a test.
    //
    // `ungraded` used to read `(live.guardDir ?? live.guards).filter(f =>
    // !live.guards.includes(f))`. With `guardDir` absent that is
    // `guards.filter(f => !guards.includes(f))` — EMPTY BY CONSTRUCTION, for
    // any input at all. The comparison did not fail, it disappeared; and
    // because `guardDir` was not in `needs`, the runner did not file the
    // claim as ungradeable either. A narrowed reader went green through a
    // second door after the first one was closed.
    //
    // Both halves are asserted, because either alone leaves the hole open: a
    // `needs` entry with a defaulted read still passes vacuously, and an
    // undefaulted read with no `needs` entry throws instead of reporting.
    const live = { ...liveNow(), guardDir: null } as unknown as Live
    const { findings, unchecked } = drift(live)

    expect(
      unchecked.map((u) => u.id),
      'a census that could not read its own directory listing must be UNGRADEABLE. Reporting it ' +
        'as held is this file’s own stated failure, aimed at itself.',
    ).toContain('guards-census')
    expect(
      findings.map((f) => f.id),
      'an ungradeable claim is not a finding either — blurring the two is how a check starts ' +
        'reporting on a fact it never read',
    ).not.toContain('guards-census')
  })

  it('still reddens on a narrowed reader when the listing IS present', () => {
    // The companion to the case above: the mutation that Sentinel used to
    // demonstrate the hole must still produce a finding once the listing is
    // read. Without this, deleting the comparison entirely would satisfy the
    // ungradeable test and nothing else would notice.
    const live = liveNow()
    live.guards = live.guards.filter((f) => !/^(e2e|axe)-/.test(f))
    const f = drift(live).findings.find((c) => c.id === 'guards-census')
    expect(f, 'a narrowed reader with a readable listing must still be a FINDING').toBeTruthy()
    expect(f!.actual).toContain('e2e-flaky-digest.test.ts')
  })

  it('reads the rulebook off disk the same way the claim does', () => {
    // The claim is graded against `readLocalReality`; this asserts the
    // exported reader and the wired one are the same thing, so a future
    // refactor cannot leave the claim reading one corpus and the tests above
    // proving properties of another.
    const direct = readRulebook(process.cwd()) as { files: string[]; text: string }
    expect(direct.files).toEqual(localReality().rulebook.files)
    expect(direct.text.length).toBe(localReality().rulebook.text.length)
  })
})

describe('the census and the tree', () => {
  it('lists every workflow file that exists, and no file that does not', () => {
    expect(
      Object.keys(localReality().workflows).sort(),
      'a workflow file arrived or left without its census entry. Say what it publishes and what it ' +
        'therefore gates, and route the change into dreamcrm-conventions §2 — a new gate that ' +
        'reaches the repo but not the rulebook is the #534 shape.',
    ).toEqual(Object.keys(CENSUS).sort())
  })

  it('agrees with the tree about which workflows can publish a required check', () => {
    const { workflows } = localReality()
    const actual: Record<string, string[]> = {}
    const claimed: Record<string, string[]> = {}

    for (const [file, source] of Object.entries(workflows)) {
      actual[file] = effectiveContexts(source)
        .filter((c: string) => CLAIMED_REQUIRED_CHECKS.includes(c))
        .sort()
      claimed[file] = [...(CENSUS[file]?.publishes ?? [])].sort()
    }

    expect(
      actual,
      'a job whose effective context is `test` or `e2e` satisfies branch protection. A second ' +
        'producer of either name can put a green tick on a commit the real suite never ran against.',
    ).toEqual(claimed)
  })

  it('reads a job name the way branch protection does', () => {
    // Branch protection matches the reported context string: the job's `name:`
    // when it has one, its key otherwise. Both spellings, pinned, because the
    // whole census rests on this 20-line reader being right.
    expect(
      effectiveContexts('jobs:\n  test:\n    runs-on: ubuntu-latest\n  e2e:\n    runs-on: ubuntu-latest\n'),
    ).toEqual(['test', 'e2e'])

    expect(
      effectiveContexts('jobs:\n  review-gate:\n    name: review-gate (advisory)\n    runs-on: ubuntu-latest\n'),
    ).toEqual(['review-gate (advisory)'])

    // A step's `name:` sits at six spaces behind a `-` and must never be read
    // as a job's — otherwise every workflow with a step called "Test" would
    // look like a producer of the required check.
    expect(
      effectiveContexts('jobs:\n  scan:\n    runs-on: ubuntu-latest\n    steps:\n      - name: test\n        run: echo\n'),
    ).toEqual(['scan'])
  })

  // THE THREE SHAPES THAT USED TO HIDE A JOB (found in review of #571, by
  // running them rather than reading for them). Every one was a FALSE
  // NEGATIVE — a job that really can publish a required context and that the
  // reader could not see — which is the dangerous direction, because an
  // invisible job satisfies the census and nothing goes red.
  it('sees a job whose name is a folded block scalar', () => {
    expect(effectiveContexts('jobs:\n  sneaky:\n    name: >-\n      test\n    runs-on: ubuntu-latest\n')).toEqual(['test'])
    expect(effectiveContexts('jobs:\n  sneaky:\n    name: |\n      e2e\n    runs-on: ubuntu-latest\n')).toEqual(['e2e'])
  })

  it('sees a job whose key carries a trailing comment', () => {
    // This one lost the WHOLE job — key, name and everything under it.
    expect(effectiveContexts('jobs:\n  sneaky: # added later\n    name: test\n    runs-on: ubuntu-latest\n')).toEqual(['test'])
  })

  it('reads a flow-style pull_request trigger', () => {
    expect(runsOnPullRequest('on: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n')).toBe(true)
    expect(runsOnPullRequest('on: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n')).toBe(false)
  })

  it('counts pull_request_target, in both spellings', () => {
    // A real PR trigger: its checks land on the PR and can satisfy branch
    // protection. It is also the more security-sensitive of the two — it runs
    // against the base repo with its secrets — so reading it as "not a PR
    // trigger" would have hidden a producer in the case worth seeing most.
    expect(runsOnPullRequest('on:\n  pull_request_target:\n    types: [opened]\n')).toBe(true)
    expect(runsOnPullRequest('on: [pull_request_target]\n')).toBe(true)
  })

  it('knows which workflows run on pull requests', () => {
    const { workflows } = localReality()
    expect(
      Object.entries(workflows)
        .filter(([, src]) => runsOnPullRequest(src))
        .map(([f]) => f)
        .sort(),
      'only a PR-triggered job can report a context in time to hold a merge',
    ).toEqual(['ci.yml', 'review-gate.yml'])
  })
})

describe('the drift workflow', () => {
  const wf = () => readFileSync(join(process.cwd(), '.github/workflows/rulebook-drift.yml'), 'utf8')

  it('runs the script and cannot publish a required check name', () => {
    expect(wf()).toContain('node scripts/rulebook-drift.mjs')
    expect(
      effectiveContexts(wf()).filter((c: string) => CLAIMED_REQUIRED_CHECKS.includes(c)),
      'a job in this workflow reporting `test` or `e2e` would satisfy branch protection with a ' +
        'tick the real suite never produced.',
    ).toEqual([])
  })

  it('never gates a pull request', () => {
    // A stale sentence in a document must not be able to hold a production
    // fix. The check's own header promises this; nothing else enforced it.
    expect(
      runsOnPullRequest(wf()),
      'rulebook-drift.yml must not run on pull_request — it reports on prose, and prose is not a ' +
        'reason to block a merge. The claims that SHOULD fail a PR are graded in this file instead.',
    ).toBe(false)
  })

  it('asks only for permissions that exist', () => {
    // THE DEFECT THIS FILE SHIPPED WITH, frozen. The first draft asked for
    // `permissions: administration: read`, which is not a valid scope —
    // GITHUB_TOKEN is never granted repository administration. GitHub rejected
    // the whole file: two 0-second failures that published NO check-run, so
    // `gh pr checks` showed nothing at all and the Actions tab listed them
    // under the file path instead of the workflow name. Merged as-is, every
    // push would have failed that way forever and the alarm would never have
    // run once — an alarm whose silence looked exactly like "no problems".
    //
    // Nothing in CI validates workflow syntax before GitHub does, so the list
    // is written out here. From GitHub's workflow-syntax documentation.
    const VALID_SCOPES = [
      'actions', 'artifact-metadata', 'attestations', 'checks', 'code-quality', 'contents',
      'deployments', 'discussions', 'id-token', 'issues', 'packages', 'pages', 'pull-requests',
      'security-events', 'statuses', 'vulnerability-alerts',
    ]
    // `\r?\n`, not `\n`. `core.autocrlf` is true on a Windows checkout and the
    // repo has no `.gitattributes`, so this file reads `permissions:\r\n` there
    // and a literal `\n` matches nothing at all — `block` comes back null and
    // the test fails for a reason that has nothing to do with permissions.
    // Green on CI's Linux runner, red for every agent running the suite
    // locally, which is where §2's "full suite green before merge" is actually
    // checked. It is the CRLF lesson at the top of `scripts/rulebook-drift.mjs`
    // arriving from the other direction.
    const block = wf().match(/^permissions:\r?\n((?: {2}\S.*\r?\n)+)/m)
    expect(block, 'rulebook-drift.yml must declare its permissions rather than inherit them').toBeTruthy()
    // `.split` rather than spreading `matchAll` — this project's tsconfig
    // target does not allow iterating a RegExpStringIterator.
    const asked = block![1]
      .split(/\r?\n/)
      .map((l) => l.match(/^ {2}([a-z-]+):/))
      .filter((m): m is RegExpMatchArray => Boolean(m))
      .map((m) => m[1])

    expect(asked.filter((s) => !VALID_SCOPES.includes(s)), 'not a real permissions scope').toEqual([])
    expect(asked, 'the checkout and the repo-settings read need nothing more').toEqual(['contents'])
  })

  it('reads branch protection through the optional secret, not the workflow token', () => {
    // The workflow token cannot read branch protection at any scope, so this
    // rides `RULEBOOK_PROTECTION_TOKEN`. When that secret is absent the run
    // must SKIP those claims rather than go red — an alarm red for a fortnight
    // waiting on a PAT nobody issued is ignored by the time it matters — and
    // the script must be TOLD, so it can say "skipped" instead of "held".
    expect(wf()).toContain('secrets.RULEBOOK_PROTECTION_TOKEN')
    expect(wf()).toContain('--no-protection-credential')
    expect(
      wf().match(/branches\/main\/protection/g)?.length,
      'the protection read belongs in the secret-gated step and nowhere else',
    ).toBe(1)
  })

  it('carries no shebang, so this file can be imported on a Windows checkout', () => {
    // The scripts/review-gate.mjs lesson, inherited: git gives a Windows tree
    // CRLF endings and vitest's transform leaves the `\r` behind when it
    // strips `#!…`, killing every test in this file on Windows only.
    expect(readFileSync(join(process.cwd(), 'scripts/rulebook-drift.mjs'), 'utf8').startsWith('#!')).toBe(false)
  })
})

describe('the gate areas', () => {
  it('claims the same list the review gate enumerates', () => {
    // §3 rules that GATE_RULES leads and the prose follows. This guard is what
    // makes "follows" mean something: add an area and the transcription here
    // must move in the same PR, which is the moment to route it into the skill.
    const live = localReality()
    expect(
      [...live.gateAreas].sort(),
      'scripts/review-gate.mjs is the source of truth for the gate areas. When it gains one, ' +
        'update CLAIMED_GATE_AREAS and dreamcrm-conventions §3 together — the enumeration is ' +
        'allowed to run ahead of the prose, but not to leave it behind indefinitely.',
    ).toEqual([...CLAIMED_GATE_AREAS].sort())
  })
})

/**
 * THE INTAKE ORDINAL, BRANCH BY BRANCH.
 *
 * The `PERTURBATIONS` table above exercises exactly one path — the duplicate,
 * which is the case that actually happened. The claim has four, and three of
 * them are the ones that make it trustworthy rather than merely present: an
 * ordinal it cannot resolve, a hole in the middle, and a reader that stopped
 * reading. §2d's rule is that a predicate counts once you have watched it fail,
 * and "it failed on the case I already knew about" is not the whole of that.
 */
describe('the intake ordinal counter', () => {
  const ordinals = CLAIMS.find((c: { id: string }) => c.id === 'intake-ordinals')!
  /** A rulebook whose only content is the entry markers for `numbers`. */
  const rulebookOf = (words: string[]) => ({
    rulebook: { files: ['SKILL.md'], text: words.map((w) => `**THE ${w}: #1, an entry.**`).join('\n\n') },
  })
  const NINE = ['FORTY-NINTH', 'FIFTIETH', 'FIFTY-FIRST', 'FIFTY-SECOND', 'FIFTY-THIRD',
    'FIFTY-FOURTH', 'FIFTY-FIFTH', 'FIFTY-SIXTH', 'FIFTY-SEVENTH']

  it('is silent on a clean run of ordinals', () => {
    expect(ordinals.check(rulebookOf(NINE))).toBeNull()
  })

  /**
   * THE 2026-09-23 CASE. Three PRs, one number, all three mergeable because
   * they insert at different offsets in one file.
   */
  it('catches a duplicate, which is what three concurrent PRs produce', () => {
    const finding = ordinals.check(rulebookOf([...NINE, 'FIFTY-SEVENTH']))
    expect(finding).not.toBeNull()
    expect(finding.actual).toContain('duplicate')
    expect(finding.actual).toContain('57')
    // It must tell the reader which PR renumbers, not merely that something is wrong.
    expect(finding.fix).toContain('lands SECOND renumbers')
  })

  it('catches a hole in the middle, which is a renumber that skipped one', () => {
    const finding = ordinals.check(rulebookOf(NINE.filter((w) => w !== 'FIFTY-THIRD')))
    expect(finding).not.toBeNull()
    expect(finding.actual).toContain('53')
  })

  /**
   * A TYPO'D ORDINAL IS LOUD AND A NON-ORDINAL IS QUIET, and the pair is the
   * design. `**THE FIX:` is a real heading in this rulebook; keying on the map
   * alone would skip it AND skip `FIFTY-EIGTH`, which is the one a counter's
   * guard must never wave through.
   */
  it('reports an ordinal it cannot resolve rather than skipping it', () => {
    const finding = ordinals.check(rulebookOf([...NINE, 'FIFTY-EIGTH']))
    expect(finding).not.toBeNull()
    expect(finding.actual).toContain('cannot resolve')
    expect(finding.actual).toContain('FIFTY-EIGTH')
  })

  it('ignores a heading that is not shaped like an ordinal at all', () => {
    const text = rulebookOf(NINE).rulebook.text + '\n\n**THE FIX: reword it.**'
    expect(ordinals.check({ rulebook: { files: ['SKILL.md'], text } })).toBeNull()
  })

  /**
   * THE EYES. Every branch above is about a set this reader built, so a regex
   * that stopped matching reports a perfectly unique, perfectly contiguous
   * EMPTY list. There is no second census to compare against here — unlike the
   * guards, whose directory is an independent reading — so the floor is the
   * honest instrument rather than a weaker version of an exact one.
   */
  it('refuses a reader that found almost nothing', () => {
    const finding = ordinals.check(rulebookOf(NINE.slice(0, INTAKE_ORDINAL_FLOOR - 1)))
    expect(finding).not.toBeNull()
    expect(finding.actual).toContain('ordinal entry markers')
    expect(finding.fix).toContain('Do NOT lower the floor')
  })

  /**
   * The map is DERIVED from units and tens rather than typed out — a
   * hand-kept table guarding a hand-kept list would be the joke §2d makes at
   * its own expense. These are the joints where a derivation goes wrong.
   */
  it('spells the tens and the compounds the way English does', () => {
    expect(ORDINAL_WORDS.FIRST).toBe(1)
    expect(ORDINAL_WORDS.NINETEENTH).toBe(19)
    expect(ORDINAL_WORDS.TWENTIETH).toBe(20)
    expect(ORDINAL_WORDS['TWENTY-FIRST']).toBe(21)
    expect(ORDINAL_WORDS.FIFTIETH).toBe(50)
    expect(ORDINAL_WORDS['FIFTY-SEVENTH']).toBe(57)
    expect(ORDINAL_WORDS['NINETY-NINTH']).toBe(99)
    // The shapes English does NOT use, so a compound cannot resolve two ways.
    expect(ORDINAL_WORDS['TWENTY-TENTH']).toBeUndefined()
    expect(ORDINAL_WORDS.TWENTIETH_FIRST).toBeUndefined()
  })
})
