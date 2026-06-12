import { describe, it, expect } from 'vitest'
import { isDeploymentSkewError } from '@/lib/auth/submit-guard'

/**
 * isDeploymentSkewError — the matcher behind deploy-skew resilience. It must
 * recognize the Next.js stale-server-action error (which arrives via message
 * AND/OR digest) so auth-critical forms reload instead of showing a raw error.
 */
describe('isDeploymentSkewError', () => {
  it('matches the canonical "Failed to find Server Action" message', () => {
    const err = new Error(
      'Failed to find Server Action "abc123". This request might be from an older or newer deployment.',
    )
    expect(isDeploymentSkewError(err)).toBe(true)
  })

  it('matches when the text rides on the error digest (server-thrown shape)', () => {
    const err = Object.assign(new Error('An error occurred in the Server Components render.'), {
      digest: 'Failed to find Server Action "x". This request might be from an older or newer deployment.',
    })
    expect(isDeploymentSkewError(err)).toBe(true)
  })

  it('matches the "older or newer deployment" phrasing alone', () => {
    expect(isDeploymentSkewError(new Error('This request might be from an older or newer deployment.'))).toBe(true)
  })

  it('matches a plain string error', () => {
    expect(isDeploymentSkewError('Failed to find Server Action "z".')).toBe(true)
  })

  it('does NOT match ordinary auth errors (so they surface normally)', () => {
    expect(isDeploymentSkewError(new Error('Invalid password'))).toBe(false)
    expect(isDeploymentSkewError(new Error('User already exists.'))).toBe(false)
    expect(isDeploymentSkewError(new Error('Failed to fetch'))).toBe(false)
  })

  it('does NOT match null / undefined / empty', () => {
    expect(isDeploymentSkewError(null)).toBe(false)
    expect(isDeploymentSkewError(undefined)).toBe(false)
    expect(isDeploymentSkewError('')).toBe(false)
    expect(isDeploymentSkewError({})).toBe(false)
  })
})
