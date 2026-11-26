import { EMAIL_AUTOMATION_SPECS, type EmailAutomationKey, type EmailSlots } from '@/lib/types/email-automations'
import { DEFAULT_MESSAGE_TEMPLATES } from '@/lib/types/message-templates'

/**
 * THE PRODUCT'S OWN EMAILS, AS A GUIDE SHOWS THEM — read, never retyped.
 *
 * The resource registry's content law is that a template shown in a guide is
 * real product copy or derived from it. The recall guide TYPES its email and
 * says it "ships inside" the product, which is true until somebody edits one
 * and not the other. So a guide that shows one of the product's automated
 * emails reads it from the spec the product sends from
 * (`EMAIL_AUTOMATION_SPECS`, client-safe) and respells the product's
 * `{{tokens}}` as the `{blanks}` every card in the library uses.
 *
 * A TOKEN WITH NO BLANK THROWS. The failure this guards against is a raw
 * `{{appointmentTime}}` in front of a reader, and the place to find that out
 * is the build, not a search result. Only the tokens the guides' emails use
 * are mapped; the first guide to show a billing or shop email adds its own.
 *
 * What a guide may NOT take from here is a promise. A card says what the
 * email says; whether the product sends it, and when, is the closing block's
 * claim, tied in that guide's test to the default that makes it true.
 */
const BLANKS: ReadonlyArray<readonly [token: string, blank: string]> = [
  ['{{firstName}}', '{first name}'],
  ['{{patientName}}', '{patient name}'],
  ['{{clinicName}}', '{practice name}'],
  ['{{clinicPhone}}', '{phone}'],
  ['{{appointmentType}}', '{visit type}'],
  ['{{appointmentDate}}', '{date}'],
  // The product's "time" token is the whole moment — "Monday, Jan 5 at 9:00 AM".
  ['{{appointmentTime}}', '{day and time}'],
  ['{{balance}}', '{balance}'],
]

/** The tokens this module can respell. */
export const GUIDE_BLANK_TOKENS: readonly string[] = BLANKS.map(([token]) => token)

export function asBlanks(productCopy: string): string {
  const out = BLANKS.reduce((s, [token, blank]) => s.replaceAll(token, blank), productCopy)
  const left = /\{\{[^}]*\}\}/.exec(out)
  if (left) throw new Error(`guide-templates: no blank for the product token ${left[0]}`)
  return out
}

/** The default copy of one of the product's automated emails, with blanks. */
export function productEmail(key: EmailAutomationKey): EmailSlots {
  const d = EMAIL_AUTOMATION_SPECS[key].slotDefaults
  return {
    subject: asBlanks(d.subject),
    body: asBlanks(d.body),
    ...(d.heading != null ? { heading: asBlanks(d.heading) } : {}),
    ...(d.closing != null ? { closing: asBlanks(d.closing) } : {}),
  }
}

/**
 * The product emails the reminder guide shows, in the order it shows them.
 * One list, read by the page, by the page's search-notice key
 * (`public-pages.ts`) and by its test — so a fifth email added to the page
 * cannot be left out of the key that tells the search engines it changed.
 */
export const REMINDER_GUIDE_EMAILS = [
  'booking_confirmation',
  'appointment_reminder',
  'appointment_reminder_confirmed',
  'rescheduled',
] as const satisfies readonly EmailAutomationKey[]

/**
 * THE REMINDER TEXTS — hand-written, and held to ONE SEGMENT by test.
 *
 * These are not the product's: it does not send text messages today, and no
 * card or sentence around them may say otherwise. They are written to the
 * conditions the federal calling rule sets for a health-care provider's
 * reminder texts (47 CFR 64.1200(a)(9)(iv), quoted on the guide): the
 * practice named, a way to reach it, nothing about money, 160 characters or
 * less, the STOP line. Plain characters only — one curly quote reprices the
 * whole message (`lib/sms-segments.ts`), so these use the straight
 * apostrophe on purpose.
 */
export const REMINDER_TEXTS = {
  /** Asks for a confirmation by reply — the shortest, and it needs no link. */
  reply:
    "{practice name}: {first name}, your visit is {day} at {time}. Reply C to confirm, or call {phone} to change it. Reply STOP to opt out.",
  /** Asks for a confirmation by link — one character under the limit on the sample fill. */
  link: "{practice name}: {first name}, your visit is {day} at {time}. Confirm: {link} or call {phone}. Reply STOP to opt out.",
  /** The day-before heads-up for a visit already confirmed: no ask. */
  confirmed:
    "{practice name}: See you {day} at {time}, {first name}. Need to change it? Call {phone}. Reply STOP to opt out.",
  /** One text for a family's same-day visits on a shared phone. */
  family:
    "{practice name}: your family's visits on {day}: {first name} {time}, {second name} {second time}. Questions? Call {phone}. Reply STOP to opt out.",
} as const

/** A realistic fill, for measuring a text the way a carrier will. */
export const REMINDER_TEXT_SAMPLE: Record<string, string> = {
  '{practice name}': 'Maple Street Dental',
  '{first name}': 'Alexandria',
  '{visit type}': 'cleaning',
  '{day}': 'Tue, Jun 9',
  '{time}': '10:30 AM',
  '{link}': 'https://mapledental.example/c/8fk2',
  '{phone}': '555-010-0142',
  '{second name}': 'Benjamin',
  '{second time}': '11:15 AM',
}

export function fillSample(template: string): string {
  return Object.entries(REMINDER_TEXT_SAMPLE).reduce((s, [blank, value]) => s.replaceAll(blank, value), template)
}

/**
 * THE REVIEW REQUEST TEXT — hand-written, one message on the sample fill.
 *
 * Not the product's (it sends no text today). And not a reminder: asking for
 * a review is not among the purposes the calling rule's health-care exemption
 * lists, so the guide says to text only patients who agreed to hear from the
 * practice by text. It carries the practice's name first and the STOP line
 * last; "good or bad" is in the message because asking only for good ones is
 * the thing Google's policy forbids.
 */
export const REVIEW_REQUEST_TEXT =
  '{practice name}: Thanks for coming in, {first name}. Would you share how it went, good or bad? {link} Reply STOP to opt out.'

/**
 * ONE OF THE PRODUCT'S SAVED REPLIES, AS A GUIDE SHOWS IT — read by name from
 * the starter set every practice's Messages is seeded with
 * (`DEFAULT_MESSAGE_TEMPLATES`), tokens respelled as blanks.
 *
 * It THROWS when the product no longer ships a reply by that name. A guide
 * that says "this is the saved reply that ships in Messages" over a card the
 * product stopped shipping is the exact drift this module exists to prevent,
 * and the place to find it out is the build.
 */
export function savedReply(name: string): { name: string; body: string } {
  const hit = DEFAULT_MESSAGE_TEMPLATES.find((t) => t.name === name)
  if (!hit) throw new Error(`guide-templates: No saved reply named “${name}” ships with the product`)
  return { name: hit.name, body: asBlanks(hit.body) }
}

/**
 * THE TREATMENT CHECK-IN TEXT — hand-written, one message on the sample fill.
 *
 * Not the product's (it sends no text today). It names no treatment, no tooth
 * and no cost: a phone screen is read by whoever is holding the phone. The
 * practice's name first and the STOP line last, like every text in this
 * library, and straight punctuation only (one curly quote reprices the whole
 * message).
 */
export const TREATMENT_CHECKIN_TEXT =
  '{practice name}: Hi {first name}, checking in after your visit, as promised. Any questions? Call {phone} or reply here. Reply STOP to opt out.'
