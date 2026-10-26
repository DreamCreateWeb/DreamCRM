/**
 * THE PMS LINK — the one answer to "is a practice-management system feeding
 * this clinic?", asked by every surface that states a fact ONLY the PMS
 * knows: who owes a balance (`patient.pms_balance_cents` is written by the
 * sync and nothing else) and what today's schedule holds (without a bridge
 * the agenda carries only website and staff-drawer bookings).
 *
 * docs/ACTIVATION.md law 3 — honest while pending. Before this module the
 * Overview told a practice with no bridge "Patients are paid up" and
 * "Nothing booked today — enjoy a quiet morning" on a full Tuesday; the
 * number was zero because nothing could have filled it. A status that
 * cannot be false is a dishonest status, so each of those sentences now
 * asks this link first and, with no PMS, says where the fact would come
 * from and opens the door (`/integrations/pms`, the S4 front door).
 *
 * Client-safe and pure: the copy and the predicate. The server half
 * (lib/services/pms-link.ts) reads the connection + the connect request.
 */

export type PmsLink =
  /** A `pms_connection` row is bound (whatever its sync health). */
  | { kind: 'connected' }
  /** The practice asked for the bridge; it is on Dream Create (S4). */
  | { kind: 'pending'; vendorLabel: string; pill: string; sentence: string }
  /** Nothing bound, nothing asked. */
  | { kind: 'none' }

/** The S4 front door — the intro + one connect-request form. */
export const PMS_DOOR = '/integrations/pms'

export function pmsConnected(link: PmsLink): boolean {
  return link.kind === 'connected'
}

export interface SourceCopy {
  /** The short line beside a zero (a KPI sub / a count suffix). */
  sub: string
  /** The sentence where an all-clear used to stand. */
  body: string
  /** The door's label. */
  cta: string
  href: string
}

/**
 * What to say where "nothing owed" would otherwise stand. `null` when a PMS
 * is connected — the all-clear is then earned and the caller keeps it.
 */
export function balanceSourceCopy(link: PmsLink): SourceCopy | null {
  switch (link.kind) {
    case 'connected':
      return null
    case 'pending':
      return {
        sub: `we’re connecting ${link.vendorLabel}`,
        body: `Balances come from ${link.vendorLabel}. ${link.sentence}`,
        cta: 'See the request',
        href: PMS_DOOR,
      }
    case 'none':
      return {
        sub: 'needs your practice software',
        body: 'Balances come from your practice software. Connect it and who owes shows here.',
        cta: 'Connect it',
        href: PMS_DOOR,
      }
  }
}

/**
 * What to say where "nothing booked today" would otherwise stand. `null`
 * when a PMS is connected — an empty day is then a real quiet morning.
 */
export function scheduleSourceCopy(link: PmsLink): { title: string; body: string; cta: string; href: string } | null {
  switch (link.kind) {
    case 'connected':
      return null
    case 'pending':
      return {
        title: 'Only visits booked through your website show here.',
        body: `We’re connecting ${link.vendorLabel} — once it syncs, the whole day appears.`,
        cta: 'See the request',
        href: PMS_DOOR,
      }
    case 'none':
      return {
        title: 'Only visits booked through your website show here.',
        body: 'Your practice software’s schedule isn’t connected yet — connect it or import a CSV and the whole day appears.',
        cta: 'Connect it',
        href: PMS_DOOR,
      }
  }
}

/** "N appointments" once the PMS feeds the day; "N booked online" until it does. */
export function todayCountLabel(link: PmsLink, total: number): string {
  if (pmsConnected(link)) return `${total} ${total === 1 ? 'appointment' : 'appointments'}`
  return `${total} booked online`
}
