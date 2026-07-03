import 'server-only'
import crypto from 'crypto'

/**
 * Signed tokens for tracking + unsubscribe links. The body is base64url-encoded
 * JSON; the suffix is a 12-byte HMAC truncated SHA-256 over body using the
 * MARKETING_TOKEN_SECRET env var (or falls back to the better-auth secret —
 * both are non-rotating per-deploy secrets).
 *
 * Tokens are opaque short strings safe to embed in URLs.
 */

export interface TokenPayload {
  /** campaign id. Optional since prospecting: exactly one of c/pr per token. */
  c?: number
  /** recipient email (lowercased) */
  e: string
  /** customer id (one-off / platform-tenant lead pipeline). Optional. */
  i?: number
  /** patient id (clinic-tenant Recall & Outreach). Optional. Only one of i/pi
   * is set per send — the source discriminator. */
  pi?: string
  /** prospect id (platform cold outreach). Routes events to outreach_event
   * instead of campaign_events. */
  pr?: string
  /** outreach touch-log id (which send the event belongs to). */
  tl?: string
  /** token purpose: 'o'=open 'k'=click 'u'=unsub */
  p: 'o' | 'k' | 'u'
  /** for click tokens: original target URL */
  u?: string
}

function secret(): string {
  return process.env.MARKETING_TOKEN_SECRET || process.env.BETTER_AUTH_SECRET || 'dreamcrm-dev-secret'
}

function b64uEncode(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function b64uDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function sign(body: string): string {
  return crypto.createHmac('sha256', secret()).update(body).digest('base64').slice(0, 16)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function encodeToken(payload: TokenPayload): string {
  const body = b64uEncode(JSON.stringify(payload))
  const sig = sign(body)
  return `${body}.${sig}`
}

export function decodeToken(token: string): TokenPayload | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  if (sign(body) !== sig) return null
  try {
    return JSON.parse(b64uDecode(body).toString('utf8')) as TokenPayload
  } catch {
    return null
  }
}
