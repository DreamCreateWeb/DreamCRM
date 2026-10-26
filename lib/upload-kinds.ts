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
