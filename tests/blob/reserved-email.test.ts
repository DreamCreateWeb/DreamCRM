import { describe, it, expect } from 'vitest'
import { isReservedUndeliverableAddress } from '@/lib/email'

/**
 * The deliver() guard for RFC-reserved undeliverable domains — the fix for
 * the prod Resend 422s (seeded persona addresses) and the safety rail that
 * lets the demo clinic sync NexHealth's sandbox practice (all @example.com
 * patients) without the reminder engine mailing a black hole.
 */
describe('isReservedUndeliverableAddress', () => {
  it('catches the RFC 2606 second-level domains and subdomains of them', () => {
    expect(isReservedUndeliverableAddress('maria.lopez@example.com')).toBe(true)
    expect(isReservedUndeliverableAddress('x@example.org')).toBe(true)
    expect(isReservedUndeliverableAddress('x@mail.example.net')).toBe(true)
    expect(isReservedUndeliverableAddress('Abbi.Rebo.790.22390@EXAMPLE.COM')).toBe(true)
  })

  it('catches the reserved TLDs', () => {
    expect(isReservedUndeliverableAddress('a@clinic.test')).toBe(true)
    expect(isReservedUndeliverableAddress('a@anything.invalid')).toBe(true)
    expect(isReservedUndeliverableAddress('a@demo.example')).toBe(true)
    expect(isReservedUndeliverableAddress('a@localhost')).toBe(true)
  })

  it('never touches real-looking mail', () => {
    expect(isReservedUndeliverableAddress('maria@gmail.com')).toBe(false)
    expect(isReservedUndeliverableAddress('front@exampledental.com')).toBe(false)
    expect(isReservedUndeliverableAddress('x@myexample.community')).toBe(false)
    expect(isReservedUndeliverableAddress('not-an-email')).toBe(false)
    expect(isReservedUndeliverableAddress('')).toBe(false)
  })
})
