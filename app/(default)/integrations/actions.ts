'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { connectOpenDental, disconnectPms, runImport, setAutoSync, setSyncDirection } from '@/lib/services/pms'
import type { SyncDirection } from '@/lib/types/pms'

function ensureClinicAdmin(ctx: { tenantType: string; role: string }) {
  if (ctx.tenantType !== 'clinic') {
    throw new Error('Integrations is only available for clinic tenants.')
  }
  if (ctx.role === 'patient') {
    throw new Error('Patients cannot manage integrations.')
  }
}

export interface ConnectResult {
  ok: boolean
  error?: string
  practiceTitle?: string
}

export async function connectOpenDentalAction(formData: FormData): Promise<ConnectResult> {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  const customerKey = formData.get('customerKey')?.toString() ?? ''
  try {
    const test = await connectOpenDental(ctx.organizationId, ctx.userId, customerKey)
    revalidatePath('/integrations')
    return { ok: true, practiceTitle: test.practiceTitle }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export interface SyncResultView {
  ok: boolean
  status?: string
  error?: string
}

export async function syncNowAction(): Promise<SyncResultView> {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  try {
    const result = await runImport(ctx.organizationId, { trigger: 'manual', triggeredByUserId: ctx.userId })
    revalidatePath('/integrations')
    return { ok: result.status !== 'error', status: result.status, error: result.error ?? undefined }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export async function disconnectPmsAction() {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await disconnectPms(ctx.organizationId)
  revalidatePath('/integrations')
}

export async function setSyncDirectionAction(direction: SyncDirection) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await setSyncDirection(ctx.organizationId, direction)
  revalidatePath('/integrations')
}

export async function setAutoSyncAction(enabled: boolean) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await setAutoSync(ctx.organizationId, enabled)
  revalidatePath('/integrations')
}
