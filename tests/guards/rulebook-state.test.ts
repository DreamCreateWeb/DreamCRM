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
    const squashed = subject.match(/\(#(\d{2,5})\)\s*$/)
    if (squashed) mergedPrs.set(Number(squashed[1]), sha)
    const merged = subject.match(/^Merge pull request #(\d{2,5})\b/)
    if (merged) mergedPrs.set(Number(merged[1]), sha)
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

  return { history: { mergedPrs, ancestry }, commitCount: log.length }
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
   * that matters: three SHAs in the rulebook today sit in commentary AFTER the
   * bold closes (a review head, an earlier re-read, a second reviewer's head)
   * and none of them is on `main`. Grading the clause would fail three correct
   * entries. If this ever drops to zero the narrowing has stopped being
   * load-bearing and rule 4 can widen; it is not an exemption list.
   */
  it('excludes commentary SHAs from the merge claim, and that exclusion is doing work', () => {
    const { history } = readMainHistory()
    const entries = allEntries()
    const offClaim = entries.flatMap((e) =>
      e.clauseShas
        .filter((sha) => !e.claimShas.includes(sha))
        .filter((sha) => history.ancestry(sha) === 'no'),
    )
    expect(offClaim.length).toBeGreaterThan(0)
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

const NO_HISTORY: MainHistory = { mergedPrs: new Map(), ancestry: () => 'unknown' }

function historyWith(prs: Record<number, string>, onMain: string[] = []): MainHistory {
  return {
    mergedPrs: new Map(Object.entries(prs).map(([k, v]) => [Number(k), v])),
    ancestry: (sha) => (onMain.includes(sha) ? 'yes' : 'no'),
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

  it('reads a merge-commit subject as well as a squash subject', () => {
    // main carries both spellings: `… (#679)` and `Merge pull request #674`.
    const squash = /\(#(\d{2,5})\)\s*$/.exec('DREAMCRM-99: the portal-billing duplicate (#679)')
    const merge = /^Merge pull request #(\d{2,5})\b/.exec(
      'Merge pull request #674 from DreamCreateWeb/claude/focused-einstein-evqdd5',
    )
    expect(squash?.[1]).toBe('679')
    expect(merge?.[1]).toBe('674')
  })
})
