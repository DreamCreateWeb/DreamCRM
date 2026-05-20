'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import {
  createPatient,
  updatePatient,
  archivePatient,
  type CreatePatientInput,
  type PatientSource,
} from '@/lib/services/patients'
import { sendBulkPatientEmail, type BulkEmailResult } from '@/lib/services/patient-bulk-comms'
import { addPatientNote, deletePatientNote } from '@/lib/services/patient-notes'

export async function createPatientAction(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can create patients' }
  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  if (!firstName || !lastName) return { ok: false, error: 'First and last name are required' }
  const input: CreatePatientInput = {
    organizationId: ctx.organizationId,
    firstName,
    lastName,
    email: String(formData.get('email') ?? '').trim() || null,
    phone: String(formData.get('phone') ?? '').trim() || null,
    dateOfBirth: String(formData.get('dateOfBirth') ?? '').trim() || null,
    source: 'manual' as PatientSource,
    lifecycle: 'new',
  }
  const id = await createPatient(input)
  revalidatePath('/patients')
  return { ok: true, id }
}

export async function updatePatientAction(
  patientId: string,
  patch: Partial<CreatePatientInput>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can update patients' }
  await updatePatient({ organizationId: ctx.organizationId, patientId, patch })
  revalidatePath(`/patients/${patientId}`)
  revalidatePath('/patients')
  return { ok: true }
}

export async function archivePatientAction(patientId: string): Promise<void> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return
  await archivePatient(ctx.organizationId, patientId)
  revalidatePath('/patients')
  redirect('/patients')
}

export async function bulkSendEmailAction(
  patientIds: string[],
  subject: string,
  body: string,
): Promise<BulkEmailResult | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can send bulk email' }
  if (patientIds.length === 0) return { ok: false, error: 'No patients selected' }
  if (!body.trim()) return { ok: false, error: 'Message body is required' }
  const result = await sendBulkPatientEmail({
    organizationId: ctx.organizationId,
    patientIds,
    subject,
    body,
    fromName: ctx.organizationName,
  })
  revalidatePath('/patients')
  return result
}

export async function addPatientNoteAction(
  patientId: string,
  body: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return { ok: false, error: 'Only clinic tenants can add notes' }
  if (!body.trim()) return { ok: false, error: 'Note body is required' }
  const id = await addPatientNote({
    organizationId: ctx.organizationId,
    patientId,
    authorId: ctx.userId,
    body,
  })
  revalidatePath(`/patients/${patientId}`)
  return { ok: true, id }
}

export async function deletePatientNoteAction(
  patientId: string,
  noteId: string,
): Promise<void> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return
  await deletePatientNote(ctx.organizationId, noteId)
  revalidatePath(`/patients/${patientId}`)
}
