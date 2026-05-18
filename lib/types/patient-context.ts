import type { Patient, Appointment } from '@/lib/db/schema/clinic'

/**
 * Lightweight patient-context payload for the inbox patient card. Type-only
 * re-export of what the server-side getInboxPatientContext() returns, but
 * split out into its own file so that client components (patient-card.tsx)
 * can reference the type without pulling in the 'server-only' module.
 */
export interface InboxPatientContext {
  patient: Patient
  nextAppointment: Appointment | null
  lastAppointment: Appointment | null
  appointmentCount: number
}

/** Pure date helper — safe to import from client components. */
export function patientAge(dob: string | null): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}
