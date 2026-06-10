import 'server-only'
import { redirect } from 'next/navigation'
import { requireTenant, type TenantContext } from '@/lib/auth/context'
import { getPortalSettings } from '@/lib/services/portal-settings'
import {
  getPortalClinicInfo,
  getAccessiblePatientIds,
  getMyDependents,
  type PortalClinicInfo,
  type PortalVisit,
  type PortalDependent,
} from '@/lib/services/patient-portal'
import { CLINIC_DEFAULT_TZ } from '@/lib/clinic-timezone'
import { PORTAL_VISIT_LABELS, type PortalSettings } from '@/lib/types/portal'
import type { VisitCardData } from '@/components/patient-portal/visit-card'

/**
 * Shared per-request context for portal pages: tenant + settings + clinic
 * info + the patient-id set this login may act for. Pages call this once
 * and pass pieces down.
 */
export interface PortalPageContext {
  ctx: TenantContext & { patientId: string }
  settings: PortalSettings
  clinic: PortalClinicInfo | null
  brand: string
  timeZone: string
  dependents: PortalDependent[]
  /** [self, ...dependents] when family access is on; [self] otherwise. */
  allowedPatientIds: string[]
}

export async function getPortalPageContext(): Promise<PortalPageContext> {
  const ctx = await requireTenant()
  if (ctx.tenantType !== 'patient') redirect('/')
  if (!ctx.patientId) redirect('/patient/dashboard') // layout renders the help screen

  const [settings, clinic] = await Promise.all([
    getPortalSettings(ctx.organizationId),
    getPortalClinicInfo(ctx.organizationId),
  ])
  const dependents = settings.features.family
    ? await getMyDependents(ctx.patientId, ctx.organizationId)
    : []
  const allowedPatientIds = await getAccessiblePatientIds(
    ctx.patientId,
    ctx.organizationId,
    settings.features.family,
  )

  return {
    ctx: ctx as TenantContext & { patientId: string },
    settings,
    clinic,
    brand: clinic?.brandColor ?? '#9CAF9F',
    timeZone: clinic?.timezone?.trim() || CLINIC_DEFAULT_TZ,
    dependents,
    allowedPatientIds,
  }
}

/** Serialize a PortalVisit for the client VisitCard. */
export function toVisitCardData(visit: PortalVisit, selfPatientId: string): VisitCardData {
  return {
    id: visit.id,
    type: visit.type,
    typeLabel: PORTAL_VISIT_LABELS[visit.type] ?? 'Visit',
    status: visit.status,
    startIso: visit.startTime.toISOString(),
    providerName: visit.providerName,
    providerPhotoUrl: visit.providerPhotoUrl,
    patientFirstName: visit.patientFirstName,
    isDependent: visit.patientId !== selfPatientId,
  }
}

/** "addressLine1, City, ST zip" for Get-directions links; null when no address. */
export function mapsQueryFor(clinic: PortalClinicInfo | null): string | null {
  if (!clinic?.addressLine1) return null
  return [clinic.addressLine1, clinic.city, [clinic.state, clinic.postalCode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')
}

/** Require a feature flag — pages for toggled-off features bounce home. */
export function requirePortalFeature(pc: PortalPageContext, flag: keyof PortalSettings['features']) {
  if (!pc.settings.features[flag]) redirect('/patient/dashboard')
}
