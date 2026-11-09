import { describe, it, expect, vi, beforeEach } from 'vitest'
import { emailDomainFor, resolveSenderTier } from '@/lib/email-identity'

/** ML-63 — the tier matrix (pure) + the DB resolver that applies it. */

const base = {
  hasGmail: false,
  customDomainState: 'active',
  websiteDomain: 'www.nwasmiles.com',
  emailDomainName: 'nwasmiles.com',
  emailDomainStatus: 'verified',
}

describe('emailDomainFor', () => {
  it('drops www, scheme, path and case', () => {
    expect(emailDomainFor('www.NWAsmiles.com')).toBe('nwasmiles.com')
    expect(emailDomainFor('https://nwasmiles.com/x')).toBe('nwasmiles.com')
  })
  it('refuses non-hosts', () => {
    expect(emailDomainFor(null)).toBeNull()
    expect(emailDomainFor('localhost')).toBeNull()
    expect(emailDomainFor('a b.com')).toBeNull()
  })
})

describe('resolveSenderTier matrix', () => {
  it('no email domain → platform', () => {
    expect(resolveSenderTier({ ...base, emailDomainName: null, emailDomainStatus: null })).toBe('platform')
  })
  it('pending → platform (Tier 1 keeps sending)', () => {
    expect(resolveSenderTier({ ...base, emailDomainStatus: 'pending' })).toBe('platform')
  })
  it('failed → platform', () => {
    expect(resolveSenderTier({ ...base, emailDomainStatus: 'failed' })).toBe('platform')
  })
  it('verified + site active → own domain', () => {
    expect(resolveSenderTier(base)).toBe('own_domain')
  })
  it('verified but the site is no longer active there → platform', () => {
    expect(resolveSenderTier({ ...base, customDomainState: 'pending_dns' })).toBe('platform')
    expect(resolveSenderTier({ ...base, websiteDomain: null })).toBe('platform')
  })
  it('verified for a domain the site has since moved off → platform', () => {
    expect(resolveSenderTier({ ...base, websiteDomain: 'www.other.com' })).toBe('platform')
  })
  it('Gmail designated always wins', () => {
    expect(resolveSenderTier({ ...base, hasGmail: true })).toBe('gmail')
  })
})

