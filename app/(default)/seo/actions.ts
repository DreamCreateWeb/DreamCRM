'use server'

import { revalidatePath } from 'next/cache'
import { requireTenant } from '@/lib/auth/context'
import { setGscSite, disconnectGsc } from '@/lib/services/gsc'

function ensureClinicAdmin(ctx: { tenantType: string; role: string }) {
  if (ctx.tenantType !== 'clinic') throw new Error('SEO is only available for clinic tenants.')
  if (ctx.role === 'patient') throw new Error('Patients cannot manage SEO settings.')
}

export async function setGscSiteAction(formData: FormData) {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  const siteUrl = formData.get('siteUrl')?.toString()
  if (!siteUrl) return
  await setGscSite(ctx.organizationId, siteUrl)
  revalidatePath('/seo')
}

export async function disconnectGscAction() {
  const ctx = await requireTenant()
  ensureClinicAdmin(ctx)
  await disconnectGsc(ctx.organizationId)
  revalidatePath('/seo')
}
