import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'

/**
 * ONE LINE ENDING, EVERYWHERE — the guard behind `.gitattributes`.
 *
 * THE DEFECT, MEASURED. Until DREAMCRM-99 this repo had no `.gitattributes` at
 * all. It has always STORED LF — 2,577 tracked files at `i/lf`, zero at
 * `i/crlf` — so the committed bytes were never wrong. What was wrong is that
 * nothing in the repository said how a checkout should materialise them, and
 * Git for Windows ships `core.autocrlf=true` in its system config. So a Windows
 * author's working tree was CRLF (276,016 CRLF lines against 1,342 bare LF) and
 * the runner that gates the merge was LF, for the same commit.
 *
 * WHY A GUARD RATHER THAN JUST THE FILE. A large share of `tests/guards/**` and
 * `tests/design-system/**` reads files OFF DISK and grades the bytes: the shared
 * `quotedChunks` reader, the control-byte rule, the legibility floor, the
 * tree-wide sweeps. A stray `\r` is a non-word character, it ends a line early,
 * and it lands inside a captured group. On #657 two independently built
 * tree-wide audits shared one blind spot for precisely this reason — which is
 * not a coincidence between two authors, it is the environment both were
 * standing in. Anything that reads a file inherits this setting, so the setting
 * gets a check.
 *
 * WHAT IT GRADES, AND WHY THAT AND NOT THE WORKING TREE. Everything here is read
 * off `git ls-files --eol`, which reports three facts per tracked file: what the
 * INDEX holds (`i/`), what the WORKING TREE holds (`w/`), and which attributes
 * git RESOLVED for it (`attr/`).
 *
 *   - The `attr/` column is the load-bearing one, and it is why this guard does
 *     not pattern-match `.gitattributes` itself. It is git's own answer, per
 *     file, after every rule in every `.gitattributes` in the tree has been
 *     applied in order. A later override — `*.md -text`, an `eol=crlf` on some
 *     subtree, a second attributes file in a subdirectory — changes this column
 *     and would not change a regex over the root file's text.
 *   - The `i/` column catches the other direction: a CRLF blob actually
 *     committed, which no checkout setting can undo.
 *   - The `w/` column is deliberately NOT graded. Checking `.gitattributes` out
 *     does not rewrite files already on disk — `text` normalises on check-IN, so
 *     a CRLF working-tree file still hashes to the LF blob and `git status`
 *     stays clean. Grading it would fail an otherwise-correct stale Windows
 *     checkout every run, and a guard that is red for a reason the reader cannot
 *     act on is a guard that gets ignored. `.gitattributes` documents the
 *     refresh incantation instead.
 *
 * WATCHED FAIL (DREAMCRM-99, §2d):
 *   - Deleting `eol=lf` from `.gitattributes` and leaving bare `text=auto`:
 *     red, 2,578 files named as resolving no `eol` rule. That is the exact
 *     half-fix this guard exists to refuse — `text=auto` alone normalises on
 *     commit and leaves the CHECKOUT to `core.autocrlf`, which is the defect.
 *   - Appending `*.md -text` (a plausible "stop mangling my docs" edit): red,
 *     naming the markdown files that stopped resolving a text rule.
 *   - Committing a CRLF file: red on the index assertion, naming it.
 *   - Deleting `.gitattributes` outright: red on both.
 */

/** One row of `git ls-files --eol`. */
type Row = { index: string; worktree: string; attrs: string; path: string }

function lsFilesEol(): Row[] {
  // `-z` is not available for --eol, so paths come back tab-separated and
  // git quotes any path with a control or non-ASCII byte in it. That is fine
  // here: `tests/guards/control-bytes.test.ts` already bans the control bytes,
  // and a quoted path still reads for the message this guard prints.
  const run = spawnSync('git', ['ls-files', '--eol'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })

  // A guard that could not run must say so rather than report nothing to
  // report — the lesson `windowGap` in scripts/review-sweep.mjs writes down.
  expect(
    run.error ?? null,
    `could not run \`git ls-files --eol\`: ${run.error?.message}. This guard grades git's own ` +
      `answer about line endings and has no fallback; do not skip it.`,
  ).toBeNull()
  expect(run.status, `\`git ls-files --eol\` exited ${run.status}: ${run.stderr}`).toBe(0)

  const rows: Row[] = []
  for (const line of run.stdout.split('\n')) {
    if (!line.trim()) continue
    // "i/lf    w/crlf  attr/text=auto eol=lf \t<path>"
    const tab = line.indexOf('\t')
    if (tab === -1) continue
    const fields = line.slice(0, tab)
    const path = line.slice(tab + 1)
    const m = /^i\/(\S*)\s+w\/(\S*)\s+attr\/(.*?)\s*$/.exec(fields)
    if (!m) continue
    rows.push({ index: m[1], worktree: m[2], attrs: m[3], path })
  }
  return rows
}

const rows = lsFilesEol()

/** Binary, or empty of line endings entirely — neither carries an eol to get wrong. */
const isText = (r: Row) => r.index === 'lf' || r.index === 'crlf' || r.index === 'mixed'

describe('line endings are the repo\'s, not the machine\'s', () => {
  it('looked at the whole tree (a scan that saw nothing is not a clean scan)', () => {
    expect(
      rows.length,
      `\`git ls-files --eol\` returned ${rows.length} rows. This repo tracked 2,785 files when ` +
        `this guard was written; a number near zero means the parser above stopped matching ` +
        `git's output format, not that the tree shrank. Fix the parser.`,
    ).toBeGreaterThan(2000)
  })

  it('no tracked file STORES CRLF', () => {
    const stored = rows.filter((r) => r.index === 'crlf' || r.index === 'mixed')
    expect(
      stored.map((r) => `${r.path} (i/${r.index})`),
      `These files are committed with CRLF (or mixed) endings. No checkout setting can undo a ` +
        `blob — the bytes are in the history. Re-save them as LF and commit:\n  ` +
        stored.map((r) => r.path).join('\n  '),
    ).toEqual([])
  })

  it('every tracked TEXT file resolves `text=auto eol=lf`', () => {
    // Read off git's resolved attributes rather than off `.gitattributes`, so a
    // later rule that overrides the root one — in this file or in any
    // subdirectory's own attributes file — is visible here.
    const wrong = rows.filter((r) => isText(r) && !/(?:^|\s)eol=lf(?:$|\s)/.test(r.attrs))
    expect(
      wrong.length,
      `${wrong.length} tracked text file(s) do not resolve \`eol=lf\`, so their checkout endings ` +
        `depend on the machine (\`core.autocrlf\`, which Git for Windows sets to \`true\` in its ` +
        `system config). \`text=auto\` on its own is NOT enough: it normalises on check-IN and ` +
        `leaves the check-OUT alone. Add the rule to .gitattributes, or remove the override that ` +
        `is cancelling it.\nFirst 20:\n  ` +
        wrong
          .slice(0, 20)
          .map((r) => `${r.path} — attr/${r.attrs || '(none)'}`)
          .join('\n  '),
    ).toBe(0)
  })

  it('nothing asks for CRLF on checkout', () => {
    // The other half of the override shape: a rule that resolves an eol, but
    // the wrong one. Named separately from the test above so the failure
    // message says which mistake was made.
    const crlf = rows.filter((r) => /(?:^|\s)eol=crlf(?:$|\s)/.test(r.attrs))
    expect(
      crlf.map((r) => r.path),
      `These files resolve \`eol=crlf\`, which re-opens the split this repo just closed: they ` +
        `would read as CRLF on disk for every guard in tests/guards/** while CI reads LF. There ` +
        `is no Windows-only script in this tree that needs it (no .bat, .cmd or .ps1 is ` +
        `tracked). If one arrives, exempt it by NAME and say why here.`,
    ).toEqual([])
  })

  it('binary files are left alone', () => {
    // The direction a normalisation rule gets DANGEROUS. `text=auto` detects
    // binaries, and `.gitattributes` names the tracked formats on top of that;
    // this asserts the combination did not accidentally mark an image as text,
    // which would rewrite a 0x0d inside it.
    const mangled = rows.filter((r) => r.index === '-text' && /(?:^|\s)eol=lf(?:$|\s)/.test(r.attrs))
    expect(
      mangled.map((r) => `${r.path} — attr/${r.attrs}`),
      `These binary files resolve an eol rule. Git would rewrite CR bytes inside them. Mark the ` +
        `extension \`binary\` in .gitattributes.`,
    ).toEqual([])
  })
})
