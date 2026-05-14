import { db } from '@/lib/db'
import { patient } from '@/lib/db/schema/clinic'
import { eq, and, or, ilike, desc } from 'drizzle-orm'
import type { Patient } from '@/lib/db/schema/clinic'

export type { Patient }

export async function getPatients(orgId: string, search?: string): Promise<Patient[]> {
  if (search && search.trim()) {
    const term = `%${search.trim()}%`
    return db
      .select()
      .from(patient)
      .where(
        and(
          eq(patient.organizationId, orgId),
          or(
            ilike(patient.firstName, term),
            ilike(patient.lastName, term),
            ilike(patient.email, term),
            ilike(patient.phone, term),
          ),
        ),
      )
      .orderBy(desc(patient.createdAt))
  }

  return db
    .select()
    .from(patient)
    .where(eq(patient.organizationId, orgId))
    .orderBy(desc(patient.createdAt))
}
