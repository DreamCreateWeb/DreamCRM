/**
 * THE PAYER NOTEBOOK — the pure half (2026-10-08).
 *
 * A desk's verification call re-learns, for every patient, things that are
 * true of the PAYER and the PRACTICE and never of the patient: which fee
 * schedule the office is on with this carrier, whether it is in their
 * network, whether they pay a crown on the seat date or the prep date, the
 * claims address, the number that actually answers. A 271 carries none of
 * it (the network indicator on a benefit says which side the BENEFIT is on,
 * not whether this practice is in). So the practice writes it once per
 * payer and the sheet fills those lines on every patient under that payer.
 *
 * Client-safe: the key, the types, the option lists, the validator and the
 * copy. The server half is lib/services/insurance-eligibility/payer-notebook.ts.
 */

export type PayerNetwork = 'in' | 'out'
export type PayerPaysOn = 'seat' | 'prep'

export interface PayerNoteFields {
  feeSchedule: string | null
  network: PayerNetwork | null
  paysOn: PayerPaysOn | null
  claimsAddress: string | null
  phone: string | null
  notes: string | null
}

export interface PayerNoteView extends PayerNoteFields {
  id: string
  payerKey: string
  payerId: string | null
  payerName: string
  updatedAtIso: string
  updatedByName: string | null
}

export const EMPTY_PAYER_NOTE: PayerNoteFields = {
  feeSchedule: null,
  network: null,
  paysOn: null,
  claimsAddress: null,
  phone: null,
  notes: null,
}

export const PAYER_NETWORK_OPTIONS: ReadonlyArray<{ id: PayerNetwork; label: string }> = [
  { id: 'in', label: 'In network' },
  { id: 'out', label: 'Out of network' },
]

export const PAYER_PAYS_ON_OPTIONS: ReadonlyArray<{ id: PayerPaysOn; label: string }> = [
  { id: 'seat', label: 'Seat date' },
  { id: 'prep', label: 'Prep date' },
]

export const PAYER_NOTEBOOK_COPY = {
  title: 'Your practice and this payer',
  lede: 'The things a 271 never says and a phone call always re-asks. Write them once; every patient on this payer gets them on their sheet.',
  empty: 'Nothing on file for this payer yet.',
  edit: 'Edit',
  save: 'Save for this payer',
  cancel: 'Cancel',
  fields: {
    feeSchedule: 'Fee schedule',
    network: 'Network',
    paysOn: 'Pays major work on',
    claimsAddress: 'Claims mailing address',
    phone: 'Phone that answers',
    notes: 'Notes',
  },
  hints: {
    feeSchedule: 'As the contract names it — "PPO", "Premier", "UCR".',
    paysOn: 'Some payers say so in the 271; what you know wins.',
  },
} as const

/**
 * One key per payer per clinic. The clearinghouse payer id when the desk
 * picked one (exact); else the name, lower-cased with punctuation and
 * spacing removed, so "Delta Dental of CA" and "delta dental of ca." land
 * on one row. A missing both is a missing key — the notebook needs a payer.
 */
export function payerNoteKey(payerId: string | null | undefined, payerName: string | null | undefined): string | null {
  const id = (payerId ?? '').trim()
  if (id) return `id:${id.toUpperCase()}`
  const name = (payerName ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim()
  return name ? `name:${name}` : null
}

const MAX = { feeSchedule: 80, claimsAddress: 240, phone: 40, notes: 1000 } as const

function clean(v: unknown, max: number): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, max) : null
}

/** Untrusted form input → the fields, or the reason. Empty strings become null; nothing is required. */
export function validatePayerNote(input: unknown): { ok: true; fields: PayerNoteFields } | { ok: false; error: string } {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const network = r.network == null || r.network === '' ? null : r.network
  if (network !== null && network !== 'in' && network !== 'out') return { ok: false, error: 'Network is in or out.' }
  const paysOn = r.paysOn == null || r.paysOn === '' ? null : r.paysOn
  if (paysOn !== null && paysOn !== 'seat' && paysOn !== 'prep') return { ok: false, error: 'Pays on is the seat date or the prep date.' }
  return {
    ok: true,
    fields: {
      feeSchedule: clean(r.feeSchedule, MAX.feeSchedule),
      network: network as PayerNetwork | null,
      paysOn: paysOn as PayerPaysOn | null,
      claimsAddress: clean(r.claimsAddress, MAX.claimsAddress),
      phone: clean(r.phone, MAX.phone),
      notes: clean(r.notes, MAX.notes),
    },
  }
}

/** True when the notebook has anything written for this payer. */
export function payerNoteHasContent(n: PayerNoteFields | null | undefined): boolean {
  return !!n && Object.values(n).some((v) => v != null && v !== '')
}
