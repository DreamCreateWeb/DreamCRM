/**
 * "To reconcile" = paid online and not yet posted to the practice's ledger
 * (their PMS or their books). A person at the desk marks a payment posted —
 * nothing stamps it for them, and DreamCRM does not post payments into a PMS
 * today, so no copy here may claim an automatic post.
 */

/** The KPI's sub line (anti-shame: "3 to post", never "3 unreconciled"). */
export function toReconcileSub(count: number): string {
  if (count <= 0) return 'all posted'
  return 'paid online, not yet in your ledger'
}

/** The list header's lead-in ("3 to post"). */
export function toPostLabel(count: number): string {
  return count <= 0 ? 'All posted' : `${count} to post`
}
