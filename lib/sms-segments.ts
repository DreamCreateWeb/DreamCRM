/**
 * SMS SEGMENT MATH — pure, client-safe.
 *
 * Carriers bill and throttle per SEGMENT, not per message, and the boundary
 * moves with the alphabet: a body that fits GSM-7 carries 160 characters in
 * one segment (153 each once it splits), while a single emoji or smart
 * quote forces the whole message into UCS-2 — 70 characters (67 split).
 * That cliff is invisible in every composer that counts "characters", and
 * it is how a practice ends up paying three segments for a two-sentence
 * reminder because somebody's name has an accent.
 *
 * One home for the counting so the composer's meter, the budget counter and
 * the send path can never disagree about what a message costs.
 */

/** The GSM-7 basic character set (3GPP TS 23.038), as a lookup string. */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'

/** Extension-table characters — legal in GSM-7 but cost TWO septets each
 *  (an escape plus the char). The euro sign is the one that actually shows
 *  up in dental copy ("€99 whitening" from a template pasted off the web). */
const GSM7_EXTENSION = '^{}\\[~]|€'

const GSM7_SET = new Set(GSM7_BASIC.split(''))
const GSM7_EXT_SET = new Set(GSM7_EXTENSION.split(''))

/** Can the whole body ride the 7-bit alphabet? One character outside it
 *  reprices every character in the message. */
export function isGsm7(text: string): boolean {
  for (const ch of text) {
    if (!GSM7_SET.has(ch) && !GSM7_EXT_SET.has(ch)) return false
  }
  return true
}

/** The body's length in the units the carrier counts — septets for GSM-7
 *  (extension chars cost 2), UTF-16 code units for UCS-2 (an emoji costs 2,
 *  which is also how the carrier sees it). */
function carrierLength(text: string): number {
  if (isGsm7(text)) {
    let n = 0
    for (const ch of text) n += GSM7_EXT_SET.has(ch) ? 2 : 1
    return n
  }
  return text.length // UTF-16 code units — surrogate pairs count 2, correctly
}

/** How many segments this body costs. Zero for an empty body — nothing to
 *  send is nothing to bill. */
export function smsSegments(text: string): number {
  if (!text) return 0
  const gsm = isGsm7(text)
  const len = carrierLength(text)
  const single = gsm ? 160 : 70
  const multi = gsm ? 153 : 67
  if (len <= single) return 1
  return Math.ceil(len / multi)
}

/**
 * Campaign HTML → the plain text a phone shows.
 *
 * Campaigns store bodyHtml (the email composer's output); a text message
 * needs the words. Block elements become line breaks, links keep their
 * visible text plus the href when they differ (a phone can't hover), and
 * entities decode. Deliberately minimal — this converts OUR OWN composer's
 * output, not arbitrary web HTML.
 */
export function htmlToSmsText(html: string): string {
  let s = html
  // Keep a link's destination when its text isn't already the URL.
  // [\s\S] instead of the dotAll flag — the tsconfig targets pre-es2018.
  s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, '').trim()
    if (!text) return href
    return text === href ? href : `${text} ${href}`
  })
  // Block boundaries → newlines before the tag-strip flattens everything.
  s = s.replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  s = s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
  // Collapse the whitespace an HTML document tolerates into what a text
  // message can carry: every line trimmed, no blank lines at all — on a
  // phone a newline IS the paragraph break, and every blank line is paid
  // for in segments.
  return s
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n')
}
