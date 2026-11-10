import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ML-50b — the primary insurance plan is authoritative in `patient_insurance`.
 * The flat `patient.insurance_*` columns are a MIRROR for one release: written
 * (by the writers below, always together with the slot), never read.
 *
 * Two walkers over `lib/` and `app/`:
 *  1. THE WRITER CONTRACT: the files found by the writer grep
 *     (`insurancePolicyNumber|insurance_policy_number|insuranceProvider:`) are
 *     each either a registered WRITER (and must call the slot writer) or a
 *     registered NON-DB file (types, UI state, normalizers, pure helpers). A
 *     new file matching the grep fails until it is classified here.
 *  2. NO NEW FLAT READER: a drizzle COLUMN reference
 *     `patient.insurance{Provider,PolicyNumber,GroupNumber,Detail}` may appear
 *     only in the dated allowlist (2026-11-10), the files that still mirror.
 *
 * Class (review-gate intake): a tree walk over `lib` and `app`.
 * Blind spot: a raw-SQL read (`insurance_provider` in a sql`` template) and a
 * whole-row `select()` are not seen by (2); the writer grep in (1) catches the
 * raw column name in new files.
 */

const SLOT_WRITERS = ['upsertPatientInsurance', 'patchPrimaryInsurance', 'seedPrimaryInsuranceBulk']

/** file -> why it writes the flat columns. Each must also call a slot writer. */
const WRITERS: Record<string, string> = {
  'lib/services/insurance-eligibility/plans.ts': 'the slot service itself (writes the mirror)',
  'lib/services/patients.ts': 'createPatient / updatePatient (the edit modal and the insurance tool go through these)',
  'lib/services/pms/sync.ts': 'PMS sync: mapped, linked and created patients',
  'lib/services/forms.ts': 'intake write-back (primary keys)',
  'lib/services/patient-import.ts': 'CSV import (carrier column) + the export',
  'lib/services/patient-merge.ts': "merge fills the survivor's blank primary card",
  'lib/services/demo-clinic/index.ts': 'persona seeder (persona-anchored)',
  'app/(portal)/patient/profile/actions.ts': 'the portal profile card edit',
}

/** Matches the writer grep but never writes the table: types, UI state, normalizers, pure helpers, readers of the slot service's output. */
const NON_DB = new Set([
  'lib/types/forms.ts',
  'lib/services/pms/provider.ts',
  'lib/services/pms/nexhealth.ts', // normalizes the PMS payload; sync.ts writes it
  'lib/services/demo-clinic/clinic-config.ts',
  'lib/services/demo-clinic/personas.ts',
  'lib/services/demo-clinic/seed-insurance.ts', // reads/stamps through the slot service
  'lib/services/patient-portal.ts', // output shape of getMyRecords (read via getPatientInsurance)
  'lib/services/patient-audit.ts',
  'lib/services/patient-context.ts', // overlays the card from the slot service
  'lib/services/insurance-eligibility/index.ts',
  'lib/services/marketing.ts',
  'lib/services/ai-mailbox.ts',
  'lib/db/schema/clinic.ts',
  'lib/insurance-eligibility.ts',
  'app/(default)/patients/[id]/patient-detail.tsx',
  'app/(default)/patients/[id]/page.tsx',
  'app/(default)/patients/[id]/edit-modal.tsx', // -> updatePatientAction -> updatePatient
  'app/(default)/patients/import-patients-modal.tsx',
  'app/(default)/insurance/actions.ts', // primary -> updatePatient/createPatient; secondary -> upsertPatientInsurance
  'app/(default)/insurance/page.tsx',
  'app/(portal)/patient/records/page.tsx',
  'app/(portal)/patient/profile/profile-form.tsx',
  'app/(portal)/patient/profile/page.tsx',
  'app/(double-sidebar)/inbox/components/patient-card.tsx',
  'app/site/[slug]/intake/[formSlug]/intake-form-runner.tsx',
])

/** DATED 2026-11-10, MAY ONLY SHRINK: files that may name a flat patient.insurance* COLUMN. */
const FLAT_COLUMN_ALLOWLIST = new Set([
  'lib/services/insurance-eligibility/plans.ts', // mirror writes + the unmirrored-primary fallback
])
const ALLOWLIST_CEILING = 1

const ROOT = process.cwd()
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (name === 'node_modules' || name === '.next' || rel === 'lib/db/migrations') continue
    const st = statSync(join(ROOT, rel))
    if (st.isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(rel)
  }
  return out
}
const files = [...walk('lib'), ...walk('app')]
const src = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('ML-50b: the writer contract', () => {
  const matches = files.filter((f) => /insurancePolicyNumber|insurance_policy_number|insuranceProvider:/.test(src(f)))

  it('every file the writer grep finds is classified (a new one must be filed here)', () => {
    const unclassified = matches.filter((f) => !(f in WRITERS) && !NON_DB.has(f))
    expect(unclassified).toEqual([])
  })

  it('every registered writer exists and calls the slot writer', () => {
    for (const f of Object.keys(WRITERS)) {
      expect(matches, `${f} no longer matches the grep - drop it from WRITERS`).toContain(f)
      expect(SLOT_WRITERS.some((w) => src(f).includes(w)), `${f} writes the flat columns but never the primary slot`).toBe(true)
    }
  })
})

describe('ML-50b: no new reader of the flat columns', () => {
  // A drizzle column reference: `schema.patient.insuranceX`, or a bare `patient.insuranceX`
  // in a file that imports the `patient` table (not a row/prop named patient).
  const COLUMN_SCHEMA = /\bschema\.patient\.insurance(Provider|PolicyNumber|GroupNumber|Detail)\b/
  const COLUMN_BARE = /(?<![.\w])patient\.insurance(Provider|PolicyNumber|GroupNumber|Detail)\b/
  const COLUMN = {
    test: (s: string) => COLUMN_SCHEMA.test(s) || (/schema\/clinic'/.test(s) && COLUMN_BARE.test(s)),
  }

  it('only the allowlisted files name a flat insurance column', () => {
    const offenders = files.filter((f) => COLUMN.test(src(f)) && !FLAT_COLUMN_ALLOWLIST.has(f))
    expect(offenders).toEqual([])
  })

  it('the allowlist may only shrink', () => {
    expect(FLAT_COLUMN_ALLOWLIST.size).toBeLessThanOrEqual(ALLOWLIST_CEILING)
    for (const f of Array.from(FLAT_COLUMN_ALLOWLIST)) expect(COLUMN.test(src(f)), `${f} no longer names a flat column - remove it`).toBe(true)
  })
})
