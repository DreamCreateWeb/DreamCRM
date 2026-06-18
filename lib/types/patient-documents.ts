/**
 * Client-safe patient-document types + bounds. The detail panel (a client
 * component) imports these without pulling the server service into the bundle.
 */

export interface PatientDocumentRow {
  id: string
  fileName: string
  fileUrl: string
  contentType: string
  sizeBytes: number
  label: string | null
  uploadedByName: string | null
  createdAt: Date
}

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024 // 15MB
export const MAX_DOCUMENT_LABEL_LEN = 80

/** What the file input accepts (client-side hint; the server re-sniffs bytes). */
export const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*'

/** Common labels offered in the picker (free text also allowed). */
export const DOCUMENT_LABEL_SUGGESTIONS = [
  'Insurance card',
  'Referral letter',
  'X-ray / imaging',
  'Treatment plan',
  'Signed form',
  'ID',
  'Other',
] as const

/** Pretty-print a byte count for the UI. */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** True when the stored object is an image (so the panel can show a thumbnail). */
export function isImageDocument(contentType: string): boolean {
  return contentType.startsWith('image/')
}
