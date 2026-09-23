import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RULEBOOK_DIR,
  compareTree,
  describeFirstDifference,
  diffAgainstMerged,
  findC1,
  findFalseHeadings,
  findMojibake,
  gradeText,
  parseArgs,
  parseFrontmatterDescription,
  readRulebookTree,
} from '../../scripts/rulebook-publish.mjs'

/**
 * THE PUBLISHER'S VERIFY, VERIFIED.
 *
 * `scripts/rulebook-publish.mjs` is the only thing standing between `main`'s
 * `docs/rulebook/` and the copy in the Multica skill store that every agent
 * actually opens. It CANNOT be a required status check: verifying needs a
 * credentialed `multica` CLI and `test` has `contents: read` and one secret, so
 * a version of it that ran here would report GREEN without ever reaching its
 * subject — §2a's "a check that cannot fail is not a check" in its purest form.
 *
 * So the enforcement is split, and this file is the half that lives in the
 * gate:
 *
 *   1. **EVERY PREDICATE IS WATCHED TO FAIL.** The four assertions are pure
 *      functions over bytes, which is why they were written as pure functions
 *      over bytes. Each is perturbed below and must be SEEN to redden. A verify
 *      whose predicates have quietly stopped firing prints exactly the same
 *      CLEAN line as one that holds, and the release would be waved through on
 *      it.
 *   2. **THE RELEASE GATE STILL EXISTS.** `docs/RELEASE.md` R5 names this
 *      command. A go/no-go that no longer mentions it is a gate that was
 *      deleted from a document nobody diffs, so the sentence is asserted here.
 *   3. **THE AUTHORED COPY IS GRADED BY THE STRONGER DETECTOR.** The preflight
 *      runs over the real `docs/rulebook/**` tree in this suite. That is not a
 *      duplicate of `rulebook-state.ts` rule 0 and the difference is the point:
 *      rule 0's mojibake test is a hand-kept list of SIGNATURES this office has
 *      seen, so it is green on every character it was not told about — §2d's
 *      identity-looseness family, in the guard that exists to catch encoding
 *      defects. `findMojibake` is the INVERSE of the defect rather than a list
 *      of its symptoms, and running it here is what puts it over the authored
 *      copy as well as the published one. Collapsing rule 0 onto it is a
 *      follow-up on a required check's definition and is deliberately not done
 *      in this PR; until it happens, the two coexist and this one is the wider.
 *
 * WHAT THIS FILE DOES NOT AND CANNOT COVER, said rather than implied: whether
 * the store currently matches `main`. Nothing without a credential can know
 * that. The evidence for that claim is a `--verify-only` run recorded on the
 * issue, and R5 is where it is owed again.
 */

const ROOT = process.cwd()

/** A minimal well-formed rulebook, so a perturbation has something to perturb. */
const HEALTHY_SKILL_MD = [
  '---',
  'name: dreamcrm-conventions',
  'description: "The map. Section one is the freeze."',
  '---',
  '',
  '# The rulebook',
  '',
  'A paragraph mentioning #559 mid-line, which is fine.',
  '',
  '```sh',
  '#!/usr/bin/env bash',
  '#559 inside a fence is code, not a heading',
  '```',
  '',
  '## A real subheading',
  '',
].join('\n')

describe('C — the encoding predicates fire, and fire on the thing they name', () => {
  it('finds a raw C1 byte, which is what a cp1252 em dash becomes', () => {
    const clean = 'an em dash — written properly'
    expect(findC1(clean)).toEqual([])

    const mangled = 'an em dash ' + String.fromCharCode(0x97) + ' written badly'
    const hits = findC1(mangled)
    expect(hits).toHaveLength(1)
    expect(hits[0].codepoint).toBe(0x97)
    expect(hits[0].line).toBe(1)
  })

  it('reports the line, so a 236KB file does not have to be re-read by hand', () => {
    const hits = findC1(['fine', 'fine', 'bad ' + String.fromCharCode(0x9f)].join('\n'))
    expect(hits.map((h) => h.line)).toEqual([3])
  })

  /**
   * THE MOJIBAKE CASES ARE CONSTRUCTED, NEVER PASTED. A specimen of the defect
   * in a tracked file IS the defect — `control-bytes.ts` and rule 0 both grade
   * this tree, and a literal mangled em dash in this test would redden them.
   * So every case below is built at runtime out of `String.fromCharCode`, which
   * is also the only way to write one that survives an editor round trip on the
   * box where the defect originates.
   */
  const asCp1252 = (utf8: string) => {
    // What a reader that decodes UTF-8 bytes as cp1252 would have produced.
    const CP1252 = new Map<number, number>([
      [0x80, 0x20ac], [0x82, 0x201a], [0x83, 0x0192], [0x84, 0x201e], [0x85, 0x2026],
      [0x86, 0x2020], [0x87, 0x2021], [0x88, 0x02c6], [0x89, 0x2030], [0x8a, 0x0160],
      [0x8b, 0x2039], [0x8c, 0x0152], [0x8e, 0x017d], [0x91, 0x2018], [0x92, 0x2019],
      [0x93, 0x201c], [0x94, 0x201d], [0x95, 0x2022], [0x96, 0x2013], [0x97, 0x2014],
      [0x98, 0x02dc], [0x99, 0x2122], [0x9a, 0x0161], [0x9b, 0x203a], [0x9c, 0x0153],
      [0x9e, 0x017e], [0x9f, 0x0178],
    ])
    // `Array.from` rather than a spread: `tsconfig.json` targets below ES2015,
    // where spreading an iterator needs `downlevelIteration` and `pnpm
    // typecheck` reddens instead. Same everywhere a Map is read below.
    return Array.from(Buffer.from(utf8, 'utf8'))
      .map((b) => String.fromCodePoint(CP1252.get(b) ?? b))
      .join('')
  }

  it('is clean on text that merely contains the characters the defect destroys', () => {
    expect(findMojibake('em dash — section § quote “ ellipsis …')).toEqual([])
    expect(findMojibake(readFileSync(join(ROOT, RULEBOOK_DIR, 'SKILL.md'), 'utf8'))).toEqual([])
  })

  it('catches the em dash, which is the 2026-09-14 case', () => {
    const hits = findMojibake('a line with an ' + asCp1252('—') + ' in it')
    expect(hits).toHaveLength(1)
    expect(hits[0].decodesTo).toBe('—')
    expect(hits[0].length).toBe(3)
  })

  it('catches the section sign, which is the same event and a different width', () => {
    const hits = findMojibake('see ' + asCp1252('§') + '2 for the gate')
    expect(hits).toHaveLength(1)
    expect(hits[0].decodesTo).toBe('§')
    expect(hits[0].length).toBe(2)
  })

  /**
   * THE ASSERTION THAT MAKES THIS WORTH HAVING OVER A SIGNATURE LIST. Neither
   * of these two characters has ever been seen mangled in this repo, and a
   * detector built from what we have seen is green on both. The inverse
   * decoder is not, because it is not looking for symptoms.
   */
  it('catches characters no signature list has ever been told about', () => {
    for (const ch of ['“', '…', ' ', '→', '🐯']) {
      expect(findMojibake('x ' + asCp1252(ch) + ' y'), `unseen character U+${ch.codePointAt(0)!.toString(16)}`)
        .not.toEqual([])
    }
  })

  /**
   * THE EMOJI CASE IS WHY THE FIVE UNASSIGNED SLOTS ARE IDENTITY-MAPPED. A
   * four-byte character's second byte is very often `0x90`, which the first
   * draft dropped as "unassigned" — so most of the emoji plane produced a run
   * the walker could not complete and came back clean.
   */
  it('does not invent a run from a character cp1252 has no byte for', () => {
    // U+0100 is outside latin-1 and is not one of cp1252's specials, so no
    // decoder could have produced it from a single byte. A lead byte followed
    // by it is not a run this may claim.
    const lead = String.fromCodePoint(0xc3)
    expect(findMojibake('x ' + lead + String.fromCodePoint(0x0100) + ' y')).toEqual([])
  })
})

describe('D — a leading # is a heading or it is a defect', () => {
  it('passes the shapes that are real headings and the ones that are plainly not', () => {
    expect(findFalseHeadings(HEALTHY_SKILL_MD)).toEqual([])
  })

  it('catches the wrapped issue reference that became an H1 on 2026-09-14', () => {
    const wrapped = ['a sentence that wrapped just before', '#559 and its follow-up.'].join('\n')
    const hits = findFalseHeadings(wrapped)
    expect(hits).toHaveLength(1)
    expect(hits[0].line).toBe(2)
    expect(hits[0].text).toContain('#559')
  })

  it('catches a hash with no space, which no renderer agrees about', () => {
    expect(findFalseHeadings('#NotAHeading')).toHaveLength(1)
    expect(findFalseHeadings('####### seven hashes')).toHaveLength(1)
    expect(findFalseHeadings('# ')).toHaveLength(1)
  })

  /**
   * THE FENCE TRACKER IS GRADED IN BOTH DIRECTIONS, because a false positive
   * here costs a blocked release and a false negative costs the defect. The
   * repo's own rulebook quotes shell and YAML at length.
   */
  it('ignores a fence and resumes after it', () => {
    const doc = ['```', '#559 in code', '```', '#559 in prose'].join('\n')
    const hits = findFalseHeadings(doc)
    expect(hits.map((h) => h.line)).toEqual([4])
  })

  it('does not let a tilde fence close a backtick fence', () => {
    const doc = ['```', '~~~', '#559 still inside the backtick fence', '```', '#559 outside'].join('\n')
    expect(findFalseHeadings(doc).map((h) => h.line)).toEqual([5])
  })
})

describe('B — the frontmatter description parses, or publishing stops', () => {
  it('reads the value the store is meant to hold', () => {
    expect(parseFrontmatterDescription(HEALTHY_SKILL_MD)).toBe('The map. Section one is the freeze.')
  })

  it('reads the real one, and it is the shape this parser accepts', () => {
    const real = readFileSync(join(ROOT, RULEBOOK_DIR, 'SKILL.md'), 'utf8')
    const description = parseFrontmatterDescription(real)
    expect(description.length).toBeGreaterThan(1000)
    expect(description).not.toContain('\n')
  })

  /**
   * REFUSING IS THE FEATURE. A lenient reader would "succeed" on each of these
   * and publish a description that is subtly not the one in the file — which is
   * the class this whole command exists to catch, reintroduced by the command.
   */
  it('refuses a folded scalar rather than guessing at it', () => {
    const folded = HEALTHY_SKILL_MD.replace('description: "The map. Section one is the freeze."', 'description: >-\n  The map.')
    expect(() => parseFrontmatterDescription(folded)).toThrow(/single-line double-quoted/)
  })

  it('refuses a single-quoted scalar', () => {
    const single = HEALTHY_SKILL_MD.replace(/description: ".*"/, "description: 'The map.'")
    expect(() => parseFrontmatterDescription(single)).toThrow(/single-line double-quoted/)
  })

  it('refuses a backslash escape it does not decode', () => {
    const escaped = HEALTHY_SKILL_MD.replace(/description: ".*"/, 'description: "a \\" quote"')
    expect(() => parseFrontmatterDescription(escaped)).toThrow(/backslash escape/)
  })

  it('refuses a document with no frontmatter at all', () => {
    expect(() => parseFrontmatterDescription('# just a heading\n')).toThrow(/frontmatter fence/)
    expect(() => parseFrontmatterDescription('---\nname: x\n')).toThrow(/never closed/)
  })
})

describe('A — the byte compare, and the length that would have passed', () => {
  const tree = (entries: Record<string, string>) =>
    new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v, 'utf8')]))

  it('is silent when every byte matches', () => {
    expect(compareTree(tree({ 'SKILL.md': 'a', 'references/1.md': 'b' }), tree({ 'SKILL.md': 'a', 'references/1.md': 'b' }))).toEqual([])
  })

  /**
   * THE 2026-09-14 SHAPE. Both sides the same length, ninety characters
   * different. A length check passes this; a byte compare cannot.
   */
  it('fails a same-length difference, which is the defect that started this', () => {
    const want = 'ruled by the owner on 2026-09-14 (DREAMCRM-31)'
    const got = 'ruled by the owner on 2026-09-15 (DREAMCRM-31)'
    expect(Buffer.byteLength(want)).toBe(Buffer.byteLength(got))
    const failures = compareTree(tree({ 'references/8.md': want }), tree({ 'references/8.md': got }))
    expect(failures).toHaveLength(1)
    expect(failures[0]).toContain('BYTES DIFFER')
  })

  it('fails a file the store never received', () => {
    const failures = compareTree(tree({ 'SKILL.md': 'a', 'references/new.md': 'b' }), tree({ 'SKILL.md': 'a' }))
    expect(failures).toEqual([expect.stringContaining('MISSING from the store')])
  })

  it('fails a file the store kept after a rename, which is the half a per-file loop misses', () => {
    const failures = compareTree(tree({ 'references/2e.md': 'a' }), tree({ 'references/2e.md': 'a', 'references/2d.md': 'a' }))
    expect(failures).toEqual([expect.stringContaining('absent from the tree')])
  })

  it('names the first differing byte and both sides of it', () => {
    const message = describeFirstDifference(Buffer.from('line one\nline two'), Buffer.from('line one\nline TWO'))
    expect(message).toContain('line 2')
    expect(message).toContain('17 vs 17 bytes')
  })

  it('says which side is longer when one is a prefix of the other', () => {
    expect(describeFirstDifference(Buffer.from('abc'), Buffer.from('ab'))).toContain('the tree continues')
    expect(describeFirstDifference(Buffer.from('ab'), Buffer.from('abc'))).toContain('the store continues')
  })
})

/**
 * THE WRITE PATH'S PRECONDITION, AND IT IS THE ONE ASSERTION HERE WHOSE ABSENCE
 * WAS PAID FOR RATHER THAN IMAGINED. Within twenty minutes of the publisher
 * existing, the store had been rewritten three times from working branches and
 * was serving rules from two unmerged PRs as though they were binding. A stale
 * rulebook under-claims; an unmerged one invents.
 */
describe('the store may only ever hold merged main', () => {
  const tree = (entries: Record<string, string>) =>
    new Map(Object.entries(entries).map(([k, v]) => [k, Buffer.from(v, 'utf8')]))
  /** The injected reader, standing in for `git show origin/main:<path>`. */
  const merged = (entries: Record<string, string | null>) => (path: string) => {
    const v = entries[path]
    return v === undefined || v === null ? null : Buffer.from(v, 'utf8')
  }

  it('is silent when the tree IS origin/main', () => {
    expect(diffAgainstMerged(tree({ 'SKILL.md': 'a', 'references/2.md': 'b' }), merged({ 'SKILL.md': 'a', 'references/2.md': 'b' }))).toEqual([])
  })

  it('refuses a file that differs from origin/main, which is the branch case', () => {
    const problems = diffAgainstMerged(tree({ 'references/2.md': 'the rule, as merged' }), merged({ 'references/2.md': 'the rule, as drafted' }))
    expect(problems).toEqual([expect.stringContaining('differs from origin/main')])
  })

  it('refuses a file that exists only on a branch', () => {
    const problems = diffAgainstMerged(tree({ 'references/2e.md': 'new section' }), merged({}))
    expect(problems).toEqual([expect.stringContaining('not on origin/main')])
  })

  /**
   * A one-character, same-length drift is the shape the whole command exists
   * for, so the precondition is held to it too rather than to a size check.
   */
  it('refuses a same-length one-character drift', () => {
    const problems = diffAgainstMerged(tree({ 'references/8.md': 'on 2026-09-14' }), merged({ 'references/8.md': 'on 2026-09-15' }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('13 vs 13 bytes')
  })

  /**
   * The sides are named for this comparison, because its second buffer is
   * `origin/main` and not the store. A failure message that says "store" here
   * sends the reader to investigate the wrong document — which is how a correct
   * refusal gets read as a broken instrument and waived.
   */
  it('names origin/main rather than the store in its own failure text', () => {
    const problems = diffAgainstMerged(tree({ 'references/8.md': 'a' }), merged({ 'references/8.md': 'b' }))
    expect(problems[0]).toContain('origin/main has 0x62')
    expect(problems[0]).not.toContain('store has')
  })

  it('takes --allow-unmerged only when it is spelled out in full', () => {
    expect(parseArgs([]).allowUnmerged).toBe(false)
    expect(parseArgs(['--allow-unmerged']).allowUnmerged).toBe(true)
    expect(() => parseArgs(['--allow-unmerge'])).toThrow(/unknown argument/)
  })
})

describe('the preflight, over the real tree', () => {
  const local = readRulebookTree(ROOT)

  /**
   * THE EYES ASSERTION. Everything above is an ABSENCE assertion, and an
   * absence assertion over an empty list passes — a tree reader whose directory
   * moved, whose extension filter narrowed or whose walk threw would report a
   * clean rulebook forever. The floors sit far below today's tree (ten files,
   * 600KB) and exist to catch a reader that has stopped reading, not to pin a
   * size.
   */
  it('reads a rulebook rather than nothing', () => {
    expect(local.size).toBeGreaterThanOrEqual(5)
    expect(Array.from(local.values()).reduce((n, b) => n + b.length, 0)).toBeGreaterThan(100_000)
    expect(local.has('SKILL.md')).toBe(true)
    expect(Array.from(local.keys()).filter((p) => p.startsWith('references/')).length).toBeGreaterThanOrEqual(4)
  })

  it('every path is stored posix-style, because a backslash path creates a SECOND store file', () => {
    local.forEach((_buf, path) => expect(path).not.toContain('\\'))
  })

  it('is clean on every file, which is the run that refuses to publish a mangled tree', () => {
    local.forEach((buf, path) => {
      expect(gradeText(path, buf.toString('utf8')), path).toEqual([])
    })
  })
})

describe('the release gate still exists', () => {
  const release = readFileSync(join(ROOT, 'docs/RELEASE.md'), 'utf8')

  /**
   * R5 is the go/no-go. A gate whose only record is a sentence in a document
   * can be deleted by anybody with a paragraph to tidy, and nothing would
   * notice — which is the same failure mode as the store copy itself.
   */
  it('R5 names the command a releaser has to run', () => {
    const r5 = release.slice(release.indexOf('### R5 '), release.indexOf('## Part 4'))
    expect(r5).not.toBe('')
    expect(r5).toContain('scripts/rulebook-publish.mjs')
    expect(r5.toLowerCase()).toContain('release-blocking')
  })
})

describe('the argument parser refuses what it does not know', () => {
  it('defaults to publish-then-verify against the named skill', () => {
    const opts = parseArgs([])
    expect(opts.verifyOnly).toBe(false)
    expect(opts.skill).toBe('dreamcrm-conventions')
    expect(opts.cli).toBe('multica')
  })

  it('takes --verify-only', () => {
    expect(parseArgs(['--verify-only']).verifyOnly).toBe(true)
  })

  /**
   * A TYPO MUST NOT PUBLISH. `--verify-only` silently ignored is a command that
   * writes to the store when the operator asked it only to look, and the
   * operator would read a CLEAN line either way.
   */
  it('throws on an unknown flag rather than ignoring it', () => {
    expect(() => parseArgs(['--verify-onyl'])).toThrow(/unknown argument/)
  })
})
