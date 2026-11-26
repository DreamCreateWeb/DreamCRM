import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import MorePatientsGuide from '@/app/(marketing)/resources/how-to-get-more-dental-patients/page'
import MembershipPricingGuide from '@/app/(marketing)/resources/dental-membership-plan-pricing/page'
import RecallScriptsGuide from '@/app/(marketing)/resources/dental-recall-scripts/page'
import NoShowPolicyGuide from '@/app/(marketing)/resources/dental-cancellation-no-show-policy/page'
import ReminderTemplatesGuide from '@/app/(marketing)/resources/dental-appointment-reminder-templates/page'
import ReviewRequestGuide from '@/app/(marketing)/resources/dental-review-request-templates/page'
import WelcomeLetterGuide from '@/app/(marketing)/resources/dental-new-patient-welcome-letter/page'
import PastDueLettersGuide from '@/app/(marketing)/resources/dental-past-due-balance-letters/page'
import {
  INSTALLMENT_RULE,
  LOCAL_RANKING,
  NO_SHOW_SOURCES,
  PRIVACY_NOTICE_RULE,
  REMINDER_RULE,
  REVIEW_RULES,
} from '@/lib/marketing/guide-sources'
import { RESOURCE_GUIDES, getResourceGuide } from '@/lib/marketing/resources'
import { publicPages } from '@/lib/marketing/public-pages'
import { contentKey } from '@/lib/indexnow'

/**
 * "NO INVENTED STATISTICS" — the resource registry's content law, held.
 *
 * The law was written in September beside two guides that broke it. The
 * patient-growth guide said most new patients pick from the map's three
 * tiles, that winning practices carry 100+ reviews, that an evening review
 * request "converts multiples better". The membership guide said what
 * practices "commonly" charge and what hygiene costs "in most practices".
 * None had a source, and nobody noticed for two and a half months because no
 * test read prose for a number. On 2026-11-26 each was sourced (Google's own
 * page on local ranking), softened or cut. This is what keeps them out:
 *
 *   1. THE RETIRED SENTENCES, by name, per guide.
 *   2. THE SOURCE THAT REPLACED THEM, pinned word for word.
 *   3. A RULE FOR THE WHOLE LIBRARY: a percentage in a guide's own words is
 *      either inside a quotation from a registered source, or in a sentence
 *      that calls itself an example. Not a tree walk — the guides are
 *      imported by name, and the list is checked against the registry.
 */

const text = (el: Element | null) => el?.textContent ?? ''
const article = (Page: () => React.ReactElement | null) => {
  const { container, unmount } = render(<Page />)
  const out = { article: container.querySelector('article')!, container, unmount }
  return out
}

describe('the patient-growth guide', () => {
  it('quotes Google’s own page on local ranking, each line pinned, linked and dated', () => {
    expect(LOCAL_RANKING.says).toEqual({
      verify:
        'This tells Google that you’re authorized to represent the business, so it\'s more likely to show up in search results.',
      complete: 'Businesses with complete and accurate info are more likely to show up in local search results.',
      reviews: 'More reviews and positive ratings can help your business’s local ranking.',
      replies: 'Positive reviews and helpful replies can help your business stand out.',
      noPaying: 'There\'s no way to request or pay for a better local ranking on Google.',
    })
    const { article: a, container, unmount } = article(MorePatientsGuide)
    for (const [name, words] of Object.entries(LOCAL_RANKING.says)) {
      expect(text(a), `${name}: not on the page`).toContain(words)
    }
    const link = container.querySelector(`a[href="${LOCAL_RANKING.source.url}"]`)
    expect(link).toBeTruthy()
    expect(link!.getAttribute('rel') ?? '').toContain('nofollow')
    expect(text(a)).toMatch(/were read\s+November 26, 2026/)
    unmount()
  })

  it('no longer says how often anything works', () => {
    const { article: a, unmount } = article(MorePatientsGuide)
    const t = text(a)
    for (const retired of [
      /most\s+new patients pick/i,
      /never scroll further/i,
      /get outranked by/i,
      /we(?:’|')ve watched a practice/i,
      /cost trust and rank/i,
      /dramatically more clicks/i,
      /almost every time/i,
      /100\+ Google reviews/i,
      /converts multiples/i,
      /a large share of booking intent/i,
      /in a\s+typical practice/i,
      /several regulate/i,
    ]) {
      expect(t, `still says ${retired}`).not.toMatch(retired)
    }
    unmount()
  })

  it('is dated the day it was revised, and its search-notice key follows what it quotes', () => {
    const guide = getResourceGuide('how-to-get-more-dental-patients')!
    expect(guide.datePublished).toBe('2026-11-26')
    const page = publicPages([]).find((p) => p.path === '/resources/how-to-get-more-dental-patients')!
    expect(page.contentKey).toBe(contentKey([guide, [REVIEW_RULES.googlePolicy.says.gating, LOCAL_RANKING]]))
  })
})

describe('the membership pricing guide', () => {
  it('states its numbers as one example’s choices, not as what practices do', () => {
    const { article: a, unmount } = article(MembershipPricingGuide)
    const t = text(a)
    for (const retired of [
      /\bcommonly\b/i,
      /in most practices/i,
      /A common landing spot/i,
      /production lift/i,
      /volume seller/i,
      /stickiest revenue/i,
      /Some practices/i,
      /several US states/i,
    ]) {
      expect(t, `still says ${retired}`).not.toMatch(retired)
    }
    // Still labelled for what it is.
    expect(t).toMatch(/illustrative numbers/i)
    expect(t).toMatch(/This example uses/)
    expect(t).toMatch(/This example picks/)
    unmount()
  })

  it('the example’s arithmetic agrees with itself', () => {
    // It used to print a target band of $280–$345 a year beside a "landing
    // spot" of $350–$420. One price now, inside its own floor and ceiling.
    const { container, unmount } = article(MembershipPricingGuide)
    const card = Array.from(container.querySelectorAll('figure')).find((f) =>
      /Worked example/.test(text(f.querySelector('figcaption'))),
    )!
    const body = text(card.querySelector('blockquote'))
    const n = (re: RegExp) => Number(re.exec(body)![1])
    const retail = n(/Retail value \.+ \$(\d+)/)
    const floor = n(/Floor — your delivery cost \.+ \$(\d+)\/yr/)
    const ceiling = n(/Ceiling — paying as they go \.+ \$(\d+)\/yr/)
    const monthly = n(/This example picks \.+ \$(\d+)\/mo/)
    const yearly = n(/This example picks \.+ \$\d+\/mo \(\$(\d+)\/yr\)/)
    // The retail lines add up to the retail value.
    const parts = Array.from(body.matchAll(/= \$(\d+)/g)).map((m) => Number(m[1]))
    expect(parts.reduce((a, b) => a + b, 0)).toBe(retail)
    expect(ceiling).toBe(retail)
    expect(yearly).toBe(monthly * 12)
    expect(yearly).toBeGreaterThan(floor)
    expect(yearly).toBeLessThan(ceiling)
    unmount()
  })

  it('the legal note says we have not read the rules, and still says it is not legal advice', () => {
    const { article: a, unmount } = article(MembershipPricingGuide)
    expect(text(a)).toMatch(/depends on your state, and we have not read the rules of any of them/)
    expect(text(a)).toMatch(/not legal advice/i)
    unmount()
  })
})

describe('the rule for the whole library', () => {
  const GUIDES: Record<string, () => React.ReactElement | null> = {
    'dental-recall-scripts': RecallScriptsGuide,
    'dental-appointment-reminder-templates': ReminderTemplatesGuide,
    'dental-cancellation-no-show-policy': NoShowPolicyGuide,
    'dental-review-request-templates': ReviewRequestGuide,
    'dental-new-patient-welcome-letter': WelcomeLetterGuide,
    'dental-past-due-balance-letters': PastDueLettersGuide,
    'dental-membership-plan-pricing': MembershipPricingGuide,
    'how-to-get-more-dental-patients': MorePatientsGuide,
  }

  /** Every word a guide may quote from an outside page. */
  const QUOTED: string[] = [
    ...Object.values(NO_SHOW_SOURCES).flatMap((s) => ('quote' in s && s.quote ? [s.quote] : [])),
    ...Object.values(REMINDER_RULE.conditions),
    ...Object.values(REVIEW_RULES).flatMap((r) => Object.values(r.says)),
    ...Object.values(PRIVACY_NOTICE_RULE.says),
    ...Object.values(LOCAL_RANKING.says),
    ...Object.values(INSTALLMENT_RULE.says),
  ]

  it('covers every guide written in prose (the pricing guide is built from the registry and has its own test)', () => {
    const prose = RESOURCE_GUIDES.map((g) => g.slug).filter((s) => s !== 'dental-software-pricing')
    expect(Object.keys(GUIDES).sort()).toEqual(prose.sort())
  })

  it('a percentage in a guide’s own words is a quotation or a labelled example', () => {
    for (const [slug, Page] of Object.entries(GUIDES)) {
      const { article: a, unmount } = article(Page)
      // The cards are templates and worked examples; the rule is for prose.
      for (const card of Array.from(a.querySelectorAll('figure'))) card.remove()
      let prose = text(a)
      for (const q of QUOTED) prose = prose.split(q).join(' ')
      const sentences = prose.split(/(?<=[.!?])\s+/)
      for (const s of sentences) {
        if (!/\d+(?:[–-]\d+)?\s?%/.test(s)) continue
        expect(/\bexample\b/i.test(s), `${slug}: an unlabelled percentage — “${s.trim().slice(0, 140)}”`).toBe(true)
      }
      unmount()
    }
  })
})
