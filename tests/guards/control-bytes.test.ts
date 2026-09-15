import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { closeSync, openSync, readSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import {
  BINARY_SIGNATURES,
  GIT_BINARY_SNIFF_WINDOW,
  SIGNATURE_PROBE_BYTES,
  binarySignatureOf,
  describeFinding,
  findControlBytes,
  isForbiddenControlByte,
  type BinarySignature,
} from './control-bytes'

/**
 * NO TRACKED TEXT FILE CARRIES A RAW CONTROL BYTE.
 *
 * `control-bytes.ts` has the defect, the three reproductions and the reasoning
 * behind the banned set. This file is the wiring: it walks the tree with `git
 * ls-files`, and it asks git itself — twice, in git's own words — whether any
 * file it scanned as text has stopped being reviewable.
 *
 * ON BYTE OFFSETS AND WINDOWS. `core.autocrlf` is on for Windows checkouts
 * (docs/CI.md makes Windows a supported dev platform), so a working-tree file
 * runs one byte per line ahead of the blob git stores. That moves the
 * `withinGitSniffWindow` flag in the REPORT and nothing else: the rule bans the
 * byte wherever it sits, which is the entire point of not re-deriving git's
 * 8000 — see `acquisition.ts` in the module header.
 */

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
}

/**
 * Git's own verdict on each tracked file.
 *
 * `-text` is git saying "this is not text" — the exact condition that renders a
 * file as `Binary files … differ`. Stricter than `git diff`'s sniff, which only
 * reads the first 8000 bytes, so a latent `NUL` past the window shows up here
 * while `gh pr diff` still prints the file happily. That is a feature: it is
 * the same defect at an earlier hour.
 *
 * THE `w/` COLUMN, NOT `i/`, and the difference is not cosmetic. `i/` is the
 * blob in the INDEX, which says nothing about a fix sitting unstaged in the
 * working tree — this test failed on `lib/services/acquisition.ts` with the
 * escape already applied on disk, because the index still held the old blob. A
 * guard that only tells the truth after `git add` teaches people to distrust
 * it. `w/` is git reading the same bytes the scan above read, so the two
 * instruments answer about one file.
 *
 * `-z` because one image in `public/` has a space in its filename, and the
 * unquoted form would have split it.
 */
function gitTextVerdicts(): Map<string, string> {
  const out = execFileSync('git', ['ls-files', '--eol', '-z'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return new Map(
    out
      .split('\0')
      .filter(Boolean)
      .map((record) => {
        const tab = record.indexOf('\t')
        const [, worktree] = record.slice(0, tab).trim().split(/\s+/)
        return [record.slice(tab + 1), worktree] as const
      }),
  )
}

/**
 * Read only what the signature check needs before committing to the whole file.
 *
 * The tracked tree is ~80MB and all but ~3MB of that is images and fonts this
 * guard has no business reading. Probing 16 bytes first keeps the scan off them.
 */
function scanTree(): {
  scanned: string[]
  skipped: Map<string, BinarySignature>
  failures: string[]
} {
  const scanned: string[] = []
  const skipped = new Map<string, BinarySignature>()
  const failures: string[] = []

  for (const path of trackedFiles()) {
    const absolute = join(process.cwd(), path)
    if (statSync(absolute).size === 0) {
      scanned.push(path)
      continue
    }

    const probe = Buffer.alloc(SIGNATURE_PROBE_BYTES)
    const fd = openSync(absolute, 'r')
    let read: number
    try {
      read = readSync(fd, probe, 0, SIGNATURE_PROBE_BYTES, 0)
    } finally {
      closeSync(fd)
    }

    const signature = binarySignatureOf(probe.subarray(0, read))
    if (signature) {
      skipped.set(path, signature)
      continue
    }

    scanned.push(path)
    for (const finding of findControlBytes(readFileSync(absolute))) {
      failures.push(describeFinding(path, finding))
    }
  }

  return { scanned, skipped, failures }
}

const tree = scanTree()

describe('raw control bytes in tracked files', () => {
  it('finds no raw C0 byte outside tab, LF and CR in any tracked text file', () => {
    // THE ONE THAT MATTERS. Everything else here grades the instrument.
    expect(
      tree.failures,
      'A raw control byte in a tracked text file is how a file stops being reviewable without ' +
        'anybody choosing it: a NUL in the first 8000 bytes makes git render the whole file as ' +
        '"Binary files … differ" in every diff view, with a "-  -" line count and no content, ' +
        'and a 0x08 silently eats the character before it in anything that reads the file as ' +
        'text. These almost never get TYPED — they arrive through the authoring path, when ' +
        'prose or source quoting a regex or an escape loses a backslash on the way to disk. ' +
        'Write the escape instead (\\u0000, \\x1b); the string value is identical and the file ' +
        'stays readable. If the file is a genuine binary, it is not one this guard knows: add ' +
        'its format signature to BINARY_SIGNATURES in tests/guards/control-bytes.ts rather than ' +
        'excluding the path.',
    ).toEqual([])
  })

  it('agrees with git about which tracked files are binary', () => {
    // ASSERT THE ANSWER, NOT A PROXY (§2d). The byte scan above is a model of
    // the consequence; this is the consequence, in git's own words, on the
    // blobs git actually stores. The two sets disagreeing means one of:
    //
    //   - a file this guard scanned as text has become binary to git — the
    //     defect, and the byte scan above should already have named it;
    //   - a file skipped by signature is text to git — a stub, a truncated
    //     asset, or a .gitattributes entry doing something surprising.
    //
    // Note this ran red on `lib/services/acquisition.ts` before that file was
    // escaped, and the byte scan did too — two instruments, one defect, which
    // is what makes a green result here worth something.
    const verdicts = gitTextVerdicts()
    const gitCallsBinary = new Set(
      Array.from(verdicts)
        .filter(([, eol]) => eol === 'w/-text')
        .map(([path]) => path),
    )

    expect(
      tree.scanned.filter((f) => gitCallsBinary.has(f)).sort(),
      'git classifies these files as binary, so they render as "Binary files … differ" with no ' +
        'content in every diff view — but this guard read them as text and found nothing to ' +
        'report. Either the byte scan missed something or a .gitattributes entry is marking a ' +
        'reviewable file -text.',
    ).toEqual([])

    expect(
      Array.from(tree.skipped.keys())
        .filter((f) => !gitCallsBinary.has(f))
        .sort(),
      'these files open with a binary format signature, so this guard skipped them — but git ' +
        'reads them as text, which means they are probably not the thing their header claims',
    ).toEqual([])
  })

  it('skips a file only when its extension matches the signature it opens with', () => {
    // THE EXCLUSION IS DERIVED, AND THIS IS WHAT KEEPS IT HONEST. Nothing here
    // reads a path to decide whether to scan — a file is skipped because its
    // first bytes say PNG, not because it lives in public/. The failure mode
    // that derivation opens is the mirror image: a file with a binary header
    // and a source extension would be skipped in silence, which is precisely
    // the hiding place a path list would have been.
    const mismatched = Array.from(tree.skipped)
      .filter(([path, sig]) => !sig.extensions.includes(extname(path).toLowerCase()))
      .map(([path, sig]) => `${path} opens with a ${sig.name} header`)
      .sort()

    expect(
      mismatched,
      'a tracked file whose content and extension disagree about what it is. This guard skipped ' +
        'it on the strength of its header, so nothing is reading its bytes.',
    ).toEqual([])

    // The instrument check the shared-pending guard taught us to write: a
    // detector that stops matching reports CLEAN forever. The tree has ~138
    // real binaries; a skip set that collapses to nothing means the signature
    // reader broke, not that the images left.
    expect(tree.skipped.size).toBeGreaterThan(100)
    expect(tree.scanned.length).toBeGreaterThan(2000)
  })
})

describe('the control-byte scanner', () => {
  const text = (s: string) => Buffer.from(s, 'utf8')

  it('reports a NUL past byte 8000, which git still diffs as text', () => {
    // THE MUTATION §2d ASKS FOR, and the reason this guard does not re-derive
    // git's 8000-byte window. `lib/services/acquisition.ts` carried its NULs at
    // 8750, 8799 and 9223 and diffed as text — a byte-offset accident, not a
    // different convention, and one added comment paragraph from flipping.
    const buf = text(`${'// filler\n'.repeat(1000)}const k = \`a\u0000b\``)
    expect(buf.length).toBeGreaterThan(GIT_BINARY_SNIFF_WINDOW)

    const found = findControlBytes(buf)
    expect(found).toHaveLength(1)
    expect(found[0].byte).toBe(0x00)
    expect(found[0].withinGitSniffWindow).toBe(false)
    expect(describeFinding('lib/services/acquisition.ts', found[0])).toContain(
      'still diffs this file as text',
    )
  })

  it('reports a NUL inside the sniff window as one git already renders as binary', () => {
    const found = findControlBytes(text('const k = `a\u0000b`\n'))
    expect(found).toHaveLength(1)
    expect(found[0].withinGitSniffWindow).toBe(true)
    expect(describeFinding('x.ts', found[0])).toContain('already renders this file as binary')
  })

  it('reports a raw backspace, which git does not call binary at all', () => {
    // The docs reproduction: `\b` in prose arriving at disk as a real 0x08.
    // Nothing in git objects — the file is still text — and the sentence has
    // quietly lost a character in every reader.
    const found = findControlBytes(text('a word boundary is not \u0008 here\n'))
    expect(found.map((f) => f.byte)).toEqual([0x08])
    expect(describeFinding('docs/RELEASE.md', found[0])).toContain('\\u0008')
  })

  it('reports a raw escape, the spelling a colour-code regex loses its backslash to', () => {
    const found = findControlBytes(text("s.replace(/\x1b\\[[0-9;]*m/g, '')\n"))
    expect(found.map((f) => f.byte)).toEqual([0x1b])
  })

  it('accepts tab, LF and CR', () => {
    expect(findControlBytes(text('a\tb\r\nc\n'))).toEqual([])
    expect(isForbiddenControlByte(0x09)).toBe(false)
    expect(isForbiddenControlByte(0x0a)).toBe(false)
    expect(isForbiddenControlByte(0x0d)).toBe(false)
    expect(isForbiddenControlByte(0x00)).toBe(true)
    expect(isForbiddenControlByte(0x1f)).toBe(true)
    // Outside C0, and deliberately not banned — see the module header.
    expect(isForbiddenControlByte(0x7f)).toBe(false)
  })

  it('counts lines by LF and columns in bytes, so the report points at the character', () => {
    const found = findControlBytes(text('one\ntwo\nth\u0000ee\n'))
    expect(found).toHaveLength(1)
    expect(found[0].line).toBe(3)
    expect(found[0].column).toBe(3)
    expect(describeFinding('a/b.ts', found[0])).toContain('a/b.ts:3:3')
  })

  it('reports every offending byte in a file, not the first', () => {
    // `acquisition.ts` had three. A guard that stops at one turns a fix into
    // three round trips through CI.
    expect(findControlBytes(text('a\u0000b\u0000c\u0008d')).map((f) => f.offset)).toEqual([1, 3, 5])
  })
})

describe('the binary-signature exclusion', () => {
  const withHeader = (bytes: number[], length = 64) =>
    Buffer.concat([Buffer.from(bytes), Buffer.alloc(length)])

  it('skips a PNG, a WOFF2 and an ICO — whose own header opens with two NULs', () => {
    expect(binarySignatureOf(withHeader([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.name).toBe('PNG')
    expect(binarySignatureOf(withHeader([0x77, 0x4f, 0x46, 0x32]))?.name).toBe('WOFF2')
    expect(binarySignatureOf(withHeader([0x00, 0x00, 0x01, 0x00]))?.name).toBe('ICO')
  })

  it('reads the signature anchored at byte zero, so a file that merely mentions PNG is scanned', () => {
    // A path list cannot be talked into skipping a source file; a CONTENT rule
    // can, if it searches instead of anchoring. `binarySignatureOf` matches at
    // offset 0 only (plus one fixed inner offset for RIFF containers), so no
    // arrangement of a comment gets a TypeScript file excluded.
    const source = Buffer.from("// renders \x89PNG\r\n\x1a\n thumbnails\nconst k = 'a\x00b'\n", 'binary')
    expect(binarySignatureOf(source)).toBeNull()
    expect(findControlBytes(source).map((f) => f.byte)).toContain(0x00)
  })

  it('does not treat a truncated header as its format', () => {
    expect(binarySignatureOf(Buffer.from([0x89, 0x50]))).toBeNull()
    expect(binarySignatureOf(Buffer.alloc(0))).toBeNull()
  })

  it('requires the inner marker on a container format', () => {
    // A bare RIFF is a WAV, an AVI or nothing; only RIFF....WEBP is a WebP.
    const riff = Buffer.concat([Buffer.from('RIFF....', 'ascii'), Buffer.alloc(32)])
    expect(binarySignatureOf(riff)).toBeNull()
    expect(
      binarySignatureOf(Buffer.concat([Buffer.from('RIFF....WEBP', 'ascii'), Buffer.alloc(32)]))?.name,
    ).toBe('WebP')
  })

  it('needs no more than SIGNATURE_PROBE_BYTES to decide', () => {
    // The tree walk reads exactly this many bytes before committing to a file,
    // so a signature that reached further would be silently unmatchable.
    const longest = Math.max(
      ...BINARY_SIGNATURES.map((s) => Math.max(s.magic.length, s.at ? s.at[0] + s.at[1].length : 0)),
    )
    expect(longest).toBeLessThanOrEqual(SIGNATURE_PROBE_BYTES)
  })

  it('claims no extension twice, so a skip has one explanation', () => {
    const seen = BINARY_SIGNATURES.flatMap((s) => s.extensions)
    expect(seen).toEqual(Array.from(new Set(seen)))
  })
})
