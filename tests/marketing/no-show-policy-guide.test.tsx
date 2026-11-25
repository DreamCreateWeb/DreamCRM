import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import NoShowPolicyGuide, { metadata } from '@/app/(marketing)/resources/dental-cancellation-no-show-policy/page'
import { NO_SHOW_SOURCES } from '@/lib/marketing/guide-sources'
import RecallScriptsGuide from '@/app/(marketing)/resources/dental-recall-scripts/page'
import { getResourceGuide } from '@/lib/marketing/resources'
import { FOOTER_COLUMNS, TRIAL } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { REMINDER_DEFAULTS } from '@/lib/types/reminders'
import { EMAIL_AUTOMATION_SPECS, resolveEmailAutomations } from '@/lib/types/email-automations'
import { DEFAULT_PORTAL_SETTINGS } from '@/lib/types/portal'
import { publicPages } from '@/lib/marketing/public-pages'
import { productEmail } from '@/lib/marketing/guide-templates'
import { contentKey } from '@/lib/indexnow'

/**
 * THE CANCELLATION & NO-SHOW POLICY GUIDE (organic queue item 2, 2026-11-25).
 *
 * Search Console's first export showed what Google already believes this site
 * is for: the front desk's own paperwork. The recall-scripts guide was shown
 * 505 times in three months and the eight "recall LETTER" spellings alone 135
 * — for a page that, until that week, had no letter on it. So the next pages
 * are the same kind of thing: what a front desk types into a search box on a
 * bad afternoon. This is the first of them.
 *
 * It is also the first guide in the library that touches MONEY A PATIENT IS
 * ASKED FOR and A RULE ABOUT WHO MAY BE ASKED, which is why most of this file
 * is not about layout:
 *
 *   1. THE PAGE PICKS NO NUMBERS. Every fee, notice period and look-back in a
 *      card is a `{placeholder}`. A typed "$50" would be this site telling a
 *      practice what to charge its patients on the strength of nothing, and a
 *      typed statistic ("no-shows cost the average practice…") is the content
 *      law's "no invented statistics" being broken in the opening paragraph,
 *      where every page of this kind breaks it.
 *
 *   2. WHO MAY NOT BE CHARGED IS QUOTED, NOT PARAPHRASED, and each quote
 *      carries the page it was read from and the day. Two states were read
 *      first-hand. The federal guidance they rest on refused the reader (403
 *      from hhs.gov on 2026-11-25), so it is not cited — the same rule
 *      `CLAUDE.md` holds for competitor facts.
 *
 *   3. NO DISMISSAL LETTER. A letter ending a patient relationship has
 *      state-by-state rules about notice, emergencies and records. A sample on
 *      a marketing page is how a practice ends up abandoning a patient with
 *      our template in its hand.
 *
 *   4. THE CLOSE SAYS WHO DOES WHAT. The shell's default — "everything in
 *      this guide is a job the software does" — would be false three times
 *      over here: the product charges no fee, sends no text today, and mails
 *      no letter. What it does do is tied below to the constants that make it
 *      true, so a changed default fails HERE and names the sentence.
 */

const guide = getResourceGuide('dental-cancellation-no-show-policy')!

function renderGuide() {
  const { container } = render(<NoShowPolicyGuide />)
  const cards = Array.from(container.querySelectorAll('figure')).map((f) => ({
    label: f.querySelector('figcaption')?.textContent ?? '',
    body: f.querySelector('blockquote')?.textContent ?? '',
  }))
  return {
    container,
    cards,
    text: container.textContent ?? '',
    /** The guide's own words, without the shell's close (which quotes OUR price). */
    article: container.querySelector('article')?.textContent ?? '',
  }
}

describe('the registry entry', () => {
  it('names what a front desk searches for — the policy, the no-show, the letters', () => {
    expect(guide).toBeTruthy()
    expect(guide.title).toMatch(/cancellation/i)
    expect(guide.title).toMatch(/no-show/i)
    expect(guide.title).toMatch(/policy/i)
    expect(guide.description).toMatch(/letter/i)
    expect(guide.contains.join(' | ')).toMatch(/policy/i)
    expect(guide.contains.join(' | ')).toMatch(/letter/i)
    // The subject is the appointment, so the tone comes from `calendar`.
    expect(guide.glyph).toBe('calendar')
  })
})

describe('the material', () => {
  it('carries the policy, the two phone scripts and the three letters as copy-ready cards', () => {
    const { cards } = renderGuide()
    const labels = cards.map((c) => c.label)
    expect(labels.filter((l) => /^Policy ·/.test(l))).toHaveLength(1)
    expect(labels.filter((l) => /^Phone ·/.test(l))).toHaveLength(1)
    expect(labels.filter((l) => /^Voicemail ·/.test(l))).toHaveLength(1)
    // First miss, second miss, third miss — a ladder is three rungs.
    expect(labels.filter((l) => /^(Email|Letter) ·/.test(l))).toHaveLength(3)
    // And nothing else is dressed as a thing to copy.
    expect(cards).toHaveLength(6)
    for (const c of cards) expect(c.body.length, `${c.label}: empty card`).toBeGreaterThan(120)
  })

  it('picks no numbers for the practice: every fee, notice period and look-back is a blank to fill', () => {
    const { cards, article } = renderGuide()
    expect(article.length).toBeGreaterThan(3000)
    for (const c of cards) {
      expect(c.body, `${c.label}: names a dollar amount`).not.toMatch(/\$/)
      expect(c.body, `${c.label}: carries a typed number`).not.toMatch(/\d/)
    }
    const policy = cards.find((c) => /^Policy ·/.test(c.label))!
    for (const blank of ['{notice period}', '{fee}', '{period}', '{phone}']) {
      expect(policy.body, `the policy has no ${blank} blank`).toContain(blank)
    }
    // No invented statistic anywhere on the page — the sentence every page of
    // this kind opens with.
    expect(article).not.toMatch(/\d\s?%|\bpercent\b/i)
    // Not one dollar figure in the guide's own words — the only price on the
    // page is ours, in the close, resolved from the plan config.
    expect(article).not.toMatch(/\$/)
  })

  it('every card obeys the guide’s own first rule — written for the patient you like', () => {
    // The opening quotes the angry register as the thing to avoid. A card that
    // used it would be the guide breaking its own rule one screen later, so
    // the cards are read, not the prose around them.
    const { cards } = renderGuide()
    for (const c of cards) {
      expect(c.body, `${c.label}: the punitive register`).not.toMatch(
        /failure to|will be charged|strictly|no exceptions|violat|penalt|forfeit|delinquen|\bmust\b|!/i,
      )
      // Shouting is a register too.
      expect(c.body, `${c.label}: capitals`).not.toMatch(/\b[A-Z]{4,}\b/)
    }
  })

  it('forgives the first miss in writing, and the first message says nothing about money', () => {
    const { cards } = renderGuide()
    const policy = cards.find((c) => /^Policy ·/.test(c.label))!
    expect(policy.body).toMatch(/first time[^.]*\.\s*No fee\./i)
    const first = cards.find((c) => /^Email ·/.test(c.label))!
    // Forgiven means not mentioned: no fee, no charge, no policy, no "next time".
    expect(first.body).not.toMatch(/\bfee\b|charge|policy|next time/i)
    // And the fee letter leaves the door open rather than closing the account.
    const second = cards.find((c) => /second/i.test(c.label) && /^Letter ·/.test(c.label))!
    expect(second.body).toContain('{fee}')
    expect(second.body).toMatch(/call and tell us/i)
  })

  it('the first-miss email IS the product’s missed-visit note — read from the spec, not retyped', () => {
    // The content law: a template shown in a guide is real product copy or
    // derived from it. So the card is graded against the spec the product
    // sends from, with its `{{tokens}}` respelled as this page's blanks. If
    // the product's copy is edited, this page moves with it; if a token is
    // added that the page does not respell, the raw `{{…}}` is caught here.
    const { cards, text } = renderGuide()
    const first = cards.find((c) => /^Email ·/.test(c.label))!
    const spec = EMAIL_AUTOMATION_SPECS.no_show_rebook.slotDefaults
    const asBlanks = (s: string) =>
      s
        .replaceAll('{{firstName}}', '{first name}')
        .replaceAll('{{clinicName}}', '{practice name}')
        .replaceAll('{{appointmentType}}', '{visit type}')
        .replaceAll('{{clinicPhone}}', '{phone}')
    expect(first.body).toContain(`Subject: ${asBlanks(spec.subject)}`)
    expect(first.body).toContain(asBlanks(spec.body))
    expect(first.body).not.toMatch(/\{\{|\}\}/)
    // The heading, the button and the last line are literals in the sender.
    const sender = readFileSync(resolve(__dirname, '../../lib/services/appointments.ts'), 'utf8')
    for (const literal of ['We missed you — no big deal', 'Find a new time', 'Prefer to talk it through? Call us at']) {
      expect(sender, `the sender no longer says "${literal}"`).toContain(literal)
      expect(first.body, `the card does not say "${literal}"`).toContain(literal)
    }
    // "It goes out when a visit is marked a no-show" — on unless switched off.
    expect(resolveEmailAutomations(null).no_show_rebook.enabled).toBe(true)
    expect(text).toMatch(/ships inside DreamCRM/)
  })

  it('has no dismissal letter, and says where one comes from', () => {
    const { cards, text } = renderGuide()
    for (const c of cards) {
      expect(`${c.label} ${c.body}`, `${c.label}: ends the relationship`).not.toMatch(
        /dismiss|discharg|terminat|no longer (?:be able to )?(?:see|treat)|find another dentist/i,
      )
    }
    expect(text).toMatch(/malpractice carrier/i)
    expect(text).toMatch(/state dental association/i)
  })
})

describe('who may not be charged', () => {
  it('quotes each program’s own words, links the page and says the day it was read', () => {
    const { container, text } = renderGuide()
    expect(NO_SHOW_SOURCES.ncMedicaid.quote).toBe(
      'Providers may NOT bill Medicaid beneficiaries for missed appointments.',
    )
    expect(NO_SHOW_SOURCES.cda.quote).toBe('Providers cannot bill Medi-Cal recipients for missed appointments.')
    for (const s of [NO_SHOW_SOURCES.ncMedicaid, NO_SHOW_SOURCES.cda]) {
      expect(text, `${s.label}: the quote is not on the page`).toContain(s.quote!)
    }
    for (const s of Object.values(NO_SHOW_SOURCES)) {
      expect(s.readOn, `${s.label}: undated`).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      const link = container.querySelector(`a[href="${s.url}"]`)
      expect(link, `${s.label}: not linked`).toBeTruthy()
      // An outside page we vouch for nothing beyond the sentence quoted.
      expect(link!.getAttribute('rel') ?? '').toContain('nofollow')
      expect(link!.getAttribute('target')).toBe('_blank')
    }
    expect(text).toMatch(/Read November 25, 2026/)
  })

  it('claims two states and no more — and sends the reader to their own', () => {
    const { text } = renderGuide()
    // The rule is set state by state and plan by plan. Two were read; a
    // sentence that said "Medicaid patients can never be charged" would be a
    // third claim nobody read.
    expect(text).toMatch(/your own state/i)
    expect(text).toMatch(/not legal advice/i)
    expect(text).not.toMatch(/in (?:all|every) states?/i)
    expect(text).not.toMatch(/federal law (?:says|prohibits|bans)/i)
  })

  it('puts the carve-out INSIDE the policy, because the card is what gets copied', () => {
    const { cards } = renderGuide()
    const policy = cards.find((c) => /^Policy ·/.test(c.label))!
    expect(policy.body).toMatch(/Medicaid/)
    expect(policy.body).toMatch(/insurance/i)
  })

  it('names the two tracking codes and the manuals they were read in', () => {
    const { text } = renderGuide()
    // Each code WITH what it is for. A bare `toContain('D9987')` passed with
    // the definition deleted, because the code is named a second time in the
    // Open Dental sentence — the mutation run of 2026-11-25 missed it.
    expect(text).toMatch(/D9986 for a\s+missed one/)
    expect(text).toMatch(/D9987 for a cancelled one/)
    expect(NO_SHOW_SOURCES.openDental.url).toBe('https://opendental.com/manual/apptbreak.html')
    expect(NO_SHOW_SOURCES.dentrix.url).toBe(
      'https://blog.dentrixenterprise.com/why-you-should-document-missed-appointments/',
    )
  })
})

describe('who does what — the close', () => {
  it('is not the shell’s default, and says the three things the software does not do', () => {
    const { text } = renderGuide()
    expect(text).not.toMatch(/Everything in this guide is a job the software does/)
    expect(text).toMatch(/does not charge/i)
    expect(text).toMatch(/does not send text messages today/i)
    expect(text).toMatch(/print or mail/i)
  })

  it('claims only what the product’s own defaults make true', () => {
    const { text } = renderGuide()
    // "three days before and the day before, on from day one" — if either
    // default moves, this fails and the sentence above is the one to change.
    expect(REMINDER_DEFAULTS.enabled).toBe(true)
    expect(REMINDER_DEFAULTS.touchOffsets).toEqual([72, 24])
    expect(text).toMatch(/three days before and the day before/i)
    // "patients can move or cancel a visit themselves, outside your notice
    // window" and "the freed time is offered to your waitlist".
    expect(DEFAULT_PORTAL_SETTINGS.features.reschedule).toBe(true)
    expect(DEFAULT_PORTAL_SETTINGS.features.waitlist).toBe(true)
    expect(text).toMatch(/outside your notice window/i)
    expect(text).toMatch(/waitlist/i)
    // "Mark a visit missed and … your team gets a follow-up to rebook them the
    // next day." The rule lives in a server-only module, so it is read as
    // source: the follow-up's title, its kind, and the one day.
    const followups = readFileSync(resolve(__dirname, '../../lib/services/patient-followups.ts'), 'utf8')
    // THE RULE'S OWN BLOCK, not the file: another follow-up in that module is
    // also due the next day, so a file-wide match kept passing with this
    // rule's date moved (the mutation run of 2026-11-25).
    const start = followups.indexOf('export async function autoCreateRebookFollowup(')
    expect(start, 'the no-show follow-up rule is gone').toBeGreaterThan(-1)
    const rule = followups.slice(start, followups.indexOf('\nexport ', start + 1))
    expect(rule).toContain('after no-show')
    expect(rule).toMatch(/dueDate: addDaysYmd\(await clinicTodayYmd\(organizationId, new Date\(\)\), 1\)/)
    expect(rule).toContain("kind: 'rebook'")
    expect(text).toMatch(/follow-up to rebook them the next day/i)
  })

  it('quotes the price and the trial from the config', () => {
    const { text } = renderGuide()
    expect(text).toContain(`$${getQuotedPlan().price.toLocaleString('en-US')}/mo`)
    expect(text).toContain(`${TRIAL.days} days free`)
  })
})

describe('the wiring', () => {
  it('has a complete head, typed as an article', () => {
    expect(String(metadata.title)).toMatch(/cancellation/i)
    expect(String(metadata.title)).toMatch(/no-show/i)
    expect(metadata.description).toBe(guide.description)
    expect(metadata.alternates?.canonical).toBe('/resources/dental-cancellation-no-show-policy')
    expect((metadata.openGraph as { type?: string }).type).toBe('article')
  })

  it('its content key follows what the page is built from, not only its own entry', () => {
    // A source re-read next year changes a quote or a date in
    // `guide-sources.ts` and nothing in the guide's registry entry. Keyed on
    // the entry alone, the page would change and the search engines would
    // never be told.
    const page = publicPages([]).find((p) => p.path === '/resources/dental-cancellation-no-show-policy')!
    expect(page).toBeTruthy()
    expect(page.contentKey).toBe(contentKey([guide, [NO_SHOW_SOURCES, productEmail('no_show_rebook')]]))
    expect(page.contentKey).not.toBe(contentKey(guide))
    // The same goes for the product's own email, which the first-miss card
    // renders: keyed on the sources alone, an edit to it would go untold.
    expect(page.contentKey).not.toBe(contentKey([guide, NO_SHOW_SOURCES]))
    expect(page.lastModified).toBe(guide.datePublished)
    // The guide cannot be dated before the newest read it reports.
    const newestRead = Object.values(NO_SHOW_SOURCES)
      .map((s) => s.readOn)
      .sort()
      .at(-1)!
    expect(guide.datePublished >= newestRead, 'the guide is dated before its newest read').toBe(true)
  })

  it('is linked from the footer of every marketing page', () => {
    expect(FOOTER_COLUMNS.flatMap((c) => c.links)).toContainEqual({
      label: 'Cancellation & no-show policy',
      href: '/resources/dental-cancellation-no-show-policy',
    })
  })

  it('and the two front-desk guides point at each other', () => {
    const here = renderGuide()
    expect(here.container.querySelector('a[href="/resources/dental-recall-scripts"]')).toBeTruthy()
    const recall = render(<RecallScriptsGuide />)
    expect(
      recall.container.querySelector('a[href="/resources/dental-cancellation-no-show-policy"]'),
    ).toBeTruthy()
  })
})
