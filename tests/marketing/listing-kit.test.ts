import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildListingKit, renderListingKit } from '@/lib/marketing/listing-kit'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { MARKETING, TRIAL, usd } from '@/lib/marketing/site'
import { INCLUDED_MONTHLY_INSURANCE_CHECKS } from '@/lib/insurance-eligibility'
import { getQuotedPlan } from '@/lib/stripe-config'
import { TRIAL_DAYS } from '@/lib/trial'

/**
 * THE LISTING KIT (lib/marketing/listing-kit.ts) — the words pasted into the
 * profiles we do not host: G2 and the marketplaces it feeds, directories,
 * company pages. Those are the pages a buyer's assistant reads about us, and
 * they are typed once into somebody else's form, so they are where a product
 * keeps last year's price. Each rule below is one way that copy could come to
 * say something untrue; the last block ties the runbook's printed copy to
 * this file so neither can move alone.
 */

const kit = buildListingKit()
const plan = getQuotedPlan()
const prose = kit.fields.map((f) => f.text)
const everything = [...prose, ...kit.features, ...kit.notIncluded].join('\n')

describe('the name is never alone', () => {
  it('every field says "dental" — other products are called DreamCRM too', () => {
    for (const f of kit.fields) expect(f.text.toLowerCase(), f.id).toMatch(/dental/)
  })

  it('the rendered kit tells whoever is pasting to add "(dental)" to the name where a form allows it', () => {
    expect(renderListingKit(kit)).toContain(`"${MARKETING.productName} (dental)"`)
  })
})

describe('every field fits the form it is for', () => {
  it.each(kit.fields.map((f) => [f.id, f] as const))('%s is within its limit, and is one clean block of text', (_id, f) => {
    expect(f.text.length).toBeLessThanOrEqual(f.max)
    expect(f.text.length).toBeGreaterThan(20)
    expect(f.text).toBe(f.text.trim())
    // Nothing a plain-text form would print literally.
    expect(f.text).not.toMatch(/[*_`<>]|\]\(|https?:\/\//)
  })

  it('the conventional lengths: a headline, a meta-description, a paragraph', () => {
    const max = Object.fromEntries(kit.fields.map((f) => [f.id, f.max]))
    expect(max.tagline).toBeLessThanOrEqual(60)
    expect(max['one-line']).toBeLessThanOrEqual(160)
    expect(max.short).toBeLessThanOrEqual(300)
  })
})

describe('the price and the trial are the real ones', () => {
  it('the published monthly and yearly prices appear, resolved — and no other dollar figure does', () => {
    const monthly = usd(plan.price)
    const yearly = usd(plan.annualPrice)
    expect(everything).toContain(`${monthly}/month`)
    expect(everything).toContain(`${yearly}/year`)
    const figures = Array.from(new Set(everything.match(/\$[\d,]+/g) ?? []))
    expect(figures.sort()).toEqual([monthly, yearly].sort())
  })

  it('the struck-through list price is NOT advertised here — that ruling is open', () => {
    expect(plan.listPrice, 'the premise: there is a list price to leave out').toBeTruthy()
    expect(everything).not.toContain(usd(plan.listPrice!))
    expect(everything).not.toMatch(/regularly|list price|normally|discount|% off/i)
  })

  it('the trial is named at its real length, and ALWAYS with its card', () => {
    const withTrial = kit.fields.filter((f) => /trial/i.test(f.text))
    expect(withTrial.map((f) => f.id).sort()).toEqual(['long', 'pricing'])
    for (const f of withTrial) {
      expect(f.text, f.id).toContain(TRIAL.name)
      expect(f.text, f.id).toMatch(/a card starts it and is not charged until the trial ends/)
    }
    expect(TRIAL.name).toContain(String(TRIAL_DAYS))
    expect(everything).not.toMatch(/no (credit )?card|without a card|cardless/i)
  })

  it('the insurance allowance is the one the product enforces', () => {
    expect(everything).toContain(`${INCLUDED_MONTHLY_INSURANCE_CHECKS} a month included`)
  })
})

describe('nothing the product does not do', () => {
  it('no compliance or security claim (docs/COMPLIANCE.md)', () => {
    expect(everything).not.toMatch(
      /hipaa|\bcompliant\b|\bcompliance\b|\bcertified\b|\bcertification\b|soc ?2|bank[- ]level|military[- ]grade|secure patient data|\bguarantee|\bencrypt/i,
    )
  })

  it('texting and phones appear ONLY as things that are not included', () => {
    const positive = [...prose.filter((_, i) => kit.fields[i].id !== 'long'), ...kit.features].join('\n')
    expect(positive).not.toMatch(/\bsms\b|text messag|texting|two-way text|\bphones?\b|voip|call answering/i)
    // The full description is the one field that says it, and it says "not".
    const long = kit.fields.find((f) => f.id === 'long')!.text
    expect(long).toMatch(/does not include phones, and it does not send text messages today/)
    expect(kit.notIncluded.join('\n')).toMatch(/VoIP phones/)
    expect(kit.notIncluded.join('\n')).toMatch(/Text messaging \(SMS\) — not available today/)
  })

  it('it never calls itself a practice management system — and says so where a form will ask', () => {
    expect(kit.fields.find((f) => f.id === 'long')!.text).toMatch(/is not a practice management system/)
    expect(kit.notIncluded[0]).toMatch(/^Practice management/)
    for (const feature of kit.features) expect(feature).not.toMatch(/practice management|charting|claims/i)
  })

  it('no superlative a marketplace could ask us to substantiate', () => {
    expect(everything).not.toMatch(/\bbest\b|\bleading\b|#1|number one|\bthe only\b|nobody else|world[- ]class|revolutionary|cutting[- ]edge/i)
  })

  it('recall is described as email — the channel it actually uses', () => {
    expect(kit.features.find((f) => /recall/i.test(f))).toMatch(/\(email\)/)
  })
})

describe('the lists', () => {
  it('"alternatives to" is the comparison registry — every vendor we publish a page about, and no other', () => {
    expect(kit.alternativesTo).toEqual(COMPARISONS.map((c) => c.name))
  })

  it('features are distinct, short, and name the PMSs the site names', () => {
    expect(new Set(kit.features).size).toBe(kit.features.length)
    for (const f of kit.features) expect(f.length, f).toBeLessThanOrEqual(90)
    expect(kit.features.join('\n')).toMatch(/NexHealth \(Dentrix, Eaglesoft and more\)/)
  })

  it('Open Dental is NOT named — its vendor advises against the bridge we sync through, and that ruling is open', () => {
    // The site's own pages still name it; a profile on somebody else's
    // marketplace is the copy we cannot quietly correct later.
    expect(everything).not.toMatch(/open ?dental/i)
    // What is named is the bridge, so the claim is checkable.
    expect(everything).toMatch(/through NexHealth/)
  })
})

describe('the copy somebody pastes from', () => {
  const DOC = resolve(__dirname, '../../docs/organic-go-live.md')
  const START = '<!-- listing-kit:start — generated from lib/marketing/listing-kit.ts; do not edit by hand -->'
  const END = '<!-- listing-kit:end -->'

  it('is the kit this code renders — the runbook cannot quote an old price or a retired trial', () => {
    const rendered = renderListingKit(kit)
    const doc = readFileSync(DOC, 'utf8')
    const a = doc.indexOf(START)
    const b = doc.indexOf(END)
    expect(a, 'docs/organic-go-live.md lost its listing-kit:start marker').toBeGreaterThan(-1)
    expect(b, 'docs/organic-go-live.md lost its listing-kit:end marker').toBeGreaterThan(a)
    if (process.env.UPDATE_LISTING_KIT === '1') {
      writeFileSync(DOC, `${doc.slice(0, a + START.length)}\n\n${rendered}\n\n${doc.slice(b)}`)
      return
    }
    // To regenerate after the price, the trial or the copy changes:
    //   UPDATE_LISTING_KIT=1 pnpm exec vitest run tests/marketing/listing-kit.test.ts
    // …and then correct the outside profiles the runbook lists, because they
    // were pasted from the old text.
    expect(doc.slice(a + START.length, b).trim()).toBe(rendered.trim())
  })
})
