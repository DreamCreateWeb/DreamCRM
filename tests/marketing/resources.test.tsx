import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RESOURCE_GUIDES, getResourceGuide } from '@/lib/marketing/resources'
import { TONE_TILE_TONE } from '@/lib/marketing/tone-tiles'
import { MARKETING_PUBLIC_PATHS } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import ResourcesIndexPage from '@/app/(marketing)/resources/page'
import RecallScriptsGuide from '@/app/(marketing)/resources/dental-recall-scripts/page'
import MembershipPricingGuide from '@/app/(marketing)/resources/dental-membership-plan-pricing/page'
import MorePatientsGuide from '@/app/(marketing)/resources/how-to-get-more-dental-patients/page'

/**
 * The practice-growth resource library (marketing-engine slice 4b). The
 * guides are BOFU/long-tail landing content — these tests pin that every
 * registry entry has a real page, the pages carry their original material
 * (the scripts ARE the content), and the wiring (public path) holds.
 */

describe('the resource registry', () => {
  it('every guide has a unique slug and honest metadata', () => {
    const slugs = RESOURCE_GUIDES.map((g) => g.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const g of RESOURCE_GUIDES) {
      expect(g.title.length).toBeGreaterThan(20)
      expect(g.description.length).toBeGreaterThan(50)
      expect(g.readMinutes).toBeGreaterThan(0)
      expect(g.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('/resources is a public marketing path — a guide behind the auth wall has shipped twice before', () => {
    expect(MARKETING_PUBLIC_PATHS).toContain('/resources')
  })

  it('getResourceGuide resolves known slugs and rejects junk', () => {
    expect(getResourceGuide('dental-recall-scripts')?.slug).toBe('dental-recall-scripts')
    expect(getResourceGuide('nope')).toBeUndefined()
  })
})

describe('the hub', () => {
  it('lists every registered guide with a door', () => {
    render(<ResourcesIndexPage />)
    for (const g of RESOURCE_GUIDES) {
      expect(screen.getByText(g.title)).toBeInTheDocument()
    }
    // The grader cross-link — the library feeds the same funnel.
    expect(screen.getByText('Grade your practice free')).toBeInTheDocument()
  })
})

describe('the guides carry their original material', () => {
  it('recall scripts: the real product templates + the TCPA caveat', () => {
    render(<RecallScriptsGuide />)
    // The actual reactivation subject line that ships in the product.
    expect(screen.getByText(/Has it been a minute\? Let’s get you scheduled\./)).toBeInTheDocument()
    // The compliance note is visible content, not a footnote.
    expect(screen.getByText(/TCPA/)).toBeInTheDocument()
    expect(screen.getAllByText(/Reply STOP to opt out/i).length).toBeGreaterThanOrEqual(1)
  })

  it('membership pricing: the worked math + the state-regulation caveat', () => {
    render(<MembershipPricingGuide />)
    expect(screen.getByText(/Worked example/i)).toBeInTheDocument()
    expect(screen.getByText(/illustrative numbers/i)).toBeInTheDocument()
    // The honest legal hedge stays on the page.
    expect(screen.getByText(/not legal advice/i)).toBeInTheDocument()
  })

  it('patient growth: ordered playbook, grader + recall cross-links, no rank promises', () => {
    render(<MorePatientsGuide />)
    // BY ROLE since DREAMCRM-79, not by text. The chapter rail is a table of
    // contents derived from these very headings, so every `h2`'s text is now
    // on the page twice by design and a bare text query is ambiguous. Asking
    // for the HEADING is also the stronger assertion: it is what "ordered
    // playbook" in this test's name actually means, and a rail entry with no
    // chapter under it would pass the old query.
    expect(
      screen.getByRole('heading', { name: /The Google listing is the front door/ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Run the free grade/)).toBeInTheDocument()
    expect(screen.getByText(/dental recall scripts that get patients back/)).toBeInTheDocument()
    // The guide itself warns against rank promises — and makes none.
    expect(screen.getByText(/Nobody can promise that honestly/)).toBeInTheDocument()
  })
})

/**
 * THE DAYLIGHT DREAM SHAPE (DREAMCRM-79, `BRAND.md` Part 8 move 6 page 5).
 */
describe('the library reads as a shelf rather than three equal cards', () => {
  it('every guide declares a subject, and the tone comes with it', () => {
    // `glyph` is REQUIRED in the type, so this cannot be missing — what it
    // asserts is that the subject RESOLVES to a tone family. A glyph added to
    // the union without a tone does not compile (both maps are keyed
    // `Record<ToneTileGlyph, …>`), so this is the registry-side half.
    for (const g of RESOURCE_GUIDES) {
      expect(TONE_TILE_TONE[g.glyph], `${g.slug} has no tone`).toBeTruthy()
    }
  })

  it('no `contains` line carries a count — a number in prose goes stale silently', () => {
    // The lesson the check-mark census taught twice. A noun phrase cannot
    // disagree with the page below it; "two text templates" can.
    for (const g of RESOURCE_GUIDES) {
      for (const line of g.contains) {
        expect(line.length, `${g.slug}: empty contains line`).toBeGreaterThan(0)
        expect(line, `${g.slug}: "${line}" carries a digit`).not.toMatch(/\d/)
      }
    }
  })

  it('the hub renders each row index, so the reader can pick without opening three tabs', () => {
    render(<ResourcesIndexPage />)
    for (const g of RESOURCE_GUIDES) {
      for (const line of g.contains) {
        expect(screen.getByText(line), `${g.slug}: "${line}" missing`).toBeInTheDocument()
      }
    }
  })

  it('the hub count is computed, not typed', () => {
    render(<ResourcesIndexPage />)
    // The `sr-only` twin of the mono numeral — the one place the number is
    // written as a sentence, so it is the one that would have to be edited by
    // hand if it were typed.
    expect(screen.getByText(`${RESOURCE_GUIDES.length} guides`)).toBeInTheDocument()
  })

  it('every article opens with the SHARED hero, not a bespoke band', () => {
    // The defect this move found. `GuideShell` carried its own
    // `from-teal-50/60` section with a hand-rolled eyebrow and `h1`, so the
    // three guides had never inherited move 4 — the same shape
    // `compare/[vendor]` was found in on page 2. `PageHero`'s eyebrow is the
    // gradient rule plus the library label; asserting the LABEL would pass on
    // the old band too, so this asserts the hero's own structure: one `h1`
    // carrying the guide title, and the read-time spine `PageHero` renders as
    // its `children`.
    for (const [name, Page] of [
      ['dental-recall-scripts', RecallScriptsGuide],
      ['dental-membership-plan-pricing', MembershipPricingGuide],
      ['how-to-get-more-dental-patients', MorePatientsGuide],
    ] as const) {
      const guide = getResourceGuide(name)!
      const { container, unmount } = render(<Page />)
      const h1 = container.querySelector('h1')
      expect(h1?.textContent, `${name}: no h1`).toBe(guide.title)
      // `PageHero`'s display step-down (Part 4 / DREAMCRM-72). The old band
      // rendered `text-[1.9rem] … sm:text-[2.4rem]`; the shared hero is
      // 2.35 / 3 / 3.6rem. This is the one class assertion here and it earns
      // its place: it is the difference between the two heroes.
      expect(h1?.className, `${name}: not the shared hero's type`).toContain('lg:text-[3.6rem]')
      expect(screen.getByText(`${guide.readMinutes}-minute read`)).toBeInTheDocument()
      unmount()
    }
  })

  it('the shared shell quotes the price from the plan config, on all three guides at once', () => {
    // DREAMCRM-38, found a fourth time. The literal lived in `GuideShell`, so
    // it was live on three public pages while counting as one surface.
    // `tests/marketing/pricing-price-source.test.tsx` owns the source scan;
    // this is the rendered twin, and it is per-page on purpose — a shell that
    // stopped rendering the close would pass a source scan silently.
    const price = `$${getQuotedPlan().price.toLocaleString('en-US')}/mo`
    for (const Page of [RecallScriptsGuide, MembershipPricingGuide, MorePatientsGuide]) {
      const { unmount } = render(<Page />)
      expect(
        screen.getByText((_, el) => el?.textContent?.includes(price) === true, {
          selector: 'p',
        }),
      ).toBeInTheDocument()
      unmount()
    }
  })
})
