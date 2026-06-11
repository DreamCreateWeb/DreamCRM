import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Account email-change security: the profile action (`updateAccount`) must NEVER
 * write `user.email`. Email is the sign-in identity and only changes through
 * better-auth's verified `changeEmail` flow (confirmation link to the existing
 * mailbox). A prior version accepted `email` and wrote it straight to the row —
 * account-takeover-adjacent. Zod `.parse()` strips unknown keys, so even a
 * smuggled `email` in the payload never reaches the DB write.
 */

const sets: Array<Record<string, unknown>> = []

vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            sets.push(patch)
            return [{ id: 'u_1', ...patch }]
          },
        }),
      }),
    }),
  },
  schema: { user: { id: 'user.id' } },
}))

import { updateAccount, AccountInput } from '@/lib/services/settings'

beforeEach(() => {
  sets.length = 0
})

describe('AccountInput schema', () => {
  it('has no `email` field (email is not a profile field)', () => {
    expect('email' in (AccountInput.shape as Record<string, unknown>)).toBe(false)
  })

  it('strips a smuggled `email` key from the parsed output', () => {
    const parsed = AccountInput.parse({ name: 'Jane', email: 'attacker@evil.com' } as never)
    expect('email' in (parsed as Record<string, unknown>)).toBe(false)
    expect((parsed as { name?: string }).name).toBe('Jane')
  })
})

describe('updateAccount', () => {
  it('writes profile fields but NEVER email — even when email is smuggled in', async () => {
    await updateAccount('u_1', { name: 'Jane', city: 'Austin', email: 'attacker@evil.com' } as never)
    expect(sets).toHaveLength(1)
    const written = sets[0]
    expect(written.name).toBe('Jane')
    expect(written.city).toBe('Austin')
    // The critical assertion: the email never reaches the DB write.
    expect('email' in written).toBe(false)
    expect(written.updatedAt).toBeInstanceOf(Date)
  })

  it('persists the normal profile fields', async () => {
    await updateAccount('u_1', {
      name: 'Dr. Reyes',
      companyName: 'Acme Dental',
      city: 'Denver',
      image: 'https://cdn/x.png',
    })
    const written = sets[0]
    expect(written.name).toBe('Dr. Reyes')
    expect(written.companyName).toBe('Acme Dental')
    expect(written.city).toBe('Denver')
    expect(written.image).toBe('https://cdn/x.png')
  })
})
