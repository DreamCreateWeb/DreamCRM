/** What the patient record's Consent card reads (client-safe). */
export interface PatientConsentView {
  emailOn: boolean
  emailOnAtIso: string | null
  emailOffAtIso: string | null
  smsOn: boolean
  smsOnAtIso: string | null
  smsOffAtIso: string | null
  /** `patient.marketing_opt_in_source` — one column, stamped on the latest opt-in. */
  source: string | null
}
