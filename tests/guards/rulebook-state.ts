/**
 * THE RULEBOOK IS THE ONE DOCUMENT HERE WITH NO GUARD ON IT.
 *
 * `dreamcrm-conventions` is the most-read document this office has and, until
 * `docs/rulebook/` existed, it lived only in the Multica skill store — outside
 * this repository, where no test could reach it. Every other tracked file is
 * graded: `control-bytes.ts` bans a raw control byte in any of them,
 * `line-endings.test.ts` pins their bytes, `rulebook-drift.test.ts` grades the
 * claims the rulebook makes ABOUT the repo. The rulebook's own text was graded
 * by nobody, and the two defect classes that found it are both ones a check
 * catches in a second and a person catches after days:
 *
 *  1. **A mangled encoding.** The Windows authoring path decodes a pipe as
 *     cp1252, so an edit-and-push round trip turns an em dash into a raw
 *     `0x97`. That happened to a stored description on 2026-09-22 and to 90
 *     characters of the rulebook on 2026-09-14, and from the agent side it was
 *     invisible. The placement buys HALF of this: `docs/rulebook/` is now
 *     inside `control-bytes.test.ts`'s `git ls-files` walk. But that guard bans
 *     C0 (`0x00`–`0x1F`) and `0x97` is C1 — a planted `0x97` in the rulebook
 *     left it GREEN across sixteen passes, watched on the real tree. Rule 0
 *     below is the half the placement did not buy.
 *  2. **`STATE:` lines that lie.** This is what the module below grades. On
 *     2026-09-22 a sweep found NINE `STATE:` lines saying a PR was still open
 *     when it was already on `main` — oldest six days, four of them
 *     contradicting §2's own list about the same four PRs, six carrying the
 *     words "Forge owns the flip." An agent opening §2b to find out what a rule
 *     DOES was told the rule was not live while §2 said it had been live since
 *     before lunch.
 *
 * THE PASS THAT WAS SUPPOSED TO CATCH DEFECT 2 ALREADY EXISTED AND MISSED SEVEN
 * OF THE NINE — it grepped the file it was being written into, while the
 * promises are spread across five. Widening it to grep all nine files was the
 * right diagnosis and the wrong instrument: it is still a person choosing to
 * look, which §2d says is not a control. This is the instrument.
 *
 * WHY THIS NEEDS NO CREDENTIAL, which is the part that unblocked it. The
 * obvious reading of "is this PR merged?" is a GitHub API call, and a required
 * check cannot make one — `test` has `contents: read` and the repo holds one
 * secret. But `main`'s own history IS the record of what merged: every squash
 * lands as `<subject> (#N)` and every merge commit as `Merge pull request #N`.
 * So the whole family is decidable from `git log origin/main`, offline, inside
 * the required check, with no token and no daily-alarm round trip.
 *
 * ================================ THE RULES =================================
 *
 * Every rule below is scoped to a unit, and the units are different on purpose
 * — a wrapped markdown line is an artifact of the formatter and must never
 * decide a predicate (the first draft of this file read the physical LINE and
 * misclassified six entries as unmerged, because `MERGED` had wrapped onto the
 * next one).
 *
 *   - **paragraph** — the maximal run of non-blank lines around the `STATE:`.
 *   - **clause** — from `STATE:` to the end of that paragraph.
 *   - **claim** — the `**bold run**` containing the `STATE:`. All 35 entries in
 *     the rulebook are written `**STATE: …**`, and the claim ends where the
 *     bold does: what follows is commentary, and commentary routinely names
 *     SHAs that are NOT the merge commit (a review head, an earlier re-read).
 *
 * THE VERDICT IS READ OFF THE CLAIM, NOT THE CLAUSE, and the first draft got
 * this wrong in the direction that matters. #685's own entry — the one
 * describing this guard — says `STATE: on the PR` and then explains, two
 * sentences later, that rule 5 will redden `test` if the line "still says
 * anything but MERGED". A clause-scoped verdict read that word and graded a
 * correct OPEN entry as MERGED, which is a red required check naming an
 * innocent line. The claim is where the verdict is ASSERTED; everything after
 * the bold is prose ABOUT the verdict, including prose that quotes it.
 *
 * RULE 0 — THE BYTES ARE STILL UTF-8 AND STILL SAY WHAT THEY SAID. Its own
 * docblock is on `gradeEncoding` below, with why `control-bytes.ts` does not
 * already cover it.
 *
 * RULE 1 — RE-CHECKABLE. Every `STATE:` resolves to a PR number, in its clause
 * or in the paragraph text before it. `gh pr view <n>` is how the next reader
 * re-checks a line, and an entry naming no PR cannot be re-checked by anybody.
 *
 * RULE 2 — A MERGED VERDICT NAMES ITS COMMIT AND ITS DATE, anywhere in the
 * clause. §2's own words: "A flip writes the merge SHA and the UTC timestamp,
 * never 'merged' on its own: an entry without a SHA cannot be re-checked by the
 * next reader, which is how #621's line survived six days of sweeps." The TIME
 * is asked for by that sentence and is NOT graded here, because four entries
 * predating the convention carry a date alone and a rule that reddens them
 * teaches people the check is noise. Tighten it by fixing those four, never by
 * exempting them.
 *
 * RULE 3 — NO TWO FILES DISAGREE ABOUT ONE PR. §2b's four stale lines were
 * stale *while §2 was correct about the same four PRs*. This is the half that
 * needs no history at all, and it is the half that fires when the entry
 * describing a RULE and the entry recording its MERGE live in different files
 * and only one gets flipped.
 *
 * RULE 4 — A MERGED CLAIM'S COMMIT IS ON `main`. Every SHA in the CLAIM (not
 * the clause) that this clone can resolve must be an ancestor of `origin/main`.
 * One-directional on purpose: a SHA git cannot resolve is not graded, because
 * a deleted PR branch's head is unresolvable here and failing on it would be a
 * red `test` run naming an innocent entry.
 *
 * RULE 5 — A NON-MERGED VERDICT IS NOT ALREADY ON `main`, ONCE THE RULEBOOK
 * HAS BEEN EDITED SINCE. This is the nine-line defect itself. The subject is
 * the FIRST PR in the clause, else the LAST PR before the `STATE:` in the same
 * paragraph ("… / PR #618. **STATE: …**" is how §2b writes it). Deliberately
 * ONE PR rather than all of them: a clause may cite neighbours, and this
 * rule's false positive is a red required check naming a correct entry.
 *
 * THE SECOND CONDITION IS NOT A SOFTENING — IT IS WHAT MAKES THE RULE LEGAL IN
 * A MERGE GATE AT ALL, and the first draft shipped without it. §2 writes a
 * registered-guard entry BEFORE its PR merges, on the DREAMCRM-60 precedent,
 * which means the entry says something other than MERGED at the moment the PR
 * lands. A rule that fires on that fires **on `main`, at the merge** — and
 * `deploy.yml` has `deploy: needs: test`, so the production deploy stops; and
 * branch protection is `strict: true`, so every open PR inherits the line the
 * moment it updates and becomes unmergeable too. The clearing action (writing
 * the merge SHA) does not exist until after the merge, so no version of the PR
 * could pre-empt it. That is not a bug in one entry; it reproduces on every
 * future guard registration. (Sentinel, REQUEST CHANGES on #685, correctly.)
 *
 * WHY "EDITED SINCE" IS THE RIGHT SECOND CONDITION rather than a grace window.
 * The narrowing offered in review was "don't fire while the subject's merge
 * commit is the tip of `origin/main`", which buys exactly one commit — an
 * unrelated merge reopens the window and the outage lands anyway. The property
 * this needs is not a shorter race; it is NO race. So the predicate compares
 * THE TREE UNDER TEST against the subject's merge commit, and that comparison
 * gives the same answer before and after the merge:
 *
 *   - `strict: true` means a PR's `test` runs on the merge RESULT, so the tree
 *     it grades is byte-identical to the `main` it is about to create.
 *   - Therefore any tree that would fail on `main` fails on the PR first, where
 *     the author can fix it inside their own diff. `main` cannot go red from a
 *     merge that was green.
 *
 * And the obligation it encodes is the honest one: **you touched the rulebook
 * and left a stale line in it.** The nine-line incident is squarely inside
 * that — the rulebook was edited several times a day throughout, so every one
 * of those edits would have gone red.
 *
 * THE RESIDUAL, NAMED: a line whose PR merged and whose rulebook is then never
 * touched again stays stale with nothing red. That is deliberate. "This line
 * has been wrong for six days" is a claim about the CALENDAR, it can become
 * true with no diff at all, and §2a already says where that kind of claim
 * belongs — `rulebook-drift.yml`, the daily alarm that gates nothing, whose own
 * header says a stale sentence in a document is not a reason to hold a
 * production fix. Wiring it there is the named follow-up.
 *
 * ========================= WHAT THIS CANNOT SEE =============================
 *
 *  - **A merge that reaches `main` with no PR number in its subject.** Two do:
 *    `947680cb` and `af59967e`. Both are the same off-board class §3 writes up
 *    under "Work that never reaches the board at all" — the defect is that the
 *    commit is unroutable, and this rule going quiet on it is a second symptom
 *    of that defect rather than a hole to patch here.
 *  - **A SHA outside the CLAIM.** `2-merge-gate.md:2028` names a review head
 *    and an earlier re-read after the bold closes; neither is graded. That is
 *    the narrowing that keeps rule 4 free of false positives.
 *  - **A verdict that is wrong in prose rather than in structure** — an entry
 *    that says MERGED, names a real on-`main` SHA, and describes the wrong
 *    rule. That is §2d's "the predicate is right and the SENTENCE is wrong"
 *    family, and no scanner finds it.
 *  - **The skill-store copy.** These rules grade `docs/rulebook/`, which is now
 *    the authoring surface; the store copy is published FROM it. See §2's
 *    placement decision for why that hop is one mechanical push with a
 *    byte-compare rather than something CI can reach.
 *
 * Pure and string-in on purpose: every branch is exercised from fixtures in
 * `rulebook-state.test.ts`. The `docs/rulebook/` walk and the `git log` live in
 * the test.
 */

/** Where the rulebook lives, now that it lives here at all. */
export const RULEBOOK_DIR = 'docs/rulebook'

/**
 * Floors for the two eyes-probes in the test.
 *
 * `actions/checkout` fetches one commit. The `test` job then fetches `main`
 * separately — and until this guard landed it did so at `--depth=1`, which
 * resolves `origin/main` to a TIP WITH NO HISTORY. Rules 4 and 5 read that
 * history, and a guard whose reader has been narrowed to nothing reports a
 * clean tree: the exact §2d defect this file is supposed to be an example of
 * not making. So the test asserts the history is THERE, against two
 * independent floors, and goes red rather than quiet if it is not.
 *
 * Both floors are far below the measured values (1,395 commits and 658 PR
 * numbers on `main` on 2026-09-23) and far above what a truncated fetch can
 * produce (1 and 0). They are a shallowness detector, not a census.
 */
export const MAIN_HISTORY_FLOOR = 300
export const MERGED_PR_FLOOR = 100

export type Verdict = 'MERGED' | 'UNMERGED'

export interface StateEntry {
  /** Repo-relative path. */
  file: string
  /** 1-indexed line the `STATE:` sits on. */
  line: number
  /** The physical line, for the failure message. */
  text: string
  verdict: Verdict
  /** The PR this entry is ABOUT — rule 1's handle and rule 5's subject. */
  subject: number | null
  /** SHAs inside the bold claim. Rule 4's subjects. */
  claimShas: string[]
  /** SHAs anywhere in the clause. Rule 2's subject. */
  clauseShas: string[]
  /** Whether the clause carries an ISO date. Rule 2's other half. */
  clauseHasDate: boolean
  /** False when the `STATE:` was not inside a `**bold run**`. */
  claimIsBold: boolean
}

export interface Finding {
  rule: 0 | 1 | 2 | 3 | 4 | 5
  file: string
  line: number
  message: string
}

/**
 * The two mojibake signatures that have actually arrived here.
 *
 * A UTF-8 em dash read back as cp1252 is `â€”`; a section sign is `Â§`. Both
 * are perfectly valid UTF-8 — they are the WRONG CHARACTERS, not bad bytes —
 * so rule 0's decode check cannot see them and neither can `control-bytes.ts`.
 * This is a signature scan of the two forms observed on 2026-09-14 (90
 * mangled characters) rather than a general mojibake detector, and it is
 * allowed to be a short list because each entry is a FACT about cp1252 rather
 * than a judgement about a file. A third form means adding the sequence.
 *
 * BUILT FROM CODE POINTS, NOT WRITTEN AS LITERALS, on purpose. §2d records a
 * pattern copied for comparison that arrived carrying a literal control byte,
 * and a silently-broken pattern reports a CLEAN TREE. A detector spelled in
 * numbers cannot be corrupted by the authoring path it exists to catch, and a
 * reviewer can read exactly which code points it means.
 */
export const MOJIBAKE_SIGNATURES = [
  String.fromCharCode(0x00e2, 0x20ac), // a UTF-8 em dash or curly quote read back as cp1252
  String.fromCharCode(0x00c2, 0x00a7), // a UTF-8 section sign read back as cp1252
  String.fromCharCode(0x00c3, 0x00a2), // the same damage applied twice
] as const

/** What `git log origin/main` was reduced to, so the grader stays pure. */
export interface MainHistory {
  /** PR number → the SHA of the commit that carried it onto `main`. */
  mergedPrs: Map<number, string>
  /** `yes` / `no` / `unknown` — `unknown` means this clone cannot resolve it. */
  ancestry(sha: string): 'yes' | 'no' | 'unknown'
  /**
   * Has `docs/rulebook/` in THE TREE UNDER TEST changed since `sha`?
   *
   * This is rule 5's second condition and the whole reason it is safe to run
   * inside a required check — see the rule's docblock. It compares the tree
   * being graded against a commit, NOT two commits, which is what makes the
   * answer identical before and after the merge.
   */
  rulebookEditedSince(sha: string): boolean
}

/**
 * The PR number a commit subject on `main` carries, or `null`.
 *
 * A squash lands as `<subject> (#N)`; a merge commit as `Merge pull request #N
 * from …`. Both spellings are read because `main` carries both, and the second
 * one is not decorative: **15 of the 658 recoverable PR numbers on `main` come
 * from merge-commit subjects only**, `#674` among them.
 *
 * EXPORTED, AND GRADED FROM FIXTURES, because the first version of this lived
 * inline in the test's `readMainHistory` while the test that claimed to cover
 * it re-declared both regexes as literals and matched them against two literal
 * strings. Deleting the merge-commit branch from the real function left that
 * test GREEN — and `MERGED_PR_FLOOR` of 100 does not notice 15 missing, so rule
 * 5 would have gone quiet on merge-commit-landed PRs with nothing red.
 * (Sentinel, reviewing #685.) That is mutation 1 of the wiring family this same
 * PR adds to §2d: rename the id the guard references and watch it keep passing.
 *
 * THE DIGIT BOUND HERE IS `{1,5}` AND THE ENTRY PARSER'S IS `{2,5}`, and the
 * difference is deliberate rather than a slip — an undocumented disagreement
 * between two readers of the same notation is precisely the wiring trap above.
 *   - A COMMIT SUBJECT's `#N` is unambiguous: it is either the squash trailer
 *     or the merge-commit prefix, and nothing else in a subject is shaped like
 *     one. So single-digit PRs count. `main` carries fourteen of them
 *     (`Merge pull request #8 from …` among them), and the first draft of this
 *     function silently dropped every one — caught by the real-tree assertion
 *     in the test rather than by review.
 *   - An ENTRY's `#N` is read out of PROSE, where `#1` is far more likely to be
 *     an ordinal than a PR. The rulebook's own PR numbers start at #534, so the
 *     two-digit floor costs nothing there and buys a quieter parse.
 */
export function prNumberFromSubject(subject: string): number | null {
  const squashed = /\(#(\d{1,5})\)\s*$/.exec(subject)
  if (squashed) return Number(squashed[1])
  const merged = /^Merge pull request #(\d{1,5})\b/.exec(subject)
  if (merged) return Number(merged[1])
  return null
}

const SHA_IN_CODE = /`([0-9a-f]{7,40})`/g
const PR_NUMBER = /#(\d{2,5})/g
const ISO_DATE = /\d{4}-\d{2}-\d{2}/

/**
 * Blank out inline code spans, preserving offsets.
 *
 * This is the discriminator between a real `STATE:` line and PROSE ABOUT one.
 * §2 quotes itself three times — "NINE STALE `STATE:` LINES", "greps every
 * reference file for `STATE:`", "an entry reading `STATE: on the PR`" — and
 * every one of those is inside backticks, while every real entry is inside
 * `**bold**`. Derived from the markup rather than from a line-number list, so
 * the next quotation needs no exemption.
 */
export function maskInlineCode(text: string): string {
  return text.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
}

function allMatches(re: RegExp, text: string): string[] {
  const out: string[] = []
  const scan = new RegExp(re.source, re.flags)
  let m = scan.exec(text)
  while (m !== null) {
    out.push(m[1])
    if (m.index === scan.lastIndex) scan.lastIndex += 1
    m = scan.exec(text)
  }
  return out
}

/**
 * The `**bold run**` containing `offset`, if there is one.
 *
 * Runs are found over the whole paragraph because these files are hard-wrapped
 * at 79 columns and a claim routinely spans three physical lines.
 *
 * MARKS ARE COUNTED ON THE MASKED TEXT AND SLICED FROM THE RAW. Pairing is
 * positional, so one stray `**` breaks every pair after it — and §2's
 * error-scan entry contains exactly one, inside the code span `` `**` `` in a
 * quoted glob. That paragraph has 21 `**` raw and 20 masked, and with the raw
 * count the entry at `2-merge-gate.md:2294` read as not-bold and rule 4
 * silently widened to the whole clause on it. Masking first is not a tidy-up:
 * it is what keeps a code span from deciding a predicate.
 */
export function boldRunAt(paragraph: string, offset: number): string | null {
  const masked = maskInlineCode(paragraph)
  const marks: number[] = []
  for (let i = 0; i + 1 < masked.length; i += 1) {
    if (masked[i] === '*' && masked[i + 1] === '*') {
      marks.push(i)
      i += 1
    }
  }
  for (let i = 0; i + 1 < marks.length; i += 2) {
    const open = marks[i] + 2
    const close = marks[i + 1]
    if (offset >= open && offset < close) return paragraph.slice(open, close)
  }
  return null
}

/** Maximal runs of non-blank lines, as [firstIndex, lastIndex] pairs. */
function paragraphRanges(lines: string[]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let start: number | null = null
  lines.forEach((line, i) => {
    if (line.trim() === '') {
      if (start !== null) {
        out.push([start, i - 1])
        start = null
      }
    } else if (start === null) {
      start = i
    }
  })
  if (start !== null) out.push([start, lines.length - 1])
  return out
}

/** Every real `STATE:` entry in one rulebook file. */
export function parseStateEntries(source: string, file: string): StateEntry[] {
  const lines = source.split('\n')
  const entries: StateEntry[] = []

  for (const [first, last] of paragraphRanges(lines)) {
    const paragraph = lines.slice(first, last + 1).join('\n')
    const maskedParagraph = maskInlineCode(paragraph)

    // Offsets of each line's start within the paragraph, so a match inside the
    // paragraph maps back to a physical line number.
    const lineStarts: number[] = []
    let at = 0
    for (let i = first; i <= last; i += 1) {
      lineStarts.push(at)
      at += lines[i].length + 1
    }

    for (let m = maskedParagraph.indexOf('STATE:'); m !== -1; m = maskedParagraph.indexOf('STATE:', m + 1)) {
      let li = 0
      while (li + 1 < lineStarts.length && lineStarts[li + 1] <= m) li += 1

      const after = m + 'STATE:'.length
      const clause = paragraph.slice(after)
      const before = paragraph.slice(0, m)
      const claim = boldRunAt(paragraph, m)

      const prsInClause = allMatches(PR_NUMBER, clause).map(Number)
      const prsBefore = allMatches(PR_NUMBER, before).map(Number)

      entries.push({
        file,
        line: first + li + 1,
        text: lines[first + li].trim(),
        verdict: /\bMERGED\b/.test(claim ?? clause) ? 'MERGED' : 'UNMERGED',
        subject: prsInClause[0] ?? prsBefore[prsBefore.length - 1] ?? null,
        claimShas: allMatches(SHA_IN_CODE, claim ?? clause),
        clauseShas: allMatches(SHA_IN_CODE, clause),
        clauseHasDate: ISO_DATE.test(clause),
        claimIsBold: claim !== null,
      })
    }
  }

  return entries
}

/**
 * Rule 0 — the rulebook is still UTF-8, and still says what it said.
 *
 * WHY THIS IS NOT COVERED BY `control-bytes.ts`, which is where the first
 * draft of this file claimed it was. That guard bans the C0 range
 * (`0x00`–`0x1F`), because every reproduction it was written from was a `NUL`
 * or a `0x08`. The cp1252 round trip does not produce a C0 byte: a UTF-8 em
 * dash decoded as cp1252 and re-encoded produces `0x97`, which is C1. Planting
 * a `0x97` in `docs/rulebook/` and running `control-bytes.test.ts` returns
 * SIXTEEN PASSES — watched, on the real tree, before this rule existed. The
 * placement bought the C0 half for free and nothing at all of the half that
 * actually happened.
 *
 * Three checks, in increasing order of how much they can see:
 *
 *  1. **Still decodable.** A raw `0x97` is not valid UTF-8 at all, so a strict
 *     decode is the widest and cheapest net. `readFileSync(f, 'utf8')` would
 *     silently hand back `U+FFFD` and every rule above would grade a document
 *     with a hole in it — which is why this one takes BYTES.
 *  2. **No C1 code point.** Catches the same damage arriving already
 *     well-formed (`0xC2 0x97`), which a decode check cannot see.
 *  3. **No cp1252 mojibake signature.** Catches the damage that is valid UTF-8
 *     AND valid code points and simply the wrong characters — the 2026-09-14
 *     shape, 90 of them, invisible from the agent side.
 *
 * SCOPED TO `docs/rulebook/` RATHER THAN THE TREE, deliberately. The authoring
 * path that produces this damage is the skill-store round trip, and only this
 * directory rides it. Widening `control-bytes.ts` to C1 tree-wide is the
 * obvious next move and it is a different change with a different blast radius
 * — it needs its own measurement over 2,577 tracked files, and doing it inside
 * this PR would be the widening §2 keeps asking people to route and measure
 * separately. Named here as the open candidate rather than left implied.
 */
export function gradeEncoding(file: string, bytes: Buffer): Finding[] {
  const findings: Finding[] = []

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // WHERE the bad byte is, exactly, rather than where a scan for the C1
    // RANGE first hits — the continuation byte of a legitimate em dash
    // (`0xE2 0x80 0x94`) is 0x80, so a range scan names an innocent offset
    // hundreds of lines from the defect. The lossy decode replaces exactly the
    // undecodable byte with U+FFFD, so re-encoding the prefix before it gives
    // the real offset and the real line.
    const lossy = new TextDecoder('utf-8').decode(bytes)
    const at = lossy.indexOf(String.fromCharCode(0xfffd))
    const offset = at === -1 ? -1 : Buffer.byteLength(lossy.slice(0, at), 'utf8')
    findings.push({
      rule: 0,
      file,
      line: at === -1 ? 1 : lossy.slice(0, at).split('\n').length,
      message:
        'this file is not valid UTF-8' +
        (offset === -1
          ? '.'
          : ` — byte ${offset} is 0x${bytes[offset].toString(16).padStart(2, '0')}, which is ` +
            'what a cp1252 round trip turns a UTF-8 punctuation character into.'),
    })
    return findings
  }

  const lines = text.split('\n')
  lines.forEach((line, i) => {
    for (const ch of line) {
      const cp = ch.codePointAt(0) ?? 0
      if (cp >= 0x80 && cp <= 0x9f) {
        findings.push({
          rule: 0,
          file,
          line: i + 1,
          message: `this line carries the C1 code point U+${cp.toString(16).toUpperCase().padStart(4, '0')}, which is never text.`,
        })
        break
      }
    }
    for (const signature of MOJIBAKE_SIGNATURES) {
      if (!line.includes(signature)) continue
      findings.push({
        rule: 0,
        file,
        line: i + 1,
        message:
          'this line carries a cp1252 mojibake signature — a UTF-8 character that was ' +
          'decoded as cp1252 somewhere on the way here. Re-fetch and compare BYTES.',
      })
      break
    }
  })

  return findings
}

/** Rules 1 and 2 — the shape a line needs to be re-checkable at all. */
export function gradeShape(entries: StateEntry[]): Finding[] {
  const findings: Finding[] = []
  for (const e of entries) {
    if (e.subject === null) {
      findings.push({
        rule: 1,
        file: e.file,
        line: e.line,
        message:
          'this STATE line names no PR number, so no later reader can re-check it ' +
          `(\`gh pr view <n>\`). Add the \`#<pr>\` it is about. Line: ${e.text}`,
      })
    }
    if (e.verdict === 'MERGED' && e.clauseShas.length === 0) {
      findings.push({
        rule: 2,
        file: e.file,
        line: e.line,
        message:
          'this STATE line says MERGED without naming a commit. A flip writes the merge ' +
          `SHA, never "merged" on its own — #621's line survived six days for exactly this. Line: ${e.text}`,
      })
    }
    if (e.verdict === 'MERGED' && !e.clauseHasDate) {
      findings.push({
        rule: 2,
        file: e.file,
        line: e.line,
        message: `this STATE line says MERGED without naming a date (YYYY-MM-DD). Line: ${e.text}`,
      })
    }
  }
  return findings
}

/** Rule 3 — two files, one PR, two answers. */
export function gradeAgreement(entries: StateEntry[]): Finding[] {
  const bySubject = new Map<number, StateEntry[]>()
  for (const e of entries) {
    if (e.subject === null) continue
    const bucket = bySubject.get(e.subject) ?? []
    bucket.push(e)
    bySubject.set(e.subject, bucket)
  }

  const findings: Finding[] = []
  const ordered = Array.from(bySubject.entries()).sort((a, b) => a[0] - b[0])
  for (const [pr, bucket] of ordered) {
    const verdicts = new Set(bucket.map((e) => e.verdict))
    if (verdicts.size < 2) continue
    const where = bucket.map((e) => `${e.file}:${e.line} says ${e.verdict}`).join('; ')
    for (const e of bucket) {
      findings.push({
        rule: 3,
        file: e.file,
        line: e.line,
        message:
          `the rulebook disagrees with itself about #${pr} — ${where}. Flipping one entry ` +
          'is half the job when the rule and its merge record live in different files.',
      })
    }
  }
  return findings
}

/** Rules 4 and 5 — the verdict against `main`'s own history. */
export function gradeAgainstHistory(entries: StateEntry[], history: MainHistory): Finding[] {
  const findings: Finding[] = []
  for (const e of entries) {
    if (e.verdict === 'MERGED') {
      for (const sha of e.claimShas) {
        if (history.ancestry(sha) !== 'no') continue
        findings.push({
          rule: 4,
          file: e.file,
          line: e.line,
          message:
            `this STATE line says MERGED and names \`${sha}\`, which is not an ancestor of ` +
            `\`origin/main\`. Either the SHA is wrong or the merge is not on main. Line: ${e.text}`,
        })
      }
      continue
    }

    if (e.subject === null) continue
    const landed = history.mergedPrs.get(e.subject)
    if (!landed) continue
    // THE SECOND CONDITION IS WHAT MAKES THIS SAFE IN A MERGE GATE. See the
    // rule's docblock: until the rulebook is edited again, the flip has not
    // had its turn, and firing here would redden `main` for everybody at the
    // instant of the merge that created the obligation.
    if (!history.rulebookEditedSince(landed)) continue
    findings.push({
      rule: 5,
      file: e.file,
      line: e.line,
      message:
        `this STATE line does not say MERGED, but #${e.subject} is on \`main\` as ` +
        `\`${landed.slice(0, 8)}\`, and ${RULEBOOK_DIR} has been edited since. Flip it, ` +
        `with the SHA and the UTC time. Line: ${e.text}`,
    })
  }
  return findings
}

/** One report, for one failure message that names everything at once. */
export function gradeRulebook(entries: StateEntry[], history: MainHistory): Finding[] {
  return [
    ...gradeShape(entries),
    ...gradeAgreement(entries),
    ...gradeAgainstHistory(entries, history),
  ]
}

export function describeFindings(findings: Finding[]): string {
  return findings
    .map((f) => `  [rule ${f.rule}] ${f.file}:${f.line} — ${f.message}`)
    .join('\n')
}
