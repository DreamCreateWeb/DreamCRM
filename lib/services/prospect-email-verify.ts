import 'server-only'
import { resolveMx } from 'node:dns/promises'
import { parseEmail, isDisposableDomain, type EmailVerifyStatus } from '@/lib/prospect-email'

/**
 * Deliverability pre-check for a discovered address — the cheapest honest
 * gate before we ever send. Syntax + disposable rejection, then a live MX
 * lookup on the domain: MX present → deliverable ('valid'); no MX →
 * 'invalid' (mail can't land); DNS error/timeout → 'unknown' (fail-open —
 * we don't blacklist on a flaky lookup; the bounce watchdog is the backstop).
 *
 * No SMTP probe (blocked/greylisted/rude and unreliable) — MX is the highest-
 * signal check we can do without one. Per-domain results are cached within a
 * run so enriching a batch resolves each domain once.
 */

export interface EmailVerifyResult {
  status: EmailVerifyStatus
  reason: string
}

const MX_TIMEOUT_MS = 4_000

async function domainHasMx(domain: string): Promise<'has' | 'none' | 'error'> {
  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('mx_timeout')), MX_TIMEOUT_MS)),
    ])
    return Array.isArray(records) && records.some((r) => r.exchange) ? 'has' : 'none'
  } catch (err) {
    // ENOTFOUND / ENODATA are authoritative "no mail here"; everything else
    // (timeout, SERVFAIL) is inconclusive → unknown, not invalid.
    const code = (err as { code?: string })?.code
    if (code === 'ENOTFOUND' || code === 'ENODATA') return 'none'
    return 'error'
  }
}

/** Verify one address. Pass a shared Map to dedupe MX lookups across a batch. */
export async function verifyEmail(
  email: string,
  mxCache?: Map<string, 'has' | 'none' | 'error'>,
): Promise<EmailVerifyResult> {
  const parsed = parseEmail(email)
  if (!parsed) return { status: 'invalid', reason: 'syntax' }
  if (isDisposableDomain(parsed.domain)) return { status: 'invalid', reason: 'disposable' }

  let mx = mxCache?.get(parsed.domain)
  if (mx === undefined) {
    mx = await domainHasMx(parsed.domain)
    mxCache?.set(parsed.domain, mx)
  }
  if (mx === 'has') return { status: 'valid', reason: 'mx_ok' }
  if (mx === 'none') return { status: 'invalid', reason: 'no_mx' }
  return { status: 'unknown', reason: 'dns_error' }
}
