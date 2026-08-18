# The RDS restore drill

Release program **R3**. `docs/RELEASE.md` Part 1 lists "Backup/restore drill —
RDS snapshots exist / **never actually restored**". A backup nobody has
restored is a hope, not a backup: you find out whether it works on the worst
day of the year, or you find out on a Tuesday, deliberately.

**Status: the procedure below is written and ready to execute. It has NOT been
run — it requires AWS credentials for account `952078552817`, which are
deliberately not available to the development session.** Executing it is an
owner action; the runbook is the deliverable here. Record the outcome in the
log at the bottom when you run it.

---

## What we are actually testing

Not "does a snapshot exist" (it does — automated backups are on, with deletion
protection). Three questions that only a real restore answers:

1. **Can a snapshot become a running database?** Instance class, storage,
   parameter/option groups, encryption key access, subnet group.
2. **Does the application boot against it?** Migration state must be exactly
   what the app expects — `drizzle` records applied migrations in its own
   table, so a restored database at an older migration must converge cleanly.
3. **How long does it take, end to end?** This number is your real RTO. Guessing
   it is how outages become multi-hour outages.

## Before you start

- Do this in a maintenance window you choose, not under pressure.
- The drill NEVER touches `dreamcrm-db`. It restores to a NEW instance with a
  distinct identifier, reads from it, and deletes it. Nothing about the drill
  modifies production.
- Budget: a `db.t4g.micro` for an hour is cents. Delete it when done.

## The drill

### 1. Pick a snapshot

```bash
aws rds describe-db-snapshots \
  --db-instance-identifier dreamcrm-db \
  --snapshot-type automated \
  --query 'reverse(sort_by(DBSnapshots,&SnapshotCreateTime))[:5].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table
```

Take the most recent `available` one. **Note its timestamp** — the gap between
it and "now" is your real RPO (how much data a restore would lose).

### 2. Restore it to a scratch instance

```bash
STAMP=$(date +%Y%m%d-%H%M)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier "dreamcrm-restore-drill-$STAMP" \
  --db-snapshot-identifier "<snapshot-id>" \
  --db-instance-class db.t4g.micro \
  --no-publicly-accessible \
  --db-subnet-group-name "<same subnet group as dreamcrm-db>" \
  --vpc-security-group-ids "<same SG as dreamcrm-db>"
```

**Start a timer here.** Wait for it:

```bash
aws rds wait db-instance-available \
  --db-instance-identifier "dreamcrm-restore-drill-$STAMP"
```

### 3. Prove the data is real

From inside the VPC (the instance is not publicly accessible — use an
App Runner exec, a bastion, or a temporary VPC-connected task):

```sql
select count(*) from organization;
select count(*) from patient;
select count(*) from appointment;
-- The migration ledger: this must match what the deployed app expects.
select * from drizzle.__drizzle_migrations order by created_at desc limit 5;
```

Sanity-check the counts against production. A restore that "succeeds" with an
empty `patient` table has told you something important.

### 4. Prove the APPLICATION boots against it

The point of the drill. Point a build at the restored database and hit health:

```bash
DATABASE_URL="postgresql://<user>:<pw>@<restored-endpoint>:5432/<db>" \
  node scripts/db-migrate.mjs     # must be a no-op or converge cleanly
DATABASE_URL="..." pnpm start --port 3200 &
curl -sf http://127.0.0.1:3200/api/health
```

`scripts/e2e-harness.sh` already proves the from-zero migration path; this step
proves the from-snapshot path, which is the one that matters in a recovery.

### 5. Stop the timer, then delete the instance

```bash
aws rds delete-db-instance \
  --db-instance-identifier "dreamcrm-restore-drill-$STAMP" \
  --skip-final-snapshot --delete-automated-backups
```

Confirm it is gone. **Leaving a drill instance running is a recurring bill and
a second copy of patient data — neither is acceptable.**

## Record the result

| Date | Snapshot age (RPO) | Time to available | App booted? | Total (RTO) | Notes |
|---|---|---|---|---|---|
| _not yet run_ | | | | | |

## What to do with the numbers

- **RTO** (step 2 → step 4) is what you can honestly promise a practice whose
  data just vanished. If it is hours, decide now whether that is acceptable, or
  whether you need a read replica / faster path.
- **RPO** (snapshot age) is how much work a clinic would redo. If the automated
  backup window means losing a busy afternoon, consider more frequent snapshots
  or PITR.
- Re-run the drill after any change to the instance class, engine version, or
  parameter group — those are exactly what silently break a restore.
