/**
 * THE PRODUCTION READ-CHECK CATALOG.
 *
 * Every question an agent can ask the production database, written down. The
 * route at `app/api/admin/read-check/route.ts` will run an entry from this file
 * and nothing else: the request carries a `check` id, the id is looked up here,
 * and the SQL comes from this module. No SQL, and no fragment of SQL, ever
 * arrives from the caller.
 *
 * THAT is the whole security argument for the feature, so hold the line:
 * on a leaked ADMIN_READ_SECRET an attacker gets exactly the entries below and
 * nothing else. The moment anything from the request reaches the SQL text, that
 * stops being true and this design becomes worse than the alternatives it was
 * chosen over. No parameters in v1. If an entry ever genuinely needs one it is a
 * typed enum or integer bound as a `$1` placeholder — never concatenated, never
 * interpolated.
 *
 * TWO RULES ON EVERY ENTRY, both enforced by review rather than by code, which
 * is why `lib/read-checks.ts` is on the review gate (`scripts/review-gate.mjs`,
 * rule `read-checks`) — a catalog-only PR used to match no rule at all and
 * report "merges on green":
 *
 *   1. NO PHI, NO PII, NO SECRETS IN A RESULT. Results are printed into a
 *      GitHub Actions log, which is retained and readable by anything with repo
 *      read. Entries return counts, aggregates and internal ids. `returns`
 *      declares the output columns so a reviewer can check this without running
 *      it. Note this is a SEPARATE control from the role's grants: the role
 *      bounds what CAN be read, this rule bounds what may be RETURNED. A value
 *      can be legitimately readable and still never belong in a shared log —
 *      `shop_coupon.code` is the worked example (see NAME_INVISIBLE in
 *      `tests/guards/read-only-role-revokes.test.ts`).
 *
 *   2. CROSS-TENANT READS ARE DECLARED, NOT ASSUMED. These checks deliberately
 *      look across clinics — "do any two clinics share a Stripe account" has no
 *      meaning otherwise — so the tenant-scoping rule every other query in this
 *      repo obeys is waived here. `tenantScope` records that in writing, per
 *      entry, so the waiver is visible to the next reader instead of being an
 *      unstated property of the file.
 */

export type ReadCheck = {
  /** Stable id. This is the string the caller sends and the workflow lists. */
  id: string
  /** One-line plain-English statement of the question, for the runbook + log. */
  question: string
  /** Why this is worth asking production. */
  why: string
  /** The output columns, declared so rule 1 above is reviewable. */
  returns: string
  /**
   * 'cross-tenant-by-design' — reads across organizations on purpose, with the
   * reason stated in `why`. 'scoped' — stays inside one organization.
   */
  tenantScope: 'cross-tenant-by-design' | 'scoped'
  /** Literal SQL. No interpolation, ever. */
  sql: string
}

/**
 * The credential columns the read-only role must NOT be able to read.
 *
 * This list is one half of a deliberate pair: the other is the REVOKE list in
 * `scripts/readonly-role.sql`. A new credential column has to be added to BOTH
 * — the guard test fails otherwise — because they defend different moments. The
 * REVOKE is what changes production; this list is what NOTICES when production
 * and the script have drifted apart. Single-homing them would feel tidier and
 * would delete the only check that can catch a REVOKE nobody actually ran.
 *
 * `verification.value` is in here and matches no credential-looking pattern at
 * all; it holds better-auth's password-reset material. It is the reason the
 * guard carries a hand-maintained NAME_INVISIBLE list beside its regex.
 */
const CREDENTIAL_COLUMNS: ReadonlyArray<readonly [table: string, column: string]> = [
  ['account', 'password'],
  ['account', 'access_token'],
  ['account', 'refresh_token'],
  ['account', 'id_token'],
  ['session', 'token'],
  ['verification', 'value'],
  ['gsc_connection', 'refresh_token_encrypted'],
  ['gsc_connection', 'access_token'],
  ['email_account', 'refresh_token_encrypted'],
  ['email_account', 'access_token'],
  ['pms_connection', 'customer_key_encrypted'],
  ['appointment', 'confirm_token'],
  ['appointment_waitlist_offer', 'token'],
  ['review_request', 'token'],
  ['clinic_profile', 'calendar_feed_token'],
  ['referral_partner', 'invite_token'],
  ['balance_payment_request', 'token'],
  ['payment_plan', 'token'],
  ['nps_response', 'token'],
  ['patient_referral_link', 'token'],
  ['prospect_meeting', 'token'],
  ['practice_grade', 'token'],
  ['marketing_event', 'capture_token'],
  ['event_capture', 'token'],
]

/** Exported for the guard test, which cross-checks it against the SQL script. */
export const CREDENTIAL_COLUMN_LIST = CREDENTIAL_COLUMNS

const privilegeValues = CREDENTIAL_COLUMNS.map(([t, c]) => `('${t}','${c}')`).join(',\n    ')

export const READ_CHECKS: ReadonlyArray<ReadCheck> = [
  {
    id: 'duplicate-stripe-accounts',
    question: 'Are any two clinics connected to the same Stripe account?',
    why:
      'DREAMCRM-32 / PR #557. Connect webhooks name a tenant only by `event.account`, so ' +
      'orgIdForConnectedAccount resolves a TENANT from this column on a money write path with ' +
      '`.limit(1)`. Two rows sharing an id file one clinic\'s refund into another clinic\'s ' +
      'records by coin-toss. The partial unique index in 0162 is created on boot, and ' +
      'Dockerfile:62 swallows a migration failure behind `|| true` — so on a duplicate the ' +
      'deploy goes GREEN and the migration is skipped silently, forever. This must come back ' +
      'EMPTY before that migration merges.',
    returns: 'stripe_account_id (a Stripe acct_ id, not patient data) + the organization ids sharing it',
    tenantScope: 'cross-tenant-by-design',
    sql: `select stripe_account_id, array_agg(organization_id) as organization_ids
  from shop_config
 where stripe_account_id is not null
 group by 1
having count(*) > 1
 limit 100`,
  },
  {
    id: 'readonly-role-privileges',
    question: 'Can the read-only account see anything it must not?',
    why:
      'The acceptance test for the role itself, and the ONLY thing that can catch grant drift ' +
      'in production. Editing scripts/readonly-role.sql does not change the database — so a ' +
      'new credential column can be correctly revoked in the committed script, pass CI, and ' +
      'still be readable in production because nobody ran the REVOKE. It is scheduled (see ' +
      '.github/workflows/error-scan.yml) so drift surfaces within a day rather than never.\n' +
      '\n' +
      'Two details worth keeping if this is ever rewritten. It asks about `current_user` ' +
      'rather than a hardcoded role name, so it asserts about whoever is actually connected ' +
      'instead of about a string that could go stale. And `has_column_privilege` resolves the ' +
      'EFFECTIVE privilege — it accounts for grants reaching the role via PUBLIC or via role ' +
      'membership, not merely the direct grants the script wrote. Do not "simplify" this into ' +
      'a query against information_schema.column_privileges, which sees only direct grants and ' +
      'would report clean on exactly the inherited-privilege mistake this exists to catch.',
    returns: 'table + column for every credential column still readable — MUST be zero rows',
    tenantScope: 'cross-tenant-by-design',
    sql: `select v.tbl as table_name, v.col as column_name
  from (values
    ${privilegeValues}
  ) as v(tbl, col)
 where has_column_privilege(current_user, v.tbl, v.col, 'SELECT')
 limit 100`,
  },
]

const BY_ID = new Map(READ_CHECKS.map((c) => [c.id, c]))

/**
 * Look up a check by the caller-supplied id. Returns undefined for anything not
 * in the catalog — the route turns that into a 400 and never echoes the input
 * back, so this cannot be used to probe for what exists.
 */
export function findReadCheck(id: string): ReadCheck | undefined {
  return BY_ID.get(id)
}

/** Every catalog id, for the workflow's choice list and the runbook. */
export function readCheckIds(): string[] {
  return READ_CHECKS.map((c) => c.id)
}
