import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  MAIN_HISTORY_FLOOR,
  MERGED_PR_FLOOR,
  RULEBOOK_DIR,
  MOJIBAKE_SIGNATURES,
  boldRunAt,
  describeFindings,
  gradeAgainstHistory,
  gradeAgreement,
  gradeEncoding,
  gradeRulebook,
  gradeShape,
  maskInlineCode,
  parseStateEntries,
  prNumberFromSubject,
  type MainHistory,
  type StateEntry,
} from './rulebook-state'

/**
 * NO `STATE:` LINE IN THE RULEBOOK LIES ABOUT `main`.
 *
 * `rulebook-state.ts` carries the defect (nine stale lines, oldest six days,
 * four of them contradicting §2 about the same four PRs), the five rules and
 * what they cannot see. This file is the wiring: it walks `docs/rulebook/`
 * with `git ls-files`, reduces `git log origin/main` to the two facts the
 * grader needs, and asserts its own eyes before it grades anything.
 *
 * WHY THE EYES ASSERTIONS COME FIRST AND ARE NOT NEGOTIABLE. Rules 4 and 5
 * read `main`'s history, and every finding they produce is a POSITIVE match —
 * so a reader narrowed to nothing produces zero findings and reports a clean
 * rulebook. That is §2d's whole subject: "watching the PREDICATE fail tells
 * you nothing about the guard's EYES". On a `pull_request`, actions/checkout
 * fetches `refs/pull/N/merge` and nothing else, and until this guard landed
 * `ci.yml` filled the gap with `--depth=1` — a tip with no history at all.
 * Both floors below are met by a factor of four on the real repo and are
 * unreachable from a truncated fetch, so they detect shallowness rather than
 * counting anything.
 */

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
}

function rulebookFiles(): string[] {
  return git(['ls-files', '--', RULEBOOK_DIR])
    .split('\n')
    .map((f) => f.trim())
    .filter((f) => f.endsWith('.md'))
}

/**
 * `main`'s history, reduced to the two questions the grader asks.
 *
 * A squash lands as `<subject> (#N)`; a merge commit as `Merge pull request
 * #N from …`. Both spellings are read, because `main` carries both — the
 * repo's own log has `… (#679)` three commits above `Merge pull request #674`.
 */
function readMainHistory(): { history: MainHistory; commitCount: number } {
  const log = git(['log', 'origin/main', '--format=%H%x00%s'])
    .split('\n')
    .filter(Boolean)

  const mergedPrs = new Map<number, string>()
  for (const row of log) {
    const [sha, subject = ''] = row.split('\0')
    const pr = prNumberFromSubject(subject)
    if (pr !== null) mergedPrs.set(pr, sha)
  }

  const cache = new Map<string, 'yes' | 'no' | 'unknown'>()
  const ancestry = (sha: string): 'yes' | 'no' | 'unknown' => {
    const hit = cache.get(sha)
    if (hit) return hit
    let answer: 'yes' | 'no' | 'unknown'
    try {
      git(['cat-file', '-e', `${sha}^{commit}`])
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main'], { cwd: process.cwd() })
        answer = 'yes'
      } catch {
        answer = 'no'
      }
    } catch {
      // Unresolvable in this clone — a deleted PR branch's head, most often.
      // Rule 4 declines to grade it rather than reddening an innocent entry.
      answer = 'unknown'
    }
    cache.set(sha, answer)
    return answer
  }

  /**
   * Does the TREE UNDER TEST differ from `sha` under `docs/rulebook/`?
   *
   * Working tree vs a commit, deliberately — not commit vs commit. `git diff
   * --quiet <sha> -- <dir>` exits 0 when they match, 1 when they differ. On a
   * `pull_request` run the working tree is the MERGE RESULT, so this answers
   * the same question `main` will ask after the merge, which is the property
   * rule 5's docblock leans on.
   */
  const editedCache = new Map<string, boolean>()
  const rulebookEditedSince = (sha: string): boolean => {
    const hit = editedCache.get(sha)
    if (hit !== undefined) return hit
    let answer: boolean
    try {
      execFileSync('git', ['diff', '--quiet', sha, '--', RULEBOOK_DIR], { cwd: process.cwd() })
      answer = false
    } catch {
      // Exit 1 is "they differ", which is the ordinary answer. A commit this
      // clone cannot resolve also lands here, and that direction is right: if
      // we cannot prove the rulebook is untouched, we do not grant the grace.
      answer = true
    }
    editedCache.set(sha, answer)
    return answer
  }

  return {
    history: { mergedPrs, ancestry, rulebookEditedSince },
    commitCount: log.length,
  }
}

function allEntries(): StateEntry[] {
  return rulebookFiles().flatMap((file) =>
    parseStateEntries(readFileSync(file, 'utf8'), file),
  )
}

describe('the rulebook is in this repository at all', () => {
  /**
   * The guard's field of view, asserted rather than assumed.
   *
   * Every rule here is an ABSENCE assertion over the files this finds, so
   * deleting `docs/rulebook/` would turn the whole suite green. The nine
   * reference files plus the map are what the skill store holds; a tenth
   * arriving is fine, a ninth going missing is not.
   */
  it('carries the map and every reference file the skill store does', () => {
    const files = rulebookFiles()
    expect(files).toContain(`${RULEBOOK_DIR}/SKILL.md`)
    for (const section of ['1', '2', '2a', '2b', '2c', '2d', '3', '6', '8']) {
      const match = files.filter((f) =>
        f.startsWith(`${RULEBOOK_DIR}/references/${section}-`),
      )
      expect(match, `§${section} has no file under ${RULEBOOK_DIR}/references/`).toHaveLength(1)
    }
  })

  it('finds STATE lines to grade', () => {
    // Zero entries is the other way this suite goes green while blind: a
    // parser that stops matching reports a clean rulebook.
    expect(allEntries().length).toBeGreaterThanOrEqual(20)
  })
})

describe('the guard can actually see main', () => {
  it('has a deep enough `origin/main` to grade a verdict against', () => {
    const { history, commitCount } = readMainHistory()
    expect(
      commitCount,
      'origin/main was fetched shallow — rules 4 and 5 are blind and would report clean. ' +
        'See the `Fetch main` step in .github/workflows/ci.yml and deploy.yml.',
    ).toBeGreaterThanOrEqual(MAIN_HISTORY_FLOOR)
    expect(
      history.mergedPrs.size,
      'no PR numbers were recoverable from main\'s subjects — rule 5 is blind.',
    ).toBeGreaterThanOrEqual(MERGED_PR_FLOOR)
  })
})

describe('the rulebook still reads as what was written', () => {
  it('is valid UTF-8 with no C1 byte and no cp1252 mojibake, in every file', () => {
    const findings = rulebookFiles().flatMap((file) =>
      gradeEncoding(file, readFileSync(file)),
    )
    expect(findings.length, `\n${describeFindings(findings)}\n`).toBe(0)
  })
})

describe('no STATE line in the rulebook lies', () => {
  it('holds at zero findings across every rulebook file', () => {
    const { history } = readMainHistory()
    const findings = gradeRulebook(allEntries(), history)
    expect(findings.length, `\n${describeFindings(findings)}\n`).toBe(0)
  })

  /**
   * Rule 4's narrowing, asserted on the real tree rather than described.
   *
   * The claim is the bold run, not the clause, and `2-merge-gate.md` is where
   * that matters: SHAs in this document sit in commentary AFTER the bold
   * closes (a review head, an earlier re-read, a second reviewer's head), and
   * none of them is the merge commit. Grading the clause would put them in
   * rule 4's population.
   *
   * WHAT THIS USED TO ASSERT, AND WHY IT WAS WRONG ON THE RUNNER. The first
   * version required at least one of those commentary SHAs to be resolvable
   * AND not an ancestor of `origin/main`. That is true in a developer's full
   * clone, which still has the deleted PR-branch heads, and FALSE on a runner
   * that fetches only `main` — there they are unresolvable, `ancestry` answers
   * `unknown`, and the set is empty. The assertion went red on CI while the
   * guard was working perfectly. That is §2d's "a guard's SENTENCE is a claim
   * about a MACHINE — ask which one", shipped in the same PR that adds the
   * section, which is worth the embarrassment of writing down.
   *
   * So the tree-level claim is now the part that does not depend on what this
   * clone happens to have fetched: commentary SHAs EXIST, so the narrowing has
   * a non-empty population to act on. That rule 4 declines to grade them is
   * pinned from fixtures below, where both machines agree.
   */
  it('has commentary SHAs outside the merge claim for the narrowing to act on', () => {
    const entries = allEntries()
    const offClaim = entries.flatMap((e) =>
      e.clauseShas.filter((sha) => !e.claimShas.includes(sha)),
    )
    expect(
      offClaim.length,
      'no entry carries a SHA outside its bold claim any more, so rule 4 grading the whole ' +
        'clause would now be equivalent. Re-measure before widening it — do not assume.',
    ).toBeGreaterThan(0)
  })

  /**
   * THE TREE THIS COMMIT CREATES DOES NOT REDDEN `main` AT THE MERGE.
   *
   * The property Sentinel's REQUEST CHANGES on #685 was about, asserted rather
   * than reasoned about — and it is a standing assertion, not a one-off for
   * that PR, because §2 writes a registered-guard entry BEFORE its PR merges
   * on the DREAMCRM-60 precedent, so every future guard registration arrives
   * in exactly this state.
   *
   * The simulation is the honest one: take the REAL entries and the REAL
   * history, then add every not-yet-merged subject in the rulebook to
   * `mergedPrs` — which is what a squash merge does — and answer
   * `rulebookEditedSince` with `false`, which is what `main` answers the
   * instant the merge lands, since its tree IS this tree.
   *
   * A red here means the merge would stop the production deploy
   * (`deploy: needs: test`) and make every open PR unmergeable
   * (`strict: true`). It is the most expensive failure this guard can cause
   * and the cheapest one to check for.
   *
   * THIS TEST AND `holds at zero findings` ARE LOAD-BEARING TOGETHER — DO NOT
   * DELETE EITHER ON THE GROUNDS THAT THE OTHER COVERS IT. (Sentinel's note 2
   * on #685.) The simulation below is deliberately MORE PERMISSIVE than
   * reality: it blankets `rulebookEditedSince: () => false` across every
   * entry, while on real `main` only the just-merged subject answers false —
   * every pre-`docs/rulebook/` subject answers TRUE, because the directory
   * does not exist at those commits, so `git diff` always differs. What makes
   * the pair sound is that `holds at zero findings` runs the REAL predicate
   * over the same tree and the same SHAs, and this test covers only the one
   * entry that the real-tree test structurally cannot reach — the PR being
   * merged, whose number is not in `mergedPrs` until it lands. Neither alone
   * is the assertion.
   */
  it('stays green on `main` at the instant this tree merges', () => {
    const { history } = readMainHistory()
    const entries = allEntries()

    const openSubjects = entries
      .filter((e) => e.verdict !== 'MERGED' && e.subject !== null)
      .map((e) => e.subject as number)

    const atMerge: MainHistory = {
      ...history,
      mergedPrs: new Map([
        ...Array.from(history.mergedPrs.entries()),
        ...openSubjects.map((pr) => [pr, 'f'.repeat(40)] as [number, string]),
      ]),
      // `main`'s tree at the merge is this tree, so nothing has been edited
      // since — the state in which rule 5 owes its grace.
      rulebookEditedSince: () => false,
    }

    const findings = gradeRulebook(entries, atMerge)
    expect(
      findings.length,
      'this tree would redden `main` the moment it merges, blocking the deploy and ' +
        `every open PR:\n${describeFindings(findings)}\n`,
    ).toBe(0)
  })

  /**
   * …and the grace is not a hole. The same simulation with the rulebook
   * EDITED since must fire on every open subject, or the test above is passing
   * because rule 5 has stopped working rather than because the grace applies.
   *
   * Skipped only when the rulebook carries no open entry at all, which is a
   * legitimate state and is asserted as such rather than passed over.
   */
  it('would fire on those same entries once the rulebook is edited again', () => {
    const { history } = readMainHistory()
    const entries = allEntries()
    const open = entries.filter((e) => e.verdict !== 'MERGED' && e.subject !== null)

    if (open.length === 0) {
      expect(entries.every((e) => e.verdict === 'MERGED')).toBe(true)
      return
    }

    const afterAnEdit: MainHistory = {
      ...history,
      mergedPrs: new Map([
        ...Array.from(history.mergedPrs.entries()),
        ...open.map((e) => [e.subject as number, 'f'.repeat(40)] as [number, string]),
      ]),
      rulebookEditedSince: () => true,
    }

    const findings = gradeAgainstHistory(entries, afterAnEdit).filter((f) => f.rule === 5)
    expect(findings).toHaveLength(open.length)
  })

  /**
   * The fallback in `parseStateEntries` — grading the whole clause when the
   * `STATE:` is not inside a bold run — is unexercised on today's tree. That
   * is not the same as handling it, so it is pinned from fixtures below and
   * recorded here.
   */
  it('writes every entry in bold, so rule 4 never falls back today', () => {
    expect(allEntries().every((e) => e.claimIsBold)).toBe(true)
  })
})

// ===========================================================================
// The fixtures. Every rule is watched failing against the real defect it was
// written for, and every one of these is the shape that actually occurred.
// ===========================================================================

const NO_HISTORY: MainHistory = {
  mergedPrs: new Map(),
  ancestry: () => 'unknown',
  rulebookEditedSince: () => true,
}

/**
 * `edited` defaults to TRUE — the state where rule 5 is ALLOWED to fire.
 *
 * Defaulting the other way would make every rule-5 fixture below pass for the
 * wrong reason, which is the shape §2d's wiring family calls "the fixture
 * reddens, but not for the stated reason". The one fixture that exercises the
 * grace passes `false` explicitly and says so.
 */
function historyWith(
  prs: Record<number, string>,
  onMain: string[] = [],
  edited = true,
): MainHistory {
  return {
    mergedPrs: new Map(Object.entries(prs).map(([k, v]) => [Number(k), v])),
    ancestry: (sha) => (onMain.includes(sha) ? 'yes' : 'no'),
    rulebookEditedSince: () => edited,
  }
}

describe('parsing a STATE line', () => {
  it('reads a verdict that wrapped onto the next line', () => {
    // The first draft of this guard read the physical LINE and called six
    // merged entries unmerged, because these files hard-wrap at 79 columns.
    const source = [
      '*`tests/marketing/no-drawn-grid.test.ts`, DREAMCRM-72 / PR #618. **STATE:',
      'MERGED 2026-09-16, `16dd4fcd`** — it was behind §3\'s review.',
    ].join('\n')
    const [entry] = parseStateEntries(source, 'f.md')
    expect(entry.verdict).toBe('MERGED')
    expect(entry.subject).toBe(618)
    expect(entry.claimShas).toEqual(['16dd4fcd'])
  })

  it('reads the verdict off the bold claim, not off commentary that quotes it', () => {
    // #685's own entry. The clause explains what will happen if the line
    // "still says anything but MERGED" — a clause-scoped verdict read that
    // word and graded a correct OPEN entry as merged, which is a red required
    // check naming an innocent line.
    const source = [
      '**STATE: on the PR — #685, routed before it merged. Forge owns the flip at',
      'the next sweep.** Rule 5 reddens `test` the moment #685 lands on `main`',
      'and this line still says anything but MERGED.',
    ].join('\n')
    const [entry] = parseStateEntries(source, 'f.md')
    expect(entry.verdict).toBe('UNMERGED')
    expect(entry.subject).toBe(685)
  })

  it('takes the subject from before the STATE when the clause names no PR', () => {
    const source = 'DREAMCRM-87 / PR #647. **STATE: MERGED — `71f4037e`, 2026-09-22.**'
    expect(parseStateEntries(source, 'f.md')[0].subject).toBe(647)
  })

  it('ignores prose that quotes a STATE line inside backticks', () => {
    // All three of these are real sentences in §2.
    const source = [
      'WHAT THIS SWEEP IS WRITTEN UP FOR: NINE STALE `STATE:` LINES, all saying OPEN.',
      '',
      'The third pass greps every reference file for `STATE:` — not the one being edited.',
      '',
      'An entry reading `STATE: on the PR` is a promise of a second visit.',
    ].join('\n')
    expect(parseStateEntries(source, 'f.md')).toHaveLength(0)
  })

  it('keeps the bold claim separate from the commentary after it', () => {
    const source = [
      '**STATE: MERGED — `c8a0f094`, 2026-09-22 20:46:28Z, Sentinel APPROVE WITH NOTES**',
      '(reviewed at head `47d4d847`; the entry carried `d7137de2` after the re-read).',
    ].join('\n')
    const [entry] = parseStateEntries(source, 'f.md')
    expect(entry.claimShas).toEqual(['c8a0f094'])
    expect(entry.clauseShas).toEqual(['c8a0f094', '47d4d847', 'd7137de2'])
  })

  it('falls back to the clause when the entry is not written in bold', () => {
    const [entry] = parseStateEntries('STATE: MERGED — `deadbee`, 2026-09-22. (#700)', 'f.md')
    expect(entry.claimIsBold).toBe(false)
    expect(entry.claimShas).toEqual(['deadbee'])
  })

  it('masks a code span without moving any other offset', () => {
    expect(maskInlineCode('a `bc` d')).toBe('a      d')
  })

  it('is not thrown off by a `**` inside a code span earlier in the paragraph', () => {
    // The real shape, from §2's error-scan entry: one stray `**` in a quoted
    // glob makes the raw `**` count odd, which mis-pairs every run after it.
    // With the raw count the entry below read as NOT bold and rule 4 widened
    // to the whole clause — silently, because widening a reader only ever
    // produces MORE findings, and there were none to notice.
    const source = [
      'A glob spelled `**` in prose, then **an emphasised clause** and more text.',
      '**STATE: MERGED — `1b34d25` (#664), 2026-09-22 21:38:38Z.** Flipped at the',
      'sweep, not by the author, at head `47d4d84`.',
    ].join('\n')
    const [entry] = parseStateEntries(source, 'f.md')
    expect(entry.claimIsBold).toBe(true)
    expect(entry.claimShas).toEqual(['1b34d25'])
  })

  it('finds no bold run around an offset outside every run', () => {
    expect(boldRunAt('plain **bold** tail', 16)).toBeNull()
    expect(boldRunAt('plain **bold** tail', 9)).toBe('bold')
  })
})

describe('rule 0 — the bytes still say what was written', () => {
  it('fails the cp1252 em dash, which control-bytes.ts cannot see', () => {
    // Watched on the real tree first: a 0x97 planted in docs/rulebook/ left
    // `control-bytes.test.ts` green across all sixteen of its passes, because
    // its banned set is C0 and 0x97 is C1.
    const bytes = Buffer.concat([
      Buffer.from('one', 'utf8'),
      Buffer.from([0x97]),
      Buffer.from('defect, one entry\n', 'utf8'),
    ])
    const findings = gradeEncoding('docs/rulebook/references/1.md', bytes)
    expect(findings.map((f) => f.rule)).toEqual([0])
    expect(findings[0].message).toContain('not valid UTF-8')
    expect(findings[0].message).toContain('0x97')
  })

  it('fails a C1 code point that arrived correctly encoded', () => {
    // 0xC2 0x97 decodes cleanly, so the decode check above cannot see it.
    const bytes = Buffer.from(`ok\nthen ${String.fromCharCode(0x97)} here\n`, 'utf8')
    const findings = gradeEncoding('f.md', bytes)
    expect(findings.map((f) => [f.rule, f.line])).toEqual([[0, 2]])
    expect(findings[0].message).toContain('U+0097')
  })

  it('fails mojibake that is valid UTF-8 and simply the wrong characters', () => {
    // The 2026-09-14 shape: 90 characters, invisible from the agent side.
    const bytes = Buffer.from(`fine\nsee ${MOJIBAKE_SIGNATURES[1]}2 for the rule\n`, 'utf8')
    const findings = gradeEncoding('f.md', bytes)
    expect(findings.map((f) => [f.rule, f.line])).toEqual([[0, 2]])
    expect(findings[0].message).toContain('mojibake')
  })

  it('passes clean UTF-8 carrying the punctuation the rulebook actually uses', () => {
    const bytes = Buffer.from('§2 — the merge gate, with an em dash and a curly ’quote’.\n', 'utf8')
    expect(gradeEncoding('f.md', bytes)).toHaveLength(0)
  })
})

describe('rule 1 — a STATE line names the PR it is about', () => {
  it('fails an entry no reader could re-check', () => {
    const entries = parseStateEntries('**STATE: MERGED — `deadbee`, 2026-09-22.**', 'f.md')
    const findings = gradeShape(entries)
    expect(findings.map((f) => f.rule)).toEqual([1])
    expect(findings[0].message).toContain('no PR number')
  })

  it('passes once the PR number is there', () => {
    expect(
      gradeShape(parseStateEntries('**STATE: MERGED — #700, `deadbee`, 2026-09-22.**', 'f.md')),
    ).toHaveLength(0)
  })
})

describe('rule 2 — a MERGED verdict names its commit and its date', () => {
  it('fails the #621 shape: "merged" on its own', () => {
    // #621's line said MERGED with no SHA and survived six days of sweeps,
    // because nothing on it could be re-checked.
    const findings = gradeShape(parseStateEntries('**STATE: MERGED** (#621).', 'f.md'))
    expect(findings.map((f) => f.rule)).toEqual([2, 2])
    expect(findings[0].message).toContain('without naming a commit')
    expect(findings[1].message).toContain('without naming a date')
  })

  it('does not ask an UNMERGED entry for a merge SHA', () => {
    expect(gradeShape(parseStateEntries('**STATE: on the PR (#700).**', 'f.md'))).toHaveLength(0)
  })

  it('accepts a date with no time, because four pre-convention entries carry one', () => {
    expect(
      gradeShape(parseStateEntries('**STATE: MERGED 2026-09-16, `16dd4fcd`** (#618).', 'f.md')),
    ).toHaveLength(0)
  })
})

describe('rule 3 — two files never disagree about one PR', () => {
  it('fails the §2/§2b split that made four of the nine', () => {
    // §2's list recorded #647 MERGED the same morning §2b still described it
    // as open. An agent opening §2b to read what the rule DOES was told it was
    // not live.
    const entries = [
      ...parseStateEntries('**STATE: MERGED — `71f4037e`, 2026-09-22.** (#647)', '2-merge-gate.md'),
      ...parseStateEntries('PR #647. **STATE: on the PR; Forge owns the flip.**', '2b-contrast.md'),
    ]
    const findings = gradeAgreement(entries)
    expect(findings).toHaveLength(2)
    expect(findings[0].rule).toBe(3)
    expect(findings[0].message).toContain('disagrees with itself about #647')
    expect(findings[0].message).toContain('2b-contrast.md')
  })

  it('says nothing when both files agree', () => {
    const entries = [
      ...parseStateEntries('**STATE: MERGED — `71f4037e`, 2026-09-22.** (#647)', 'a.md'),
      ...parseStateEntries('**STATE: MERGED — `71f4037e`, 2026-09-22.** (#647)', 'b.md'),
    ]
    expect(gradeAgreement(entries)).toHaveLength(0)
  })
})

describe('rule 4 — a MERGED claim names a commit that is on main', () => {
  it('fails a claim whose SHA is not an ancestor of main', () => {
    const entries = parseStateEntries('**STATE: MERGED — `badc0de`, 2026-09-22.** (#700)', 'f.md')
    const findings = gradeAgainstHistory(entries, historyWith({}, []))
    expect(findings.map((f) => f.rule)).toEqual([4])
    expect(findings[0].message).toContain('not an ancestor')
  })

  it('passes when the SHA is on main', () => {
    const entries = parseStateEntries('**STATE: MERGED — `c8a0f09`, 2026-09-22.** (#665)', 'f.md')
    expect(gradeAgainstHistory(entries, historyWith({}, ['c8a0f09']))).toHaveLength(0)
  })

  it('declines to grade a SHA this clone cannot resolve', () => {
    // A merged PR's branch is deleted, so its head is unresolvable here.
    // Failing on it would be a red `test` run naming a correct entry.
    const entries = parseStateEntries('**STATE: MERGED — `47d4d84`, 2026-09-22.** (#665)', 'f.md')
    expect(gradeAgainstHistory(entries, NO_HISTORY)).toHaveLength(0)
  })

  it('does not grade a SHA that sits in the commentary after the claim', () => {
    const source = [
      '**STATE: MERGED — `c8a0f09`, 2026-09-22.** (#665) — reviewed at head',
      '`47d4d84`, which is not on main and never was.',
    ].join('\n')
    const history = historyWith({}, ['c8a0f09'])
    expect(gradeAgainstHistory(parseStateEntries(source, 'f.md'), history)).toHaveLength(0)
  })
})

describe('rule 5 — a non-MERGED verdict is not already on main', () => {
  it('fails the nine-line defect itself', () => {
    const source = 'PR #664. **STATE: on the PR — Forge owns the flip at the next sweep.**'
    const findings = gradeAgainstHistory(
      parseStateEntries(source, '2-merge-gate.md'),
      historyWith({ 664: '1b34d2571b34d2571b34d2571b34d2571b34d257' }),
    )
    expect(findings.map((f) => f.rule)).toEqual([5])
    expect(findings[0].message).toContain('#664 is on `main`')
    expect(findings[0].message).toContain('1b34d257')
  })

  it('stays quiet while the PR really is open', () => {
    const source = 'PR #999. **STATE: on the PR.**'
    expect(gradeAgainstHistory(parseStateEntries(source, 'f.md'), historyWith({}))).toHaveLength(0)
  })

  it('does not fire while the rulebook has not been touched since the merge', () => {
    // THE SECOND CONDITION, and the whole reason this rule is legal in a merge
    // gate. #685's own entry is this exact shape: routed before the merge, so
    // it says "on the PR" at the instant the PR lands. Firing here reddens
    // `main` — `deploy: needs: test` stops the production deploy and
    // `strict: true` makes every open PR unmergeable — with no clearing action
    // available, because the merge SHA does not exist until afterwards.
    const source = 'PR #685. **STATE: on the PR — Forge owns the flip.**'
    const entries = parseStateEntries(source, '2-merge-gate.md')
    const landed = { 685: 'aaaaaaaabbbbbbbbccccccccdddddddd' }

    expect(gradeAgainstHistory(entries, historyWith(landed, [], false))).toHaveLength(0)

    // …and the obligation is real the moment the rulebook is edited again.
    const findings = gradeAgainstHistory(entries, historyWith(landed, [], true))
    expect(findings.map((f) => f.rule)).toEqual([5])
    expect(findings[0].message).toContain('has been edited since')
  })
})

describe('the subject reader main history is built from', () => {
  /**
   * Graded through the REAL exported function, not a copy of its regexes.
   *
   * The previous version of this test re-declared both patterns as literals
   * and matched them against two literal strings — so deleting the
   * merge-commit branch from the real reader left it green, while 15 of the
   * 658 recoverable PR numbers on `main` (including `#674`) silently vanished
   * and `MERGED_PR_FLOOR` of 100 never noticed. Rule 5 would have gone quiet
   * on every merge-commit-landed PR with nothing red. (Sentinel, #685.)
   */
  it('reads a squash subject', () => {
    expect(
      prNumberFromSubject('DREAMCRM-99: the portal-billing duplicate is TRANSIENT (#679)'),
    ).toBe(679)
  })

  it('reads a merge-commit subject', () => {
    expect(
      prNumberFromSubject('Merge pull request #674 from DreamCreateWeb/claude/focused-einstein'),
    ).toBe(674)
  })

  it('reads a single-digit PR number, which main carries six of', () => {
    expect(prNumberFromSubject('Merge pull request #8 from DreamCreateWeb/claude/stripe-admin-ui')).toBe(8)
  })

  it('ignores a PR number that is neither the trailer nor the merge prefix', () => {
    // An issue key or a cross-reference in the middle of a subject is not the
    // PR this commit carried.
    expect(prNumberFromSubject('DREAMCRM-98: Sentinel notes 2 and 3 on #669')).toBeNull()
  })

  it('recovers every merge-commit PR number on the real main', () => {
    // The fixtures above prove the branch exists; this proves it is LOAD
    // BEARING on the tree that actually gates merges. Deleting the
    // merge-commit branch drops these to zero.
    const subjects = git(['log', 'origin/main', '--format=%s']).split('\n').filter(Boolean)
    const fromMergeCommits = subjects.filter((s) => s.startsWith('Merge pull request #'))
    expect(fromMergeCommits.length).toBeGreaterThan(0)
    for (const subject of fromMergeCommits) {
      expect(prNumberFromSubject(subject), subject).not.toBeNull()
    }
  })
})
