'use server'

import { requireTenant } from '@/lib/auth/context'
import { searchPatientOptions, type PatientOption } from '@/lib/services/patients'

/**
 * The shared patient picker's search (components/ui/patient-combobox.tsx):
 * name / email / phone digits, server-side, capped, most recently active
 * first. It rides `searchPatientOptions` — never a second ILIKE — and the
 * org comes from the session, never the caller.
 */
export async function searchPatientsAction(query: string): Promise<PatientOption[]> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'clinic') return []
  return searchPatientOptions(ctx.organizationId, typeof query === 'string' ? query.slice(0, 80) : '')
}
