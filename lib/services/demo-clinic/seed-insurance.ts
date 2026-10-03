import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { detailFromRequest, type EligibilityRequest } from '@/lib/insurance-eligibility'
import { SANDBOX_TIMEOUT_MESSAGE, renderSandboxScenario, type SandboxScenarioKey } from '@/lib/services/insurance-eligibility/sandbox'
import { buildPatientPersonas } from './personas'

/**
 * Seed the insurance-check showcase: a small persona-anchored history so the
 * /insurance page's recent list, the patient-record rail card and the
 * timeline all have real rows to read. Each row is pinned to a sandbox
 * scenario and stored EXACTLY as the driver would answer (renderSandboxScenario
 * at the row's own checked-at instant), driver 'sandbox', so the honesty pill
 * renders on every one.
 *
 * Coverage of states: Mia [0] active twice (a history), Marcus [3] new
 * coverage with waiting periods, Sophia [4] coverage ended, Emma [6] not
 * found, Aiden [5] a failed check (error row, result null). Noah and the rest
 * stay never-checked so the "Never checked" state + the needs-attention nudge
 * are visible too. Deterministic `ins_demo…` ids; cleanup sweeps strays.
 */
export async function seedDemoInsuranceChecks(
  orgId: string,
  now: Date,
  patientIds: Array<string | null>,
): Promise<void> {
  const dayMs = 24 * 60 * 60 * 1000
  const miaId = patientIds[0]
  if (!miaId) return

  // Positive anchor: Mia's row must exist (exhausted seeder-test queue → skip).
  const [mia] = await db
    .select({ id: schema.patient.id, policy: schema.patient.insurancePolicyNumber, detail: schema.patient.insuranceDetail })
    .from(schema.patient)
    .where(and(eq(schema.patient.organizationId, orgId), eq(schema.patient.id, miaId)))
    .limit(1)
  if (!mia) return
  // Mia's checks carry HER on-file policy number, so the remembered card the
  // rows imply still matches the record (the merge rule drops a mismatch).
  const miaMemberId = (mia.policy ?? '').trim() || 'DD-100-2231'

  const personas = buildPatientPersonas(now)
  const person = (i: number) => {
    const p = personas[i]
    return { firstName: p.firstName, lastName: p.lastName, dateOfBirth: p.dateOfBirth }
  }
  const request = (i: number, memberId: string): EligibilityRequest => ({
    patient: person(i),
    carrierName: 'Delta Dental',
    memberId,
    groupNumber: 'GRP-4471',
    relationship: 'self',
    subscriber: null,
  })

  const seeds: Array<{
    id: string
    personaIndex: number
    memberId: string
    scenario: SandboxScenarioKey | 'timeout'
    daysAgo: number
  }> = [
    { id: 'ins_demo_mia_2', personaIndex: 0, memberId: miaMemberId, scenario: 'active_ppo', daysAgo: 12 },
    { id: 'ins_demo_mia_1', personaIndex: 0, memberId: miaMemberId, scenario: 'active_exhausted', daysAgo: 300 },
    { id: 'ins_demo_marcus_1', personaIndex: 3, memberId: 'DD-100-7718', scenario: 'active_waiting', daysAgo: 3 },
    { id: 'ins_demo_sophia_1', personaIndex: 4, memberId: 'DD-100-0000', scenario: 'inactive', daysAgo: 20 },
    { id: 'ins_demo_emma_1', personaIndex: 6, memberId: 'DD-100-9999', scenario: 'not_found', daysAgo: 40 },
    { id: 'ins_demo_aiden_1', personaIndex: 5, memberId: 'DD-100-0001', scenario: 'timeout', daysAgo: 60 },
  ]

  const existing = await db
    .select({ id: schema.insuranceVerification.id })
    .from(schema.insuranceVerification)
    .where(inArray(schema.insuranceVerification.id, seeds.map((s) => s.id)))
  const have = new Set(existing.map((r) => r.id))

  for (const s of seeds) {
    const patientId = patientIds[s.personaIndex]
    if (!patientId || have.has(s.id)) continue
    const checkedAt = new Date(now.getTime() - s.daysAgo * dayMs)
    const input = request(s.personaIndex, s.memberId)
    const result = s.scenario === 'timeout' ? null : renderSandboxScenario(s.scenario, input, checkedAt)
    await db.insert(schema.insuranceVerification).values({
      id: s.id,
      organizationId: orgId,
      patientId,
      requestedByUserId: null,
      driver: 'sandbox',
      status: result ? result.status : 'error',
      input,
      result,
      error: result ? null : SANDBOX_TIMEOUT_MESSAGE,
      checkedAt,
      createdAt: checkedAt,
    })
  }

  // The record remembers the card (polish phase 3): stamp Mia's detail the
  // way her latest seeded check would have, once — a self-heal for demos
  // seeded before the column existed. Never touches the flat columns.
  if (!mia.detail) {
    const input = request(0, miaMemberId)
    const latest = new Date(now.getTime() - 12 * dayMs)
    await db
      .update(schema.patient)
      .set({ insuranceDetail: detailFromRequest(input, renderSandboxScenario('active_ppo', input, latest), 'check', latest) })
      .where(and(eq(schema.patient.organizationId, orgId), eq(schema.patient.id, miaId)))
  }
}
