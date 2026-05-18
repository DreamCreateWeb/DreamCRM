import { describe, it, expect, beforeAll } from 'vitest'

beforeAll(() => {
  process.env.EMAIL_ENCRYPTION_KEY = 'test-key-do-not-use-in-prod'
})

describe('crypto helpers', () => {
  it('round-trips a refresh-token-like string', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/crypto')
    const original = '1//0abcDEFghi123_jkl456MNOPqrs789tuvWXYZ'
    const ct = encryptSecret(original)
    expect(ct).not.toBe(original)
    expect(decryptSecret(ct)).toBe(original)
  })

  it('produces a fresh ciphertext for the same input each time (random IV)', async () => {
    const { encryptSecret } = await import('@/lib/crypto')
    const a = encryptSecret('hello world')
    const b = encryptSecret('hello world')
    expect(a).not.toBe(b)
  })

  it('rejects tampered ciphertext via GCM auth tag', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/crypto')
    const ct = encryptSecret('payload')
    // Flip the last byte
    const tampered = ct.slice(0, -1) + (ct.slice(-1) === 'A' ? 'B' : 'A')
    expect(() => decryptSecret(tampered)).toThrow()
  })

  it('throws when EMAIL_ENCRYPTION_KEY is missing', async () => {
    const saved = process.env.EMAIL_ENCRYPTION_KEY
    delete process.env.EMAIL_ENCRYPTION_KEY
    const { encryptSecret } = await import('@/lib/crypto')
    expect(() => encryptSecret('x')).toThrow(/EMAIL_ENCRYPTION_KEY is not set/)
    process.env.EMAIL_ENCRYPTION_KEY = saved
  })
})
