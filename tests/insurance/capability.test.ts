import { describe, it, expect } from 'vitest'
import { getCapability, isGrantable } from '@/lib/autonomy'

/** `insurance_check` is registered (the ledger narrates it), ships ask-first,
 *  and is NOT grantable — there is no cadence to hand over yet. */
describe('insurance_check capability', () => {
  it('is registered at ask and not grantable', () => {
    const def = getCapability('insurance_check')
    expect(def).not.toBeNull()
    expect(def?.defaultTrust).toBe('ask')
    expect(isGrantable('insurance_check')).toBe(false)
  })
})
