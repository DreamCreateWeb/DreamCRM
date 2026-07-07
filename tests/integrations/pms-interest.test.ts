import { describe, it, expect } from 'vitest'
import { isRequestablePms, REQUESTABLE_PMS } from '@/lib/services/pms-interest'

/**
 * The PMS demand-capture guard: only the honest roadmap PMSs are requestable.
 * Open Dental is LIVE (connect directly), demo is the sandbox — neither is a
 * "notify me" target, and junk never is. The DB-touching functions are covered
 * end-to-end by the integrations flow; this pins the pure gate that stops a
 * clinic from "requesting" a PMS that's already available.
 */
describe('isRequestablePms', () => {
  it('accepts exactly the four roadmap PMSs', () => {
    expect(REQUESTABLE_PMS).toEqual(['dentrix_ascend', 'dentrix_desktop', 'eaglesoft', 'curve'])
    for (const id of REQUESTABLE_PMS) expect(isRequestablePms(id)).toBe(true)
  })

  it('rejects the live + sandbox providers and junk', () => {
    expect(isRequestablePms('open_dental')).toBe(false) // live — connect directly
    expect(isRequestablePms('demo')).toBe(false) // the sandbox
    expect(isRequestablePms('')).toBe(false)
    expect(isRequestablePms('nonsense')).toBe(false)
  })
})
