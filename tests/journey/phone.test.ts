import { describe, it, expect } from 'vitest'
import { toE164, isTextable, formatPhone, lastFour, dedupeByNumber } from '@/lib/phone'

/**
 * PHONE NORMALISATION — the one place a number becomes canonical.
 *
 * `patient.phone` is a plain text column that has accepted every spelling a
 * front desk can produce, and the SMS rails want E.164. These pin the
 * conversion, and in particular the cases where the honest answer is null:
 * a number we cannot parse must never be sent to a carrier and reported as
 * delivered.
 */

describe('toE164', () => {
  it('accepts the spellings a human actually types', () => {
    for (const raw of [
      '4155550142',
      '415-555-0142',
      '(415) 555-0142',
      '415.555.0142',
      '415 555 0142',
      '+1 415 555 0142',
      '1-415-555-0142',
      '  (415) 555-0142  ',
    ]) {
      expect(toE164(raw), raw).toBe('+14155550142')
    }
  })

  it('drops an extension — it is a front-desk fact, not something a carrier routes to', () => {
    expect(toE164('415-555-0142 x204')).toBe('+14155550142')
    expect(toE164('4155550142 ext. 12')).toBe('+14155550142')
    expect(toE164('(415) 555-0142 extension 9')).toBe('+14155550142')
  })

  it('returns null for nothing at all', () => {
    expect(toE164(null)).toBeNull()
    expect(toE164(undefined)).toBeNull()
    expect(toE164('')).toBeNull()
    expect(toE164('   ')).toBeNull()
  })

  it('returns null for the wrong number of digits', () => {
    expect(toE164('415555')).toBeNull()
    expect(toE164('415555014')).toBeNull() // nine
    expect(toE164('41555501428')).toBeNull() // eleven, not starting 1
  })

  it('REJECTS the placeholder numbers people type to get past a required field', () => {
    // The booking form makes phone required, so these get typed. Each is a
    // message that silently goes nowhere and a segment we paid for.
    expect(toE164('0000000000')).toBeNull()
    expect(toE164('1111111111')).toBeNull()
    expect(toE164('(123) 456-7890')).toBeNull() // area code starts with 1
    expect(toE164('415-055-0142')).toBeNull() // exchange starts with 0
  })

  it('returns null for a non-US number rather than coercing it into a plausible fake', () => {
    // A2P 10DLC is a US framework. Silently mangling +44 into something
    // ten digits long would produce a number that looks valid and fails at
    // the carrier — worse than an honest null the UI can flag.
    expect(toE164('+44 20 7946 0958')).toBeNull()
    expect(toE164('+33 1 42 68 53 00')).toBeNull()
  })

  it('is idempotent — normalising an already-canonical number changes nothing', () => {
    expect(toE164('+14155550142')).toBe('+14155550142')
    expect(toE164(toE164('(415) 555-0142'))).toBe('+14155550142')
  })
})

describe('isTextable', () => {
  it('is the single predicate an SMS caller asks', () => {
    expect(isTextable('(415) 555-0142')).toBe(true)
    expect(isTextable('0000000000')).toBe(false)
    expect(isTextable(null)).toBe(false)
  })
})

describe('formatPhone', () => {
  it('shows a parseable number the way a person reads it', () => {
    expect(formatPhone('4155550142')).toBe('(415) 555-0142')
    expect(formatPhone('+14155550142')).toBe('(415) 555-0142')
  })

  it('shows an UNPARSEABLE number as typed rather than blanking it', () => {
    // It is still the number the front desk wrote down, and they need to see
    // it to fix it. Hiding it hides the rows that need editing.
    expect(formatPhone('call the office')).toBe('call the office')
    expect(formatPhone('555-1234')).toBe('555-1234')
  })

  it('renders nothing for nothing', () => {
    expect(formatPhone(null)).toBe('')
    expect(formatPhone('')).toBe('')
  })
})

describe('lastFour', () => {
  it('echoes a number without printing it in full', () => {
    expect(lastFour('(415) 555-0142')).toBe('0142')
  })

  it('is empty for an unparseable number — never a partial echo of arbitrary text', () => {
    expect(lastFour('call the office')).toBe('')
    expect(lastFour(null)).toBe('')
  })
})

describe('dedupeByNumber', () => {
  const p = (id: string, phone: string | null) => ({ id, phone })

  it('collapses the same phone spelled differently, keeping the first seen', () => {
    const out = dedupeByNumber(
      [p('a', '(415) 555-0142'), p('b', '415-555-0142'), p('c', '4155559999')],
      (x) => x.phone,
    )
    expect(out.map((x) => x.id)).toEqual(['a', 'c'])
  })

  it('does NOT collapse unparseable numbers together — they are different unknowns', () => {
    // Merging them would silently drop a real patient whose number just
    // needs correcting.
    const out = dedupeByNumber([p('a', 'call office'), p('b', 'ask mum'), p('c', null)], (x) => x.phone)
    expect(out).toHaveLength(3)
  })

  it('leaves a list with nothing to merge exactly as it was', () => {
    const list = [p('a', '4155550142'), p('b', '4155559999')]
    expect(dedupeByNumber(list, (x) => x.phone)).toEqual(list)
  })
})
