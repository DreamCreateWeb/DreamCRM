import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * `uploadPatientDocumentAction` — WHICH CHECK RUNS FIRST.
 *
 * The patient-in-org check lived only inside `addPatientDocument`, which the
 * action calls AFTER `uploadBlob`. So a forged `patientId` in the form data
 * put the file into S3 at `patient-documents/<org>/<forged id>/…`, and only
 * then failed the row insert — leaving a blob in the bucket with no row, no
 * access check and nothing that will ever reach it again. Staff-only and
 * integrity-only (the uploader supplies their own bytes and never gets them
 * back), but storage is the one write here that cannot be rolled back, so the
 * gate belongs in front of it.
 *
 * What these pin:
 *
 *  1. A patient that is not in the caller's organization uploads NOTHING.
 *  2. The check runs BEFORE the upload, not merely somewhere.
 *  3. The org comes from the tenant context, never from the form.
 *  4. The happy path still uploads and still writes its row.
 *  5. `addPatientDocument` keeps its own check — a service that trusts its
 *     caller to have checked is one caller away from not being checked.
 *
 * RELEASE.md Part 5 · `uploadPatientDocumentAction` writes the S3 blob before
 * the patient-in-org check.
 */

const tenantCtx = {
  tenantType: 'clinic' as 'clinic' | 'patient' | 'platform',
  organizationId: 'org_1',
  userId: 'user_staff',
  role: 'owner' as string,
}
vi.mock('@/lib/auth/context', () => ({ requireTenant: vi.fn(async () => tenantCtx) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))

/** Every side-effecting step, in the order it actually happened. */
const calls: string[] = []
const state = {
  /** patientId → is it in `org_1`? */
  inOrg: {} as Record<string, boolean>,
  belongsArgs: [] as Array<[string, string]>,
  uploadKeys: [] as string[],
  added: [] as Record<string, unknown>[],
}

vi.mock('@/lib/blob', () => ({
  uploadBlob: vi.fn(async (key: string) => {
    calls.push('uploadBlob')
    state.uploadKeys.push(key)
    return { url: `https://storage.example/${key}` }
  }),
}))

vi.mock('@/lib/services/patient-documents', async (importOriginal) => {
  // Keep the REAL magic-byte sniff — this test is about ordering, and a
  // stubbed sniff would let a file through that the action would reject.
  const actual = await importOriginal<typeof import('@/lib/services/patient-documents')>()
  return {
    ...actual,
    patientBelongsToOrg: vi.fn(async (organizationId: string, patientId: string) => {
      calls.push('patientBelongsToOrg')
      state.belongsArgs.push([organizationId, patientId])
      return state.inOrg[patientId] === true
    }),
    addPatientDocument: vi.fn(async (input: Record<string, unknown>) => {
      calls.push('addPatientDocument')
      state.added.push(input)
      return { id: 'doc_1', fileName: 'x.pdf', fileUrl: String(input.fileUrl), contentType: 'application/pdf', sizeBytes: 8, label: null, uploadedByName: null, createdAt: new Date() }
    }),
    deletePatientDocument: vi.fn(async () => undefined),
    listPatientDocuments: vi.fn(async () => []),
  }
})

// Unused-by-this-test imports of patients/actions.ts that touch other services.
vi.mock('@/lib/db', async () => ({ db: {}, schema: await import('@/lib/db/schema') }))
vi.mock('@/lib/email', () => ({ sendPatientPortalInviteEmail: vi.fn() }))
vi.mock('@/lib/services/clinic-sender', () => ({ getClinicSenderIdentity: vi.fn() }))
vi.mock('@/lib/services/patients', () => ({ createPatient: vi.fn(), updatePatient: vi.fn(), archivePatient: vi.fn(), listPatients: vi.fn() }))
vi.mock('@/lib/services/patient-bulk-comms', () => ({ sendBulkPatientEmail: vi.fn() }))
vi.mock('@/lib/services/patient-notes', () => ({ addPatientNote: vi.fn(), deletePatientNote: vi.fn() }))
vi.mock('@/lib/services/patient-messaging', () => ({ getOrCreatePatientThread: vi.fn() }))
vi.mock('@/lib/services/patient-intake-send', () => ({ sendIntakeRequestToPatient: vi.fn() }))
vi.mock('@/lib/services/reviews', () => ({ createAndSendReviewRequest: vi.fn() }))
vi.mock('@/lib/services/patient-import', () => ({ importPatients: vi.fn(), autoMapColumns: vi.fn(), MAX_IMPORT_ROWS: 5000 }))
vi.mock('@/lib/csv-parse', () => ({ parseCsvTable: vi.fn() }))
vi.mock('../ecommerce/customers/admin-actions', () => ({ enterDemoMode: vi.fn() }))
vi.mock('@/app/(default)/ecommerce/customers/admin-actions', () => ({ enterDemoMode: vi.fn() }))

import { uploadPatientDocumentAction } from '@/app/(default)/patients/actions'

/** A real PDF, as far as the magic-byte sniff is concerned. */
function form(patientId: string): FormData {
  const fd = new FormData()
  fd.set('patientId', patientId)
  fd.set('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])], 'chart.pdf'))
  return fd
}

beforeEach(() => {
  tenantCtx.tenantType = 'clinic'
  tenantCtx.organizationId = 'org_1'
  calls.length = 0
  state.inOrg = { pat_mine: true }
  state.belongsArgs = []
  state.uploadKeys = []
  state.added = []
})

describe('uploadPatientDocumentAction — the check comes before the bytes', () => {
  it('a patient in ANOTHER clinic uploads nothing at all', async () => {
    state.inOrg = { pat_mine: true, pat_theirs: false }

    const res = await uploadPatientDocumentAction(form('pat_theirs'))

    expect(res).toEqual({ ok: false, error: 'Patient not found in this organization' })
    // The whole defect: the blob used to be written before this was known.
    expect(calls).not.toContain('uploadBlob')
    expect(state.uploadKeys).toEqual([])
    expect(state.added).toEqual([])
  })

  it('an id that matches no patient anywhere uploads nothing either', async () => {
    const res = await uploadPatientDocumentAction(form('pat_forged'))

    expect(res).toMatchObject({ ok: false })
    expect(calls).not.toContain('uploadBlob')
  })

  it('checks BEFORE it uploads, not merely somewhere', async () => {
    await uploadPatientDocumentAction(form('pat_mine'))

    expect(calls).toEqual(['patientBelongsToOrg', 'uploadBlob', 'addPatientDocument'])
    expect(calls.indexOf('patientBelongsToOrg')).toBeLessThan(calls.indexOf('uploadBlob'))
  })

  it('scopes the check to the tenant context, never to the form', async () => {
    tenantCtx.organizationId = 'org_other'
    state.inOrg = { pat_mine: false }

    await uploadPatientDocumentAction(form('pat_mine'))

    expect(state.belongsArgs).toEqual([['org_other', 'pat_mine']])
  })

  it('the happy path still uploads and still writes the row', async () => {
    const res = await uploadPatientDocumentAction(form('pat_mine'))

    expect(res).toMatchObject({ ok: true })
    expect(state.uploadKeys[0]).toContain('patient-documents/org_1/pat_mine/')
    expect(state.added[0]).toMatchObject({ organizationId: 'org_1', patientId: 'pat_mine', uploadedBy: 'user_staff' })
  })

  it('a non-clinic tenant is refused before anything is read', async () => {
    tenantCtx.tenantType = 'patient'

    const res = await uploadPatientDocumentAction(form('pat_mine'))

    expect(res).toMatchObject({ ok: false })
    expect(calls).toEqual([])
  })
})
