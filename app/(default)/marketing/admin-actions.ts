'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { recordSpend } from '@/lib/services/marketing-spend'

/**
 * Dials-cockpit actions — PLATFORM ONLY. The /marketing page serves both
 * tenants (clinics get redirected), but a redirect is not an auth gate:
 * these mutate Dream Create's own spend ledger, so the persona check is
 * positive and strict.
 */
async function requirePlatformStaff() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'platform') {
    throw new Error('The dials are a platform-owner surface.')
  }
  return ctx
}

export type SpendFormResult = { ok: true } | { ok: false; error: string }

export async function recordSpendAction(formData: FormData): Promise<SpendFormResult> {
  await requirePlatformStaff()
  const month = String(formData.get('month') ?? '').trim()
  const channel = String(formData.get('channel') ?? '').trim()
  const dollarsRaw = String(formData.get('amount') ?? '').replace(/[$,\s]/g, '')
  const dollars = Number(dollarsRaw)
  if (!dollarsRaw || !Number.isFinite(dollars)) {
    return { ok: false, error: 'Enter the month’s spend in dollars.' }
  }
  const res = await recordSpend({
    month,
    channel,
    amountCents: Math.round(dollars * 100),
    note: String(formData.get('note') ?? ''),
  })
  if (res.ok) revalidatePath('/marketing')
  return res
}
