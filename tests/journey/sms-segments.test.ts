import { describe, it, expect } from 'vitest'
import { isGsm7, smsSegments, htmlToSmsText } from '@/lib/sms-segments'

/**
 * SMS SEGMENT MATH. Carriers bill per segment and the boundary moves with
 * the alphabet — the cliff every "character counter" composer hides. These
 * pin the boundaries exactly, because an off-by-one here is money on every
 * send and a truncated reminder on the worst ones.
 */

describe('isGsm7', () => {
  it('plain dental copy rides the 7-bit alphabet', () => {
    expect(isGsm7('Hi Sam, a reminder about your cleaning tomorrow at 10:00 AM. Reply STOP to opt out.')).toBe(true)
  })

  it('one emoji reprices the whole message', () => {
    expect(isGsm7('See you tomorrow 🦷')).toBe(false)
  })

  it('smart quotes — the character a pasted template actually smuggles in — are not GSM-7', () => {
    expect(isGsm7('We’ve got room Thursday')).toBe(false)
    expect(isGsm7("We've got room Thursday")).toBe(true)
  })
})

describe('smsSegments — the exact boundaries', () => {
  it('nothing costs nothing', () => {
    expect(smsSegments('')).toBe(0)
  })

  it('GSM-7: 160 in one, 161 splits, and split segments carry 153', () => {
    expect(smsSegments('a'.repeat(160))).toBe(1)
    expect(smsSegments('a'.repeat(161))).toBe(2)
    expect(smsSegments('a'.repeat(306))).toBe(2)
    expect(smsSegments('a'.repeat(307))).toBe(3)
  })

  it('UCS-2: 70 in one, 71 splits, split segments carry 67', () => {
    const uc = (n: number) => '’' + 'a'.repeat(n - 1) // one smart quote forces UCS-2
    expect(smsSegments(uc(70))).toBe(1)
    expect(smsSegments(uc(71))).toBe(2)
    expect(smsSegments(uc(134))).toBe(2)
    expect(smsSegments(uc(135))).toBe(3)
  })

  it('GSM-7 extension characters cost TWO septets — 80 euro signs fill a segment', () => {
    expect(smsSegments('€'.repeat(80))).toBe(1)
    expect(smsSegments('€'.repeat(81))).toBe(2)
  })

  it('an emoji costs two UTF-16 units, the same way the carrier counts it', () => {
    // 35 emoji = 70 units = one UCS-2 segment; 36 = 72 units = two.
    expect(smsSegments('🦷'.repeat(35))).toBe(1)
    expect(smsSegments('🦷'.repeat(36))).toBe(2)
  })
})

describe('htmlToSmsText — the composer’s HTML becomes the words a phone shows', () => {
  it('flattens paragraphs to line breaks and strips tags', () => {
    expect(htmlToSmsText('<p>Hi {{firstName}},</p><p>See you Tuesday.</p>')).toBe(
      'Hi {{firstName}},\nSee you Tuesday.',
    )
  })

  it('keeps a link’s destination — a phone can’t hover', () => {
    expect(htmlToSmsText('<p>Pick a time: <a href="https://x.com/book">book here</a></p>')).toBe(
      'Pick a time: book here https://x.com/book',
    )
  })

  it('does not print a URL twice when the link text IS the URL', () => {
    expect(htmlToSmsText('<a href="https://x.com/book">https://x.com/book</a>')).toBe('https://x.com/book')
  })

  it('decodes entities and collapses the whitespace HTML tolerates', () => {
    expect(htmlToSmsText('<p>Coffee&nbsp;&amp;&nbsp;cleanings</p>\n\n\n<p></p><p>Soon.</p>')).toBe(
      'Coffee & cleanings\nSoon.',
    )
  })
})
