import 'server-only'
import { clinicWeekStart } from '@/lib/clinic-timezone'
import { isWorkEntry, listRecentActions } from '@/lib/services/action-ledger'
import { countOpenProposals } from '@/lib/services/proposals'

/**
 * "THE DREAM TEAM ALREADY DID IT" (ML-36, G3-15) — ONE read for the Growth
 * pages. A page whose job the machine now does (review requests sent, a
 * recall campaign filed, the month's content plan) should say so BEFORE it
 * offers a lever. It reads what the Overview strip reads — the open
 * proposals and the Action Ledger — narrowed to the capabilities the page
 * fronts. Never a second counter: nothing is tallied anywhere new.
 *
 *  - `open`: cards for these capabilities waiting on a human yes
 *    (countOpenProposals — a card the machine handles under a grant is not
 *    waiting on anyone);
 *  - `doneThisWeek`: WORK the team did since the clinic-local week began,
 *    counted as distinct PEOPLE where the entry names a patient (a patient
 *    who got a reminder and a nudge is one person, not two) and per entry
 *    where it does not (a post, a plan);
 *  - `lastLine`: the newest work entry's own narrated sentence.
 *
 * Every read is org-scoped; each is best-effort — an unreadable ledger yields
 * the quiet answer (no band), never a broken page.
 */
export interface TeamDidIt {
  open: number
  doneThisWeek: number
  lastLine: string | null
}

export const TEAM_DID_IT_QUIET: TeamDidIt = { open: 0, doneThisWeek: 0, lastLine: null }

const WEEK_ENTRY_LIMIT = 500

export async function teamDidIt(
  organizationId: string,
  capabilities: readonly string[],
  opts: { now?: Date; timeZone?: string | null } = {},
): Promise<TeamDidIt> {
  const now = opts.now ?? new Date()
  const since = clinicWeekStart(now, opts.timeZone)
  const [open, entries] = await Promise.all([
    countOpenProposals(organizationId, { capabilities }).catch(() => 0),
    listRecentActions(organizationId, { since, capabilities, limit: WEEK_ENTRY_LIMIT }).catch(() => []),
  ])
  const work = entries.filter((e) => isWorkEntry(e.detail))
  const people = new Set<string>()
  let unnamed = 0
  for (const e of work) {
    if (e.patientId) people.add(e.patientId)
    else unnamed++
  }
  return {
    open,
    doneThisWeek: people.size + unnamed,
    // listRecentActions is newest-first.
    lastLine: work[0]?.summary?.trim() || null,
  }
}
