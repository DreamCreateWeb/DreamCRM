import 'server-only'


/**
 * What `createDemoClinic` reports back: which org it resolved, whether this
 * call created it, and how much it seeded.
 */
export interface DemoClinicResult {
  organizationId: string
  organizationSlug: string
  organizationName: string
  created: boolean
  patientCount: number
  appointmentCount: number
}
