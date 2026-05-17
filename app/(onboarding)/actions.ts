'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { requireUser } from '@/lib/session'

/**
 * Onboarding actions — temporarily stubbed.
 *
 * The original implementation wrote onboarding fields (accountType,
 * companyName, address, etc.) directly to the user row. With the new
 * multi-tenant model, onboarding instead creates a clinic *organization*
 * and a clinicProfile, then redirects to Stripe Checkout. That rewire
 * lands in the next PR (multi-tenant routes + onboarding).
 *
 * For now these actions just route between steps so the UI keeps flowing.
 * Step 2's "enable invoicing automation" toggle is captured as a per-user
 * preference in connected_apps so we don't lose the user's intent.
 */

const Step1 = z.object({
  accountType: z.enum(['company', 'freelance', 'starting']),
})

const Step2 = z.object({
  orgType: z.enum(['individual', 'organization']),
  enableFeature: z.boolean(),
})

const Step3 = z.object({
  companyName: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  streetAddress: z.string().min(1).max(200),
  country: z.string().min(1).max(100),
})

export async function saveOnboardingStep1(input: z.infer<typeof Step1>) {
  await requireUser()
  Step1.parse(input)
  // TODO(pr-b): persist accountType, prepare clinic org draft
  redirect('/onboarding-02')
}

export async function saveOnboardingStep2(input: z.infer<typeof Step2>) {
  const user = await requireUser()
  const parsed = Step2.parse(input)
  await db
    .insert(schema.connectedApps)
    .values({
      userId: user.id,
      appKey: 'onboarding.org_type',
      enabled: parsed.enableFeature,
      config: { orgType: parsed.orgType },
    })
    .onConflictDoUpdate({
      target: [schema.connectedApps.userId, schema.connectedApps.appKey],
      set: { enabled: parsed.enableFeature, config: { orgType: parsed.orgType } },
    })
  redirect('/onboarding-03')
}

export async function saveOnboardingStep3(input: z.infer<typeof Step3>) {
  await requireUser()
  Step3.parse(input)
  // TODO(pr-b): create organization row + clinicProfile from these fields
  redirect('/onboarding-04')
}

export async function completeOnboarding() {
  await requireUser()
  // TODO(pr-b): redirect to Stripe checkout after creating the clinic org
  redirect('/')
}
