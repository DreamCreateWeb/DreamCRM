import 'server-only'
import { randomBytes } from 'crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { MAX_DOCUMENT_LABEL_LEN, type PatientDocumentRow } from '@/lib/types/patient-documents'

export type { PatientDocumentRow }
export { MAX_DOCUMENT_BYTES } from '@/lib/types/patient-documents'

/**
 * Per-patient document storage (S3-backed). CRM-side file attachments —
 * referral letters, x-ray/photo exports, signed PDFs, insurance-card scans —
 * NOT the clinical imaging system. Mirrors the patient-notes service: org-scoped
 * reads/writes, patient ownership verified before a write, soft delete.
 */

export function newPatientDocumentId(): string {
  return `pdoc_${randomBytes(10).toString('hex')}`
}

export type DocumentSniff =
  | { ok: true; contentType: string }
  | { ok: false; reason: string }

/**
 * Identify an uploaded document from its leading bytes — PDF or a raster image
 * (the same allowlist as the image route, plus PDF). Never trusts the client
 * Content-Type. SVG/markup is rejected (stored-XSS risk in a public bucket).
 * Pure + exported for tests.
 */
export function sniffPatientDocument(bytes: Uint8Array): DocumentSniff {
  const b = bytes
  const has = (sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v)
  const ascii = (s: string, offset = 0) => s.split('').every((c, i) => b[offset + i] === c.charCodeAt(0))

  // PDF: "%PDF"
  if (ascii('%PDF')) return { ok: true, contentType: 'application/pdf' }
  // JPEG: FF D8 FF
  if (has([0xff, 0xd8, 0xff])) return { ok: true, contentType: 'image/jpeg' }
  // PNG
  if (has([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ok: true, contentType: 'image/png' }
  // GIF
  if (ascii('GIF87a') || ascii('GIF89a')) return { ok: true, contentType: 'image/gif' }
  // WEBP: "RIFF"...."WEBP"
  if (ascii('RIFF') && ascii('WEBP', 8)) return { ok: true, contentType: 'image/webp' }

  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(b.slice(0, 256))
    .trimStart()
    .toLowerCase()
  if (head.startsWith('<svg') || head.startsWith('<?xml') || head.startsWith('<!doctype')) {
    return { ok: false, reason: 'SVG and other markup files aren’t allowed.' }
  }
  return { ok: false, reason: 'Upload a PDF or an image (JPEG, PNG, WebP, GIF).' }
}

export async function listPatientDocuments(
  organizationId: string,
  patientId: string,
): Promise<PatientDocumentRow[]> {
  const rows = await db
    .select({
      id: schema.patientDocument.id,
      fileName: schema.patientDocument.fileName,
      fileUrl: schema.patientDocument.fileUrl,
      contentType: schema.patientDocument.contentType,
      sizeBytes: schema.patientDocument.sizeBytes,
      label: schema.patientDocument.label,
      uploadedByName: schema.user.name,
      createdAt: schema.patientDocument.createdAt,
    })
    .from(schema.patientDocument)
    .leftJoin(schema.user, eq(schema.patientDocument.uploadedBy, schema.user.id))
    .where(
      and(
        eq(schema.patientDocument.organizationId, organizationId),
        eq(schema.patientDocument.patientId, patientId),
        isNull(schema.patientDocument.deletedAt),
      ),
    )
    .orderBy(desc(schema.patientDocument.createdAt))
  return rows
}

export interface AddPatientDocumentInput {
  organizationId: string
  patientId: string
  uploadedBy: string | null
  fileName: string
  fileUrl: string
  contentType: string
  sizeBytes: number
  label?: string | null
}

/** Persist a document row. Verifies the patient belongs to the org first so a
 *  stale/foreign id can't orphan a row. Returns the created row. */
export async function addPatientDocument(input: AddPatientDocumentInput): Promise<PatientDocumentRow> {
  const [owner] = await db
    .select({ id: schema.patient.id })
    .from(schema.patient)
    .where(and(eq(schema.patient.id, input.patientId), eq(schema.patient.organizationId, input.organizationId)))
    .limit(1)
  if (!owner) throw new Error('Patient not found in this organization')

  const id = newPatientDocumentId()
  const fileName = (input.fileName || 'document').slice(0, 200)
  const label = input.label ? input.label.trim().slice(0, MAX_DOCUMENT_LABEL_LEN) || null : null
  const createdAt = new Date()
  await db.insert(schema.patientDocument).values({
    id,
    organizationId: input.organizationId,
    patientId: input.patientId,
    uploadedBy: input.uploadedBy,
    fileName,
    fileUrl: input.fileUrl,
    contentType: input.contentType,
    sizeBytes: Math.max(0, Math.round(input.sizeBytes)),
    label,
    createdAt,
  })

  // Live-push so an open patient record (staff detail + the patient's own
  // portal) shows the new file the instant it's shared — best-effort.
  try {
    const { publishRealtime } = await import('@/lib/services/realtime')
    await publishRealtime(input.organizationId, 'documents', { patientId: input.patientId, action: 'added' })
  } catch {
    /* best-effort */
  }

  return {
    id,
    fileName,
    fileUrl: input.fileUrl,
    contentType: input.contentType,
    sizeBytes: Math.max(0, Math.round(input.sizeBytes)),
    label,
    uploadedByName: null,
    createdAt,
  }
}

/** Soft-delete a document (the S3 object is left in place). */
export async function deletePatientDocument(organizationId: string, documentId: string): Promise<void> {
  const removed = await db
    .update(schema.patientDocument)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(schema.patientDocument.id, documentId),
        eq(schema.patientDocument.organizationId, organizationId),
      ),
    )
    .returning({ patientId: schema.patientDocument.patientId })

  const patientId = removed[0]?.patientId
  if (patientId) {
    try {
      const { publishRealtime } = await import('@/lib/services/realtime')
      await publishRealtime(organizationId, 'documents', { patientId, action: 'removed' })
    } catch {
      /* best-effort */
    }
  }
}
