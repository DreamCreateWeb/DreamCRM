/**
 * lib/deployment-skew.ts — telling "the server was redeployed under this tab"
 * apart from every other failed server action, and comparing build ids.
 */
import { describe, it, expect } from 'vitest'
import { buildsDiffer, isDeploymentSkewError } from '@/lib/deployment-skew'

describe('isDeploymentSkewError', () => {
  it('recognises the shapes Next throws for an action id from another build', () => {
    expect(
      isDeploymentSkewError(
        new Error('Failed to find Server Action "a81292d8953d895e043e92c49b08acfe631ab050". This request might be from an older or newer deployment.'),
      ),
    ).toBe(true)
    expect(isDeploymentSkewError(new Error('Server Action "abc" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action'))).toBe(true)
    const named = new Error('nope')
    named.name = 'UnrecognizedActionError'
    expect(isDeploymentSkewError(named)).toBe(true)
    expect(isDeploymentSkewError('This request might be from an older or newer deployment.')).toBe(true)
  })

  it('leaves ordinary failures alone', () => {
    expect(isDeploymentSkewError(new Error('Failed to fetch'))).toBe(false)
    expect(isDeploymentSkewError(new Error('An unexpected response was received from the server.'))).toBe(false)
    expect(isDeploymentSkewError(new TypeError('x is not a function'))).toBe(false)
    expect(isDeploymentSkewError(null)).toBe(false)
    expect(isDeploymentSkewError(undefined)).toBe(false)
    expect(isDeploymentSkewError(42)).toBe(false)
  })
})

describe('buildsDiffer', () => {
  it('is true only when both ids are known and differ', () => {
    expect(buildsDiffer('a1', 'b2')).toBe(true)
    expect(buildsDiffer('a1', 'a1')).toBe(false)
    expect(buildsDiffer('a1', null)).toBe(false)
    expect(buildsDiffer(undefined, 'b2')).toBe(false)
    expect(buildsDiffer('', 'b2')).toBe(false)
  })

  it('never reports skew against the dev placeholder', () => {
    expect(buildsDiffer('dev', 'b2')).toBe(false)
    expect(buildsDiffer('a1', 'dev')).toBe(false)
  })
})
