/**
 * THE DSO / CHAIN NAME LIST (P-04) — maintained by hand.
 *
 * Owner's ruling (2026-11-11): chains and DSOs are OUT of the prospecting
 * pool — we will target them later with other features. A practice whose
 * name, NPI organization name or Google listing name carries one of these
 * is set aside as `suppressed_reason='chain'` (lib/prospect-fit.ts does the
 * matching; the drawer's "Not a chain" lets a human un-flag one for good).
 *
 * TWO CLASSES (P-04 fix pass): a DISTINCT brand ("Aspen Dental",
 * "Heartland Dental") matches on the name alone. A COMMON-PHRASE brand
 * ("Gentle Dental", "Dentistry for Children", "Perfect Teeth" — words
 * hundreds of independents carry) carries `domains`, and matches ONLY when
 * the practice's website host (the row's, or the matched listing's) equals
 * or ends with one of them. A name hit with no domain corroboration is NOT
 * a match — nothing hides a row on a word. Every domain here was looked up
 * (the brand's own site or its parent's); an entry whose domain could not
 * be named with confidence is not on the list.
 *
 * Add a name here when a chain shows up in the pool; the match is a
 * normalized whole-word sequence, so "Imagen" never catches "Imagenation
 * Dental" and "DECA" never catches "Decatur".
 */
export interface DsoEntry {
  name: string
  /** Set only for a common-phrase brand: the website host must match. */
  domains?: readonly string[]
}

export const DSO_ENTRIES: readonly DsoEntry[] = [
  { name: 'Aspen Dental' },
  { name: 'Heartland Dental' },
  { name: 'Pacific Dental Services' },
  { name: 'Smile Brands' },
  { name: 'Western Dental' },
  { name: 'Affordable Dentures & Implants' },
  { name: 'Great Expressions' },
  { name: 'Dental Care Alliance' },
  { name: 'MB2 Dental' },
  // The brand's site is mysagedental.com (its own releases point there).
  { name: 'Sage Dental', domains: ['mysagedental.com'] },
  { name: 'Familia Dental', domains: ['familiadental.com'] },
  { name: 'Kool Smiles' },
  { name: 'Benevis' },
  // Two DSOs wear this name: 42 North Dental's "Gentle Dental of New
  // England" (gentledental.com — 40+ MA / NH offices) and InterDent's
  // West-coast brand (gentledental.interdent.com; gentle1.com redirects
  // there). Either host corroborates; a "Gentle Dental Care of Smithville"
  // at its own domain never matches (fix pass II, V1).
  { name: 'Gentle Dental', domains: ['gentledental.com', 'interdent.com', 'gentle1.com'] },
  { name: 'Bright Now!' },
  { name: 'Castle Dental', domains: ['castledental.com'] },
  { name: 'Midwest Dental', domains: ['midwest-dental.com'] },
  { name: 'InterDent' },
  { name: 'Lone Peak', domains: ['lonepeakdentalgroup.com'] },
  { name: 'Riccobene' },
  { name: 'Marquee Dental' },
  // The Spark-supported New Jersey group; the Minnesota and Atlanta
  // practices of the same name are independents and never match.
  { name: 'Dentistry for Children', domains: ['dentistryforchildrenus.com'] },
  { name: 'Perfect Teeth', domains: ['perfectteeth.com'] },
  { name: 'Monarch Dental', domains: ['monarchdental.com'] },
  { name: 'Dental One Partners' },
  { name: 'North American Dental Group' },
  { name: 'Specialized Dental Partners' },
  { name: 'ClearChoice' },
  { name: '42 North' },
  { name: 'Imagen' },
  { name: 'Elite Dental Partners' },
  { name: 'Community Dental Partners' },
  { name: 'DECA' },
  { name: 'Smile Doctors', domains: ['smiledoctors.com'] },
  { name: 'Rodeo Dental' },
]

export const DSO_NAMES: readonly string[] = DSO_ENTRIES.map((e) => e.name)

/** The common-phrase brands — the ones that need the host to agree. */
export const DSO_DOMAIN_CLASS: readonly string[] = DSO_ENTRIES.filter((e) => e.domains && e.domains.length > 0).map((e) => e.name)
