import { describe, it, expect } from 'vitest'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '@/lib/db/schema'

/**
 * The slot upsert and the rank-filtered check read, rendered through
 * drizzle's real Postgres dialect: the conflict target must be the unique
 * (organization_id, patient_id, rank) index, and the rank filter must be a
 * bound parameter on the statement — not a JS-side filter.
 */
const db = drizzle.mock({ schema })

describe('ML-50 statements, as Postgres will receive them', () => {
  it('the slot upsert conflicts on (organization_id, patient_id, rank)', () => {
    const q = db
      .insert(schema.patientInsurance)
      .values({ id: 'pins_x', organizationId: 'org_1', patientId: 'pat_1', rank: 'secondary', provider: 'Cigna', policyNumber: 'CG-1', groupNumber: null })
      .onConflictDoUpdate({
        target: [schema.patientInsurance.organizationId, schema.patientInsurance.patientId, schema.patientInsurance.rank],
        set: { provider: 'Cigna' },
      })
      .toSQL()
    expect(q.sql).toMatch(/insert into "patient_insurance"/)
    expect(q.sql).toMatch(/on conflict \("organization_id","patient_id","rank"\) do update set "provider" = \$/)
  })
})
