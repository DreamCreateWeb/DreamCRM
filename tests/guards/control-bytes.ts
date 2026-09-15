/**
 * A RAW CONTROL BYTE MAKES A TRACKED FILE UNREVIEWABLE.
 *
 * Git decides a blob is binary by scanning its first 8000 bytes for a `NUL`.
 * One such byte anywhere in that window and the file renders in every diff view
 * — `gh pr diff`, the GitHub review page, `git diff --numstat` — as
 * `Binary files … differ`, with no content and a `-  -` line count. The PR that
 * does it reports no additions. Nothing in this repo checked for that, so a
 * file could stop being reviewable without anybody choosing it.
 *
 * #588 shipped `tests/guards/axe-baseline-ratchet.ts` — the comparator for the
 * axe ratchet — with a `NUL` at byte 7636. All 13,413 bytes of it were
 * invisible in the PR diff. `tests/guards/**` is on `INTAKE_RULES` and not on
 * `GATE_RULES`, so every later edit to that file would have gone to intake
 * rather than to a reviewer, pointed at an opaque blob: a weakening of the
 * ratchet would have been invisible in review by construction.
 *
 * WHY THE RULE IS NOT "NO NUL IN THE FIRST 8000 BYTES". Three things, in
 * increasing order of how much they change the shape of the check:
 *
 *  1. **The 8000 is an accident, not a convention.** `lib/services/acquisition.ts`
 *     carried three raw `NUL`s as composite map-key separators, at bytes 8750,
 *     8799 and 9223 — text to `git diff` only because the first one sits PAST
 *     the window. One added comment paragraph above them flips the whole file
 *     to binary. A guard that re-derives git's own cutoff would have reported
 *     that file clean on the day it was one paragraph from unreviewable, which
 *     is the report that teaches people the check is noise.
 *  2. **`NUL` is not the only byte that arrives by accident.** The hazard is not
 *     "somebody typed a control character" — it is that prose or source quoting
 *     a regex or an escape acquires the byte ON THE WAY TO DISK, through the
 *     authoring path. `docs/RELEASE.md` took a raw `0x08` where a backslash-b
 *     was meant, and lost the name of the lesson it was recording; Forge
 *     reproduced the same thing half an hour later in a different tool, where a
 *     backslash-b typed into an edit script arrived on disk as a real `0x08`
 *     after two layers of JSON encoding. `0x08` does not make git call the file
 *     binary. It still silently replaced the text.
 *  3. **Every reproduction so far has been in docs or in a test fixture, and
 *     none in product code.** So the scan covers every tracked file, not a
 *     source list.
 *
 * The banned set is therefore the whole C0 range (`0x00`–`0x1F`) minus the
 * three that are real text: tab, LF and CR. `0x7F` (DEL) is deliberately NOT
 * banned — it is outside C0, it has never appeared here, and the argument for a
 * guard is the byte class that keeps arriving by accident rather than every
 * byte one could dislike.
 *
 * EXCLUSIONS ARE DERIVED FROM CONTENT, NOT FROM A PATH LIST. Genuine binaries
 * — images, fonts, the favicon — obviously carry control bytes, and a guard
 * that carried a hand-written list of them would (a) go stale the first time
 * somebody adds a PNG and (b) become the place to hide a file. So a file is
 * skipped when its FIRST BYTES ARE A KNOWN BINARY SIGNATURE, anchored at offset
 * zero. That derivation is not circular the way git's own binary flag would be:
 * asking git "is this binary?" excludes exactly the files this guard exists to
 * find — `git ls-files --eol` already reported `acquisition.ts` as `-text` —
 * whereas a `.ts` file does not begin with a PNG header, and a new font added
 * tomorrow is skipped with nobody editing anything.
 *
 * Pure and buffer-in on purpose: every branch below is exercised from fixtures
 * in `control-bytes.test.ts`, including the case git itself cannot see (a
 * control byte past byte 8000). The `git ls-files` walk lives in the test.
 */

/** Git's binary sniff window. Recorded to REPORT with, never to gate on — see above. */
export const GIT_BINARY_SNIFF_WINDOW = 8000

/** Tab, LF, CR. The only C0 bytes that are text. */
export const ALLOWED_CONTROL_BYTES: ReadonlySet<number> = new Set([0x09, 0x0a, 0x0d])

/** C0 minus tab, LF and CR. */
export function isForbiddenControlByte(byte: number): boolean {
  return byte < 0x20 && !ALLOWED_CONTROL_BYTES.has(byte)
}

export type BinarySignature = {
  /** What it is, for the message when a skip has to be explained. */
  readonly name: string
  /** Bytes that must appear at offset 0. */
  readonly magic: readonly number[]
  /**
   * A second fixed run further in, for container formats whose first four bytes
   * are a generic chunk header (RIFF/WEBP). `[offset, bytes]`.
   */
  readonly at?: readonly [number, readonly number[]]
  /** Extensions this signature is allowed to appear under. */
  readonly extensions: readonly string[]
}

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0))

/**
 * The formats a repository of a web app can legitimately track as bytes.
 *
 * Longer than what is in the tree today, deliberately: the failure mode of a
 * too-SHORT list is a real PNG landing in `public/` and failing this guard with
 * a message about control bytes, which tells its author nothing useful. The
 * failure mode of a too-long one is nil — none of these headers can be the
 * first bytes of a TypeScript file, a Markdown document or a YAML workflow.
 *
 * SVG is absent on purpose. It is XML, it is reviewable, and it should be held
 * to the same rule as any other text file.
 */
export const BINARY_SIGNATURES: readonly BinarySignature[] = [
  { name: 'PNG', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], extensions: ['.png'] },
  { name: 'JPEG', magic: [0xff, 0xd8, 0xff], extensions: ['.jpg', '.jpeg'] },
  { name: 'GIF', magic: ascii('GIF8'), extensions: ['.gif'] },
  {
    name: 'WebP',
    magic: ascii('RIFF'),
    at: [8, ascii('WEBP')],
    extensions: ['.webp'],
  },
  // The ICO header opens with two NUL bytes of its own, which is why the
  // signature check has to run BEFORE the byte scan rather than as a rescue
  // after it.
  { name: 'ICO', magic: [0x00, 0x00, 0x01, 0x00], extensions: ['.ico'] },
  { name: 'WOFF', magic: ascii('wOFF'), extensions: ['.woff'] },
  { name: 'WOFF2', magic: ascii('wOF2'), extensions: ['.woff2'] },
  { name: 'TrueType font', magic: [0x00, 0x01, 0x00, 0x00], extensions: ['.ttf'] },
  { name: 'OpenType font', magic: ascii('OTTO'), extensions: ['.otf'] },
  { name: 'PDF', magic: ascii('%PDF'), extensions: ['.pdf'] },
  { name: 'ZIP', magic: [0x50, 0x4b, 0x03, 0x04], extensions: ['.zip'] },
  { name: 'gzip', magic: [0x1f, 0x8b], extensions: ['.gz', '.tgz'] },
  { name: 'MP4', magic: [], at: [4, ascii('ftyp')], extensions: ['.mp4', '.m4v', '.mov'] },
]

/** How many leading bytes `binarySignatureOf` needs. */
export const SIGNATURE_PROBE_BYTES = 16

const matchesAt = (buf: Uint8Array, offset: number, bytes: readonly number[]): boolean =>
  bytes.every((b, i) => buf[offset + i] === b)

/**
 * The binary format this buffer declares itself to be, or `null`.
 *
 * Anchored at offset 0 (and at one fixed inner offset for container formats).
 * A text file that merely MENTIONS `PNG` somewhere is not a PNG, which is the
 * whole reason this does not search.
 */
export function binarySignatureOf(buf: Uint8Array): BinarySignature | null {
  return (
    BINARY_SIGNATURES.find(
      (sig) =>
        buf.length >= Math.max(sig.magic.length, sig.at ? sig.at[0] + sig.at[1].length : 0) &&
        matchesAt(buf, 0, sig.magic) &&
        (!sig.at || matchesAt(buf, sig.at[0], sig.at[1])),
    ) ?? null
  )
}

export type ControlByteFinding = {
  /** Byte offset in the file, which is what `git`'s sniff window is measured in. */
  readonly offset: number
  readonly byte: number
  /** 1-based, counting LF. */
  readonly line: number
  /** 1-based, in bytes from the last LF. */
  readonly column: number
  /**
   * Whether git can see it TODAY. Reported, never gated on: a `false` here is
   * `acquisition.ts` — the same defect, one comment paragraph from biting.
   */
  readonly withinGitSniffWindow: boolean
}

/** Every forbidden C0 byte in the buffer, in order. */
export function findControlBytes(buf: Uint8Array): ControlByteFinding[] {
  const found: ControlByteFinding[] = []
  let line = 1
  let lineStart = 0

  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i]
    if (byte === 0x0a) {
      line++
      lineStart = i + 1
      continue
    }
    if (isForbiddenControlByte(byte)) {
      found.push({
        offset: i,
        byte,
        line,
        column: i - lineStart + 1,
        withinGitSniffWindow: i < GIT_BINARY_SNIFF_WINDOW,
      })
    }
  }

  return found
}

/** `0x00` → `\u0000`, the spelling the fix uses. */
export const escapeFor = (byte: number): string =>
  `\\u${byte.toString(16).padStart(4, '0')}`

const NAMES: Record<number, string> = { 0x00: 'NUL', 0x08: 'BS', 0x0b: 'VT', 0x0c: 'FF', 0x1b: 'ESC' }

/** One line per finding, in the shape a failure message wants. */
export function describeFinding(path: string, f: ControlByteFinding): string {
  const name = NAMES[f.byte] ? ` ${NAMES[f.byte]}` : ''
  const window = f.withinGitSniffWindow
    ? 'git already renders this file as binary'
    : `past git's ${GIT_BINARY_SNIFF_WINDOW}-byte sniff window, so git still diffs this file as text — ` +
      'the same defect, waiting on one added paragraph above it'
  return (
    `${path}:${f.line}:${f.column} — raw 0x${f.byte.toString(16).padStart(2, '0')}${name} ` +
    `at byte ${f.offset} (${window}). Write it as ${escapeFor(f.byte)}.`
  )
}
