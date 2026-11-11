/**
 * THE DSO / CHAIN NAME LIST (P-04) — maintained by hand.
 *
 * Owner's ruling (2026-11-11): chains and DSOs are OUT of the prospecting
 * pool — we will target them later with other features. A practice whose
 * name, NPI organization name or Google listing name carries one of these
 * is set aside as `suppressed_reason='chain'` (lib/prospect-fit.ts does the
 * matching; the drawer's "Not a chain" lets a human un-flag one for good).
 *
 * Add a name here when a chain shows up in the pool; the match is a
 * normalized whole-word sequence, so "Imagen" never catches "Imagenation
 * Dental" and "DECA" never catches "Decatur".
 */
export const DSO_NAMES: readonly string[] = [
  'Aspen Dental',
  'Heartland Dental',
  'Pacific Dental Services',
  'Smile Brands',
  'Western Dental',
  'Affordable Dentures & Implants',
  'Great Expressions',
  'Dental Care Alliance',
  'MB2 Dental',
  'Sage Dental',
  'Familia Dental',
  'Kool Smiles',
  'Benevis',
  'Gentle Dental',
  'Bright Now!',
  'Castle Dental',
  'Midwest Dental',
  'InterDent',
  'Lone Peak',
  'Riccobene',
  'Marquee Dental',
  'Dentistry for Children',
  'Perfect Teeth',
  'Monarch Dental',
  'Dental One Partners',
  'North American Dental Group',
  'Specialized Dental Partners',
  'ClearChoice',
  '42 North',
  'Imagen',
  'Elite Dental Partners',
  'Community Dental Partners',
  'DECA',
  'Smile Doctors',
  'Rodeo Dental',
]
