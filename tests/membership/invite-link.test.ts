import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }))
import { inviteLink } from '@/app/(default)/payments/memberships/memberships-client'

describe('membership invite link', () => {
  const base = 'https://smile.example.com/dental-plans'
  it('carries the plan id', () => {
    expect(inviteLink(base, 'plan_1', '')).toBe(`${base}?plan=plan_1`)
  })
  it('encodes the email', () => {
    expect(inviteLink(base, 'plan_1', ' sam+club@example.com ')).toBe(`${base}?plan=plan_1&email=sam%2Bclub%40example.com`)
  })
})
