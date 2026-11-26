import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import TreatmentFollowUpGuide, { metadata } from '@/app/(marketing)/resources/dental-unscheduled-treatment-follow-up/page'
import RecallScriptsGuide from '@/app/(marketing)/resources/dental-recall-scripts/page'
import { TREATMENT_FOLLOWUP } from '@/lib/marketing/guide-sources'
import { REMINDER_TEXT_SAMPLE, TREATMENT_CHECKIN_TEXT, asBlanks, fillSample, savedReply } from '@/lib/marketing/guide-templates'
import { GUIDE_SHORT_TITLES, getResourceGuide } from '@/lib/marketing/resources'
import { FOOTER_COLUMNS, TRIAL } from '@/lib/marketing/site'
import { getQuotedPlan } from '@/lib/stripe-config'
import { publicPages } from '@/lib/marketing/public-pages'
import { contentKey } from '@/lib/indexnow'
import { DEFAULT_MESSAGE_TEMPLATES } from '@/lib/types/message-templates'
import { FOLLOWUP_OUTCOMES } from '@/lib/types/followups'
import { NEVER_TOUCHED } from '@/lib/types/pms'
import { MESSAGE_ATTACHMENT_ACCEPT } from '@/lib/upload-kinds'
import { smsSegments } from '@/lib/sms-segments'

/**
 * THE UNSCHEDULED-TREATMENT FOLLOW-UP GUIDE (organic queue item 8, 2026-11-26).
 *
 * Every other guide in the library is about something the practice is owed or
 * has promised: a visit, a balance, a review it may ask for. This one is about
 * a decision that belongs to somebody else, which is where a script library
 * turns into a pressure kit if nobody is watching. What is held:
 *
 *   1. NO CARD PRESSES. No deadline of ours, no "before it gets worse", no
 *      exclamation mark, no capitals.
 *
 *   2. THE FRONT DESK NEVER SAYS WHAT HAPPENS IF THE PATIENT WAITS. No card
 *      carries a clinical word of ours. The one script that needs the
 *      consequence carries a blank for the dentist's own sentence, and the
 *      note under it gives the script for when the chart has none.
 *
 *   3. THE VOICEMAIL AND THE TEXT NAME NO TREATMENT AND NO COST.
 *
 *   4. THE CHECK-IN MESSAGE IS THE PRODUCT'S, read from the saved replies it
 *      ships with.
 *
 *   5. THE YEAR-END NOTE ASKS AND DOES NOT TELL. The source says plans
 *      differ; the page quotes that sentence too, and the template is
 *      conditional.
 *
 *   6. THE CLOSE SAYS WHAT THE PRODUCT DOES NOT DO, FIRST: it does not read
 *      treatment plans. Every other claim in it is tied to the code that
 *      makes it true.
 */

const guide = getResourceGuide('dental-unscheduled-treatment-follow-up')!
const ROOT = resolve(__dirname, '../..')
const source = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

function renderGuide() {
  const { container } = render(<TreatmentFollowUpGuide />)
  const cards = Array.from(container.querySelectorAll('figure')).map((f) => ({
    label: f.querySelector('figcaption')?.textContent ?? '',
    body: f.querySelector('blockquote')?.textContent ?? '',
  }))
  return {
    container,
    cards,
    text: container.textContent ?? '',
    article: container.querySelector('article')?.textContent ?? '',
  }
}

const card = (cards: Array<{ label: string; body: string }>, label: RegExp) => {
  const hit = cards.filter((c) => label.test(c.label))
  expect(hit, `one card labelled ${label}`).toHaveLength(1)
  return hit[0]
}

describe('the registry entry', () => {
  it('names what a front desk searches for', () => {
    expect(guide).toBeTruthy()
    expect(guide.title).toMatch(/unscheduled/i)
    expect(guide.title).toMatch(/treatment/i)
    expect(guide.title).toMatch(/follow-up scripts/i)
    expect(guide.glyph).toBe('tooth')
    expect(GUIDE_SHORT_TITLES['dental-unscheduled-treatment-follow-up']).toBe('Treatment follow-up scripts')
  })
})

describe('the material', () => {
  it('twelve cards, one for each moment', () => {
    const { cards } = renderGuide()
    card(cards, /^In person · the handoff/)
    card(cards, /^Email · the plan in writing/)
    card(cards, /^Message · the check-in/)
    card(cards, /^Text · the check-in/)
    card(cards, /^Phone · the check-in call/)
    card(cards, /^Voicemail ·/)
    card(cards, /^Phone · when it is the cost/)
    card(cards, /^Phone · when it is nerves/)
    card(cards, /^Phone · when it does not hurt/)
    card(cards, /^Phone · when it is time/)
    card(cards, /^Email or letter · the year-end benefits note/)
    card(cards, /^Letter · closing the loop/)
    expect(cards).toHaveLength(12)
  })

  it('no card picks a number, a price or a date for the practice', () => {
    const { cards } = renderGuide()
    for (const c of cards) {
      expect(c.body, `${c.label}: a dollar sign`).not.toMatch(/\$/)
      expect(c.body, `${c.label}: a typed number`).not.toMatch(/\d/)
      expect(c.body, `${c.label}: a percentage`).not.toMatch(/%|percent/i)
    }
  })

  it('no card presses', () => {
    const { cards } = renderGuide()
    for (const c of cards) {
      expect(c.body, `${c.label}: the closer’s register`).not.toMatch(
        /last chance|act now|don[’']t (?:wait|delay|put (?:it|this) off)|urgent|before it[’']s too late|limited time|use it or lose it|you (?:must|need to|have to|should)|only get worse|will get worse|risk|lose (?:your|the) (?:tooth|teeth|benefits)|!/i,
      )
      expect(c.body, `${c.label}: capitals`).not.toMatch(/\b[A-Z]{4,}\b(?<!STOP)/)
    }
  })

  it('the front desk never says what happens if the patient waits', () => {
    const { cards, article } = renderGuide()
    // Not one clinical word of ours in any card: what the treatment is and
    // what waiting does are blanks for the dentist's sentences.
    for (const c of cards) {
      expect(c.body, `${c.label}: a clinical word of ours`).not.toMatch(
        /infect|decay|cavit|abscess|root canal|extract|crown|filling|implant|gum disease|periodont|fracture|crack|spread|pain(?:ful)?\b|hurts?\b|nerve\b/i,
      )
    }
    const waiting = card(cards, /^Phone · when it does not hurt/)
    expect(waiting.body).toContain('{what the doctor said about waiting, word for word}')
    // …and when the chart has no such sentence, the script hands the question
    // to the dentist.
    expect(article).toMatch(/The middle of that script belongs to the dentist\./)
    expect(article).toMatch(/“That is a good question for the doctor\. Let me have them call you\.”/)
    // The rule itself is on the page.
    expect(article).toMatch(/The front desk repeats the doctor and adds nothing\./)
  })

  it('every script leaves the choice with the patient', () => {
    const { cards } = renderGuide()
    // Whether treatment can be staged is the dentist's call, so the cost
    // script offers to ask and does not promise it.
    expect(card(cards, /^Phone · when it is the cost/).body).toMatch(
      /Some treatment can be done in stages, and I can ask \{doctor\} whether yours can\./,
    )
    expect(card(cards, /^In person · the handoff/).body).toMatch(/Would it be all right if I checked in with you on \{day\}\?/)
    const call = card(cards, /^Phone · the check-in call/)
    expect(call.body).toMatch(/You asked me to check in/)
    expect(call.body).toMatch(/If they say no: “Thank you for telling me\./)
    expect(card(cards, /^Email or letter · the year-end/).body).toMatch(
      /If you have decided to wait, that is your call\. Tell us and we will not send another note about it\./,
    )
    expect(card(cards, /^Letter · closing the loop/).body).toMatch(/this is our last note about it for now/)
  })

  it('the voicemail and the text name no treatment and no cost', () => {
    const { cards, article } = renderGuide()
    const quiet = /treatment|plan\b|tooth|teeth|cost|estimate|insurance|benefit|balance|doctor|\{doctor\}/i
    expect(card(cards, /^Voicemail ·/).body).not.toMatch(quiet)
    expect(card(cards, /^Text ·/).body).not.toMatch(quiet)
    expect(article).toMatch(/No treatment, no tooth, no cost\./)
    expect(article).toMatch(/The text names no\s+treatment and no cost on purpose/)
  })
})

describe('the check-in message is the product’s', () => {
  it('read from the saved replies the product ships with', () => {
    const { cards, article } = renderGuide()
    const shipped = DEFAULT_MESSAGE_TEMPLATES.find((t) => t.name === 'Following up on your treatment plan')
    expect(shipped, 'the product no longer ships this saved reply').toBeTruthy()
    const reply = savedReply('Following up on your treatment plan')
    // The tokens became blanks and nothing else moved.
    expect(reply.body).toBe(asBlanks(shipped!.body))
    expect(reply.body).toBe(shipped!.body.split('{{firstName}}').join('{first name}'))
    expect(reply.body).toContain('{first name}')
    expect(reply.body).not.toMatch(/\{\{|\}\}/)
    expect(card(cards, /^Message · the check-in/).body).toBe(reply.body)
    expect(article).toMatch(/This is the saved reply that ships in\s+DreamCRM’s Messages/)
    // And the product does offer saved replies in the composer, seeded for
    // every practice.
    expect(source('lib/services/message-templates.ts')).toMatch(/seeds the starter set on first read/)
    expect(source('app/(double-sidebar)/messages/clinic-messages-view.tsx')).toContain('listMessageTemplates(')
  })

  it('asks for a saved reply the product does not ship and gets an error, not a blank card', () => {
    expect(() => savedReply('A reply nobody wrote')).toThrow(/No saved reply/)
  })
})

describe('the text', () => {
  it('is one message on a realistic fill, with the practice first and STOP last', () => {
    const { cards, article } = renderGuide()
    const text = card(cards, /^Text ·/)
    expect(text.body).toBe(TREATMENT_CHECKIN_TEXT)
    expect(TREATMENT_CHECKIN_TEXT.startsWith('{practice name}: ')).toBe(true)
    expect(TREATMENT_CHECKIN_TEXT.endsWith('Reply STOP to opt out.')).toBe(true)
    const filled = fillSample(TREATMENT_CHECKIN_TEXT)
    expect(filled, 'a blank the sample cannot fill').not.toMatch(/\{[^}]+\}/)
    expect(Object.keys(REMINDER_TEXT_SAMPLE)).toContain('{phone}')
    expect(smsSegments(filled)).toBe(1)
    expect(article).toMatch(/Text only patients who have agreed to get texts from you\./)
  })
})

describe('what the page quotes', () => {
  it('four pages, each pinned word for word, linked and dated', () => {
    expect(TREATMENT_FOLLOWUP.adaCode.says).toEqual({
      involvement:
        'The dentist should inform the patient of the proposed treatment, and any reasonable alternatives, in a manner that allows the patient to become involved in treatment decisions.',
    })
    expect(TREATMENT_FOLLOWUP.benefits.says).toEqual({
      deadline:
        'Many insurance companies have a benefit deadline of December 31, and this means that any of your unused benefits don’t roll over into the New Year for most dental plans.',
      varies:
        'Still, some plans may end at different times of the year, so check your plan document or ask your employer to be sure.',
    })
    expect(TREATMENT_FOLLOWUP.openDental.says).toEqual({
      report: 'Use the Treatment Finder report to identify active patients who have treatment planned procedures.',
      remaining:
        'Enter an amount to filter the report to only include patients that have insurance benefits remaining over the specified amount.',
    })
    expect(TREATMENT_FOLLOWUP.dentrix.says).toEqual({
      report:
        'Use the Unscheduled Treatment Plan Report to find and schedule treatment plans that have been added to the Chart but not scheduled in the Appointment Book.',
      remaining:
        'The report displays patient insurance benefits remaining, which you can use to find patients who still have insurance benefits available but have not yet scheduled an appointment for their treatment plans.',
    })
    const { container, article } = renderGuide()
    for (const [name, entry] of Object.entries(TREATMENT_FOLLOWUP)) {
      for (const words of Object.values(entry.says)) expect(article, `${name}: not on the page`).toContain(words)
      const link = container.querySelector(`a[href="${entry.source.url}"]`)
      expect(link, `${name}: no link`).toBeTruthy()
      expect(link!.getAttribute('rel') ?? '', name).toContain('nofollow')
      expect(entry.source.readOn, name).toBe('2026-11-26')
    }
    expect(article).toMatch(/were read November 26, 2026/)
    // Who said it is on the page beside what they said.
    expect(article).toMatch(/The American Dental Association’s code of conduct says/)
    expect(article).toMatch(/MouthHealthy, the American\s+Dental Association’s site for patients/)
    expect(article).toMatch(/Open Dental: “/)
    expect(article).toMatch(/Dentrix Enterprise: “/)
    // The Dentrix post is six years old, and the page says so.
    expect(TREATMENT_FOLLOWUP.dentrix.source.pageSays).toBe('June 10, 2020')
    expect(article).toMatch(/in a post dated June 10, 2020/)
  })
})

describe('the year-end note asks and does not tell', () => {
  it('is conditional on the patient’s own plan, promises nothing, and is sent once', () => {
    const { cards, article } = renderGuide()
    const note = card(cards, /^Email or letter · the year-end/)
    expect(note.body).toMatch(/If your dental plan runs on the calendar year, benefits you have not used by the end of December may not carry into next year\./)
    expect(note.body).toMatch(/Your plan document, or the number on your insurance card, will tell you for certain/)
    expect(note.body).not.toMatch(
      /will expire|expires? on|you (?:still )?have [^.]*\b(?:left|remaining)\b|don[’']t lose|covered in full|will (?:be covered|pay)/i,
    )
    // The reason for the "if" is the source's own second sentence.
    expect(article).toMatch(/That second sentence is why the note below asks and does not tell\./)
    // Who it goes to: the patients with benefits left, which the practice
    // software's own report shows (both vendors' sentences are on the page).
    expect(article).toMatch(/Send it to the patients it can help: the ones with benefits left\./)
    expect(article).toMatch(/Send it once\. A note about benefits running out, sent to a patient who has none\s+left, is an untruth with your name on it\./)
  })

  it('the estimate in the plan email is called an estimate', () => {
    const { cards } = renderGuide()
    const email = card(cards, /^Email · the plan in writing/)
    expect(email.body).toMatch(/The estimate is our best reading of your insurance benefits\./)
    expect(email.body).toMatch(/What your insurance pays is decided by your insurer\./)
    // It says a plan is attached and nothing about what is in it.
    expect(email.body).not.toMatch(/\{treatment/)
  })
})

describe('the closing letter', () => {
  it('ends the asking, keeps the door open, and sends the documentation question to the carrier', () => {
    const { cards, article } = renderGuide()
    const letter = card(cards, /^Letter · closing the loop/)
    expect(letter.body).toMatch(/We do not want to keep calling if you would rather we did not/)
    expect(letter.body).toMatch(/\{doctor\} will go over it with you again at your next check-up/)
    expect(letter.body).not.toMatch(/dismiss|discharge|release|no longer (?:be )?(?:able|responsible)|liab|refus|at your own/i)
    expect(article).toMatch(/is a question for your\s+malpractice carrier: ask them, then make their answer the routine\. This is not\s+legal advice\./)
  })
})

describe('who does what — the close', () => {
  it('says what the product does not do first, and ties the rest to the code', () => {
    const { text } = renderGuide()
    const close = text.slice(text.indexOf('Remembering to ask again is a job the software does'))
    // Treatment plans stay in the practice software.
    expect(NEVER_TOUCHED).toContain('Treatment plans')
    expect(close).toMatch(/DreamCRM does not read treatment plans\. They stay in your practice software, and so\s+does the list of who has not scheduled\./)
    // A follow-up has an owner and a due date…
    const service = source('lib/services/patient-followups.ts')
    expect(service).toMatch(/dueDate,\s+assignedUserId,/)
    expect(close).toMatch(/has an owner and a due date/)
    // …shows on that person's day until it is done…
    expect(source('app/(default)/my-day/page.tsx')).toContain('data.followups.overdue + data.followups.today')
    expect(close).toMatch(/shows on that person’s day until it\s+is done/)
    // …and asks how it went.
    expect(Object.keys(FOLLOWUP_OUTCOMES)).toEqual(expect.arrayContaining(['booked', 'no_answer', 'declined']))
    expect(close).toMatch(/asks how it went when you close it/)
    // The plan as a PDF in the thread.
    expect(MESSAGE_ATTACHMENT_ACCEPT).toContain('application/pdf')
    expect(close).toMatch(/the plan can go to the patient as a PDF in the same thread/)
    expect(close).toMatch(/does not send text messages\s+today/)
  })

  it('quotes the price and the trial from the config', () => {
    const { text } = renderGuide()
    expect(text).toContain(`$${getQuotedPlan().price.toLocaleString('en-US')}/mo`)
    expect(text).toContain(`${TRIAL.days} days free`)
  })
})

describe('the wiring', () => {
  it('has a complete head, typed as an article', () => {
    expect(String(metadata.title)).toMatch(/unscheduled dental treatment follow-up scripts/i)
    expect(metadata.description).toBe(guide.description)
    expect(metadata.alternates?.canonical).toBe('/resources/dental-unscheduled-treatment-follow-up')
    expect((metadata.openGraph as { type?: string }).type).toBe('article')
  })

  it('its content key follows what the page is built from', () => {
    const page = publicPages([]).find((p) => p.path === '/resources/dental-unscheduled-treatment-follow-up')!
    expect(page).toBeTruthy()
    expect(page.contentKey).toBe(
      contentKey([guide, [TREATMENT_FOLLOWUP, savedReply('Following up on your treatment plan'), TREATMENT_CHECKIN_TEXT]]),
    )
    expect(page.contentKey).not.toBe(contentKey(guide))
  })

  it('is in the footer, and the recall and membership guides are one click away in both directions', () => {
    expect(FOOTER_COLUMNS.flatMap((c) => c.links)).toContainEqual({
      label: 'Treatment follow-up scripts',
      href: '/resources/dental-unscheduled-treatment-follow-up',
    })
    const here = renderGuide()
    expect(here.container.querySelector('a[href="/resources/dental-recall-scripts"]')).toBeTruthy()
    expect(here.container.querySelector('a[href="/resources/dental-membership-plan-pricing"]')).toBeTruthy()
    const there = render(<RecallScriptsGuide />)
    expect(there.container.querySelector('a[href="/resources/dental-unscheduled-treatment-follow-up"]')).toBeTruthy()
  })
})
