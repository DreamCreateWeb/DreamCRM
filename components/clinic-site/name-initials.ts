/** Two initials from a person's or practice's name, skipping honorifics and
 *  middle initials ("Dr. Ted M. Pinney" → TP, not DT). Shared by the crest's
 *  monogram and the doctor card. */
export function nameInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w) && !/^(dr|mr|mrs|ms|prof)\.?$/i.test(w))
    .filter((w) => !/^[A-Za-z]\.$/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}
