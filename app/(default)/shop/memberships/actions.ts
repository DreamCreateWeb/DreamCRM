'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { savePlan, setPlanStatus, deletePlan, markBenefitUsed } from '@/lib/services/membership'
import type { PlanInput, PlanStatus } from '@/lib/types/membership'

async function ensureClinicAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Memberships are only available for clinic tenants.')
  if (ctx.role === 'patient') throw new Error('Patients cannot manage membership plans.')
  return ctx
}

export async function savePlanAction(input: PlanInput): Promise<{ id: string }> {
  const ctx = await ensureClinicAdmin()
  if (!input.name?.trim()) throw new Error('Plan name is required')
  if (!(Number(input.priceDollars) > 0)) throw new Error('Set a price above $0')
  const id = await savePlan(ctx.organizationId, input)
  revalidatePath('/shop/memberships')
  return { id }
}

export async function setPlanStatusAction(id: string, status: PlanStatus) {
  const ctx = await ensureClinicAdmin()
  await setPlanStatus(ctx.organizationId, id, status)
  revalidatePath('/shop/memberships')
}

export async function deletePlanAction(id: string) {
  const ctx = await ensureClinicAdmin()
  await deletePlan(ctx.organizationId, id)
  revalidatePath('/shop/memberships')
}

export async function markBenefitUsedAction(membershipId: string, benefitLabel: string) {
  const ctx = await ensureClinicAdmin()
  await markBenefitUsed(ctx.organizationId, membershipId, benefitLabel)
  revalidatePath('/shop/memberships')
}
