/**
 * Tenant-aware terminology for the inbox UI. The platform tenant (Dream
 * Create) thinks of contacts as "clients" — the clinics + clinic owners
 * they sell to. A clinic tenant thinks of them as "patients". The
 * underlying `patient` table is shared; only the labels differ.
 *
 * Lives in lib/ (not lib/services/) so client components can import without
 * pulling in 'server-only'.
 */
// 'partner' is accepted for assignability with lib/modules' TenantType; a
// partner never reaches the inbox, so it falls through to the default branch.
export type TenantType = 'platform' | 'clinic' | 'patient' | 'partner'

export interface InboxTerminology {
  /** lowercase singular: "client" | "patient" */
  contact: string
  /** lowercase plural: "clients" | "patients" */
  contacts: string
  /** Capitalized singular: "Client" | "Patient" */
  Contact: string
  /** Capitalized plural: "Clients" | "Patients" */
  Contacts: string
  /** Should we show clinic-specific UI (appointments, insurance, intent chips)? */
  isClinical: boolean
}

export function inboxTerminology(tenantType: TenantType): InboxTerminology {
  if (tenantType === 'platform') {
    return {
      contact: 'client',
      contacts: 'clients',
      Contact: 'Client',
      Contacts: 'Clients',
      isClinical: false,
    }
  }
  return {
    contact: 'patient',
    contacts: 'patients',
    Contact: 'Patient',
    Contacts: 'Patients',
    isClinical: true,
  }
}
