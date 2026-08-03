import { NextResponse } from 'next/server'
import { parseInboundSms, handleInboundSms } from '@/lib/services/inbound-sms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * INBOUND SMS WEBHOOK (Phase 5 limb 3, slice 3b). AWS End User Messaging's
 * two-way channel publishes each inbound text to an SNS topic whose HTTPS
 * subscription points here.
 *
 * AUTH: a shared-secret query token (?token=$SMS_WEBHOOK_SECRET), the same
 * posture as CRON_SECRET — minted at subscription time, rotated by
 * re-subscribing. Fails closed when unset. (SNS's own signature scheme
 * needs a cert fetch + RSA verify per message; the token gives equivalent
 * practical protection for a payload whose worst forgery is a fake patient
 * text, which the family-safe threading already treats as untrusted.)
 *
 * SNS PROTOCOL: a new subscription first POSTs SubscriptionConfirmation —
 * we confirm by fetching its SubscribeURL (that URL is only ever handed out
 * by SNS itself). Everything else is Notification with the real payload in
 * `Message` as a JSON string.
 *
 * ALWAYS 200 on handled paths: SNS retries any non-2xx, and a poison
 * message must be acknowledged-and-logged, not redelivered forever.
 */
async function post(request: Request) {
  const secret = process.env.SMS_WEBHOOK_SECRET
  const token = new URL(request.url).searchParams.get('token')
  if (!secret || token !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let envelope: Record<string, unknown>
  try {
    envelope = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: true, ignored: 'not_json' })
  }

  if (envelope.Type === 'SubscriptionConfirmation' && typeof envelope.SubscribeURL === 'string') {
    try {
      await fetch(envelope.SubscribeURL)
      return NextResponse.json({ ok: true, confirmed: true })
    } catch (e) {
      console.error('[sms-webhook] subscription confirm failed', e)
      // Non-200 here is the ONE retry we want — SNS re-sends the
      // confirmation and the subscription eventually completes.
      return NextResponse.json({ error: 'confirm_failed' }, { status: 500 })
    }
  }

  if (envelope.Type !== 'Notification' || typeof envelope.Message !== 'string') {
    return NextResponse.json({ ok: true, ignored: 'not_notification' })
  }

  let message: unknown
  try {
    message = JSON.parse(envelope.Message)
  } catch {
    return NextResponse.json({ ok: true, ignored: 'unparseable_message' })
  }

  const payload = parseInboundSms(message)
  if (!payload) {
    // A DLR or an unrecognised shape — acknowledged, not retried.
    return NextResponse.json({ ok: true, ignored: 'not_inbound_sms' })
  }

  const result = await handleInboundSms(payload)
  return NextResponse.json({ ok: true, outcome: result.outcome })
}

export { post as POST }
