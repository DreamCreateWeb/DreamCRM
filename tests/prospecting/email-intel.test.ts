import { describe, it, expect } from 'vitest'
import {
  parseEmail,
  isJunkEmail,
  isDisposableDomain,
  isFreeProvider,
  matchesPersonName,
  contactRoleFor,
  rankContactEmail,
  pickPrimaryEmail,
} from '@/lib/prospect-email'

/**
 * Pure email intelligence — syntax/junk gating, role inference, owner-name
 * matching, and the send-preference ranking that decides which address the
 * engine reaches out on. This is the reachability layer's brain.
 */

describe('parseEmail', () => {
  it('lowercases + splits valid addresses', () => {
    expect(parseEmail('  DrJane@SmileDental.COM ')).toEqual({
      email: 'drjane@smiledental.com',
      localPart: 'drjane',
      domain: 'smiledental.com',
    })
  })
  it('rejects the crawl’s asset false-positives and malformed input', () => {
    expect(parseEmail('logo@2x.png')).toBeNull() // asset TLD
    expect(parseEmail('sprite@image.svg')).toBeNull()
    expect(parseEmail('not-an-email')).toBeNull()
    expect(parseEmail('a@b')).toBeNull() // no TLD
    expect(parseEmail(null)).toBeNull()
  })
})

describe('isJunkEmail', () => {
  it('kills tracking/template/no-reply junk', () => {
    expect(isJunkEmail('test@example.com')).toBe(true)
    expect(isJunkEmail('you@yourdomain.com')).toBe(true)
    expect(isJunkEmail('noreply@smiledental.com')).toBe(true)
    expect(isJunkEmail('postmaster@smiledental.com')).toBe(true)
    expect(isJunkEmail('info@smiledental.com')).toBe(false)
  })
})

describe('disposable + free provider', () => {
  it('flags throwaways and known consumer providers', () => {
    expect(isDisposableDomain('mailinator.com')).toBe(true)
    expect(isDisposableDomain('smiledental.com')).toBe(false)
    expect(isFreeProvider('gmail.com')).toBe(true)
    expect(isFreeProvider('smiledental.com')).toBe(false)
  })
})

describe('matchesPersonName', () => {
  it('matches whole-token, flast, and firstl patterns', () => {
    expect(matchesPersonName('drjane', 'Dr. Jane Roe')).toBe(true) // token
    expect(matchesPersonName('jane.roe', 'Jane Roe')).toBe(true)
    expect(matchesPersonName('jroe', 'Jane Roe')).toBe(true) // flast
    expect(matchesPersonName('janer', 'Jane Roe')).toBe(true) // firstl
    expect(matchesPersonName('info', 'Jane Roe')).toBe(false)
    expect(matchesPersonName('drjane', null)).toBe(false)
  })
})

describe('contactRoleFor', () => {
  it('owner-name match wins over everything', () => {
    expect(contactRoleFor('drjane@smiledental.com', 'Jane Roe')).toBe('owner')
  })
  it('maps role local-parts to their buckets', () => {
    expect(contactRoleFor('info@x.com')).toBe('generic')
    expect(contactRoleFor('office@x.com')).toBe('front_desk')
    expect(contactRoleFor('reception@x.com')).toBe('front_desk')
    expect(contactRoleFor('billing@x.com')).toBe('billing')
  })
  it('reads a name-shaped local-part as a person', () => {
    expect(contactRoleFor('smith@x.com')).toBe('personal')
    expect(contactRoleFor('john.smith@x.com')).toBe('personal')
    expect(contactRoleFor('x8f2z9@x.com')).toBe('unknown')
  })
})

describe('rankContactEmail', () => {
  it('ranks a verified owner address above a verified shared desk', () => {
    const owner = rankContactEmail({ email: 'drjane@smiledental.com', personName: 'Jane Roe', verifyStatus: 'valid' })
    const info = rankContactEmail({ email: 'info@smiledental.com', personName: 'Jane Roe', verifyStatus: 'valid' })
    expect(owner).toBeGreaterThan(info)
  })
  it('floors invalid + disposable so they can never be primary', () => {
    expect(rankContactEmail({ email: 'drjane@smiledental.com', verifyStatus: 'invalid' })).toBeLessThan(-900)
    expect(rankContactEmail({ email: 'a@mailinator.com', verifyStatus: 'valid' })).toBeLessThan(-900)
  })
  it('prefers a deliverable address over an unverified/risky one', () => {
    const valid = rankContactEmail({ email: 'office@x.com', verifyStatus: 'valid' })
    const risky = rankContactEmail({ email: 'office@x.com', verifyStatus: 'risky' })
    expect(valid).toBeGreaterThan(risky)
  })
})

describe('pickPrimaryEmail', () => {
  it('chooses the named owner over the desk, skipping invalid ones', () => {
    const best = pickPrimaryEmail(
      [
        { email: 'info@smiledental.com', verifyStatus: 'valid' },
        { email: 'drjane@smiledental.com', verifyStatus: 'valid' },
        { email: 'old@smiledental.com', verifyStatus: 'invalid' },
      ],
      'Jane Roe',
    )
    expect(best).toBe('drjane@smiledental.com')
  })
  it('returns null when nothing is deliverable', () => {
    expect(
      pickPrimaryEmail([{ email: 'dead@nowhere.test', verifyStatus: 'invalid' }], null),
    ).toBeNull()
  })
})
