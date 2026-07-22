import { describe, it, expect } from 'vitest'
import { namesLooselyMatch, normalizePersonName, splitFullName } from '@/lib/patient-identity'
import { cancelActorLabel } from '@/lib/cancel-actor'

/**
 * The 2026-07-22 guard rails, pure-logic layer:
 *  - namesLooselyMatch decides whether a contact-info match may claim an
 *    existing chart. FAMILY MEMBERS SHARE LAST NAMES — first-name rigor is
 *    the whole point.
 *  - cancelActorLabel is the single home for "who cancelled this" phrasing.
 */

const n = (firstName: string, lastName: string) => ({ firstName, lastName })

describe('namesLooselyMatch', () => {
  it('matches the same person (case/whitespace insensitive)', () => {
    expect(namesLooselyMatch(n('Maria', 'Aguilera'), n('  maria', 'AGUILERA '))).toBe(true)
  })

  it('NEVER matches a family member — same last name, different first name', () => {
    // The exact mixup: John used the family email; he is not Maria.
    expect(namesLooselyMatch(n('John', 'Aguilera'), n('Maria', 'Aguilera'))).toBe(false)
  })

  it('never matches a different last name even with the same first name', () => {
    expect(namesLooselyMatch(n('Maria', 'Lopez'), n('Maria', 'Aguilera'))).toBe(false)
  })

  it('accepts a single-letter first initial ("M Aguilera" ≈ "Maria Aguilera")', () => {
    expect(namesLooselyMatch(n('M', 'Aguilera'), n('Maria', 'Aguilera'))).toBe(true)
  })

  it('a nickname is a MISMATCH (safe failure mode: flagged duplicate, not a wrong chart)', () => {
    expect(namesLooselyMatch(n('Mike', 'Chen'), n('Michael', 'Chen'))).toBe(false)
  })

  it('ignores diacritics and punctuation (José/Jose, O’Brien/OBrien)', () => {
    expect(namesLooselyMatch(n('José', "O'Brien"), n('Jose', 'OBrien'))).toBe(true)
  })

  it('falls back to first-name-only when one side has no last name (chat single names)', () => {
    expect(namesLooselyMatch(n('Maria', '—'), n('Maria', 'Aguilera'))).toBe(true)
    expect(namesLooselyMatch(n('John', '—'), n('Maria', 'Aguilera'))).toBe(false)
  })

  it('an empty first name never matches anything', () => {
    expect(namesLooselyMatch(n('', 'Aguilera'), n('Maria', 'Aguilera'))).toBe(false)
  })
})

describe('normalizePersonName / splitFullName', () => {
  it('normalizes case, spacing, punctuation, and diacritics', () => {
    expect(normalizePersonName('  José-Luis   O’BRIEN ')).toBe('joseluis obrien')
    expect(normalizePersonName(null)).toBe('')
  })

  it('splits a free-text full name into first + rest', () => {
    expect(splitFullName('Maria Aguilera Cruz')).toEqual({ firstName: 'Maria', lastName: 'Aguilera Cruz' })
    expect(splitFullName('Maria')).toEqual({ firstName: 'Maria', lastName: '' })
  })
})

describe('cancelActorLabel', () => {
  it('phrases every recorded actor', () => {
    expect(cancelActorLabel('portal')).toBe('cancelled from the patient portal')
    expect(cancelActorLabel('staff', 'Sarah Chen')).toBe('cancelled by Sarah Chen')
    expect(cancelActorLabel('staff')).toBe('cancelled by the office')
    expect(cancelActorLabel('reschedule')).toBe('moved to a new time')
    expect(cancelActorLabel('waitlist_claim')).toBe('moved up via the waitlist')
    expect(cancelActorLabel('pms')).toBe('cancelled in the practice system')
  })

  it('returns null for legacy/unknown rows — render nothing rather than guess', () => {
    expect(cancelActorLabel(null)).toBeNull()
    expect(cancelActorLabel('something_new')).toBeNull()
  })
})
