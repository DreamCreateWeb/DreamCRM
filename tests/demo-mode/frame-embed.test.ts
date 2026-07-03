import { describe, it, expect } from 'vitest'

/**
 * Frame-embeddability matrix for the compare view's left pane — XFO and
 * CSP frame-ancestors handling, case-insensitivity, and the permissive
 * defaults (no headers = embeddable; the CALLER treats fetch failure as
 * blocked).
 */

import { isFrameBlocked } from '@/lib/frame-embed'

describe('isFrameBlocked', () => {
  it('X-Frame-Options DENY / SAMEORIGIN block (any casing)', () => {
    expect(isFrameBlocked({ xfo: 'DENY' })).toBe(true)
    expect(isFrameBlocked({ xfo: 'sameorigin' })).toBe(true)
    expect(isFrameBlocked({ xfo: ' SameOrigin ' })).toBe(true)
  })

  it('CSP frame-ancestors blocks unless wildcard', () => {
    expect(isFrameBlocked({ csp: "frame-ancestors 'none'" })).toBe(true)
    expect(isFrameBlocked({ csp: "frame-ancestors 'self'" })).toBe(true)
    expect(isFrameBlocked({ csp: 'frame-ancestors https://their-partner.com' })).toBe(true)
    expect(isFrameBlocked({ csp: "default-src 'self'; frame-ancestors *" })).toBe(false)
    expect(isFrameBlocked({ csp: "Default-Src 'self'; FRAME-ANCESTORS *".toLowerCase() })).toBe(false)
  })

  it('CSP without frame-ancestors does not block', () => {
    expect(isFrameBlocked({ csp: "default-src 'self'; img-src *" })).toBe(false)
  })

  it('no headers = embeddable (fetch failure is the caller’s blocked case)', () => {
    expect(isFrameBlocked({})).toBe(false)
    expect(isFrameBlocked({ xfo: null, csp: null })).toBe(false)
    expect(isFrameBlocked({ xfo: 'ALLOWALL' })).toBe(false)
  })
})
