/**
 * THE CONTENT CALENDAR (Transformation Phase 5 — the first new limb), pure
 * half.
 *
 * WHAT THIS IS NOT. It is not a calendar the clinic operates. DESIGN.md's
 * design test — "does this ask the clinic to operate something, or does it
 * do the job and report?" — rules out the obvious build: a month grid with
 * drag-and-drop slots and an empty state that says "plan your content". That
 * is a queue of raw work wearing a calendar's clothes, and a practice with
 * nobody to staff it ends the month with an empty grid and a small feeling
 * of failure.
 *
 * WHAT IT IS. The machine looks at the weeks ahead, notices the practice has
 * nothing going out, WRITES THE WHOLE PLAN, and asks one question: "here is
 * what I'd publish over the next four weeks — yes or no?" One proposal, one
 * approve, everything scheduled. The forward view that comes with it is a
 * REPORT of what is already coming, not a surface to fill in.
 *
 * Why a pure module: the plan's shape — how many pieces, on which days, of
 * which kind — is the part worth pinning in tests, and it must be reasoned
 * about without a database or an AI call.
 */

/** How far ahead a plan reaches. Four weeks is the shortest horizon that
 *  reads as "a plan" rather than "a few posts", and the longest a dental
 *  practice's calendar is reliably predictable — beyond it, a plan drafted
 *  today is guessing about a season it cannot see. */
export const PLAN_HORIZON_DAYS = 28

/** Below this many pieces already scheduled in the horizon, the practice is
 *  publishing nothing and a plan is worth proposing. At or above it they
 *  have their own rhythm and the machine stays out of the way — proposing a
 *  plan over the top of work they can already see queued is the
 *  contradiction the social generator's `upcomingSends` twin check exists to
 *  avoid. */
export const THIN_HORIZON = 2

/** Pieces in a proposed plan. Enough to be a month of presence, few enough
 *  that a practice reading the card can actually judge all of it — a plan
 *  nobody reads to the end is an approve button on unseen content. */
export const PLAN_SIZE = 4

/** Publishing hour, clinic-local. Mid-morning: the post is up before the
 *  lunchtime scroll and a same-day reply from the front desk is still
 *  possible during opening hours. Deliberately NOT the shared brain's
 *  learned send hour — that value is learned from EMAIL opens and applies to
 *  automationSendAt only, and borrowing it here would be the confounded
 *  reuse the Phase-4 audit spent a round removing. */
export const PUBLISH_HOUR = 10

export type ContentKind = 'social' | 'blog'

export interface PlannedItem {
  kind: ContentKind
  /** Days from the plan's start — the pure half never touches a clock. */
  dayOffset: number
  /** Blog only: the post's headline. Social items carry none. */
  title?: string
  /** What actually gets published. */
  body: string
}

/**
 * WHEN the pieces go out.
 *
 * Evenly spread across the horizon, and WEEKDAYS ONLY: a dental practice's
 * audience is at work on Tuesday and away on Sunday, and a plan that lands
 * two of its four pieces at the weekend has quietly halved itself. The
 * spread is deterministic — the same start date always produces the same
 * dates — so a re-drafted plan does not shuffle under a practice that has
 * already read it.
 *
 * `startDow` is the day-of-week the horizon opens on (0 = Sunday), which the
 * caller resolves in the CLINIC's timezone.
 */
export function planDayOffsets(startDow: number, count = PLAN_SIZE): number[] {
  const step = Math.floor(PLAN_HORIZON_DAYS / count)
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    // Start a few days out: a plan approved this morning should not publish
    // its first piece this afternoon, before anyone has looked at it.
    let offset = 2 + i * step
    // Walk forward off Saturday (6) and Sunday (0). At most two steps, so
    // the spread never collapses two pieces onto one day.
    for (let guard = 0; guard < 2; guard++) {
      const dow = (startDow + offset) % 7
      if (dow !== 0 && dow !== 6) break
      offset += 1
    }
    out.push(offset)
  }
  return out
}

/**
 * A plan is a MIX. All-social is a feed, not a plan; all-blog is a content
 * farm nobody reads. One long piece anchors the month (it is the thing that
 * earns search traffic and gives the short pieces something to point at) and
 * the rest are short.
 *
 * The long piece is deliberately NOT first: a blog post takes a practice
 * longer to read and judge than a caption, and putting it at position two
 * lets the card open with something quick.
 */
export function planKinds(count = PLAN_SIZE): ContentKind[] {
  return Array.from({ length: count }, (_, i) => (i === 1 ? 'blog' : 'social'))
}

/**
 * Is this practice's horizon thin enough to be worth a plan?
 *
 * Counts everything ALREADY going out — scheduled posts and scheduled blog
 * pieces alike — because from the practice's side those are the same thing:
 * something is coming. A clinic that queued three posts last night does not
 * need the machine offering to fill a month it has already filled.
 */
export function horizonIsThin(scheduledAhead: number): boolean {
  return scheduledAhead < THIN_HORIZON
}

/**
 * The card's body: the whole plan, readable end to end, in the order it will
 * go out.
 *
 * Written so a practice can judge every piece before saying yes — the
 * proposal law is "here is exactly what I want to do", and a plan summarised
 * as "4 pieces of content" is an approve button on writing nobody has seen.
 * Long bodies are shown in full; this is the one place they exist before
 * they are public.
 */
export function describePlan(items: readonly PlannedItem[], dateLabels: readonly string[]): string {
  const lines: string[] = [PLAN_DATE_CAVEAT, '']
  items.forEach((item, i) => {
    const when = dateLabels[i] ?? ''
    const head = item.kind === 'blog' ? `${when} — blog: ${item.title ?? 'Untitled'}` : `${when} — post`
    lines.push(head)
    lines.push(item.body)
    if (i < items.length - 1) lines.push('')
  })
  return lines.join('\n')
}

/**
 * What the machine says it did, once the plan is scheduled. Plural nouns and
 * a count, in the narrator's voice — never "executed content plan".
 */
/**
 * The one thing the card must not be silent about.
 *
 * The dates on the card are computed when it is DRAFTED; the schedule is
 * resolved again when it is APPROVED, because a plan sitting in the inbox
 * for a week would otherwise carry dates already in the past — and both
 * publishing rails correctly refuse to schedule into the past, so the whole
 * plan would fail for the crime of being thought about. Shifting it forward
 * is the right behaviour; doing it without saying so would make the card a
 * promise the machine quietly breaks.
 */
export const PLAN_DATE_CAVEAT =
  'Dates assume you say yes today — approve later and I’ll shift the whole plan forward to match.'

/**
 * A drafted body is plain text; a blog post is HTML. Paragraphs on blank
 * lines, everything escaped — the model's output is untrusted input, and the
 * blog service re-sanitizes on write, so this is belt AND braces on the one
 * path that ends on a public page.
 */
export function paragraphsToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`)
    .join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** The index-card summary: the post's first sentence-ish, never the whole
 *  body. Falls back to nothing rather than a truncated half-word. */
export function blogExcerpt(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= 180) return clean
  const cut = clean.slice(0, 180)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

export function planLedgerSummary(items: readonly PlannedItem[]): string {
  const social = items.filter((i) => i.kind === 'social').length
  const blog = items.filter((i) => i.kind === 'blog').length
  const parts: string[] = []
  if (social > 0) parts.push(`${social} ${social === 1 ? 'post' : 'posts'}`)
  if (blog > 0) parts.push(`${blog} blog ${blog === 1 ? 'piece' : 'pieces'}`)
  return `Lined up ${parts.join(' and ')} for the next four weeks`
}

/**
 * Nothing reaches a practice's public channels without passing this.
 *
 * The items come back from a model, so they are treated as untrusted input:
 * anything missing a body, or a blog piece missing a headline, is dropped
 * rather than published as a blank. Returns only what is publishable, so a
 * partially-bad draft becomes a smaller honest plan instead of a card with
 * holes in it.
 */
export function validatePlanItems(raw: unknown): PlannedItem[] {
  if (!Array.isArray(raw)) return []
  const out: PlannedItem[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const kind = o.kind === 'blog' ? 'blog' : 'social'
    const body = typeof o.body === 'string' ? o.body.trim() : ''
    const title = typeof o.title === 'string' ? o.title.trim() : ''
    if (!body) continue
    if (kind === 'blog' && !title) continue
    out.push({
      kind,
      dayOffset: 0,
      body,
      ...(kind === 'blog' ? { title } : {}),
    })
  }
  return out.slice(0, PLAN_SIZE)
}
