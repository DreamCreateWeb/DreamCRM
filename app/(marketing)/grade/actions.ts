'use server'

import { redirect } from 'next/navigation'
import { looksLikeBot } from '@/lib/form-trust'
import { rateLimitPublicAction } from '@/lib/services/rate-limit'
import { runPracticeGrade } from '@/lib/services/practice-grader'

/**
 * The grader form submit — the marketing site's first server action, so it
 * wears the full public-form armor before any work happens: honeypot +
 * time-trap (silent-ish drop), then the DB-backed per-IP rate limit (the
 * grade does a live site fetch + a metered Places lookup — this is the
 * spend gate), then input caps. On success the visitor lands straight on
 * their tokenized report.
 */
export async function runGradeAction(
  formData: FormData,
): Promise<{ ok: false; error: string }> {
  if (looksLikeBot(formData)) {
    // Honeypot doctrine: no error worth learning from. The generic message
    // also covers the rare too-fast human, who just retries.
    return { ok: false, error: 'Something went wrong — give it another try.' }
  }
  if (!(await rateLimitPublicAction('grader', { limit: 4, windowMs: 10 * 60 * 1000 }))) {
    return { ok: false, error: 'A few grades just ran from your connection — give it a minute and try again.' }
  }

  const str = (name: string, max: number): string => {
    const v = formData.get(name)
    return typeof v === 'string' ? v.trim().slice(0, max) : ''
  }
  const practiceName = str('practiceName', 200)
  const email = str('email', 200)
  const city = str('city', 100)
  const state = str('state', 2)
  const websiteUrl = str('websiteUrl', 300)

  if (!practiceName) return { ok: false, error: 'Tell us your practice name.' }
  if (!email) return { ok: false, error: 'We need an email to send your report to.' }

  const res = await runPracticeGrade({
    practiceName,
    email,
    city: city || null,
    state: state || null,
    websiteUrl: websiteUrl || null,
  })
  if (!res.ok) return { ok: false, error: res.error }
  redirect(`/g/${res.token}`)
}
