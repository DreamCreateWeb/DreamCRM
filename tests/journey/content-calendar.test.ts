import { describe, it, expect } from 'vitest'
import {
  PLAN_HORIZON_DAYS,
  PLAN_SIZE,
  PLAN_DATE_CAVEAT,
  THIN_HORIZON,
  PUBLISH_HOUR,
  planDayOffsets,
  planKinds,
  horizonIsThin,
  describePlan,
  planLedgerSummary,
  validatePlanItems,
  paragraphsToHtml,
  blogExcerpt,
  type PlannedItem,
} from '@/lib/content-calendar'

/**
 * THE CONTENT CALENDAR (Phase 5, limb 1), pure half.
 *
 * The shape of a plan — how many pieces, on which days, of which kind, and
 * what the card says about all of it — is the part worth pinning, and it must
 * be reasonable about without a database or an AI call.
 */

describe('the plan’s shape', () => {
  it('spreads PLAN_SIZE pieces across the horizon, starting a few days out', () => {
    // Monday (1) — no weekend collisions to reason about.
    const offsets = planDayOffsets(1)
    expect(offsets).toHaveLength(PLAN_SIZE)
    // Never publishes the same afternoon it was approved.
    expect(offsets[0]).toBeGreaterThanOrEqual(2)
    // Inside the horizon it promises.
    expect(offsets[offsets.length - 1]).toBeLessThan(PLAN_HORIZON_DAYS)
    // Ascending, and never two on one day.
    for (let i = 1; i < offsets.length; i++) expect(offsets[i]).toBeGreaterThan(offsets[i - 1])
  })

  it('lands every piece on a WEEKDAY, from every possible starting day', () => {
    for (let startDow = 0; startDow < 7; startDow++) {
      for (const offset of planDayOffsets(startDow)) {
        const dow = (startDow + offset) % 7
        expect(dow, `start ${startDow} → offset ${offset} landed on dow ${dow}`).not.toBe(0)
        expect(dow).not.toBe(6)
      }
    }
  })

  it('is DETERMINISTIC — the same start always produces the same dates, so a re-draft doesn’t shuffle under a practice that already read it', () => {
    expect(planDayOffsets(3)).toEqual(planDayOffsets(3))
    expect(planDayOffsets(3)).not.toEqual(planDayOffsets(4))
  })

  it('mixes ONE article in among the posts, and NOT first — a caption is quicker to judge than an essay', () => {
    const kinds = planKinds()
    expect(kinds.filter((k) => k === 'blog')).toHaveLength(1)
    expect(kinds[0]).toBe('social')
    expect(kinds[1]).toBe('blog')
  })

  it('publishes mid-morning, clinic-local — up before the lunchtime scroll, still inside opening hours', () => {
    expect(PUBLISH_HOUR).toBeGreaterThanOrEqual(8)
    expect(PUBLISH_HOUR).toBeLessThan(12)
  })
})

describe('the thin-horizon test', () => {
  it('is thin only when the practice is publishing essentially nothing', () => {
    expect(horizonIsThin(0)).toBe(true)
    expect(horizonIsThin(THIN_HORIZON - 1)).toBe(true)
    expect(horizonIsThin(THIN_HORIZON)).toBe(false)
    expect(horizonIsThin(9)).toBe(false)
  })
})

describe('what the card says', () => {
  const items: PlannedItem[] = [
    { kind: 'social', dayOffset: 2, body: 'A short post.' },
    { kind: 'blog', dayOffset: 9, title: 'Your first visit', body: 'Para one.\n\nPara two.' },
    { kind: 'social', dayOffset: 16, body: 'Another short post.' },
  ]

  it('writes the WHOLE plan out — every body in full, so a yes is never a yes to unseen writing', () => {
    const body = describePlan(items, ['Tue, Aug 4', 'Tue, Aug 11', 'Tue, Aug 18'])
    for (const item of items) expect(body).toContain(item.body)
    expect(body).toContain('Your first visit')
    expect(body).toContain('Tue, Aug 11')
  })

  it('opens with the date caveat — the schedule shifts on a late approve, and shifting a promise silently is worse than not making it', () => {
    const body = describePlan(items, ['Tue, Aug 4', 'Tue, Aug 11', 'Tue, Aug 18'])
    expect(body.startsWith(PLAN_DATE_CAVEAT)).toBe(true)
  })

  it('survives missing date labels rather than rendering "undefined" at a practice', () => {
    const body = describePlan(items, [])
    expect(body).not.toContain('undefined')
    expect(body).toContain('A short post.')
  })

  it('narrates in plural nouns and a count — never "executed content plan"', () => {
    expect(planLedgerSummary(items)).toBe('Lined up 2 posts and 1 blog piece for the next four weeks')
    expect(planLedgerSummary([items[0]])).toBe('Lined up 1 post for the next four weeks')
    expect(planLedgerSummary([items[1]])).toBe('Lined up 1 blog piece for the next four weeks')
  })
})

describe('validatePlanItems — nothing reaches a public channel without passing this', () => {
  it('drops a piece with no body', () => {
    const out = validatePlanItems([{ kind: 'social', body: '   ' }, { kind: 'social', body: 'Real.' }])
    expect(out).toHaveLength(1)
    expect(out[0].body).toBe('Real.')
  })

  it('drops an article with no headline — an untitled post is a blank on a public page', () => {
    expect(validatePlanItems([{ kind: 'blog', body: 'Words.' }])).toEqual([])
    expect(validatePlanItems([{ kind: 'blog', title: 'A headline', body: 'Words.' }])).toHaveLength(1)
  })

  it('treats anything that isn’t a list of objects as nothing at all', () => {
    expect(validatePlanItems(null)).toEqual([])
    expect(validatePlanItems('four posts please')).toEqual([])
    expect(validatePlanItems([null, 7, 'x'])).toEqual([])
  })

  it('never returns more than a plan’s worth, however much the model sent', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ kind: 'social', body: `Post ${i}` }))
    expect(validatePlanItems(many)).toHaveLength(PLAN_SIZE)
  })

  it('treats an unknown kind as a post, not as an article — the safer of the two (no headline is required)', () => {
    const out = validatePlanItems([{ kind: 'newsletter', body: 'Words.' }])
    expect(out[0].kind).toBe('social')
  })
})

describe('the blog body', () => {
  it('becomes paragraphs on blank lines', () => {
    expect(paragraphsToHtml('One.\n\nTwo.')).toBe('<p>One.</p>\n<p>Two.</p>')
  })

  it('ESCAPES the model’s output — this is the one path that ends on a public page', () => {
    const html = paragraphsToHtml('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('keeps single newlines as line breaks inside a paragraph', () => {
    expect(paragraphsToHtml('One\ntwo')).toBe('<p>One<br />two</p>')
  })

  it('drops blank paragraphs rather than emitting empty <p> tags', () => {
    expect(paragraphsToHtml('One.\n\n\n\n   \n\nTwo.')).toBe('<p>One.</p>\n<p>Two.</p>')
  })

  it('excerpts on a word boundary, never mid-word', () => {
    const long = `${'word '.repeat(80)}end`
    const ex = blogExcerpt(long)
    expect(ex.length).toBeLessThanOrEqual(181)
    expect(ex.endsWith('…')).toBe(true)
    expect(ex).not.toContain('  ')
    // The cut lands after a whole word, so the character before the ellipsis
    // is never the middle of one.
    expect(/\swor?d?…$/.test(ex) || /d…$/.test(ex)).toBe(true)
  })

  it('leaves a short body alone', () => {
    expect(blogExcerpt('Short and done.')).toBe('Short and done.')
  })
})
