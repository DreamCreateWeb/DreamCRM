/**
 * What an upload IS, decided from its bytes — the pure, client-safe half the
 * /api/upload route and the browser-side pickers share, so the refusal a
 * staff member reads before the transfer starts is the same one the server
 * would send back after it.
 *
 * THE HEIC CASE. iPhones shoot HEIC by default. iOS Safari converts on upload,
 * but a photo AirDropped to a Mac or synced to Windows and dragged into Chrome
 * arrives raw. HEIC/HEIF is ISO-BMFF — the same `ftyp` box MP4 and MOV open
 * with — so the sniffer read it as a VIDEO, the route stored it, the stored
 * URL became a `photoUrl`, and the team card rendered a broken square while
 * the upload said it succeeded. The brand after `ftyp` tells them apart.
 */

/** ISO-BMFF brands that mean a HEIF-family still image, not a video. */
export const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heif'])

/** The four-character brand after an ISO-BMFF `ftyp` box, or null when the
 *  bytes are not ISO-BMFF at all. */
export function isoBmffBrand(bytes: Uint8Array): string | null {
  const ascii = (s: string, offset: number) =>
    s.split('').every((c, i) => bytes[offset + i] === c.charCodeAt(0))
  if (!ascii('ftyp', 4)) return null
  return String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0)
}

/** True when the leading bytes are a HEIC/HEIF still image. */
export function isHeicBytes(bytes: Uint8Array): boolean {
  const brand = isoBmffBrand(bytes)
  return brand !== null && HEIC_BRANDS.has(brand.toLowerCase())
}

/** The refusal names the FIX, not the format (anti-shame voice). */
export const HEIC_REJECTION =
  'iPhone HEIC photos aren’t supported yet — export it as a JPEG (Photos → File → Export) and try again.'

/**
 * Folders that only ever hold a PHOTO. A video sniffed into one of these is
 * refused in plain words rather than stored where a template will hand it to
 * the image optimizer. Any folder not listed here keeps today's behaviour.
 */
export const IMAGE_ONLY_FOLDERS = new Set([
  'clinic-staff',
  'clinic-office-photos',
  'clinic-logos',
  'clinic-hero',
  'clinic-coloring-pages',
  'service-icons',
  'avatars',
  'shop',
])

export function folderIsImageOnly(folder: string): boolean {
  return IMAGE_ONLY_FOLDERS.has(folder)
}

export const VIDEO_ON_IMAGE_FOLDER_REJECTION =
  'That looks like a video — this spot takes a photo (JPEG, PNG, or WebP).'

/**
 * Browser-side pre-check for a picked file, run BEFORE the transfer so the
 * message appears at once instead of after a progress bar. Reads the first 12
 * bytes (the `ftyp` box + brand) and falls back to the declared type and the
 * extension, since some browsers report HEIC as an empty type. Returns the
 * refusal sentence, or null when the file may go up. Never throws.
 */
export async function heicRefusal(file: File): Promise<string | null> {
  const declared = (file.type || '').toLowerCase()
  const name = (file.name || '').toLowerCase()
  if (declared === 'image/heic' || declared === 'image/heif' || /\.hei[cf]$/.test(name)) {
    return HEIC_REJECTION
  }
  try {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
    if (isHeicBytes(head)) return HEIC_REJECTION
  } catch {
    // An unreadable head is the server's call — it sniffs the real bytes.
  }
  return null
}

// ── The `message_attachment` kind ────────────────────────────────────────────
// What a thread can carry: a photo OR a PDF (a treatment plan, an EOB). One
// definition for the staff panel, the portal composer and /api/upload, so the
// words a person reads before the transfer are the ones the server would send.

/** The upload folder (and so the S3 prefix) message attachments live under. */
export const MESSAGE_ATTACHMENT_FOLDER = 'message-attachments'

/** One cap for every message attachment, photo or PDF. */
export const MESSAGE_ATTACHMENT_MAX_MB = 10
export const MESSAGE_ATTACHMENT_MAX_BYTES = MESSAGE_ATTACHMENT_MAX_MB * 1024 * 1024

/** The `accept` attribute for a message file input. */
export const MESSAGE_ATTACHMENT_ACCEPT = 'image/*,application/pdf'

/** True when the leading bytes are a PDF (`%PDF-`). */
export function isPdfBytes(bytes: Uint8Array): boolean {
  return [0x25, 0x50, 0x44, 0x46, 0x2d].every((v, i) => bytes[i] === v)
}

export const MESSAGE_ATTACHMENT_TYPE_REJECTION =
  'Threads take a photo (JPEG, PNG, WebP) or a PDF — save it as one of those and try again.'

export function messageAttachmentTooLarge(name: string): string {
  return `"${name}" is over ${MESSAGE_ATTACHMENT_MAX_MB} MB — pick a smaller file or compress the PDF.`
}

/** True when a declared type/filename is a PDF. */
export function looksLikePdf(file: { type?: string; name?: string }): boolean {
  return (file.type || '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(file.name || '')
}

/**
 * Browser-side pre-check for a message attachment, run BEFORE the transfer.
 * Returns the refusal sentence (HEIC names the fix), or null when it may go up.
 */
export async function messageAttachmentRefusal(file: File): Promise<string | null> {
  const heic = await heicRefusal(file)
  if (heic) return heic
  const isImage = (file.type || '').toLowerCase().startsWith('image/')
  if (!isImage && !looksLikePdf(file)) return MESSAGE_ATTACHMENT_TYPE_REJECTION
  if (file.size > MESSAGE_ATTACHMENT_MAX_BYTES) return messageAttachmentTooLarge(file.name)
  return null
}

/** "412 KB" / "1.3 MB" — the size on a document chip. */
export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
