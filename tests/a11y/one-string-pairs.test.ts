import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  describeFinding,
  eachClassString,
  gradeClasses,
  gradeSameStringPair,
  gradeToneFillClasses,
  isParitySubject,
  sameStringPairSites,
  scanForOffRegistryToneFills,
  scanForParityFailures,
  scanForUngradedStringPairs,
  quotedChunks,
  readChunks,
  scanForWhiteOnShallowBrand,
  UI_ROOTS,
  uiSourceFiles,
} from './class-pairs'
import { AA, contrast, DARK, LIGHT, ROOT, token, utilityColor } from './palette'

/**
 * THE ONE-STRING PAIR GUARD — rule 7.
 *
 * `./class-pairs.ts` carries the defect shape, the three ways a pair got past
 * rules 1–6, and how this rule partitions with the ones around it rather than
 * joining them on a line. This file is the gate, its red run, and the proof
 * that the partition actually holds over the real tree.
 *
 * IT HOLDS AT ZERO, for the reason `dark-mode-parity.test.ts` states at
 * length and one of its own. `e2e/axe-baseline.ts` is `{}` now, so a ceiling
 * here would be the only inventory of contrast debt in the repo — and this is
 * the shape that spent the whole program invisible precisely because three
 * separate rules each believed somebody else had it. A number here would be
 * room in the room nothing else can see into.
 *
 * THE POPULATION IT LANDED ON: **29 sites across 19 files**, every one fixed
 * in the same batch (DREAMCRM-88, UI batch 68). Batch 64 measured this
 * population from outside and predicted 28 in `docs/UI-BEST-VERSION.md`; the
 * one it missed is the alpha-bail shape, which it had filed under an existing
 * heading rather than as its own gap.
 *
 * THAT NUMBER IS THE INSTRUMENT'S, NOT ANYBODY'S MEMORY OF IT — and it is
 * written here once for that reason. The first draft of this batch carried
 * FOUR counts across four files and two of them disagreed (Forge's read of
 * #655), which is §2b's own "a number in a header is prose, and the header is
 * what the next author trusts instead of reading the body". It was settled by
 * replaying `scanForUngradedStringPairs` against the pre-sweep tree
 * (`git archive <parent> app components lib` into a scratch root, then scan
 * that root) rather than by picking one of the four. Zero here is a measured
 * state of the tree, not an aspiration; 29/19 is the count that measurement
 * returned.
 */

/* ── the shared chunk reader ─────────────────────────────────────────────── */

/**
 * `quotedChunks` decides what every rule in `class-pairs.ts` — and
 * `dimmed-text.test.ts` — is even able to look at, so its own red run lives
 * here rather than being assumed from the rules that sit on top of it.
 *
 * It was widened on DREAMCRM-88 after Sentinel's review of #656: the regex it
 * replaces could not span a template literal carrying an interpolation with a
 * quote in it, so 10,021 chunks were never read and batch 69's sweep missed
 * five sites for a purely syntactic reason. The two things worth pinning are
 * that it now SEES the shape, and that widening it LOST nothing.
 *
 * WHY THIS GRADES BOTH LINE ENDINGS RATHER THAN THE GIT-NORMALISED BLOB, since
 * the blob is the obvious answer and it is the wrong one. Reading the blob
 * would make this assertion correct on the platform CI happens to use;
 * grading both renderings makes it platform-INDEPENDENT, which is the property
 * that was actually missing when the chop shipped green on Windows and red on
 * Linux — and pinning to the blob would re-create that failure in mirror
 * image, with a Windows contributor's guard no longer describing the tree in
 * their own editor. The cost is nil: across 277,358 lines there is not one
 * line where a rule's verdict differs between the two renderings (measured
 * independently by Sentinel and re-derived here before this was written).
 */
describe('the shared chunk reader', () => {
  /** The reader this replaced, verbatim — backreference included. A copy of a
   *  regex is where the escaping goes wrong, and a copy that has quietly
   *  stopped matching would make the additive assertion below pass on nothing;
   *  the self-check right after it is what stops that. (It went wrong once
   *  while this very test was being written: the backreference arrived as a
   *  literal control byte.) */
  const OLD = (line: string): string[] => line.match(/(["'`])[^"'`]*\1/g) ?? []

  it('the OLD reader here still behaves like the one it replaced', () => {
    expect(OLD(`<a className="p-2" title='x'>`)).toEqual(['"p-2"', "'x'"])
    // The defining miss: a template whose interpolation carries a quote.
    expect(OLD("`a text-gray-400 ${x ? '' : 'b'}`")).toEqual(["''", "'b'"])
  })

  it('reads the static text of a template literal the old regex could not span', () => {
    // The real line from `balance-outreach-card.tsx`, which is four lines below
    // a plain-string sibling that batch 69 DID sweep.
    const line = "className={`mt-2 text-xs leading-relaxed text-gray-400 ${s.enabled ? '' : 'opacity-50'}`}"

    expect(OLD(line).some((c) => c.includes('text-gray-400'))).toBe(false)
    expect(quotedChunks(line).some((c) => c.includes('text-gray-400'))).toBe(true)
  })

  it('still yields each ternary branch as its own chunk, and never joins one to the prefix', () => {
    // Rule 1's conditional-form red run depends on the branches being separate
    // chunks, and the do-not-join rule depends on them never being merged with
    // the static text. Both survive the widening.
    const chunks = quotedChunks(
      "className={`inline-flex ${active ? 'bg-teal-500 text-white' : 'text-gray-600'}`}",
    )

    expect(chunks).toContain('bg-teal-500 text-white')
    expect(chunks).toContain('text-gray-600')
    expect(chunks.some((c) => c.includes('inline-flex') && c.includes('bg-teal-500'))).toBe(false)
  })

  it('replaces an interpolation with a SPACE so two tokens cannot fuse', () => {
    // `text-gray-${n}00` must not become the colour word `text-gray-400`'s
    // neighbour by accident — an invented utility is a false positive.
    expect(quotedChunks('className={`text-gray-${n}00 p-2`}')).toEqual(['text-gray- 00 p-2'])
  })

  it('does not run a plain string past a stray apostrophe into the next quote', () => {
    // JSX prose is full of apostrophes. A reader that paired this `'` with the
    // NEXT quote would invent a chunk spanning two unrelated strings — and
    // pair an ink in one with a surface in the other. The old regex refused
    // this and so does the new one.
    const line = `<p title="don't" className="bg-white">{x}</p>`
    expect(quotedChunks(line).some((c) => c.includes('don') && c.includes('bg-white'))).toBe(false)
  })

  it('loses nothing when a template runs off the end of the line', () => {
    // THE ONE THAT SHIPPED RED. `components/dropdown-help.tsx` opens a template
    // and an interpolation on one line and closes both on the next, so the
    // inner string is the last thing on line one. The first version of the
    // reader sliced `end - 1` to drop the `}` and — with no `}` on the line —
    // dropped the string's closing quote instead, losing both colour tokens.
    //
    // IT PASSED ON WINDOWS AND FAILED ON LINUX. A CRLF working tree leaves a
    // `\r` at the end of every line, so the chop ate the `\r` and the quote
    // survived; the tree-wide assertion below is per-platform because the
    // SOURCE is. This case is spelled out with an explicit LF so it fails on
    // either, rather than relying on whoever runs it next being on Linux.
    const line =
      "className={`w-8 h-8 rounded-full ${open && 'bg-gray-200 dark:bg-gray-800'"
    const chunks = quotedChunks(line)

    expect(chunks).toContain('bg-gray-200 dark:bg-gray-800')
    expect(quotedChunks(`${line}\r`)).toContain('bg-gray-200 dark:bg-gray-800')
  })

  it('treats an escaped backtick as one token rather than a template opener', () => {
    // The statics pass keeps the RAW two characters of an escape, so without a
    // top-level escape skip an escaped backtick re-entered the template branch
    // on the rescan — the "one level deep by construction" the comment claimed
    // and the code did not do. (Sentinel, reviewing #657.) Nothing was ever
    // lost by it; the point is that the claim now holds.
    const chunks = quotedChunks('const t = `a \\` bg-gray-100 text-gray-400`')

    expect(chunks.some((c) => c.includes('bg-gray-100') && c.includes('text-gray-400'))).toBe(true)
    expect(chunks.filter((c) => c.includes('bg-gray-100'))).toHaveLength(1)
  })

  it('terminates on an unclosed interpolation inside a nested literal', () => {
    // `skipLiteral` walks into an interpolation too, and an unterminated one
    // there used to hand it `-1` — which is not a miss, it is `j = -1` and the
    // whole string walked again from zero. A hang, in a guard that runs over
    // 277,000 lines. Sentinel confirmed it from outside: with the guard
    // removed this input never returns (killed at 90s); with it, 0 ms.
    //
    // ASSERTED ON THE RETURN VALUE, NOT ON `not.toThrow()`. The failure mode
    // is non-termination, and `not.toThrow()` does catch that — but only via
    // the 20 s `testTimeout`, so it would fail with a timeout while claiming
    // to be about exceptions. A test should fail for the reason it names.
    expect(quotedChunks('const a = `x ${ `y ${')).toEqual([])
    expect(quotedChunks("`${'")).toEqual([])
  })

  it('handles a nested template inside an interpolation without losing the outer statics', () => {
    const line = "className={`p-2 ${on ? `bg-white ${k}` : ''} text-gray-400`}"
    const chunks = quotedChunks(line)

    expect(chunks.some((c) => c.includes('p-2') && c.includes('text-gray-400'))).toBe(true)
    expect(chunks.some((c) => c.includes('bg-white'))).toBe(true)
  })

  it('LOSES NO CLASS TOKEN the old reader could see, across the real tree', () => {
    // THE ASSERTION THAT MAKES THIS SAFE TO LAND. A field-of-view change can
    // trade one blind spot for another, and an absence assertion downstream
    // cannot tell the difference — a green `scanForUngradedStringPairs` reads
    // identically whether the tree is clean or the reader has gone blind.
    //
    // NOT "the chunk sets are equal", and the first draft of this test made
    // that mistake. The old regex matched a template with no quotes inside it
    // WHOLE, interpolation text included (`` `/patients/${input.patientId}` ``);
    // the new reader blanks each `${…}` to a space, so those two chunks differ
    // as strings while carrying exactly the same class tokens. The property
    // that matters to a contrast scanner is the TOKENS, so that is what this
    // asserts: every Tailwind-shaped token the old reader could see on a line
    // is still visible somewhere in that line's chunks.
    //
    // Run over the tree rather than over planted strings, because the shapes
    // that break a parser are the ones nobody thinks to plant.
    //
    // "Token" here means one a RULE can read — an ink, a surface, a gradient
    // stop, a dimming, a type scale — and not any lowercase word. That
    // narrowing is not convenience: the old regex swallowed a whole template
    // including its interpolation SOURCE, so `${typeof x}` handed it the token
    // `typeof`, and the new reader blanks that. Losing a JavaScript identifier
    // is the point of the change; losing `text-gray-400` would be the bug.
    const GRADEABLE =
      /^(?:[a-z-]+:)*(?:(?:text|bg|from|via|to|opacity)-[\w./[\]%-]+|tabular-nums|font-mono-num)$/
    const tokens = (chunk: string): string[] =>
      chunk.split(/\s+/).filter((t) => t && !t.includes('${') && GRADEABLE.test(t))

    // THE FILE LIST COMES FROM THE WALK, NOT FROM THE READER. Deriving it from
    // `eachClassString` — as the first version did — only names files that
    // yield at least one chunk under the NEW reader, so a file it went
    // completely blind on would be skipped rather than reported. The `> 1000`
    // floor catches a catastrophic version of that; it would not catch one
    // file. (Sentinel, reviewing #657.)
    const files = uiSourceFiles()

    // AND BOTH LINE ENDINGS, ON EVERY PLATFORM. This assertion reads the
    // working tree, and a Windows checkout is CRLF while CI is LF — so the two
    // read a different string per line and can disagree about a parser bug.
    // They did: the unterminated-interpolation defect above was invisible here
    // on Windows for exactly that reason and only showed up on CI. Grading the
    // LF form as well means a Windows run now exercises what CI will see.
    const lost: string[] = []
    let lines = 0
    for (const file of files) {
      const src = readFileSync(join(ROOT, file), 'utf8')
      for (const raw of src.split('\n')) {
        lines++
        // NORMALISE, THEN GRADE BOTH — unconditionally, rather than branching
        // on what the checkout happens to hold. The first version read
        // `raw.endsWith('\r') ? [raw, raw.slice(0, -1)] : [raw]`, which grades
        // both endings on a CRLF tree and only ONE on an LF tree — so the
        // sentence "exercises both line endings on every platform" was true
        // here and half-true on CI, which is the same over-claiming shape as
        // the `by construction` comment two rounds ago. (Sentinel, reviewing
        // #657 at f0879741.) Measured on this checkout: 276,016 CRLF lines and
        // 1,342 bare LF — exactly one per file, i.e. the trailing empty split.
        // There is effectively no LF content line here at all, so on Windows
        // the old form was the only thing standing between this assertion and
        // the platform it could not see.
        const lf = raw.endsWith('\r') ? raw.slice(0, -1) : raw
        for (const line of [lf, `${lf}\r`]) {
          const before = Array.from(new Set(OLD(line).flatMap((c) => tokens(c.slice(1, -1)))))
          if (before.length === 0) continue
          const after = new Set(quotedChunks(line).flatMap(tokens))
          for (const t of before) if (!after.has(t)) lost.push(`${file}: ${t}`)
        }
      }
    }

    expect(files.length, 'the walk must actually be visiting files').toBeGreaterThan(1000)
    expect(lines, 'and reading their lines').toBeGreaterThan(100_000)
    expect(lost.slice(0, 20), 'class tokens the old reader saw and the new one does not').toEqual([])
  })
})


/* ── the tree walk feeds the reader until the reader is done ─────────────── */

/**
 * THE MULTI-LINE WIDENING (DREAMCRM-107, punch-list item 3).
 *
 * The residual #657 left behind and named: a template literal broken across
 * source lines was invisible, because `eachClassString` split a file on
 * newlines and handed the scanner one line at a time. The opening line never
 * closed, so its static text was dropped; the continuation lines carried no
 * quote to find. 22 lines in the tree carried a colour utility no chunk
 * contained, `welcome-interview.tsx:579` among them — a full rule 7 subject,
 * ungraded for a purely syntactic reason.
 *
 * `readChunks` is the whole mechanism: the same scan, plus whether it ended
 * inside an open template. The caller keeps appending lines until it is
 * closed. The reader itself did not change, which is why the per-line
 * assertions above are untouched and still exercise exactly the code the tree
 * walk runs.
 *
 * FOUR THINGS ARE ASSERTED HERE, and they are four different questions:
 *
 *   1. `readChunks` answers `open` correctly, both directions.
 *   2. The joined walk reads a multi-line template that the per-line walk did
 *      not — the field of view really widened.
 *   3. Over the REAL TREE, the widening loses no colour utility the per-line
 *      walk could see. Additive, measured, not by construction.
 *   4. Over the REAL TREE, no colour utility in any source line is left with
 *      no chunk carrying it. **This is the one that is not a comparison
 *      against the predecessor** — §2d's rule that an additive lock can never
 *      measure what neither instrument sees, so to measure what an instrument
 *      cannot see you compare it against the SOURCE. It is also the assertion
 *      that fails if anybody ever puts the per-line caller back.
 */
describe('the tree walk feeds the reader until the reader is done', () => {
  /**
   * A colour utility as the RULES define one — a ramp step, `white` or
   * `black`. Deliberately not "any lowercase word with a dash": `to-do`,
   * `text-only` and `bg-soft` are English and appear in this tree's prose, and
   * counting them would report a residual the graders never had.
   *
   * A COPY OF A PATTERN OWES A SELF-CHECK (§2d, and this file's own header
   * about the OLD regex arriving with a mangled backreference). The first test
   * below is that self-check; without it, a pattern that had quietly stopped
   * matching would make assertions 3 and 4 pass over nothing at all.
   */
  const COLOUR_UTILITY =
    /(?:^|[\s'"`{(])((?:[a-z-]+:)*(?:text|bg|from|via|to)-(?:[a-z]+-\d{2,3}|white|black))(?![\w-])/g
  const colourUtilities = (text: string): string[] =>
    Array.from(text.matchAll(COLOUR_UTILITY)).map((m) => m[1])

  /** The caller as it was before this change, verbatim, to measure against. */
  function eachClassStringPerLine(visit: (file: string, chunk: string) => void): void {
    for (const file of uiSourceFiles()) {
      readFileSync(join(ROOT, file), 'utf8')
        .split('\n')
        .forEach((line) => {
          for (const chunk of quotedChunks(line)) visit(file, chunk)
        })
    }
  }

  it('the colour-utility pattern this file grades WITH still matches, and still discriminates', () => {
    expect(colourUtilities('rounded bg-stone-800 dark:text-white p-2')).toEqual([
      'bg-stone-800',
      'dark:text-white',
    ])
    expect(colourUtilities('`hover:bg-teal-600`')).toEqual(['hover:bg-teal-600'])
    // The English this tree actually contains. A pattern that matched these
    // would report a residual of prose forever and be switched off.
    expect(colourUtilities('three to-dos and a text-only fallback, bg-soft')).toEqual([])
    expect(colourUtilities('bg-[var(--c-brand)] text-[13px]')).toEqual([])
  })

  it('reports whether the text ran out inside an open template', () => {
    expect(readChunks("className={`p-2 text-gray-400`}").open).toBe(false)
    expect(readChunks("className={`p-2 text-gray-400").open).toBe(true)
    // An interpolation that does not close leaves the template open too.
    expect(readChunks("className={`p-2 ${on && 'bg-white'").open).toBe(true)
    // AND THE ASYMMETRY THAT MAKES JOINING SAFE. An unpartnered quote opens
    // nothing — the scanner steps over it rather than running to the next
    // quote — so a line of JSX prose can never start swallowing the file.
    expect(readChunks(`<p>it's fine</p>`).open).toBe(false)
    expect(readChunks(`const s = "unterminated`).open).toBe(false)
  })

  it('reads a template broken across lines that the per-line walk could not', () => {
    // The `welcome-interview.tsx:579` shape, split the way the real file does.
    const source = [
      'const cls = `max-w-[85%] rounded-2xl',
      "  bg-stone-800 dark:bg-stone-200 px-4 py-2.5",
      '  text-sm text-white dark:text-stone-900`',
    ]
    const perLine = source.flatMap((l) => quotedChunks(l))
    expect(
      perLine.some((c) => c.includes('bg-stone-800')),
      'the per-line reader must NOT see this, or the test below proves nothing',
    ).toBe(false)

    const joined = quotedChunks(source.join('\n'))
    const whole = joined.find((c) => c.includes('bg-stone-800'))
    expect(whole, 'the joined text must yield the template statics as one chunk').toBeDefined()
    // ONE chunk carrying BOTH halves, which is what makes it rule 7's subject
    // rather than two unrelated fragments.
    expect(whole).toContain('dark:bg-stone-200')
    expect(whole).toContain('text-white')
    expect(whole).toContain('dark:text-stone-900')
  })

  it('grades THE named residual site, at the line its template opens on', () => {
    // `welcome-interview.tsx:579` is the one the punch list named — rule 7's
    // both-halves-overridden subject, the auth-button shape, sitting ungraded
    // for a purely syntactic reason. It is the whole point of this change, so
    // it is asserted by name rather than left to a tree-wide count.
    //
    // KEYED ON BOTH HALVES TOGETHER. The same file writes
    // `bg-stone-800 dark:bg-stone-200` on a single line elsewhere (a progress
    // bar at 284), so matching the surface pair alone would pass with this
    // site still unread. Rule 7's subject is an ink AND a surface in ONE
    // string, and that is the chunk this has to find.
    const found: { line: number; chunk: string }[] = []
    eachClassString(['app'], (file, line, chunk) => {
      if (!file.endsWith('welcome/welcome-interview.tsx')) return
      if (chunk.includes('dark:bg-stone-200') && chunk.includes('dark:text-stone-900')) {
        found.push({ line, chunk })
      }
    })

    expect(found, 'the named residual site must yield exactly one chunk').toHaveLength(1)
    // The line the TEMPLATE opens on — where a reader following a `file:line`
    // in a red CI log would look, and where the class string really starts.
    expect(found[0].line).toBe(579)
    expect(found[0].chunk).toContain('rounded-tr-sm')
    // And it reads: this residual was always predicted to be clean, and
    // grading it is a different fact from having predicted it.
    expect(gradeSameStringPair(found[0].chunk)).toBeNull()
  })

  it('LOSES NO COLOUR UTILITY the per-line walk could see, across the real tree', () => {
    // THE ADDITIVE LOCK, at the CALLER this time. The one above it is about
    // `quotedChunks` over a line; this is about what the tree walk delivers,
    // and they are different instruments — a caller change can lose a chunk
    // without the reader losing a thing.
    //
    // MEASURED: the join drops 115 chunks the per-line walk produced and NOT
    // ONE of them carries a colour utility. They are interpolation SOURCE
    // (`${BRAND.blueLight}` and friends) that leaked as chunks only because
    // the template around them never closed on the line. Losing a JavaScript
    // expression is the point of the change.
    const per = new Map<string, string[]>()
    eachClassStringPerLine((file, chunk) => {
      const have = per.get(file) ?? []
      have.push(...colourUtilities(chunk))
      per.set(file, have)
    })

    const now = new Map<string, Set<string>>()
    eachClassString(UI_ROOTS, (file, _line, chunk) => {
      let have = now.get(file)
      if (!have) now.set(file, (have = new Set()))
      for (const t of colourUtilities(chunk)) have.add(t)
    })

    const lost: string[] = []
    let counted = 0
    // `Array.from` rather than iterating the Map: this tsconfig targets below
    // es2015 and refuses a bare `for...of` over one, the same reason
    // `foldHeadroom` spells it out in e2e/axe-headroom.ts.
    for (const [file, tokens] of Array.from(per)) {
      for (const t of tokens) {
        counted++
        if (!now.get(file)?.has(t)) lost.push(`${file}: ${t}`)
      }
    }

    expect(counted, 'the per-line walk must actually be finding colour utilities').toBeGreaterThan(
      10_000,
    )
    expect(lost.slice(0, 20), 'colour utilities the per-line walk saw and the joined one does not').toEqual(
      [],
    )
  })

  it('leaves NO colour utility in the tree with no chunk carrying it', () => {
    // THE RESIDUAL, ASSERTED RATHER THAN CARRIED. §2d: an additive lock
    // compares the new instrument against the old one, so anything BOTH are
    // blind to is invisible to it by construction — to measure what an
    // instrument cannot see you compare it against the SOURCE.
    //
    // That is exactly how the per-line hole was found and it is what this
    // assertion now closes: **35 colour utilities across 22 lines** had no
    // chunk containing them before this change, and zero do after.
    //
    // WHAT IT CLAIMS, precisely, because the scope is the honest part: for
    // every FILE, every colour utility appearing anywhere in its text appears
    // in some chunk of that file. It does not claim the chunk came from the
    // same LINE — a token inside a multi-line template is attributed to the
    // template's opening line, so a per-line form of this would be false by
    // design rather than by defect. A colour utility written only inside a
    // comment is covered when the same utility is used elsewhere in the file
    // and would be reported here otherwise; today the tree has none.
    const inChunks = new Map<string, Set<string>>()
    eachClassString(UI_ROOTS, (file, _line, chunk) => {
      let have = inChunks.get(file)
      if (!have) inChunks.set(file, (have = new Set()))
      for (const t of colourUtilities(chunk)) have.add(t)
    })

    const unread: string[] = []
    let scanned = 0
    for (const file of uiSourceFiles()) {
      const have = inChunks.get(file) ?? new Set<string>()
      readFileSync(join(ROOT, file), 'utf8')
        .split('\n')
        .forEach((raw, i) => {
          // Both renderings, on every platform — the same reason the per-line
          // lock grades LF and CRLF: a Windows checkout and the Ubuntu runner
          // read a different string per line, and only one of them gates a
          // merge.
          const lf = raw.endsWith('\r') ? raw.slice(0, -1) : raw
          for (const t of Array.from(
            new Set([...colourUtilities(lf), ...colourUtilities(`${lf}\r`)]),
          )) {
            scanned++
            if (!have.has(t)) unread.push(`${file}:${i + 1} ${t}`)
          }
        })
    }

    expect(scanned, 'the source scan must actually be finding colour utilities').toBeGreaterThan(
      10_000,
    )
    expect(
      unread.slice(0, 20),
      'colour utilities written in the tree that NO chunk carries — every rule in class-pairs.ts ' +
        'and dimmed-text.ts is structurally blind to these, whatever their scan returns',
    ).toEqual([])
  })
})

/* ── the red run, kept permanently ───────────────────────────────────────── */

/**
 * A guard that has never failed has never been tested. The planted defects
 * below are one per way this scanner could be wrong, and the first three are
 * the three real gaps rather than variations on one:
 *
 *   1. BOTH halves overridden — the seven auth buttons, 4.01 in dark, the
 *      batch-58 defect surviving in the shape rule 1 treats as deliberate;
 *   2. NEITHER half overridden — an off-registry ramp on an off-registry wash,
 *      which `token-contrast` never sees because the design system does not
 *      declare it;
 *   3. exactly one half overridden BUT the override is a WASH — rule 1 bails
 *      on the whole chunk, taking a fully opaque, fully determined light
 *      rendering down with it;
 *   4. the CONDITIONAL form, because the last source guard in this repo whose
 *      red run passed (batch 57) matched only the literal spelling;
 *   5. a light side that passes and a dark side that does not, and
 *   6. the reverse, so the rule cannot degenerate into a one-theme checker.
 */
describe('the guard can actually fail', () => {
  it('reports BOTH halves overridden — the auth button, verbatim', () => {
    // As it sat on main on every sign-in, reset-password and accept-invite
    // screen. Rule 1 declined it by design ("a pair somebody chose"); nobody
    // had measured the pair they chose. White on teal-600 is 5.09 and fine;
    // near-black on teal-500 is 4.01, which is the batch-58 number.
    const found = gradeSameStringPair(
      '"btn w-full bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-500 dark:text-gray-900"',
    )

    expect(found, 'the shape this rule was written for must be reported').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['dark'])
    expect(found!.failures[0].ratio).toBeCloseTo(4.01, 2)
  })

  it('reports NEITHER half overridden — a pair with no dark: anywhere', () => {
    // The public intake form's error line. `red` was never a v3 tone ramp, so
    // nothing in `TONE_PILL` or `TONE_FILL` declares this pairing and
    // `token-contrast` has no opinion about it. Both renderings are the same
    // two words, and both miss: the ramps are not re-tinted per theme, so the
    // defect renders identically in light and dark rather than only in one.
    const found = gradeSameStringPair('"text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg"')

    expect(found, 'a single unprefixed pairing is graded by nobody else').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['light', 'dark'])
    expect(found!.failures[0].ratio).toBeCloseTo(2.94, 2)
  })

  it('reports the opaque LIGHT rendering under an alpha dark override', () => {
    // THE THIRD GAP, and the subtle one. Exactly one half carries the
    // override, so this looks like rule 1's — but the override is a wash, and
    // rule 1 skips the whole chunk rather than the one rendering it cannot
    // resolve. The light pair is fully determined at 4.12 and was graded by
    // nothing; the dark rendering is correctly left alone here too.
    const classes = '"mb-4 text-sm text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 rounded"'

    expect(gradeClasses(classes), 'rule 1 declines this chunk entirely').toBeNull()

    const found = gradeSameStringPair(classes)
    expect(found, 'the opaque half of it is still a real pairing').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['light'])
    expect(found!.failures[0].ratio).toBeCloseTo(4.12, 2)
  })

  it('reports the CONDITIONAL form, not just the literal one', () => {
    // batch 57's source scan passed its red run while the two worst real
    // instances were live, because both were conditional. Here the pair never
    // appears as one static string: it is a ternary branch inside a template
    // literal, which is how most of this repo's conditional styling is written.
    const source =
      "className={`rounded px-2 ${muted ? 'bg-gray-200 text-gray-500' : 'bg-white text-gray-800'}`}"

    const chunks = source.match(/(["'`])[^"'`]*\1/g) ?? []
    const found = chunks.map(gradeSameStringPair).filter((f) => f !== null)

    expect(found, 'a defect inside a ternary branch must be found').toHaveLength(1)
    expect(found[0]!.failures[0].ratio).toBeCloseTo(4.34, 2)
  })

  it('reports a pair that passes in light and fails only in dark', () => {
    // The kbd chip on the prospecting copilot bar. gray-500 on gray-100 is
    // 4.63 and clears; the overridden pair underneath it is 3.92. Both halves
    // moved, so rule 1 read the element as deliberate and never measured it.
    const found = gradeSameStringPair(
      "'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'",
    )

    expect(found, 'a dark-only failure must be reported').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['dark'])
  })

  it('reports a pair that passes in dark and fails only in light', () => {
    // The other direction, so the rule cannot become a dark-mode checker. The
    // prospecting pipeline's stage numeral: gray-500 on gray-200 is 4.34 in
    // light, and the dark override lands at 6.62.
    const found = gradeSameStringPair(
      "'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300'",
    )

    expect(found, 'a light-only failure must be reported').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['light'])
  })
})

/* ── the partition, asserted rather than described ───────────────────────── */

describe('rule 7 and its neighbours partition one population', () => {
  it('declines every chunk rule 1 grades, by reading rule 1s own condition', () => {
    // `isParitySubject` IS rule 1's grading condition — not a copy of it — so
    // these two cannot drift into overlapping or into leaving a new gap. Both
    // spellings of the unpaired override, and the passing case too: rule 7
    // must decline a chunk rule 1 GRADES, not merely one rule 1 REPORTS.
    for (const classes of [
      '"rounded-full bg-teal-500 text-white dark:text-gray-900"',
      '"bg-teal-600 text-white dark:bg-teal-500"',
      '"bg-gray-100 text-gray-800 dark:bg-gray-700"',
    ]) {
      expect(isParitySubject(classes), classes).toBe(true)
      expect(gradeSameStringPair(classes), classes).toBeNull()
    }
    // And the first of those really is a live rule 1 finding, so the deferral
    // is to a rule that is looking rather than to an empty chair.
    expect(gradeClasses('"rounded-full bg-teal-500 text-white dark:text-gray-900"')).not.toBeNull()
  })

  it('leaves white on the shallow brand ramp to rule 2, in both themes', () => {
    // Rule 2 owns the brand-ramp cutoff and the one BRAND_FILL_EXEMPTIONS
    // entry — the aria-hidden RecallFunnelMock bar. Grading it here would
    // re-report a site that is deliberately pardoned one rule over.
    expect(gradeSameStringPair("'bg-teal-400 text-white'")).toBeNull()
    expect(gradeSameStringPair('"bg-teal-600 text-white dark:bg-teal-500 dark:text-white"')).toBeNull()
  })

  it('leaves the BASE pairing of a solid tone fill to rule 5 — and only that one', () => {
    // Rule 5 grades the base pairing against the TONE_FILL registry. It never
    // looks at a `dark:` override, so deferring the overridden dark rendering
    // too would hand it to nobody — the gap this whole rule exists to close.
    const offRegistry = "'bg-amber-500 text-white'"
    expect(gradeToneFillClasses(offRegistry), 'rule 5 is looking at this').not.toBeNull()
    expect(gradeSameStringPair(offRegistry)).toBeNull()

    const darkOnly = "'bg-gray-100 text-gray-800 dark:bg-amber-500 dark:text-white'"
    const found = gradeSameStringPair(darkOnly)
    expect(found, 'a tone fill declared only for dark is nobody elses').not.toBeNull()
    expect(found!.failures.map((f) => f.theme)).toEqual(['dark'])
  })

  it('cannot collide with rule 6, which needs a chunk carrying no bg- at all', () => {
    // By construction rather than by agreement: rule 6 bails on any `bg-`,
    // this one requires a base `bg-<colour>`.
    expect(gradeSameStringPair('"text-gray-400 dark:text-gray-500"')).toBeNull()
  })

  it('has no ink to pair with on a clipped-text chunk, which is rule 4s', () => {
    // `text-transparent` is not a palette word, so the ink lookup finds
    // nothing and this rule declines the shape whose whole point is that the
    // background IS the letterforms.
    expect(
      gradeSameStringPair('"bg-teal-400 bg-clip-text text-transparent font-black"'),
    ).toBeNull()
  })
})

describe('the guard does not report what it must not', () => {
  it('says nothing about a wash on either half of a rendering', () => {
    // An alpha ink or an alpha surface composites against an ancestor no
    // source scanner can resolve. Both spellings Tailwind accepts.
    expect(gradeSameStringPair('"bg-amber-500/15 text-amber-800"')).toBeNull()
    expect(gradeSameStringPair('"bg-violet-500/[0.08] text-violet-600"')).toBeNull()
    expect(gradeSameStringPair('"bg-gray-100 text-gray-400/70"')).toBeNull()
  })

  it('says nothing about a hover state, in either spelling', () => {
    // A resting pairing is what a person reads; a hover needs its own ancestor
    // context to grade honestly. `BOUNDARY` is what keeps these out — a `:`
    // before the utility is not a boundary character.
    expect(gradeSameStringPair('"bg-white text-gray-800 hover:text-gray-300"')).toBeNull()
    expect(gradeSameStringPair('"bg-white text-gray-800 dark:hover:bg-gray-100"')).toBeNull()
  })

  it('says nothing about a colour it cannot resolve', () => {
    // An arbitrary hex or a clinic-brand var is not in this repo's palette,
    // and guessing would be worse than declining.
    expect(gradeSameStringPair('"bg-[#4c7df0] text-gray-400"')).toBeNull()
    expect(gradeSameStringPair('"bg-[color:var(--c-brand)] text-gray-400"')).toBeNull()
  })

  it('says nothing about half a pair', () => {
    // Ink with no surface is rule 6's question; a surface with no ink has no
    // pairing at all. A `dark:`-only half with no base spelling is not a pair
    // either — the cascade fills the other end from somewhere unreadable here.
    expect(gradeSameStringPair('"text-gray-400"')).toBeNull()
    expect(gradeSameStringPair('"bg-gray-100"')).toBeNull()
    expect(gradeSameStringPair('"dark:bg-gray-700 dark:text-gray-400"')).toBeNull()
  })

  it('says nothing about a pair that reads', () => {
    expect(gradeSameStringPair('"bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-300"')).toBeNull()
    expect(gradeSameStringPair("'bg-rose-50 text-rose-700'")).toBeNull()
  })

  it('grades against the real palette, not a transcript of it', () => {
    // Pins the shared resolver the same way the sibling guards do, so a broken
    // cascade cannot make every assertion above pass vacuously.
    expect(contrast(utilityColor(DARK, 'gray-900')!, token(DARK, 'teal-500'))).toBeLessThan(AA)
    expect(contrast(utilityColor(LIGHT, 'rose-700')!, token(LIGHT, 'rose-50'))).toBeGreaterThanOrEqual(AA)
  })
})

/* ── the gate ────────────────────────────────────────────────────────────── */

describe('no ink and surface written together miss AA', () => {
  it('the scanner is pointed at the product, not at nothing', () => {
    // A rule narrowed until it matches nothing reports CLEAN forever, and an
    // absence assertion cannot tell that apart from a clean tree. The field of
    // view is the other half of the zero below.
    expect(UI_ROOTS).toEqual(['app', 'components', 'lib'])
    const sites = sameStringPairSites()
    expect(sites.length, 'rule 7 must still be able to see pairs at all').toBeGreaterThan(200)
  })

  it('every ink/surface pair written in one class string clears WCAG AA', () => {
    const findings = scanForUngradedStringPairs()

    expect(
      findings.map(describeFinding),
      'An element that writes its ink and its surface in the same class string ' +
        'carries both ends of its own pairing, so the pair is a fact rather than ' +
        'an estimate. Fix the colour — do not add an exemption here. ' +
        'See tests/a11y/class-pairs.ts rule 7 for the shape and the partition.',
    ).toEqual([])
  })

  it('no line in the tree is reported by this rule AND by a neighbour', () => {
    // The partition asserted over the real product rather than over six
    // planted strings. Two rules reporting one line is how a repo ends up
    // arguing about whose number is right instead of fixing a defect.
    const key = (f: { file: string; line: number }) => `${f.file}:${f.line}`
    const mine = new Set(scanForUngradedStringPairs().map(key))
    const neighbours = [
      ...scanForParityFailures(),
      ...scanForWhiteOnShallowBrand(),
      ...scanForOffRegistryToneFills(),
    ].map(key)

    expect(neighbours.filter((k) => mine.has(k))).toEqual([])
  })
})
