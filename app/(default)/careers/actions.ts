'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { planAllows } from '@/lib/modules'
import {
  createJob,
  updateJob,
  setJobStatus,
  deleteJob,
  setApplicationStatus,
  updateApplicationNotes,
  type JobRole,
  type EmploymentType,
  type JobStatus,
  type ApplicationStatus,
} from '@/lib/services/careers'

async function ensureClinicAdmin() {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') throw new Error('Careers is only available for clinics.')
  if (ctx.role === 'patient') throw new Error('Patients cannot manage careers.')
  // Careers is Premium-tier (lib/modules/clinic.ts) — block below-tier clinics
  // from firing the action even if they reach it by deep-link. Platform-admin
  // demo contexts inherit the demo org's tier (premium), so they pass.
  if (!planAllows(ctx.planTier, 'premium')) {
    throw new Error('Careers is on the Premium plan. Upgrade to manage job postings.')
  }
  return ctx
}

function dollarsToCents(raw: FormDataEntryValue | null): number | null {
  const s = raw?.toString().trim()
  if (!s) return null
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : Math.round(n * 100)
}

function parseJobForm(formData: FormData) {
  return {
    title: formData.get('title')?.toString().trim() ?? '',
    role: (formData.get('role')?.toString() ?? 'other') as JobRole,
    employmentType: (formData.get('employmentType')?.toString() ?? 'full_time') as EmploymentType,
    description: formData.get('description')?.toString().trim() ?? '',
    responsibilities: formData.get('responsibilities')?.toString().trim() || null,
    requirements: formData.get('requirements')?.toString().trim() || null,
    benefits: formData.get('benefits')?.toString().trim() || null,
    compMinCents: dollarsToCents(formData.get('compMin')),
    compMaxCents: dollarsToCents(formData.get('compMax')),
    compPeriod: (formData.get('compPeriod')?.toString() === 'year' ? 'year' : 'hour') as 'hour' | 'year',
    showComp: formData.get('showComp') === 'on',
    status: (formData.get('status')?.toString() ?? 'draft') as JobStatus,
    applyMethod: (formData.get('applyMethod')?.toString() === 'external' ? 'external' : 'in_app') as 'in_app' | 'external',
    externalApplyUrl: formData.get('externalApplyUrl')?.toString().trim() || null,
  }
}

export async function createJobAction(formData: FormData) {
  const ctx = await ensureClinicAdmin()
  const input = parseJobForm(formData)
  if (!input.title) throw new Error('Title is required')
  await createJob(ctx.organizationId, input)
  revalidatePath('/careers')
  redirect('/careers')
}

export async function updateJobAction(formData: FormData) {
  const ctx = await ensureClinicAdmin()
  const id = formData.get('id')?.toString()
  if (!id) throw new Error('Missing job id')
  const input = parseJobForm(formData)
  if (!input.title) throw new Error('Title is required')
  await updateJob(ctx.organizationId, id, input)
  revalidatePath('/careers')
  redirect('/careers')
}

export async function setJobStatusAction(id: string, status: JobStatus) {
  const ctx = await ensureClinicAdmin()
  await setJobStatus(ctx.organizationId, id, status)
  revalidatePath('/careers')
}

export async function deleteJobAction(id: string) {
  const ctx = await ensureClinicAdmin()
  await deleteJob(ctx.organizationId, id)
  revalidatePath('/careers')
}

export async function setApplicationStatusAction(id: string, status: ApplicationStatus) {
  const ctx = await ensureClinicAdmin()
  await setApplicationStatus(ctx.organizationId, id, status)
  revalidatePath('/careers')
}

export async function updateApplicationNotesAction(id: string, notes: string | null, rating: number | null) {
  const ctx = await ensureClinicAdmin()
  await updateApplicationNotes(ctx.organizationId, id, { notes, rating })
  revalidatePath('/careers')
}
