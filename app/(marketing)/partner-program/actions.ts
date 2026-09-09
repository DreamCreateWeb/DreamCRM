'use server'

import { looksLikeBot } from '@/lib/form-trust'
import { rateLimitPublicAction } from '@/lib/services/rate-limit'
import { submitPartnerApplication } from '@/lib/services/partner-applications'

/**
 * The partner-program application submit — same public-form armor as the
 * grader: honeypot + time-trap, then the per-IP rate limit, then caps.
 */
export async function applyPartnerAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (looksLikeBot(formData)) {
    return { ok: false, error: 'Something went wrong — give it another try.' }
  }
  if (!(await rateLimitPublicAction('partner_apply', { limit: 3, windowMs: 10 * 60 * 1000 }))) {
    return { ok: false, error: 'A few applications just came from your connection — give it a minute.' }
  }
  const str = (name: string, max: number): string => {
    const v = formData.get(name)
    return typeof v === 'string' ? v.trim().slice(0, max) : ''
  }
  return submitPartnerApplication({
    name: str('name', 200),
    email: str('email', 200),
    phone: str('phone', 40) || null,
    company: str('company', 200) || null,
    message: str('message', 2000) || null,
  })
}
