import 'server-only'
import { randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type {
  PmsProviderClient,
  PmsTestResult,
  PmsWriteResult,
  NormalizedPatient,
  NormalizedAppointment,
  NormalizedProvider,
  CreateAppointmentPayload,
  CreatePatientPayload,
} from './provider'

/**
 * Sandbox provider for the Acme demo clinic. It is NOT canned static data — it
 * reads the demo org's already-seeded rows + their pms_entity_map links and
 * re-presents them as if they came from Open Dental, so "Sync now" in demo
 * mode runs the real engine idempotently (everything already mapped → 0
 * created, all skipped/updated) instead of duplicating. Writes return a
 * synthetic external id, simulating a successful sanctioned API write.
 *
 * Presented to the user as "Open Dental (Sandbox)" — honest: the whole Acme
 * clinic is sample data behind the global demo banner.
 */
export class DemoProvider implements PmsProviderClient {
  readonly id = 'demo' as const
  constructor(private readonly organizationId: string) {}

  private async maps(entityType: 'patient' | 'appointment' | 'provider'): Promise<Map<string, string>> {
    const rows = await db
      .select({ internalId: schema.pmsEntityMap.internalId, externalId: schema.pmsEntityMap.externalId })
      .from(schema.pmsEntityMap)
      .where(
        and(
          eq(schema.pmsEntityMap.organizationId, this.organizationId),
          eq(schema.pmsEntityMap.entityType, entityType),
        ),
      )
    return new Map(rows.map((r) => [r.internalId, r.externalId]))
  }

  async testConnection(): Promise<PmsTestResult> {
    return {
      ok: true,
      practiceTitle: 'Acme Dental (Sandbox)',
      version: 'Open Dental 24.3 — simulated',
      eConnectorReachable: true,
      scopeNote: 'Sandbox — no real PMS is contacted',
    }
  }

  async listProviders(): Promise<NormalizedProvider[]> {
    const map = await this.maps('provider')
    if (map.size === 0) return []
    const rows = await db
      .select()
      .from(schema.clinicProvider)
      .where(eq(schema.clinicProvider.organizationId, this.organizationId))
    return rows
      .filter((r) => map.has(r.id))
      .map((r) => ({ externalId: map.get(r.id)!, displayName: r.displayName, role: r.role }))
  }

  async listPatients(): Promise<NormalizedPatient[]> {
    const map = await this.maps('patient')
    if (map.size === 0) return []
    const rows = await db
      .select()
      .from(schema.patient)
      .where(eq(schema.patient.organizationId, this.organizationId))
    return rows
      .filter((r) => map.has(r.id))
      .map((r) => ({
        externalId: map.get(r.id)!,
        firstName: r.firstName,
        lastName: r.lastName,
        dateOfBirth: r.dateOfBirth ?? null,
        email: r.email ?? null,
        phone: r.phone ?? null,
        addressLine1: r.addressLine1 ?? null,
        city: r.city ?? null,
        state: r.state ?? null,
        postalCode: r.postalCode ?? null,
        balanceCents: r.pmsBalanceCents ?? null,
      }))
  }

  async listAppointments(): Promise<NormalizedAppointment[]> {
    const apptMap = await this.maps('appointment')
    if (apptMap.size === 0) return []
    const patMap = await this.maps('patient')
    const provMap = await this.maps('provider')
    const rows = await db
      .select()
      .from(schema.appointment)
      .where(eq(schema.appointment.organizationId, this.organizationId))
    return rows
      .filter((r) => apptMap.has(r.id) && patMap.has(r.patientId))
      .map((r) => ({
        externalId: apptMap.get(r.id)!,
        patientExternalId: patMap.get(r.patientId)!,
        providerExternalId: r.providerId ? provMap.get(r.providerId) ?? null : null,
        startTime: r.startTime,
        endTime: r.endTime ?? null,
        status: r.status as NormalizedAppointment['status'],
        type: r.type,
        note: r.notes ?? null,
      }))
  }

  async createPatient(_payload: CreatePatientPayload): Promise<PmsWriteResult> {
    return { externalId: `od-sbx-pat-${randomUUID().slice(0, 8)}` }
  }

  async createAppointment(_payload: CreateAppointmentPayload): Promise<PmsWriteResult> {
    return { externalId: `od-sbx-apt-${randomUUID().slice(0, 8)}` }
  }
}
