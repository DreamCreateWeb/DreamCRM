import 'server-only'
import { and, asc, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { newProviderId } from '@/lib/services/appointments'

/**
 * Providers CRUD — the CRM-side staff labels that appointments attach to
 * ("with Dr. Reyes"). NOT clinical provider records (no NPI / license /
 * signature — those live in the PMS). Until now `clinic_provider` rows only
 * arrived via the demo seeder or a PMS import; this service lets a real clinic
 * create + manage its own roster from Settings → Practice.
 *
 * All reads/writes are org-scoped. Providers are deactivated, never hard-deleted,
 * so historical appointments keep their "with {name}" attribution.
 */

/** Roles a clinic can pick in the practice settings editor. Strings (not an
 *  enum) so we can add roles without a migration — `clinic_provider.role` is
 *  free text. */
export const PROVIDER_ROLES: Array<{ value: string; label: string }> = [
  { value: 'dentist', label: 'Dentist' },
  { value: 'hygienist', label: 'Hygienist' },
  { value: 'specialist', label: 'Specialist' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'admin', label: 'Front desk / admin' },
]

const KNOWN_ROLES = new Set(PROVIDER_ROLES.map((r) => r.value))
export function normalizeProviderRole(role: string | null | undefined): string {
  const r = (role ?? '').trim().toLowerCase()
  return KNOWN_ROLES.has(r) ? r : 'dentist'
}

export interface ProviderRow {
  id: string
  displayName: string
  role: string
  email: string | null
  isActive: boolean
}

/**
 * List providers for an org. By default returns active + inactive (the settings
 * editor needs both); pass `activeOnly` for booking/filter surfaces.
 */
export async function listProviders(
  organizationId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<ProviderRow[]> {
  const where = [eq(schema.clinicProvider.organizationId, organizationId)]
  if (opts.activeOnly) where.push(eq(schema.clinicProvider.isActive, 1))
  const rows = await db
    .select({
      id: schema.clinicProvider.id,
      displayName: schema.clinicProvider.displayName,
      role: schema.clinicProvider.role,
      email: schema.clinicProvider.email,
      isActive: schema.clinicProvider.isActive,
    })
    .from(schema.clinicProvider)
    .where(and(...where))
    .orderBy(asc(schema.clinicProvider.displayName))
  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    role: r.role,
    email: r.email,
    isActive: r.isActive === 1,
  }))
}

export interface CreateProviderInput {
  organizationId: string
  displayName: string
  role?: string
  email?: string | null
}

export async function createProvider(input: CreateProviderInput): Promise<string> {
  const displayName = input.displayName.trim()
  if (!displayName) throw new Error('Provider name is required')
  const id = newProviderId()
  await db.insert(schema.clinicProvider).values({
    id,
    organizationId: input.organizationId,
    displayName,
    role: normalizeProviderRole(input.role),
    email: input.email?.trim() || null,
  })
  return id
}

export interface UpdateProviderInput {
  organizationId: string
  providerId: string
  patch: {
    displayName?: string
    role?: string
    email?: string | null
    isActive?: boolean
  }
}

export async function updateProvider({ organizationId, providerId, patch }: UpdateProviderInput): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.displayName !== undefined) {
    const name = patch.displayName.trim()
    if (!name) throw new Error('Provider name is required')
    update.displayName = name
  }
  if (patch.role !== undefined) update.role = normalizeProviderRole(patch.role)
  if (patch.email !== undefined) update.email = patch.email?.trim() || null
  if (patch.isActive !== undefined) update.isActive = patch.isActive ? 1 : 0
  await db
    .update(schema.clinicProvider)
    .set(update)
    .where(
      and(
        eq(schema.clinicProvider.organizationId, organizationId),
        eq(schema.clinicProvider.id, providerId),
      ),
    )
}

/**
 * Deactivate a provider (soft — we never hard-delete because past appointments
 * reference the row for "with {name}" attribution). A deactivated provider
 * drops out of the booking + filter pickers but stays attached to history.
 */
export async function deactivateProvider(organizationId: string, providerId: string): Promise<void> {
  await updateProvider({ organizationId, providerId, patch: { isActive: false } })
}
