'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { requireUser } from '@/lib/session'

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
  const user = await requireUser()
  const parsed = Step1.parse(input)
  await db
    .update(schema.users)
    .set({ accountType: parsed.accountType, onboardingStep: 1, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id))
  revalidatePath('/onboarding-02')
  redirect('/onboarding-02')
}

export async function saveOnboardingStep2(input: z.infer<typeof Step2>) {
  const user = await requireUser()
  const parsed = Step2.parse(input)
  // Persist orgType in role (free-form) for now; toggle stored in connected_apps as a preference.
  await db
    .update(schema.users)
    .set({
      onboardingStep: 2,
      // store orgType in accountType suffix so we don't lose step-1 selection
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id))
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
  const user = await requireUser()
  const parsed = Step3.parse(input)
  await db
    .update(schema.users)
    .set({
      companyName: parsed.companyName,
      city: parsed.city,
      postalCode: parsed.postalCode,
      streetAddress: parsed.streetAddress,
      country: parsed.country,
      onboardingStep: 3,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id))
  redirect('/onboarding-04')
}

export async function completeOnboarding() {
  const user = await requireUser()
  await db
    .update(schema.users)
    .set({ onboardingStep: 4, onboardingComplete: true, updatedAt: new Date() })
    .where(eq(schema.users.id, user.id))
  redirect('/')
}
