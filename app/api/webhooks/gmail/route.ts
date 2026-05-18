import { NextRequest, NextResponse } from 'next/server'
import { createPublicKey, createVerify } from 'node:crypto'
import { processHistoryEvent } from '@/lib/services/mailbox'

/**
 * Gmail push-notification webhook. Pub/Sub delivers one POST per Gmail
 * change (with delivery retries on non-2xx). The envelope wraps a base64
 * `data` payload of `{ emailAddress, historyId }`. Auth is via an OIDC
 * bearer token signed by Google for the SA we configured on the push
 * subscription — verify it before trusting anything.
 *
 * Returns 200 even on "no-op" cases (unknown mailbox, duplicate event) so
 * Pub/Sub doesn't keep retrying. Real failures (DB down, Gmail unreachable)
 * surface as 5xx so Pub/Sub does retry.
 */

interface PubSubMessage {
  data?: string
  messageId?: string
  publishTime?: string
  attributes?: Record<string, string>
}

interface PubSubEnvelope {
  message: PubSubMessage
  subscription?: string
}

interface GmailNotification {
  emailAddress: string
  historyId: number | string
}

interface JwtHeader {
  alg: string
  kid: string
  typ?: string
}

interface JwtPayload {
  iss?: string
  aud?: string
  azp?: string
  email?: string
  email_verified?: boolean
  exp?: number
  iat?: number
}

// ----- Google OIDC JWKS cache -----

interface JwksKey { kid: string; n: string; e: string; kty: string; alg?: string; use?: string }
let jwksCache: { keys: JwksKey[]; fetchedAt: number } | null = null
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const JWKS_TTL_MS = 60 * 60 * 1000 // 1h — Google rotates daily

async function getJwks(): Promise<JwksKey[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys
  }
  const res = await fetch(JWKS_URL)
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)
  const data = (await res.json()) as { keys: JwksKey[] }
  jwksCache = { keys: data.keys, fetchedAt: Date.now() }
  return data.keys
}

function decodeBase64Url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

async function verifyOidcToken(
  token: string,
  expectedEmail: string,
  expectedAudience: string | undefined,
): Promise<JwtPayload> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed JWT')

  const header = JSON.parse(decodeBase64Url(parts[0]).toString('utf8')) as JwtHeader
  const payload = JSON.parse(decodeBase64Url(parts[1]).toString('utf8')) as JwtPayload
  if (header.alg !== 'RS256') throw new Error(`Unsupported JWT alg: ${header.alg}`)

  const jwks = await getJwks()
  const key = jwks.find((k) => k.kid === header.kid)
  if (!key) throw new Error(`JWKS has no key for kid=${header.kid}`)

  // Build PEM from JWK (n, e are base64url big-endian).
  const publicKey = createPublicKey({
    key: { kty: key.kty, n: key.n, e: key.e },
    format: 'jwk',
  })
  const verifier = createVerify('RSA-SHA256')
  verifier.update(`${parts[0]}.${parts[1]}`)
  const ok = verifier.verify(publicKey, decodeBase64Url(parts[2]))
  if (!ok) throw new Error('JWT signature verification failed')

  const now = Math.floor(Date.now() / 1000)
  if (!payload.exp || payload.exp < now - 30) throw new Error('JWT expired')
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    throw new Error(`Unexpected issuer: ${payload.iss}`)
  }
  if (payload.email !== expectedEmail || payload.email_verified !== true) {
    throw new Error(`JWT email mismatch: got ${payload.email}`)
  }
  // Audience defaults to the webhook URL; we accept either an explicitly
  // configured audience override (when the subscription was created with a
  // custom audience) or the canonical request URL.
  if (expectedAudience && payload.aud !== expectedAudience) {
    throw new Error(`JWT audience mismatch: got ${payload.aud}, want ${expectedAudience}`)
  }

  return payload
}

// ----- Handler -----

export async function POST(req: NextRequest) {
  const expectedEmail = process.env.GMAIL_PUBSUB_SA_EMAIL
  if (!expectedEmail) {
    console.error('[gmail.webhook] GMAIL_PUBSUB_SA_EMAIL not configured')
    return NextResponse.json({ error: 'webhook not configured' }, { status: 500 })
  }

  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null
  if (!token) {
    return NextResponse.json({ error: 'missing bearer token' }, { status: 401 })
  }

  try {
    await verifyOidcToken(token, expectedEmail, process.env.GMAIL_PUBSUB_AUDIENCE)
  } catch (err) {
    console.warn('[gmail.webhook] OIDC verify failed:', (err as Error).message)
    return NextResponse.json({ error: 'invalid token' }, { status: 401 })
  }

  let envelope: PubSubEnvelope
  try {
    envelope = (await req.json()) as PubSubEnvelope
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 })
  }
  if (!envelope.message?.data) {
    return NextResponse.json({ error: 'no message data' }, { status: 400 })
  }

  let notification: GmailNotification
  try {
    notification = JSON.parse(
      Buffer.from(envelope.message.data, 'base64').toString('utf8'),
    ) as GmailNotification
  } catch {
    return NextResponse.json({ error: 'invalid message payload' }, { status: 400 })
  }
  if (!notification.emailAddress || notification.historyId == null) {
    return NextResponse.json({ error: 'missing emailAddress or historyId' }, { status: 400 })
  }

  try {
    const result = await processHistoryEvent({
      emailAddress: notification.emailAddress,
      notificationHistoryId: String(notification.historyId),
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    // 5xx so Pub/Sub retries with exponential backoff
    console.error('[gmail.webhook] processing failed', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
