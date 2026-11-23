import { describe, it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CALLOUT_MAX,
  DESCRIPTION_MAX,
  HEADLINE_MAX,
  PATH_MAX,
  SITELINK_TEXT_MAX,
  googleCompetitorCampaign,
  landingUrl,
  renderCampaignBrief,
} from '@/lib/marketing/ad-campaigns'
import { COMPARISONS } from '@/lib/marketing/comparisons'
import { MARKETING_PUBLIC_PATHS, usd } from '@/lib/marketing/site'
import { buildAttributionTouch, campaignKeyOf } from '@/lib/marketing-attribution'
import { getQuotedPlan } from '@/lib/stripe-config'
import { TRIAL_DAYS } from '@/lib/trial'

/**
 * THE AD CAMPAIGN, HELD TO THE SAME LAWS AS THE SITE IT ADVERTISES.
 *
 * An ad is typed into Google's system and then nobody reads it again, and it
 * quotes exactly the things here that change — the price, the trial length,
 * which competitor pages were actually checked. `lib/marketing/ad-campaigns.ts`
 * builds the campaign from the sources the site itself resolves, and these
 * cases hold what a hand-typed ad could quietly break:
 *
 *  - Google's hard limits (a 31-character headline is simply rejected);
 *  - a rival's name never appears in ad text (a keyword is allowed; copy is
 *    the restricted case);
 *  - paid clicks land only on a comparison page with a dated check;
 *  - the price and the trial length in the copy are the real ones;
 *  - and the brief in `docs/ads-go-live.md` — the text that actually gets
 *    pasted — is the one this code renders.
 *
 * Bounded to the campaign module, the comparison registry and one named doc.
 */

const campaign = googleCompetitorCampaign()
const allCopy = [
  ...campaign.headlines,
  ...campaign.descriptions,
  ...campaign.paths,
  ...campaign.callouts,
  ...campaign.sitelinks.map((s) => s.text),
]

describe('Google’s limits', () => {
  it('every headline, description, path, sitelink and callout fits', () => {
    for (const h of campaign.headlines) expect(h.length, `headline "${h}"`).toBeLessThanOrEqual(HEADLINE_MAX)
    for (const d of campaign.descriptions) expect(d.length, `description "${d}"`).toBeLessThanOrEqual(DESCRIPTION_MAX)
    for (const p of campaign.paths) expect(p.length, `path "${p}"`).toBeLessThanOrEqual(PATH_MAX)
    for (const s of campaign.sitelinks) expect(s.text.length, `sitelink "${s.text}"`).toBeLessThanOrEqual(SITELINK_TEXT_MAX)
    for (const c of campaign.callouts) expect(c.length, `callout "${c}"`).toBeLessThanOrEqual(CALLOUT_MAX)
  })

  it('carries enough distinct assets for a responsive search ad to rotate', () => {
    // Google takes up to 15 headlines and 4 descriptions and needs at least 3 and 2.
    expect(campaign.headlines.length).toBeGreaterThanOrEqual(8)
    expect(campaign.headlines.length).toBeLessThanOrEqual(15)
    expect(campaign.descriptions.length).toBeGreaterThanOrEqual(2)
    expect(campaign.descriptions.length).toBeLessThanOrEqual(4)
    expect(new Set(campaign.headlines).size).toBe(campaign.headlines.length)
    expect(new Set(campaign.descriptions).size).toBe(campaign.descriptions.length)
  })
})

describe('what the copy may say', () => {
  it('never names a rival — a competitor is a keyword, not ad text', () => {
    // Every name in the comparison registry, plus the spellings people type.
    const names = [...COMPARISONS.map((c) => c.name), 'PatientPop', 'Tebra', 'Modento', 'getweave', 'Solution Reach']
    for (const text of allCopy) {
      for (const name of names) {
        expect(text.toLowerCase(), `"${text}" names ${name}`).not.toContain(name.toLowerCase())
      }
    }
  })

  it('quotes the RESOLVED price and the real trial length, and nothing the product cannot back', () => {
    const price = `${usd(getQuotedPlan().price)}/mo`
    expect(campaign.headlines.some((h) => h.includes(price))).toBe(true)
    expect(campaign.descriptions.some((d) => d.includes(price))).toBe(true)
    expect(campaign.headlines.some((h) => h.includes(`${TRIAL_DAYS}-Day Free Trial`))).toBe(true)
    // Any dollar figure in the copy is that price — never a second, typed one
    // (a former "list" price in particular).
    for (const text of allCopy) {
      for (const figure of text.match(/\$[\d,]+/g) ?? []) expect(figure, `"${text}"`).toBe(usd(getQuotedPlan().price))
    }
    // Not shipped, not claimable, or a results promise.
    for (const text of allCopy) {
      expect(text, text).not.toMatch(/hipaa|compliant|texting|\bsms\b|guarantee|#1|\bbest\b|regularly|fills? (your )?chairs/i)
    }
  })
})

describe('where the clicks go', () => {
  it('has an ad group only for a vendor whose pricing was re-read — and lands on that vendor’s page', () => {
    expect(campaign.adGroups.length).toBeGreaterThan(0)
    for (const group of campaign.adGroups) {
      const vendor = COMPARISONS.find((c) => c.slug === group.vendorSlug)
      expect(vendor, group.vendorSlug).toBeTruthy()
      expect(vendor!.pricingChecked, `${group.vendorSlug} has paid traffic and no dated check`).toBeTruthy()
      expect(group.landingPath).toBe(`/compare/${group.vendorSlug}`)
      expect(landingUrl(group, 'https://www.dreamcreatestudio.com/')).toBe(`https://www.dreamcreatestudio.com/compare/${group.vendorSlug}`)
    }
  })

  it('DROPS the ad group when a page’s check is removed — unverified pages get no paid traffic', () => {
    const withoutChecks = COMPARISONS.map((c) => ({ ...c, pricingChecked: undefined }))
    expect(googleCompetitorCampaign(withoutChecks).adGroups).toEqual([])
    // And one vendor losing its check loses exactly its own group.
    const first = campaign.adGroups[0]!.vendorSlug
    const oneLapsed = COMPARISONS.map((c) => (c.slug === first ? { ...c, pricingChecked: undefined } : c))
    const slugs = googleCompetitorCampaign(oneLapsed).adGroups.map((g) => g.vendorSlug)
    expect(slugs).not.toContain(first)
    expect(slugs.length).toBe(campaign.adGroups.length - 1)
  })

  it('points every sitelink at a public marketing route', () => {
    for (const s of campaign.sitelinks) expect(MARKETING_PUBLIC_PATHS as readonly string[], s.path).toContain(s.path)
  })
})

describe('the keywords', () => {
  it('are plain lowercase phrases that name the vendor — rendered in brackets, so exact match', () => {
    for (const group of campaign.adGroups) {
      expect(group.keywords.length, group.vendorSlug).toBeGreaterThanOrEqual(4)
      expect(new Set(group.keywords).size).toBe(group.keywords.length)
      for (const k of group.keywords) {
        expect(k, k).toBe(k.toLowerCase().trim())
        // No match-type punctuation typed into the data; the renderer adds the brackets.
        expect(k, k).not.toMatch(/[\[\]"+]/)
        expect(k.replace(/\s+/g, ''), `${k} does not mention ${group.vendorSlug}`).toContain(group.vendorSlug.replace(/-/g, ''))
      }
    }
    const brief = renderCampaignBrief(campaign)
    for (const group of campaign.adGroups) for (const k of group.keywords) expect(brief).toContain(`[${k}]`)
  })

  it('qualifies the name that is also a hairstyle, and excludes the searches that share it', () => {
    const weave = campaign.adGroups.find((g) => g.vendorSlug === 'weave')
    // The premise: Weave is in the campaign. If it leaves, this case goes with it.
    expect(weave).toBeTruthy()
    for (const k of weave!.keywords) expect(k, `"${k}" would answer a hair-salon search`).toMatch(/dental|software|getweave/)
    for (const n of ['hair', 'salon', 'wig', 'jobs', 'login']) expect(campaign.negatives).toContain(n)
  })
})

describe('the tracking on every click', () => {
  it('tags the click so the site files it under Google Ads, with the campaign and the keyword', () => {
    expect(campaign.campaignKey).toBe(campaignKeyOf(campaign.campaignKey))
    expect(campaign.finalUrlSuffix).toContain(`utm_campaign=${campaign.campaignKey}`)
    expect(campaign.finalUrlSuffix).toContain('utm_term={keyword}')
    // What Google sends once `{keyword}` is filled and its click id appended —
    // read by the same function the middleware uses.
    const landed = campaign.finalUrlSuffix.replace('{keyword}', 'nexhealth%20pricing') + '&gclid=Cj0KCQiA_test-Id'
    const touch = buildAttributionTouch({ path: '/compare/nexhealth', search: `?${landed}`, referrer: null })
    expect(touch.channel).toBe('google_ads')
    expect(touch.utmCampaign).toBe(campaign.campaignKey)
    expect(touch.utmTerm).toBe('nexhealth pricing')
    expect(touch.clickId).toEqual({ kind: 'gclid', value: 'Cj0KCQiA_test-Id' })
  })
})

describe('the brief somebody pastes from', () => {
  const DOC = resolve(__dirname, '../../docs/ads-go-live.md')
  const START = '<!-- campaign:start — generated from lib/marketing/ad-campaigns.ts; do not edit by hand -->'
  const END = '<!-- campaign:end -->'

  it('is the campaign this code renders — the doc cannot quote an old price or a lapsed page', () => {
    const rendered = renderCampaignBrief(campaign)
    const doc = readFileSync(DOC, 'utf8')
    const a = doc.indexOf(START)
    const b = doc.indexOf(END)
    expect(a, 'docs/ads-go-live.md lost its campaign:start marker').toBeGreaterThan(-1)
    expect(b, 'docs/ads-go-live.md lost its campaign:end marker').toBeGreaterThan(a)
    if (process.env.UPDATE_ADS_BRIEF === '1') {
      writeFileSync(DOC, `${doc.slice(0, a + START.length)}\n\n${rendered}\n\n${doc.slice(b)}`)
      return
    }
    // To regenerate after changing the campaign:
    //   UPDATE_ADS_BRIEF=1 pnpm exec vitest run tests/marketing/ad-campaign.test.ts
    expect(doc.slice(a + START.length, b).trim()).toBe(rendered.trim())
  })
})
