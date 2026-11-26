import { EMAIL_AUTOMATION_SPECS, type EmailAutomationKey, type EmailSlots } from '@/lib/types/email-automations'

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
