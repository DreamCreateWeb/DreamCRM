/**
 * ONE DEFINITION OF WHERE A `sql` TAGGED TEMPLATE ENDS.
 *
 * Two guards read drizzle `sql` templates out of source text — the repo-wide
 * `tests/guards/timestamp-aggregate-mapping.test.ts`, which asks whether an
 * aggregate over a mapped column kept its mapper, and the per-site pin in
 * `tests/journey/journey-timestamp-mapping.test.ts`, which asks WHICH column a
 * given aggregate names. They lived with separate answers to the same question
 * and the second one was wrong: a lazy `[\s\S]*?` between the opening and
 * closing backtick is unbounded, so it ran past the end of its own template and
 * settled on a later one's `.mapWith` (Sentinel's note on PR #509 — deleting
 * `countSeatedBetween`'s `.mapWith` left that pin green because the match
 * extended to the NEXT aggregate, which was still mapped). Hence one walker,
 * here, used by both.
 *
 * Hand-written rather than regexed, because these templates nest: `${}` can
 * hold parens and backticks, and the body spans lines. A regex for the closing
 * backtick is how the first version of the guard ended up only matching
 * one-liners.
 */

export interface SqlTemplate {
  /** The template including its `sql` tag — the text a scan reasons about. */
  body: string
  /** Index in the source where the `sql` tag starts. */
  start: number
  /** Index just PAST the closing backtick. */
  end: number
  /** Whether a `.mapWith(...)` immediately follows the closing backtick. */
  mapped: boolean
  /** That call's argument text (`schema.appointment.startTime`), or null. */
  mapWithArg: string | null
}

/** The argument of a `.mapWith(...)` that immediately follows, paren-matched. */
function readMapWithArg(after: string): string | null {
  const open = /^\s*\.mapWith\s*\(/.exec(after)
  if (!open) return null
  let depth = 1
  let i = open[0].length
  for (; i < after.length && depth > 0; i++) {
    if (after[i] === '(') depth++
    else if (after[i] === ')') depth--
  }
  return depth === 0 ? after.slice(open[0].length, i - 1).trim() : null
}

/** Every `sql` tagged template in a source file, in order. */
export function sqlTemplates(src: string): SqlTemplate[] {
  const out: SqlTemplate[] = []
  const tag = /\bsql\s*(?:<[^`]*?>)?\s*`/g
  for (let m = tag.exec(src); m; m = tag.exec(src)) {
    let i = m.index + m[0].length
    let depth = 0
    for (; i < src.length; i++) {
      const c = src[i]
      if (c === '\\') { i++; continue }
      if (c === '$' && src[i + 1] === '{') { depth++; i++; continue }
      if (c === '}' && depth > 0) { depth--; continue }
      if (c === '`' && depth === 0) break
    }
    const after = src.slice(i + 1)
    out.push({
      body: src.slice(m.index, i),
      start: m.index,
      end: i + 1,
      mapped: /^\s*\.mapWith\s*\(/.test(after),
      mapWithArg: readMapWithArg(after),
    })
    tag.lastIndex = i + 1
  }
  return out
}

/**
 * The object key a template was declared under (`firstBookedAt: sql`…``).
 *
 * Read BACKWARDS from the template's own start, which is what makes the pin
 * exact: a template can only belong to the declaration immediately before it.
 * Returns null for a template that is not a property value — the module-level
 * `const NOT_IMPORTED = sql`…`` predicates, for instance.
 */
export function declaredFieldOf(src: string, template: SqlTemplate): string | null {
  return /([A-Za-z_$][\w$]*)\s*:\s*$/.exec(src.slice(0, template.start))?.[1] ?? null
}
