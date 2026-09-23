// NO SHEBANG, DELIBERATELY — same reason as scripts/rulebook-drift.mjs. The
// command is `node scripts/rulebook-publish.mjs`, so it was never load-bearing,
// and with CRLF endings on a Windows checkout vitest's SSR transform leaves the
// `\r` behind and every test importing this file dies at column 1.
/**
 * THE PUBLISHED RULEBOOK STOPS BEING ABLE TO LIE.
 *
 * `dreamcrm-conventions` is authored here, under `docs/rulebook/`, and
 * PUBLISHED to the Multica skill store (DREAMCRM-109). Every check this repo
 * owns grades the authored copy: `rulebook-state.ts` grades its `STATE:` lines,
 * `rulebook-drift.mjs` grades the claims it makes about the repo,
 * `control-bytes.ts` bans a raw C0 byte in it, `line-endings.test.ts` pins its
 * bytes. **Nothing graded the hop.** The copy every agent actually opens is the
 * STORE copy, and between the two sat one agent remembering to look.
 *
 * Both ways that hop fails are observed here, not imagined:
 *
 *  1. **STALE.** Nine `STATE:` lines described `main` wrongly for up to six
 *     days. The repo-side guard closed that class for the authored copy. A
 *     store copy that simply never received the merge is the same defect with
 *     no guard on it at all, and it is the LIKELIER of the two, because it
 *     needs nobody to do anything wrong — it needs somebody to do nothing.
 *  2. **MANGLED.** A cp1252 round trip on the Windows authoring box replaced 90
 *     characters of the rulebook on 2026-09-14 — every em dash and every
 *     section sign — and from the agent side it was invisible. On 2026-09-22
 *     the same box did it to a stored description. **Both strings were 9,018
 *     characters long afterwards.** A length match is not a comparison; it is a
 *     comparison's shadow.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS, AND THE ONE THING IT IS NOT
 *
 * It is two commands that share a tree reader, and the second one is the point:
 *
 *   node scripts/rulebook-publish.mjs                # publish, then verify
 *   node scripts/rulebook-publish.mjs --verify-only  # verify what is up there
 *
 * It is NOT a required status check and can never become one. Verifying needs a
 * credentialed `multica` CLI; `test` runs with `contents: read` and one secret,
 * and a check that cannot reach its subject would report GREEN forever — which
 * is the precise failure §2a's standing convention exists to name. So the
 * enforcement is where the credential is: this command is RELEASE-BLOCKING in
 * `docs/RELEASE.md` R5, a red verify stops the go/no-go, and
 * `tests/guards/rulebook-publish.test.ts` holds both halves in place from
 * inside `test` — it grades every predicate below by perturbation, and it
 * asserts that R5 still names this command, so the release gate cannot be
 * quietly deleted from a document nobody diffs.
 * ---------------------------------------------------------------------------
 *
 * THE FOUR ASSERTIONS, and why four rather than one.
 *
 *   A. **BYTES.** Every byte of `SKILL.md` and of every `references/**` file
 *      comes back identical, and the store holds exactly the file set the tree
 *      holds — no file missing, no file left behind by a rename.
 *   B. **DESCRIPTION.** The stored `description` field equals the frontmatter
 *      `description`. It is a SEPARATE field on the store record, so assertion
 *      A cannot see it, and it is the text an agent reads to decide whether to
 *      open the rulebook at all — a description that has drifted makes whole
 *      sections unfindable without making anything look wrong.
 *   C. **ENCODING.** No character in `U+0080`–`U+009F`, and no cp1252-decoded
 *      UTF-8 fragment.
 *   D. **HEADINGS.** No line outside a fenced block begins with `#` unless it
 *      is a real ATX heading. A wrapped issue reference — a `#` followed by
 *      digits, landing at the start of a line the formatter chose — became an
 *      H1 in this document on 2026-09-14.
 *
 * C AND D LOOK REDUNDANT NEXT TO A AND ARE NOT, and the reason is the whole
 * design. A is a comparison, so it is satisfied by a FAITHFUL publish of an
 * already-mangled tree: if the repo copy carries the `0x97`, A goes green while
 * the rulebook is wrong. So C and D run TWICE — once on the local tree before
 * anything is pushed, which is the run that refuses to publish a mangled file,
 * and once on what came back, which is the run that catches the store or the
 * transport doing it. A, alone, grades the transport. C and D, alone, grade the
 * text. Neither is the other's proxy.
 *
 * WHY NOT TRUST THE SERVER'S `content_hash`. `multica skill files list` returns
 * a sha256 per file and comparing it would be one line. It grades the store
 * against ITSELF: a mangling that happened on the way IN produces a hash that
 * honestly describes the mangled bytes. The subject of this check is the bytes
 * in this working tree, so the bytes in this working tree are what it compares
 * against. The hash is printed in the report as corroboration and is never the
 * verdict.
 *
 * READ THE CLI'S OUTPUT AS BYTES. `execFileSync` returns a Buffer and it is
 * decoded here with an explicit `utf8`, never left to a default. On the Windows
 * authoring box a pipe decoded as cp1252 is exactly how defect 2 happened, and
 * a verifier that inherits the mangling it is looking for reports CLEAN. For
 * the same reason the CLI is invoked with an ARGV ARRAY and no shell: the one
 * text-carrying flag that has no file form is `--description`, and building
 * that flag through a shell substitution is what rewrote every em dash in a
 * stored description as a raw `0x97` on 2026-09-22.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep, posix } from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const RULEBOOK_DIR = 'docs/rulebook'
export const SKILL_NAME = 'dreamcrm-conventions'

/**
 * The store record is one document plus a file list, and the mapping is fixed:
 * `SKILL.md` IS the skill's `content` — frontmatter included, because that is
 * what `skill get` returns today and a publisher that strips it would make
 * every future comparison a transformation rather than an identity. Everything
 * else in the tree is a file at its path relative to `docs/rulebook/`.
 */
const SKILL_MD = 'SKILL.md'

/**
 * ONE MEGABYTE IS THE DEFAULT AND THE RULEBOOK IS SIX HUNDRED KILOBYTES OF
 * MARKDOWN BEFORE JSON QUOTING. A `maxBuffer` overrun throws ENOBUFS, which
 * would read as "the store is unreachable" on the day §2b grows — a verifier
 * that turns its own success into a failure teaches people to skip it.
 */
const MAX_BUFFER = 64 * 1024 * 1024

/**
 * THE DESCRIPTION HAS TO FIT IN A COMMAND LINE, AND ON 2026-09-23 IT STOPPED.
 *
 * `skill update --description` is the one text-carrying flag on this CLI with
 * NO file form, so the description travels as an argv element. Windows'
 * `CreateProcess` caps the whole command line at 32,767 characters, and the
 * first publish after #712 merged died with `spawnSync multica ENAMETOOLONG`
 * at 33,592 — mid-publish, with the store left holding main's files and the
 * previous description.
 *
 * **The defect is not the limit, it is that nothing said so until the publish
 * died.** A document can grow past what its own publisher can transmit, and
 * the only signal was an OS errno that names neither the field nor the cause.
 * So the ceiling is asserted in the PREFLIGHT, before anything is written, and
 * `tests/guards/rulebook-publish.test.ts` asserts the authored description is
 * under it — which turns "the next person to add a clause breaks publishing"
 * into a red `test` on the PR that adds the clause.
 *
 * THE HEADROOM IS SIZED FROM THE REST OF THE COMMAND LINE, not guessed. The
 * invocation is `skill update <36-char uuid> --content-file <path>
 * --description <desc> --output json`, which is a little over 270 characters
 * before the description; 767 leaves roughly 500 of slack for a longer
 * checkout path. The first draft reserved 2,000 and that was wrong in the
 * expensive direction — it would have condemned a description that had been
 * publishing cleanly all day, which is a guard inventing work rather than
 * catching a defect.
 */
const ARGV_CEILING = 32767
const DESCRIPTION_HEADROOM = 767
export const MAX_DESCRIPTION_CHARS = ARGV_CEILING - DESCRIPTION_HEADROOM

/* ========================================================================= *
 * C. ENCODING
 * ========================================================================= */

/**
 * cp1252's eight-bit half, as the mapping actually is rather than as latin-1
 * would have it. The twenty-seven codepoints below are the ones cp1252 puts in
 * `0x80`–`0x9F` where latin-1 has controls.
 *
 * THE FIVE SLOTS THAT ARE NOT IN THIS TABLE ARE STILL DECODABLE, and the first
 * draft got that wrong in the direction that loses a defect. `0x81`, `0x8D`,
 * `0x8F`, `0x90` and `0x9D` are unassigned in the published cp1252 chart, so
 * the draft dropped them — and then a four-byte UTF-8 character whose second
 * byte is `0x90` produced a run this could not walk, which is most of the
 * emoji plane. Every real decoder (WHATWG's `windows-1252`, and Windows' own)
 * maps those five to their C1 control, so `CP1252_IDENTITY` below treats them
 * as themselves. Nothing is invented: a character in that range is either one
 * of the twenty-seven, or one of these five, or it did not come from cp1252.
 */
const CP1252_HIGH = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
}

/** The five unassigned slots every real decoder passes through unchanged. */
const CP1252_IDENTITY = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d])

/**
 * RAW C1. `control-bytes.ts` bans C0 (`0x00`–`0x1F`) across every tracked file
 * and a planted `0x97` left it GREEN across sixteen passes on the real tree —
 * `0x97` is C1, and C1 is what a cp1252 em dash becomes. This is the half that
 * placement did not buy, restated for the copy that placement cannot reach.
 */
export function findC1(text) {
  const hits = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const ch of lines[i]) {
      const cp = ch.codePointAt(0)
      if (cp >= 0x80 && cp <= 0x9f) {
        hits.push({ line: i + 1, codepoint: cp, context: lines[i].slice(0, 80) })
      }
    }
  }
  return hits
}

/**
 * THE MOJIBAKE DETECTOR IS THE INVERSE OF THE DEFECT, NOT A LIST OF ITS
 * SYMPTOMS, and that choice is load-bearing. The tempting implementation is a
 * table of the sequences this office has actually seen. The rulebook carries
 * one em dash family and one section sign today; it will carry a curly quote,
 * a non-breaking space and an ellipsis tomorrow, and a symptom list goes green
 * on every character it was not told about. §2d's identity-looseness family is
 * exactly this trap.
 *
 * So: map each character back through cp1252 to the byte it came from, and ask
 * whether the resulting bytes form a valid UTF-8 MULTI-BYTE sequence. If they
 * do, this text is UTF-8 that somebody decoded as cp1252 — which is the defect,
 * stated as the thing it is.
 *
 * ITS FALSE-POSITIVE SHAPE, MEASURED RATHER THAN ASSUMED (Sentinel, #712).
 * Every non-surrogate codepoint from `U+0080` to `U+10FFFF` — 1,111,998 of them
 * — was mangled through cp1252 and fed to this in three line positions; zero
 * misses, and zero false positives on any single clean character. The one way
 * clean text reddens is ADJACENCY: an accented Latin letter immediately
 * followed, with no space between, by a cp1252 high punctuation character.
 * 1,920 such two-character pairs exist and they are what a legitimate run would
 * trip on. Ordinary prose does not — a space breaks the run, and `"Ça… voilà"`,
 * `"Über — das"`, `"café § 2"` and `"naïve “quote”"` all come back clean. It is
 * written here because a false positive on a RELEASE GATE is how a release gate
 * gets waived, and the next person to see one should know the shape before they
 * decide the instrument is noise. The continuation ranges for `0xE0`, `0xF0`
 * and `0xF4` are likewise not narrowed for overlongs or for anything past
 * `U+10FFFF`: that is over-acceptance, which errs toward a false positive and
 * never toward losing a defect, and it stays that way deliberately.
 *
 * WHAT THIS DELIBERATELY CANNOT SEE, said here rather than left to be found:
 * text that is genuinely about mojibake. A document quoting a mangled em dash
 * as a SPECIMEN is indistinguishable from a document that IS mangled, and that
 * is not a limitation to engineer around — it is the reason this rulebook may
 * never paste a specimen and must describe one in prose. The instructions this
 * grew out of failed their own check by pasting one.
 */
export function findMojibake(text) {
  const hits = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const bytes = new Array(line.length).fill(-1)
    for (let j = 0; j < line.length; j++) {
      const cp = line.codePointAt(j)
      if (cp === undefined || cp > 0xffff) continue
      if (cp <= 0x7f) bytes[j] = cp
      else if (cp >= 0xa0 && cp <= 0xff) bytes[j] = cp
      else if (CP1252_IDENTITY.has(cp)) bytes[j] = cp
      else if (CP1252_HIGH[cp] !== undefined) bytes[j] = CP1252_HIGH[cp]
    }
    for (let j = 0; j < bytes.length; j++) {
      const lead = bytes[j]
      // Only a LEAD byte can start a mojibake run, and `0xC0`/`0xC1` are not
      // legal leads in UTF-8 — accepting them would find overlong sequences
      // that no encoder produces.
      let need = 0
      if (lead >= 0xc2 && lead <= 0xdf) need = 1
      else if (lead >= 0xe0 && lead <= 0xef) need = 2
      else if (lead >= 0xf0 && lead <= 0xf4) need = 3
      if (!need || j + need >= bytes.length) continue
      let ok = true
      for (let k = 1; k <= need; k++) {
        const b = bytes[j + k]
        if (b < 0x80 || b > 0xbf) { ok = false; break }
      }
      if (!ok) continue
      hits.push({
        line: i + 1,
        length: need + 1,
        decodesTo: Buffer.from(bytes.slice(j, j + need + 1)).toString('utf8'),
        context: line.slice(Math.max(0, j - 30), j + need + 31),
      })
      j += need
    }
  }
  return hits
}

/* ========================================================================= *
 * D. HEADINGS
 * ========================================================================= */

/**
 * A REAL HEADING IS ATX AND NOTHING ELSE. One to six `#`, then a space, then
 * something. `#559` at the start of a line is what the formatter produces when
 * an issue reference wraps, and in the store's renderer it became an H1 in the
 * middle of a paragraph on 2026-09-14 — a document whose structure is how
 * agents navigate it, restructured by a line break.
 *
 * FENCED BLOCKS ARE SKIPPED, and that is not politeness. This rulebook quotes
 * shell (`# comment`) and YAML, and `#!/usr/bin/env` inside a fence is legal
 * text that this predicate would otherwise redden — a false positive on a
 * release gate is how a release gate gets waived. The fence tracker accepts
 * both ``` and ~~~ and closes on a fence of the same character, which is what
 * CommonMark does; an info string on the opening fence is ignored.
 */
export function findFalseHeadings(text) {
  const hits = []
  const lines = text.split('\n')
  let fence = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const open = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (open && open[1][0] === fence) fence = null
      continue
    }
    if (open) { fence = open[1][0]; continue }
    if (line[0] !== '#') continue
    if (/^#{1,6} \S/.test(line)) continue
    hits.push({ line: i + 1, text: line.slice(0, 100) })
  }
  return hits
}

/* ========================================================================= *
 * B. THE FRONTMATTER DESCRIPTION
 * ========================================================================= */

/**
 * A NARROW PARSER THAT REFUSES WHAT IT DOES NOT RECOGNISE, rather than a YAML
 * dependency or a lenient regex. The rulebook's frontmatter is three lines and
 * the description is a single-line double-quoted scalar; that is the only shape
 * this accepts. A folded block, a multi-line scalar or a single-quoted string
 * would all parse "successfully" under a lenient reader and publish a
 * description that is subtly not the one in the file — the exact class this
 * check exists to catch, introduced by the check.
 *
 * So an unrecognised shape THROWS. Publishing is blocked until somebody either
 * rewrites the frontmatter or widens this deliberately, and both of those are
 * decisions rather than accidents.
 */
export function parseFrontmatterDescription(skillMd) {
  const lines = skillMd.split('\n')
  if (lines[0] !== '---') {
    throw new Error(`${SKILL_MD}: expected a frontmatter fence on line 1, found ${JSON.stringify(lines[0])}`)
  }
  let end = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { end = i; break }
  }
  if (end === -1) throw new Error(`${SKILL_MD}: frontmatter is never closed`)

  const found = []
  for (let i = 1; i < end; i++) {
    const m = /^description: "(.*)"$/.exec(lines[i])
    if (m) found.push({ line: i + 1, value: m[1] })
    else if (/^description:/.test(lines[i])) {
      throw new Error(
        `${SKILL_MD}:${i + 1}: the description is not a single-line double-quoted scalar. ` +
          'This parser refuses shapes it does not recognise rather than guessing at one; ' +
          'rewrite the frontmatter or widen scripts/rulebook-publish.mjs deliberately.',
      )
    }
  }
  if (found.length !== 1) {
    throw new Error(`${SKILL_MD}: expected exactly one frontmatter description, found ${found.length}`)
  }
  const value = found[0].value
  // A `\"` or a `\\` in the raw line means YAML escaping is in play and the
  // slice above is no longer the value. There is none today; there is no
  // silent handling of it either.
  if (/\\/.test(value)) {
    throw new Error(
      `${SKILL_MD}:${found[0].line}: the description contains a backslash escape, which this ` +
        'parser does not decode. Remove it or teach the parser, but do not publish a guess.',
    )
  }
  return value
}

/* ========================================================================= *
 * THE TREE
 * ========================================================================= */

/**
 * The tree reader, and it reads BYTES. Everything downstream works on Buffers
 * until the moment a predicate needs characters, so "identical" means identical
 * and never "identical once both sides have been normalised by the same
 * decoder".
 *
 * Paths are stored with forward slashes whatever the host separator is: the
 * store's path is `references/2-merge-gate.md` and a Windows publisher that
 * sent `references\2-merge-gate.md` would create a SECOND file rather than
 * update the first, which is a drift the file-set assertion would then report
 * forever.
 */
export function readRulebookTree(root = process.cwd(), dir = RULEBOOK_DIR) {
  const base = join(root, dir)
  if (!existsSync(base)) throw new Error(`${dir} does not exist under ${root}`)
  const out = new Map()
  const walk = (abs) => {
    for (const entry of readdirSync(abs).sort()) {
      const full = join(abs, entry)
      if (statSync(full).isDirectory()) { walk(full); continue }
      if (!/\.md$/.test(entry)) continue
      const rel = relative(base, full).split(sep).join(posix.sep)
      out.set(rel, readFileSync(full))
    }
  }
  walk(base)
  if (!out.has(SKILL_MD)) throw new Error(`${dir}/${SKILL_MD} is missing`)
  // THE READER'S OWN EYES. A wrong `--root`, a truncated `git archive` extract
  // or a prefix that landed one directory off all produce a tree that parses,
  // grades clean and is almost empty — and every assertion downstream of here
  // is an ABSENCE assertion, which an almost-empty tree only makes greener.
  // The exact comparison against `origin/main` is what actually catches this
  // (see `diffAgainstMerged`); this is the independent tripwire for the case
  // where that comparison is itself what broke, and it is deliberately a floor
  // rather than a count, because there is no expected size to compare to here.
  if (![...out.keys()].some((p) => p.startsWith('references/'))) {
    throw new Error(
      `${dir} holds ${out.size} file(s) and none under references/ — this does not look like the rulebook. ` +
        'Check --root: the tree reader found almost nothing, so anything it reports means nothing.',
    )
  }
  return out
}

/**
 * THE LOCAL PREFLIGHT — C and D, pointed at the tree, BEFORE anything is
 * pushed. A publisher that faithfully uploads a mangled file has done its job
 * and left the rulebook wrong, and the verify pass afterwards would agree with
 * it byte for byte. This is the run that refuses.
 */
/**
 * The description's own ceiling, graded in the preflight so it is a refusal
 * BEFORE the first write rather than an OS errno in the middle of one. See
 * `MAX_DESCRIPTION_CHARS` for why the limit exists and what it is made of.
 */
export function gradeDescriptionLength(description) {
  if (description.length <= MAX_DESCRIPTION_CHARS) return []
  return [
    `${RULEBOOK_DIR}/${SKILL_MD}: the frontmatter description is ${description.length} characters, over the ` +
      `${MAX_DESCRIPTION_CHARS} this command can transmit. \`skill update --description\` has no file form, so it ` +
      "travels as an argv element and Windows caps a command line at 32,767 — the publish would die with " +
      'ENAMETOOLONG naming neither the field nor the cause. SHORTEN IT: this text is how an agent decides ' +
      'whether to OPEN the rulebook, not a second copy of it, and a description this long has stopped being ' +
      'either.',
  ]
}

export function gradeText(name, text) {
  const failures = []
  for (const hit of findC1(text)) {
    failures.push(
      `${name}:${hit.line}: raw C1 control byte U+00${hit.codepoint.toString(16).toUpperCase()} — ` +
        'this is what a cp1252 round trip leaves where an em dash was',
    )
  }
  for (const hit of findMojibake(text)) {
    failures.push(
      `${name}:${hit.line}: UTF-8 decoded as cp1252 (${hit.length} chars standing in for ` +
        `${JSON.stringify(hit.decodesTo)}) near ${JSON.stringify(hit.context)}`,
    )
  }
  for (const hit of findFalseHeadings(text)) {
    failures.push(`${name}:${hit.line}: line starts with '#' but is not an ATX heading: ${JSON.stringify(hit.text)}`)
  }
  return failures
}

/**
 * A. THE BYTE COMPARE, and the file-set comparison that goes with it.
 *
 * `Buffer.compare` and nothing else. Not a length, which is what 2026-09-14
 * defeated — 9,018 characters on both sides of a mangling that replaced ninety
 * of them. Not a normalised string compare, which would forgive a BOM and a
 * line-ending flip. Not the server's own hash, for the reason in the header.
 *
 * The SET comparison is the half that catches a rename: publishing
 * `2e-foo.md` under a new name leaves `2d-foo.md` in the store, where agents go
 * on reading a file `main` has deleted. An EXTRA in the store is a failure, not
 * a warning.
 */
export function compareTree(local, remote) {
  const failures = []
  const localPaths = [...local.keys()].sort()
  const remotePaths = [...remote.keys()].sort()

  for (const p of localPaths) {
    if (!remote.has(p)) failures.push(`${p}: in the tree, MISSING from the store`)
  }
  for (const p of remotePaths) {
    if (!local.has(p)) {
      failures.push(`${p}: in the store, absent from the tree — a rename or a deletion that never reached the store`)
    }
  }
  for (const p of localPaths) {
    const want = local.get(p)
    const got = remote.get(p)
    if (!got) continue
    if (Buffer.compare(want, got) === 0) continue
    failures.push(`${p}: BYTES DIFFER — ${describeFirstDifference(want, got)}`)
  }
  return failures
}

/**
 * A byte compare that only says "different" sends the reader back to a 236KB
 * file with no idea where to look, so the first differing offset is located and
 * rendered as the line it falls on with both renderings of the character. The
 * 2026-09-14 mangling is legible in one line of this and in no amount of the
 * other.
 */
export function describeFirstDifference(want, got, sides = ['tree', 'store']) {
  const [a, b] = sides
  const n = Math.min(want.length, got.length)
  let i = 0
  while (i < n && want[i] === got[i]) i++
  if (i === n) {
    const longer = want.length > got.length ? a : b
    return `identical for ${n} bytes, then the ${longer} continues (${want.length} vs ${got.length} bytes)`
  }
  const line = want.subarray(0, i).toString('utf8').split('\n').length
  const near = (buf) => JSON.stringify(buf.subarray(Math.max(0, i - 40), i + 40).toString('utf8'))
  return (
    `first difference at byte ${i} (line ${line}): ${a} has 0x${want[i].toString(16).padStart(2, '0')}, ` +
    `${b} has 0x${got[i].toString(16).padStart(2, '0')}; ${a} ${near(want)} vs ${b} ${near(got)}; ` +
    `${want.length} vs ${got.length} bytes`
  )
}

/* ========================================================================= *
 * THE CLI
 * ========================================================================= */

/**
 * `execFileSync` with an argv array and NO shell, and the Windows fallback is
 * the only concession. Node does not walk PATHEXT for a bare name, so `multica`
 * resolves on Linux and throws ENOENT on the authoring box where every one of
 * these defects was born.
 */
function runCli(bin, args) {
  const attempt = (cmd) =>
    execFileSync(cmd, args, { maxBuffer: MAX_BUFFER, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    return attempt(bin)
  } catch (err) {
    if (err.code === 'ENOENT' && process.platform === 'win32' && !/\.(exe|cmd|bat)$/i.test(bin)) {
      for (const ext of ['.exe', '.cmd']) {
        try { return attempt(bin + ext) } catch (retry) { if (retry.code !== 'ENOENT') throw retry }
      }
    }
    throw err
  }
}

/**
 * THE DECODE IS EXPLICIT AND THAT IS THE WHOLE POINT OF THIS FUNCTION. A Buffer
 * in, `utf8` named out loud, `JSON.parse` after. The one thing this verifier
 * must never do is inherit the mangling it is looking for.
 *
 * `--output json` puts JSON on stdout and confirmations on stderr; stderr is
 * captured separately here and never merged, because merging is how a write
 * that SUCCEEDED reads as a failure and invites a duplicate retry.
 */
function cliJson(bin, args) {
  const out = runCli(bin, [...args, '--output', 'json'])
  return JSON.parse(out.toString('utf8'))
}

function resolveSkillId(bin, name) {
  const skills = cliJson(bin, ['skill', 'list'])
  const match = skills.filter((s) => s.name === name)
  if (match.length !== 1) {
    throw new Error(`expected exactly one skill named ${name} in this workspace, found ${match.length}`)
  }
  return match[0].id
}

/** The store record, read back as the same shape the tree reader produces. */
function fetchStore(bin, id) {
  const skill = cliJson(bin, ['skill', 'get', id, '--with-content'])
  const files = new Map()
  files.set(SKILL_MD, Buffer.from(skill.content ?? '', 'utf8'))
  for (const f of skill.files ?? []) {
    files.set(f.path, Buffer.from(f.content ?? '', 'utf8'))
  }
  return { skill, files }
}

function publish(bin, id, root, local, description, log) {
  // `--description` is the one text-carrying flag with no file form. It travels
  // as an argv element through `execFileSync`, which on Windows reaches
  // `CreateProcessW` as UTF-16 — no shell, no cp1252 stdout, none of the path
  // that rewrote a stored description on 2026-09-22. Assertion B re-reads it
  // regardless; this is belt, and B is the braces.
  log(`skill update ${id} (content ${local.get(SKILL_MD).length} bytes, description ${description.length} chars)`)
  runCli(bin, [
    'skill', 'update', id,
    '--content-file', join(root, RULEBOOK_DIR, SKILL_MD),
    '--description', description,
    '--output', 'json',
  ])
  for (const path of [...local.keys()].sort()) {
    if (path === SKILL_MD) continue
    log(`skill files upsert ${path} (${local.get(path).length} bytes)`)
    runCli(bin, [
      'skill', 'files', 'upsert', id,
      '--path', path,
      '--content-file', join(root, RULEBOOK_DIR, ...path.split(posix.sep)),
      '--output', 'json',
    ])
  }
  // A file the tree no longer has is deleted rather than left to rot. The
  // file-set half of assertion A would otherwise report it on every run
  // forever, which is how a check becomes noise and then becomes ignored.
  const listed = cliJson(bin, ['skill', 'files', 'list', id])
  for (const f of listed) {
    if (local.has(f.path)) continue
    log(`skill files delete ${f.path} — absent from ${RULEBOOK_DIR}`)
    runCli(bin, ['skill', 'files', 'delete', id, f.id])
  }
}

/* ========================================================================= *
 * main
 * ========================================================================= */

/* ========================================================================= *
 * THE WRITE PATH'S OWN PRECONDITION
 * ========================================================================= */

/**
 * THE STORE MAY ONLY EVER HOLD MERGED `main`, AND THIS IS WHAT REFUSES
 * OTHERWISE.
 *
 * The four assertions above all grade whether the publish LANDED. None of them
 * asks whether it should have happened, and on 2026-09-23 that gap was spent:
 * within twenty minutes of this command existing, the store had been rewritten
 * three times from working branches and was carrying rules from two PRs that
 * had not merged. Every agent who opened the rulebook in that window read them
 * as binding. That is a worse failure than a stale copy — a stale rulebook
 * under-claims, an unmerged one invents — and it is the direction DREAMCRM-128
 * never contemplated. (Sentinel, reviewing #712, who found it with this
 * command's own `--verify-only`.)
 *
 * WHY THIS COMPARES BYTES AND NOT `HEAD`. The obvious guard is `git rev-parse
 * HEAD` against `origin/main` plus a dirty check, and it was written that way
 * first. It refuses the legitimate case: publishing `main` from a `git archive`
 * extract, which is not a git repository at all and is the ONLY way to publish
 * exactly `main` from a worktree that is mid-PR. And it accepts an illegitimate
 * one — a clean checkout of a commit that merely happens to be on `main`'s
 * history but is not its tip. The question is not where these bytes came from,
 * it is whether they ARE merged `main`, and that is answerable directly: read
 * each file out of `origin/main` and compare. Same instrument as everything
 * else here, pointed one step earlier.
 *
 * `readMerged` is injected so the predicate is a pure function of two trees and
 * `tests/guards/rulebook-publish.test.ts` can perturb it without a repository.
 */
export function diffAgainstMerged(local, readMerged, listMerged) {
  const problems = []

  /**
   * THE EYES COME FIRST, AND THE FIRST DRAFT HAD NONE. It iterated
   * `local.keys()` and nothing else, so every assertion in it was about a file
   * the tree HAS — and a file on `origin/main` that the tree LACKS was never
   * examined, because nothing iterated `origin/main`. `publish()` then deletes
   * from the store anything the tree does not hold, and assertion A reports
   * CLEAN afterwards **because the publish made the two agree, by deleting the
   * difference.** A tree holding only `SKILL.md`, byte-identical to `main`'s,
   * returned `[]` from the precondition and took nine of ten sections out of
   * the store under a green verdict. (Sentinel, REQUEST CHANGES on #712, who
   * ran it rather than argued it.)
   *
   * That is DREAMCRM-128's ORIGINAL defect — a store no check can notice is
   * wrong — reconstituted inside the guard built to abolish it, and it needed
   * nothing exotic to reach: a commit to `main` that only ADDS a rulebook file
   * (the §2 split added four at once) is enough, as is a truncated `git
   * archive` extract, which is the very route §2 now names as supported.
   *
   * §2d has the general form and it is why six passing perturbation tests
   * said nothing about this: **watching a PREDICATE fail tells you nothing
   * about the guard's EYES.** So the set comparison is exact and runs FIRST,
   * `compareTree`'s own rule applied one step earlier — an absence from the
   * tree is a failure, not a warning.
   */
  const mergedPaths = listMerged()
  if (mergedPaths.length === 0) {
    // An absence assertion over an empty list passes, so an empty answer is
    // never read as agreement. A clone with no `origin/main`, an unfetched
    // one, or a lookup that threw all arrive here.
    problems.push(
      `origin/main:${RULEBOOK_DIR} lists NO files — the lookup failed, or this clone has no origin/main. ` +
        'Refusing rather than treating an empty answer as "nothing is missing".',
    )
  }
  for (const path of mergedPaths) {
    // AN ENTRY THAT DID NOT PARSE IS A REFUSAL, NEVER A DROP. Anything still
    // carrying the directory prefix, a leading quote or a backslash came back
    // from the lister in a shape it could not reduce to a rulebook-relative
    // path — and a listing this function cannot read is not evidence that
    // nothing is missing.
    if (path.startsWith(`${RULEBOOK_DIR}/`) || /^["/]|\\/.test(path)) {
      problems.push(
        `${JSON.stringify(path)}: unreadable entry in the origin/main listing — it could not be reduced to a ` +
          `path under ${RULEBOOK_DIR}. Refusing rather than dropping it: a listing this cannot read is not ` +
          'evidence that nothing is missing.',
      )
      continue
    }
    if (!/\.md$/.test(path)) {
      // The tree reader only sees `.md`, so a file of any other kind on `main`
      // is outside this command's field of view ENTIRELY — it would be left
      // out of the store silently and for ever. Naming it in prose as a
      // residual would be the weaker move when refusing costs one branch.
      problems.push(
        `${path}: on origin/main and not a .md file — this command's tree reader cannot see it, so ` +
          'publishing would leave it out of the store with nothing to say so. Teach the reader or move the file.',
      )
      continue
    }
    if (!local.has(path)) {
      problems.push(
        `${path}: on origin/main, MISSING from this tree — publishing would DELETE it from the store, ` +
          'and the byte compare afterwards would be green because the deletion is what made the two agree.',
      )
    }
  }

  for (const path of [...local.keys()].sort()) {
    const merged = readMerged(path)
    if (merged === null) {
      problems.push(`${path}: not on origin/main — this file exists only on a branch`)
      continue
    }
    if (Buffer.compare(local.get(path), merged) !== 0) {
      // The sides are NAMED, because this comparison's second buffer is
      // `origin/main` and not the store, and a failure message that says
      // "store" here sends the reader to investigate the wrong document.
      problems.push(
        `${path}: differs from origin/main — ${describeFirstDifference(local.get(path), merged, ['tree', 'origin/main'])}`,
      )
    }
  }
  return problems
}

/**
 * EVERY path under `docs/rulebook` on `origin/main`, relative to it, UNFILTERED
 * by extension. The filter lives in `diffAgainstMerged`, where a non-`.md` file
 * becomes a refusal rather than a silent omission — filtering here instead
 * would narrow the eyes back to what the tree reader already sees, which is the
 * shape of the defect this list exists to close.
 *
 * `git ls-tree` rather than a walk of the working tree: the subject is the
 * COMMIT, and a worktree sitting on a PR does not have `origin/main`'s files on
 * disk. A failed lookup returns `[]`, which `diffAgainstMerged` refuses rather
 * than reads as agreement.
 */
function mergedLister(dir = RULEBOOK_DIR) {
  return () => {
    try {
      // `-z` IS LOAD-BEARING, and the first draft did not have it. Without it
      // `git ls-tree` C-QUOTES any path containing a non-ASCII byte — the whole
      // path comes back wrapped in double quotes with the bytes escaped — and
      // such a line does not begin with the directory prefix. The first draft
      // FILTERED on that prefix, so it dropped the line silently, reported a
      // shorter `origin/main` than `main` has, and a file missing from the
      // publish tree became invisible again: B1, narrowed to one filename
      // class. `-z` removes the quoting entirely rather than teaching this
      // function to unquote, and the split moves to NUL.
      const out = execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', 'origin/main', '--', dir], {
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return out
        .toString('utf8')
        .split('\0')
        .filter((l) => l !== '')
        // A line that does NOT strip is returned VERBATIM rather than dropped,
        // and `diffAgainstMerged` refuses it. That is the half that matters as
        // much as `-z`: a dropped line and a file that genuinely is not there
        // used to be indistinguishable, and the quiet one is the wrong default
        // in a function whose entire job is to be the eyes. (Sentinel, N8.)
        .map((l) => (l.startsWith(`${dir}/`) ? l.slice(dir.length + 1) : l))
        .sort()
    } catch {
      return []
    }
  }
}

/** `git show origin/main:<path>` as bytes, or null when the path is not there. */
function mergedReader(dir = RULEBOOK_DIR) {
  return (path) => {
    try {
      return execFileSync('git', ['show', `origin/main:${dir}/${path}`], {
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch {
      return null
    }
  }
}

export function parseArgs(argv) {
  const opts = {
    verifyOnly: false,
    allowUnmerged: false,
    cli: 'multica',
    skill: SKILL_NAME,
    root: process.cwd(),
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--verify-only') opts.verifyOnly = true
    // The escape hatch exists for exactly one thing: the watched-to-fail runs
    // §9 owes, which have to publish something deliberately wrong. It is spelled
    // out loud so it cannot be typed by accident, and the run prints that it was
    // used.
    else if (a === '--allow-unmerged') opts.allowUnmerged = true
    else if (a === '--cli') opts.cli = argv[++i]
    else if (a === '--skill') opts.skill = argv[++i]
    else if (a === '--root') opts.root = argv[++i]
    else throw new Error(`unknown argument ${a}`)
  }
  return opts
}

function main(argv) {
  const opts = parseArgs(argv)
  const log = (m) => console.log(`  ${m}`)
  // FIRST LINE, BEFORE ANYTHING ELSE, because §2 says it announces itself on
  // its own first line and it used to print fourth. A small wrong sentence in
  // the rulebook is still a wrong sentence in the rulebook, and the cheaper
  // fix was the code rather than the rule. (Sentinel, N7 on #712.)
  if (opts.allowUnmerged) {
    console.log('*** --allow-unmerged: the merged-main precondition is OFF. This is for the §9 runs only. ***')
  }
  const local = readRulebookTree(opts.root)
  const skillMd = local.get(SKILL_MD).toString('utf8')
  const description = parseFrontmatterDescription(skillMd)

  console.log(`${RULEBOOK_DIR}: ${local.size} files, ${[...local.values()].reduce((n, b) => n + b.length, 0)} bytes`)

  // PREFLIGHT — C and D on the tree. Nothing is pushed if this speaks.
  const preflight = []
  for (const [path, buf] of local) preflight.push(...gradeText(`${RULEBOOK_DIR}/${path}`, buf.toString('utf8')))
  preflight.push(...gradeText(`${RULEBOOK_DIR}/${SKILL_MD} frontmatter description`, description))
  preflight.push(...gradeDescriptionLength(description))
  if (preflight.length) {
    console.error('\nPREFLIGHT FAILED — the authored copy is already wrong, so nothing was published.\n')
    for (const f of preflight) console.error(`  - ${f}`)
    return 1
  }
  console.log('preflight: clean (no C1, no mojibake, no false heading, description parses)')

  const id = /^[0-9a-f-]{36}$/.test(opts.skill) ? opts.skill : resolveSkillId(opts.cli, opts.skill)
  console.log(`skill: ${opts.skill} (${id})`)

  if (opts.verifyOnly) {
    // Verifying a BRANCH against the store is a legitimate thing to want — it
    // is how you see the gap a PR will close — and the closing line already
    // says "on this tree". Only the write path is constrained.
    console.log('\n--verify-only: grading what is in the store, publishing nothing')
  } else {
    const unmerged = diffAgainstMerged(local, mergedReader(), mergedLister())
    if (unmerged.length && !opts.allowUnmerged) {
      console.error('\nREFUSING TO PUBLISH — this tree is not merged `main`.\n')
      for (const p of unmerged) console.error(`  - ${p}`)
      console.error(
        '\nThe store is the copy every agent reads and it may only ever hold merged `main`: an unmerged\n' +
          'rulebook does not go stale, it INVENTS rules, and nothing on the agent side can tell the\n' +
          'difference. Land the PR and publish from `main` (a `git archive origin/main docs/rulebook`\n' +
          'extract published with --root is the supported way to do that mid-PR). `--allow-unmerged`\n' +
          'exists only for the watched-to-fail runs §9 owes.\n' +
          '\nIf this clone has simply not fetched, `git fetch origin main` first: everything above is\n' +
          'measured against `origin/main` as THIS clone knows it.',
      )
      return 1
    }
    if (unmerged.length) {
      console.log(`\n--allow-unmerged: publishing anyway over ${unmerged.length} precondition failure(s):`)
      for (const p of unmerged) console.log(`  ! ${p}`)
    }
    console.log('\npublishing:')
    publish(opts.cli, id, opts.root, local, description, log)
  }

  console.log('\nverifying (re-fetched, decoded utf8 explicitly):')
  const { skill, files: remote } = fetchStore(opts.cli, id)

  const failures = []
  const a = compareTree(local, remote)
  failures.push(...a.map((f) => `[A bytes] ${f}`))
  console.log(`  A. bytes + file set: ${a.length ? `${a.length} FAILED` : `${local.size} files identical`}`)

  const storedDescription = skill.description ?? ''
  const b = Buffer.compare(Buffer.from(description, 'utf8'), Buffer.from(storedDescription, 'utf8')) === 0
  if (!b) {
    failures.push(
      `[B description] stored description differs from the frontmatter — ` +
        `${describeFirstDifference(Buffer.from(description, 'utf8'), Buffer.from(storedDescription, 'utf8'))}`,
    )
  }
  console.log(`  B. description:      ${b ? `identical (${description.length} chars)` : 'FAILED'}`)

  const cd = []
  for (const [path, buf] of remote) cd.push(...gradeText(`store:${path}`, buf.toString('utf8')))
  cd.push(...gradeText('store:description', storedDescription))
  // EVERY FINDING REACHES `failures`, AND THE PARTITION IS FOR THE CONSOLE
  // ONLY. The first draft assembled `failures` from the two filtered halves,
  // which is classification by string match sitting inside the one command
  // whose whole argument is that classification by string match is the defect.
  // All three of `gradeText`'s message shapes matched a regex, so nothing was
  // lost — but rewording one message, or adding a fifth predicate, would have
  // computed a genuine store failure, printed it nowhere, and exited 0 on a
  // broken rulebook. Latent, not live, and closed at the same standard #686's
  // comma-thousands case was closed at. (Sentinel, reviewing #712.)
  //
  // The label a finding carries is still derived from its text, because that is
  // all a string finding offers — but an UNRECOGNISED one is labelled as such
  // rather than filed under whichever half the ternary happens to reach. A new
  // predicate then announces itself in the report instead of hiding inside a
  // count that no longer describes it.
  const label = (f) =>
    /ATX heading/.test(f) ? 'D headings' : /control byte|cp1252/.test(f) ? 'C encoding' : 'C/D unclassified'
  // THE COUNTERS ARE DERIVED FROM THE SAME `label()` THE VERDICT IS, so the
  // summary cannot disagree with the exit code. They used to be two
  // independent `filter`s, which printed two GREEN lines over a run that
  // correctly exited 1 on an unclassified finding — the verdict right and the
  // summary wrong, which is the half of a report a reader actually acts on.
  // (Sentinel, reviewing #712.)
  const labelled = cd.map((f) => ({ text: f, kind: label(f) }))
  const c = labelled.filter((x) => x.kind === 'C encoding')
  const d = labelled.filter((x) => x.kind === 'D headings')
  const u = labelled.filter((x) => x.kind === 'C/D unclassified')
  failures.push(...labelled.map((x) => `[${x.kind}] ${x.text}`))
  console.log(`  C. encoding:         ${c.length ? `${c.length} FAILED` : 'no C1, no mojibake'}`)
  console.log(`  D. headings:         ${d.length ? `${d.length} FAILED` : 'every leading # is a real heading'}`)
  if (u.length) console.log(`  C/D unclassified:    ${u.length} FAILED — a predicate this summary does not know`)

  if (failures.length) {
    console.error(`\nPUBLISHED RULEBOOK VERIFY: FAILED (${failures.length})\n`)
    for (const f of failures) console.error(`  - ${f}`)
    console.error(
      '\nThis is release-blocking (docs/RELEASE.md R5). Re-run the publisher; if it fails again the store ' +
        'and the tree have genuinely diverged and the store is the copy every agent reads.',
    )
    return 1
  }
  console.log('\nPUBLISHED RULEBOOK VERIFY: CLEAN — the store is byte-identical to docs/rulebook/ on this tree.')
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exit(main(process.argv.slice(2)))
  } catch (err) {
    console.error(`\nrulebook-publish: ${err.message}`)
    process.exit(1)
  }
}
