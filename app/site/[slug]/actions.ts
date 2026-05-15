'use server'

import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { patient, appointment } from '@/lib/db/schema/clinic'
import { clinicProfile } from '@/lib/db/schema/platform'
import { eq, and } from 'drizzle-orm'
import { sendContactRequestEmail, sendBookingConfirmationEmail } from '@/lib/email'

export async function submitContactRequest(formData: FormData) {
  const orgId = formData.get('orgId')?.toString()
  const name = formData.get('name')?.toString().trim()
  const phone = formData.get('phone')?.toString().trim()
  const email = formData.get('email')?.toString().trim() || null
  const message = formData.get('message')?.toString().trim() || null
  const preferredDate = formData.get('preferredDate')?.toString().trim() || null

  if (!orgId) throw new Error('Missing organization')
  if (!name) throw new Error('Name is required')
  if (!phone) throw new Error('Phone is required')

  // Look up clinic email for forwarding
  const [profile] = await db
    .select({ email: clinicProfile.email, displayName: clinicProfile.displayName })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)

  // Send email to clinic — fire-and-forget, don't fail the form if Resend isn't configured
  if (profile?.email) {
    sendContactRequestEmail(profile.email, {
      clinicName: profile.displayName ?? 'Your Clinic',
      patientName: name,
      phone,
      email,
      preferredDate,
      message,
    }).catch(() => {})
  }
}

export async function submitBookingRequest(formData: FormData) {
  const orgId = formData.get('orgId')?.toString()
  const firstName = formData.get('firstName')?.toString().trim()
  const lastName = formData.get('lastName')?.toString().trim()
  const email = formData.get('email')?.toString().trim() || null
  const phone = formData.get('phone')?.toString().trim() || null
  const appointmentType = formData.get('type')?.toString() || 'checkup'
  const startTimeRaw = formData.get('startTime')?.toString()
  const notes = formData.get('notes')?.toString().trim() || null

  if (!orgId) throw new Error('Missing organization')
  if (!firstName || !lastName) throw new Error('Name is required')
  if (!startTimeRaw) throw new Error('Appointment date and time are required')

  const startTime = new Date(startTimeRaw)
  if (isNaN(startTime.getTime())) throw new Error('Invalid date/time')

  // Find existing patient by email, or create new
  let patientId: string
  if (email) {
    const [existing] = await db
      .select({ id: patient.id })
      .from(patient)
      .where(and(eq(patient.organizationId, orgId), eq(patient.email, email)))
      .limit(1)
    patientId = existing?.id ?? ''
  } else {
    patientId = ''
  }

  if (!patientId) {
    patientId = randomUUID()
    await db.insert(patient).values({
      id: patientId,
      organizationId: orgId,
      firstName,
      lastName,
      email,
      phone,
      isActive: 1,
    })
  }

  // Book the appointment
  await db.insert(appointment).values({
    id: randomUUID(),
    organizationId: orgId,
    patientId,
    title: `${appointmentType.charAt(0).toUpperCase() + appointmentType.slice(1).replace('_', ' ')} – ${firstName} ${lastName}`,
    startTime,
    type: appointmentType,
    status: 'scheduled',
    notes,
  })

  // Send confirmation to patient and notification to clinic
  const [profile] = await db
    .select({ email: clinicProfile.email, displayName: clinicProfile.displayName, phone: clinicProfile.phone })
    .from(clinicProfile)
    .where(eq(clinicProfile.organizationId, orgId))
    .limit(1)

  if (email) {
    sendBookingConfirmationEmail(email, {
      patientName: `${firstName} ${lastName}`,
      clinicName: profile?.displayName ?? 'Your Clinic',
      clinicPhone: profile?.phone ?? null,
      startTime,
      appointmentType,
    }).catch(() => {})
  }
}
