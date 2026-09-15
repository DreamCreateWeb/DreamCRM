# Production read access for agents

How an agent answers a question about the live database without holding a
credential for it. Built for DREAMCRM-42; approved by the owner 2026-09-14 after
two rounds of security review.

**The shape in one line:** an agent dispatches a *named, pre-reviewed check* from
GitHub Actions; the check runs inside the VPC on the app that is already there,
under a `SELECT`-only Postgres role; the answer comes back in the Actions log.

Nothing holds a standing credential. No agent machine has a database password or
an AWS key, and no network or VPC change was made to build this.

## Running a check

```bash
gh workflow run read-check.yml \
  -f check=duplicate-stripe-accounts \
  -f reason='DREAMCRM-32 / Rio'
gh run list --workflow=read-check.yml --limit 1
gh run view <run-id> --log
```

The answer is in the run log and the job summary.

**`reason` is required and self-declared.** The repo has exactly one
collaborator and the whole agent fleet authenticates as it, so `github.actor`
reads `DreamCreateWeb` for every dispatch no matter who actually asked. The
`reason` field is the only identifying information in the record, and anyone who
can dispatch can type anything into it. It makes a run legible later; it does not
authenticate anybody.

### The checks

| id | question |
|---|---|
| `duplicate-stripe-accounts` | Are any two clinics connected to the same Stripe account? (the DREAMCRM-32 merge gate) |
| `readonly-role-privileges` | Can the read-only account see anything it must not? Must be **zero rows**. |
| `migrations-applied` | Which migrations has production actually applied? (DREAMCRM-46 — the answer half of the post-deploy migration check) |

`readonly-role-privileges` also runs on a schedule (07:00 UTC daily) and fails
the workflow if it finds anything.

`migrations-applied` is normally not dispatched by hand at all:
`.github/workflows/migration-check.yml` asks it after every deploy and again at
08:20 UTC daily, and compares the answer to the committed journal. It is in the
choice list because a dispatch is the quickest way to see the raw ledger. See
"The deploy is not finished until the migrations are in" in `docs/CI.md`.

## Adding a check

1. Add an entry to `READ_CHECKS` in `lib/read-checks.ts`.
2. Add its id to the `check` choice list in `.github/workflows/read-check.yml`
   (a guard fails if the two disagree).
3. If it needs a column from one of the revoked tables, add a narrow
   `GRANT SELECT (col, ...) ON <table> TO dreamcrm_readonly;` to
   `scripts/readonly-role.sql` **and run it** — see the warning below. The same
   applies to anything outside schema `public`: the blanket grant is scoped to
   that schema, so `migrations-applied` needed its own `GRANT USAGE ON SCHEMA
   drizzle` plus a `GRANT SELECT` on that one table. Without them the entry
   returns a 500, not an answer.
4. Open a PR. It is on the review gate (`read-checks` rule) and **needs
   Sentinel**, because per-entry review is the entire control on the two rules
   below.

Two rules on every entry:

- **No PHI, no PII, no secrets in a result.** Results land in an Actions log that
  is retained and readable by anything with repo read. Entries return counts,
  aggregates and internal ids. `returns` declares the output columns so this is
  reviewable without running it.
- **Cross-tenant reads are declared, not assumed.** These checks deliberately
  look across clinics. `tenantScope` records that in writing, per entry.

And one line that must not move: **no parameters.** The security argument for
this whole feature is that on a leaked `ADMIN_READ_SECRET` an attacker gets
exactly the catalog and nothing else. The moment anything from the request
reaches the SQL, that stops being true.

## ⚠️ Editing `scripts/readonly-role.sql` does not change production

This is the one thing most likely to go wrong, so it is worth being blunt about.

The role script is a **one-time manual run**. The guard test
(`tests/guards/read-only-role-revokes.test.ts`) reads the committed file, so CI
can go green on a `REVOKE` that nobody ever executed. A new credential column can
be correctly revoked in git and still be readable in production.

After any edit to that file:

1. Run the statement against production.
2. Dispatch `readonly-role-privileges`.
3. Confirm **zero rows**.

The scheduled run of that check is the only thing that notices this drift on its
own, which is why it is scheduled and why it fails loudly.

## What the role can and cannot do

**Cannot write.** `INSERT`/`UPDATE`/`DELETE`/DDL are never granted. That is the
solid guarantee — it comes from the absence of a grant, not from a setting.

**Cannot read a credential.** 19 tables holding passwords, session tokens, OAuth
tokens and token-is-auth links are revoked whole-table. Whole-table matters: in
PostgreSQL a table-level privilege covers every column and a column-level
`REVOKE` **cannot subtract from it**, so `GRANT SELECT ON ALL TABLES` followed by
`REVOKE SELECT (confirm_token) ON appointment` leaves `confirm_token` readable.
That was the defect the second review round caught before anything was built.

**A new table is not readable by default.** There is deliberately no
`ALTER DEFAULT PRIVILEGES`: a credential-bearing table added later would
otherwise be readable in production the moment it booted, while CI stayed green.
A check that needs a new table gets a single reviewed `GRANT`.

**What the timeouts are and are not.** `statement_timeout`,
`idle_in_transaction_session_timeout` and `default_transaction_read_only` are all
`USERSET` GUCs — any session connecting as the role can set them back. They bound
a careless catalog entry, which is the case that will actually happen. They do
**not** bound someone holding the password. Do not read them as write protection;
the write protection is the missing grant.

## Setup (owner, one time)

1. **Create the role** — run `scripts/readonly-role.sql` against production:

   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v dbname=<database-name> \
     -f scripts/readonly-role.sql
   ```

   Both flags matter. **`ON_ERROR_STOP=1`**: without it a failure partway
   leaves the rest unapplied — blanket `SELECT` granted, some or all of the
   `REVOKE`s skipped — which is exactly the partial-application failure the
   script's own header warns about, and it is one flag away. **`-v dbname=`**:
   the script uses `:"dbname"` twice, and unlike `:DBNAME` that is not a
   built-in, so an unset one substitutes literally and those statements fail.

   Generate the password with `openssl rand -base64 32`, somewhere it will not
   land in shell history.
2. **App Runner env** — set `DATABASE_URL_READONLY` (same host/database as
   `DATABASE_URL`, `dreamcrm_readonly` credentials) and `ADMIN_READ_SECRET`
   (another `openssl rand -base64 32`). Secret changes need a redeploy.
3. **GitHub secret** — `ADMIN_READ_SECRET`, the same value.
4. **IAM role for the error scan** — `DreamCRMGitHubActionsReadOnly`, trusted by
   the same GitHub OIDC provider `deploy.yml` already uses, carrying
   `CloudWatchReadOnlyAccess` + `CloudWatchLogsReadOnlyAccess` and nothing else.
   Deliberately not `DreamCRMGitHubActionsDeploy`, which holds S3/CodeBuild/
   EventBridge write.
5. **Verify** — dispatch `readonly-role-privileges` and confirm zero rows, then
   `duplicate-stripe-accounts` for the real answer, then `migrations-applied`
   (it should return one row whose `applied_count` matches the number of entries
   in `lib/db/migrations/meta/_journal.json`). If that last one errors, the two
   `drizzle`-schema grants in `scripts/readonly-role.sql` did not run — see step
   1 and the warning above about editing the script not changing production.

Until step 3 is done, `.github/workflows/migration-check.yml` reports
**NOT VERIFIED** on every deploy and exits 0. That is deliberate and it is
written on every run; it is not the check passing.

Until steps 1–3 are done the route answers `503` and the workflow fails with a
clear message. That is fail-closed working, not a bug.

## The error scan (DREAMCRM-12)

`.github/workflows/error-scan.yml` scans the App Runner log groups for errors
every 30 minutes and writes what it finds to the job summary. It uses the same
keyless OIDC trust as the deploy, so production error scanning belongs to no
agent's credentials.

This replaces DREAMCRM-12's original ask, which was to put an AWS credential on
the machine the agents run on — the thing the owner restricted on DREAMCRM-41.

## Rollback

Revert the PR (the endpoint is gone), `DROP ROLE dreamcrm_readonly` (the access
is gone), delete the GitHub secret. No network or VPC change to undo.

## Why this shape

The alternatives, and why they lost, are on DREAMCRM-42 in full. Briefly: the
RDS Data API is Aurora-only and may not exist for this instance; an SSM/bastion
tunnel means a standing instance plus arbitrary SQL from an agent machine; a read
replica does not solve reachability; and an in-VPC one-shot task runner buys "no
new public door" for four permanent production changes against this design's
zero network changes.

The route is the fourth `/api/admin/*` one-shot behind the same middleware
allowlist. The other three are older and stronger — one of them, `/api/admin/
migrate`, runs pending DDL against production on a correct bearer. This one runs
a fixed list of literal `SELECT`s under a role that cannot write.
