import { describe, it, expect } from 'vitest'
import { CONNECT_BACK_PATHS, resolveConnectBack } from '@/lib/types/shop-connect'

/**
 * The Stripe Connect flow returns to the door that sent it (S5: the
 * Payments intro). The value rides the OAuth state, which anyone can
 * shape, so it is an allowlist — unknown falls back to the shop.
 */
describe('resolveConnectBack', () => {
  it('accepts only the known doors and falls back to the shop', () => {
    expect(resolveConnectBack('payments')).toBe('payments')
    // An inherited name is not an allowlisted key (audit round 2).
    expect(resolveConnectBack('constructor')).toBe('shop')
    expect(resolveConnectBack('toString')).toBe('shop')
    expect(resolveConnectBack('integrations')).toBe('integrations')
    expect(resolveConnectBack('shop')).toBe('shop')
    expect(resolveConnectBack('//evil.example')).toBe('shop')
    expect(resolveConnectBack(null)).toBe('shop')
    expect(resolveConnectBack(undefined)).toBe('shop')
    expect(CONNECT_BACK_PATHS.payments).toBe('/payments')
  })
})
