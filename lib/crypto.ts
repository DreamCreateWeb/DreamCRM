import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

/**
 * AES-256-GCM helpers for at-rest encryption of OAuth refresh tokens.
 *
 * Key comes from the EMAIL_ENCRYPTION_KEY env var — any string, we derive a
 * 32-byte key via SHA-256 so it can be a passphrase or a generated secret.
 * Stored ciphertext format: base64(iv || authTag || ciphertext).
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const raw = process.env.EMAIL_ENCRYPTION_KEY
  if (!raw) throw new Error('EMAIL_ENCRYPTION_KEY is not set')
  return createHash('sha256').update(raw, 'utf8').digest()
}

export function encryptSecret(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
}

export function decryptSecret(ciphertextB64: string): string {
  const key = getKey()
  const buf = Buffer.from(ciphertextB64, 'base64')
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Ciphertext too short to be valid')
  }
  const iv = buf.subarray(0, IV_LENGTH)
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString('utf8')
}
