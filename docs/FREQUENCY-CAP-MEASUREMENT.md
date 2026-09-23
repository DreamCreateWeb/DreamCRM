# The frequency cap's query: measured, and why `:1840` was struck

**DREAMCRM-123.** `docs/RELEASE.md` Part 5 carried an entry asking for a
partial index on `campaign_events` — `(patientId, occurredAt) where
type='sent'` — **"if it shows in slow logs"**. We have no slow logs, and will
not until DREAMCRM-42's slow-query surface lands, so the entry could not be
closed under any verdict. It had been re-verified twice and both times the
honest answer was "the trigger has not fired", which is not the same as "this
is fine".

This is the measurement that replaced the missing signal, and the verdict it
produced: **STRUCK BY DECISION.** The reopen conditions are at the bottom, and
one of them is a number anybody can go and get.

## The three things the entry got wrong

**1. "Every index is `campaignId`-leading and the query names no
`campaignId`" — true about the columns, wrong about the consequence.**

The cap query (`lib/services/marketing-frequency.ts:96-110`) joins `campaigns`
to scope the organization, and that join HANDS the planner campaign ids. So
`campaign_events_campaign_patient_type_idx` — `(campaign_id, patient_id, type,
occurred_at)` — is usable, and Postgres uses it: every "without the indexes"
plan below is a nested loop from the org's campaigns into that index. The cap
query has never been a sequential scan. The entry's premise was that no index
could serve it; one already does.

(For the record, the entry's "every index" is also not literally true:
`campaign_events_provider_msg_idx` leads with `provider_message_id`. It is
irrelevant to this query, but the claim as written is not checkable.)

**2. The proposed index is under-specified — and the OR it was under-specified
about is unreachable today.**

The predicate is `patient_id IN (…) OR recipient_email IN (…)`, so one partial
index serves half of it and Postgres needs both before it can bitmap-OR. That
was the issue's own correction, and it is right about the SQL.

It is not right about production. `partitionByFrequencyCap` is called from
exactly one place — `lib/services/marketing-send.ts:299` — and only when
`recipientSource === 'patients'`. A patients-source audience sets `patientId`
on every recipient (`lib/services/marketing.ts:669`); the customer-source
resolver, which sets it to null (`lib/services/marketing.ts:428`), is the
branch the gate excludes. `keySets` therefore fills `ids` and leaves `emails`
empty, and `keyMatch` emits a single `IN` with no `or()` at all.

The OR is reachable in principle — the function is deliberately
source-compatible with customer rows — and it is measured below anyway. But no
caller produces it, so "Postgres needs both indexes to bitmap-OR" describes a
query production does not run.

**3. The read is the cheap half of this trade.**

The cap query runs ONCE per campaign send. `campaign_events` takes one INSERT
per RECIPIENT of that send. Pricing an index by what it saves the read, on a
table whose write rate is three orders of magnitude higher, is how you ship an
index that loses. Both halves are measured below.

## How to reproduce this

`scripts/frequency-cap-explain.ts` is the instrument. It seeds a
`campaign_events` table at a stated row count, runs the cap's real statement
under `EXPLAIN (ANALYZE, BUFFERS)`, creates the two candidate indexes, and runs
it again.

```bash
# the throwaway cluster the E2E harness uses, then:
DATABASE_URL=postgresql://postgres@127.0.0.1:55432/dreamcrm_perf \
  node scripts/migrate.mjs
DATABASE_URL=postgresql://postgres@127.0.0.1:55432/dreamcrm_perf \
  npx tsx scripts/frequency-cap-explain.ts --out run.md
```

The script cannot import `partitionByFrequencyCap` (that module is
`server-only` and reaches the live `db` proxy), so it rebuilds the SELECT
through drizzle's own `QueryBuilder`.
`tests/marketing/frequency-cap-explain-parity.test.ts` asserts inside `pnpm
test` that the two render BYTE-IDENTICAL SQL and parameters — without it, this
document would describe the performance of a statement this repo does not run,
and nothing would say so.

## What the fixture is, and what it is not

40 clinics × 2,500 patients × 60 campaigns each, events spread over 365 days,
40% of them `type='sent'`. Every value is a hash of the row number rather than
`random()`, so the same ladder rebuilds the same table on any box.

**4,000,000 rows is the ceiling actually reached, and it is a generous one.**
It is 40 clinics carrying ~100,000 events apiece — roughly a year of a busy
practice, or several years of a normal one. Today there is one beta clinic. A
16,000,000-row level was attempted and abandoned: the seed was still running
after 22 minutes and the answer it was going to give was not in doubt.

**Two limits worth holding against every number below.**

- **Everything was cached.** Every buffer column reads `hit/0` — not one block
  came off disk. Production is a t4g.micro where a 411 MB heap does not stay
  resident, so the absolute milliseconds here are a floor, not a forecast. What
  transfers is the PLAN SHAPE and the relative comparison, which is what this
  document rests on.
- **This is a Windows dev laptop**, not RDS. Same caveat, same answer.

## What it means

**The query is fine.** At 4,000,000 rows — well beyond anything this product
will see before 1.0 — the worst median measured is **5.3 ms**, and it is
index-served at every level. There is no slow query here to fix.

**The indexes do not reliably help, and at the size that matters they hurt.**
They win on a 100-recipient list (0.8 ms → 0.5 ms at 1M rows; 4.4 ms → 0.8 ms
on the mixed shape at 4M) and lose on a 2,000-recipient one (4.3 ms → 5.2 ms),
where the planner declines them and goes back to the campaign-leading index
anyway. The best honest reading of the read table is "somewhere between a 2 ms
saving and a 1 ms penalty, depending on a shape nobody controls".

**The write cost is not ambiguous.** Two more index updates per inserted row
cost **+24.8 ms on a 2,000-recipient send** and +2.2 ms on a 200-recipient
one. That is the same send whose cap query the indexes made *slower*. They lose
on the exact shape they were proposed for, and the loss is an order of
magnitude larger than the largest win anywhere in the read table.

They also cost 142 MB of index on a 411 MB heap at the 4M level — a third
again as much to keep resident on the box least able to keep anything
resident.

**Verdict: STRUCK BY DECISION.** Not "not yet" — the entry asked for something
that measures worse than doing nothing.

## What would reopen it

Any one of these, and the strike is void:

1. **`campaign_events` passes 4,000,000 rows in production.** That is the
   ceiling this measurement reached; past it nothing here is evidence. Ask the
   `campaign-events-volume` read-check (`docs/PROD-READ-ACCESS.md`) — it
   returns `reltuples` and the timestamp that dates it.
2. **The cap query appears in slow logs**, once DREAMCRM-42's slow-query
   surface is live. That was the original entry's own trigger and it is kept.
3. **The recipient-source gate at `lib/services/marketing-send.ts:299`
   changes** so that a single call mixes patient-keyed and address-keyed
   recipients. That makes the OR reachable, which is the only condition under
   which the two-index argument was ever about a query we run.

A re-measurement is `npx tsx scripts/frequency-cap-explain.ts` against a
throwaway Postgres. It takes about eight minutes.

## Other things this run turned up

- **`partitionByPriorAutomationSend`** (same file, line 143) has the same shape
  and **no time window at all** — it scans a clinic's whole history of
  `type='sent'` rows under a `campaigns.automation_key LIKE 'welcome:%'`
  filter. It was not measured here and it is not this entry's defect. Worth its
  own ledger line if the welcome cron ever shows up anywhere.
- **A partial index would have worked at all** is worth recording, because it
  was not obvious. `type = $2` is a bound parameter, and proving `type = $2`
  implies `type = 'sent'` is something Postgres can only do with the value in
  hand. node-postgres sends unnamed extended queries, so every execution gets a
  custom plan and the predicate proof succeeds. Under a driver that promoted
  these to named prepared statements, a generic plan would silently stop using
  any partial index on this table.

---

# The run

Everything below is `scripts/frequency-cap-explain.ts` output, verbatim.

# frequency-cap measurement

- PostgreSQL 16.4, compiled by Visual C++ build 1940, 64-bit
- taken 2026-09-23T17:52:37.643Z
- fixture: 40 orgs × 2500 patients × 60 campaigns, events spread over 365 days
- each number is the median of 7 EXPLAIN (ANALYZE, BUFFERS) executions

seeding 40 orgs × 2500 patients × 60 campaigns
seeding 250,000 more campaign_events (→ 250,000)
  spread: 40 orgs carry events (6,099–6,409 each); org_1 has 48 'sent' rows inside the 7-day window
  size: campaign_events (heap+all indexes) = 86 MB
  size: campaign_events (heap only) = 26 MB
  size: campaign_events_patient_sent_occurred_idx = 3880 kB
  size: campaign_events_email_sent_occurred_idx = 5288 kB
seeding 750,000 more campaign_events (→ 1,000,000)
  spread: 40 orgs carry events (24,642–25,248 each); org_1 has 192 'sent' rows inside the 7-day window
  size: campaign_events (heap+all indexes) = 345 MB
  size: campaign_events (heap only) = 103 MB
  size: campaign_events_patient_sent_occurred_idx = 15 MB
  size: campaign_events_email_sent_occurred_idx = 21 MB
seeding 3,000,000 more campaign_events (→ 4,000,000)
  spread: 40 orgs carry events (99,434–100,547 each); org_1 has 752 'sent' rows inside the 7-day window
  size: campaign_events (heap+all indexes) = 1378 MB
  size: campaign_events (heap only) = 411 MB
  size: campaign_events_patient_sent_occurred_idx = 60 MB
  size: campaign_events_email_sent_occurred_idx = 82 MB

## The numbers

| campaign_events rows | recipients | predicate shape | before (ms) | after (ms) | speedup | buffers before (hit/read) | buffers after (hit/read) | rows returned |
|---|---|---|---|---|---|---|---|---|
| 250,000 | 100 | patients only (production) | 0.6 | 0.8 | 0.7× | 255/0 | 492/0 | 48 |
| 250,000 | 100 | mixed (patients + addresses) | 0.6 | 0.5 | 1.1× | 255/0 | 255/0 | 48 |
| 250,000 | 500 | patients only (production) | 0.6 | 0.6 | 0.9× | 255/0 | 255/0 | 48 |
| 250,000 | 500 | mixed (patients + addresses) | 0.6 | 0.7 | 0.9× | 255/0 | 255/0 | 48 |
| 250,000 | 2000 | patients only (production) | 0.7 | 0.8 | 0.8× | 255/0 | 255/0 | 48 |
| 250,000 | 2000 | mixed (patients + addresses) | 0.7 | 0.9 | 0.8× | 255/0 | 255/0 | 48 |
| 1,000,000 | 100 | patients only (production) | 0.8 | 0.5 | 1.6× | 527/0 | 409/0 | 106 |
| 1,000,000 | 100 | mixed (patients + addresses) | 0.3 | 1.2 | 0.2× | 645/0 | 710/0 | 106 |
| 1,000,000 | 500 | patients only (production) | 1.0 | 1.0 | 1.0× | 527/0 | 527/0 | 192 |
| 1,000,000 | 500 | mixed (patients + addresses) | 1.2 | 0.8 | 1.6× | 527/0 | 527/0 | 192 |
| 1,000,000 | 2000 | patients only (production) | 1.2 | 1.1 | 1.1× | 527/0 | 527/0 | 192 |
| 1,000,000 | 2000 | mixed (patients + addresses) | 1.3 | 1.2 | 1.1× | 527/0 | 527/0 | 192 |
| 4,000,000 | 100 | patients only (production) | 0.4 | 0.4 | 1.2× | 2049/0 | 418/0 | 115 |
| 4,000,000 | 100 | mixed (patients + addresses) | 4.4 | 0.8 | 5.4× | 1686/0 | 719/0 | 115 |
| 4,000,000 | 500 | patients only (production) | 4.1 | 1.8 | 2.2× | 1686/0 | 2081/0 | 578 |
| 4,000,000 | 500 | mixed (patients + addresses) | 5.3 | 4.3 | 1.2× | 1686/0 | 3581/0 | 578 |
| 4,000,000 | 2000 | patients only (production) | 4.3 | 5.2 | 0.8× | 1686/0 | 1686/0 | 752 |
| 4,000,000 | 2000 | mixed (patients + addresses) | 5.3 | 5.1 | 1.0× | 1686/0 | 1686/0 | 752 |

## What the indexes cost to write

At the largest level measured, one send's worth of `campaign_events` rows, inserted with and without the two candidate indexes (median of 7 transactions, each rolled back):

| rows inserted (one send) | without the indexes (ms) | with both (ms) | write penalty |
|---|---|---|---|
| 200 | 7.1 | 9.3 | +2.2 ms |
| 2,000 | 61.6 | 86.4 | +24.8 ms |

## The plans

### 250,000 rows · 100 recipients · patients only (production)

**without the indexes** (0.6 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (0.8 ms)

```
Nested Loop
  Index Scan (campaign_events_patient_sent_occurred_idx)
  Index Scan (campaigns_pkey)
```

### 250,000 rows · 100 recipients · mixed (patients + addresses)

**without the indexes** (0.6 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (0.5 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

### 250,000 rows · 500 recipients · patients only (production)

**without the indexes** (0.6 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (0.6 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

### 250,000 rows · 500 recipients · mixed (patients + addresses)

**without the indexes** (0.6 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (0.7 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

### 250,000 rows · 2000 recipients · patients only (production)

**without the indexes** (0.7 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (0.8 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

### 250,000 rows · 2000 recipients · mixed (patients + addresses)

**without the indexes** (0.7 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (0.9 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

### 1,000,000 rows · 100 recipients · patients only (production)

**without the indexes** (0.8 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (0.5 ms)

```
Hash Join
  Index Scan (campaign_events_patient_sent_occurred_idx)
  Hash
    Bitmap Heap Scan
      Bitmap Index Scan (campaigns_org_status_idx)
```

### 1,000,000 rows · 100 recipients · mixed (patients + addresses)

**without the indexes** (0.3 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_occurred_idx)
```

**with both partial indexes** (1.2 ms)

```
Hash Join
  Bitmap Heap Scan
    BitmapOr
      Bitmap Index Scan (campaign_events_patient_sent_occurred_idx)
      Bitmap Index Scan (campaign_events_email_sent_occurred_idx)
  Hash
    Bitmap Heap Scan
      Bitmap Index Scan (campaigns_org_status_idx)
```

### 1,000,000 rows · 500 recipients · patients only (production)

**without the indexes** (1.0 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (1.0 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

### 1,000,000 rows · 500 recipients · mixed (patients + addresses)

**without the indexes** (1.2 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (0.8 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

### 1,000,000 rows · 2000 recipients · patients only (production)

**without the indexes** (1.2 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (1.1 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

### 1,000,000 rows · 2000 recipients · mixed (patients + addresses)

**without the indexes** (1.3 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (1.2 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

### 4,000,000 rows · 100 recipients · patients only (production)

**without the indexes** (0.4 ms)

```
Nested Loop
  Bitmap Heap Scan
    Bitmap Index Scan (campaigns_org_status_idx)
  Index Scan (campaign_events_campaign_occurred_idx)
```

**with both partial indexes** (0.4 ms)

```
Hash Join
  Index Scan (campaign_events_patient_sent_occurred_idx)
  Hash
    Bitmap Heap Scan
      Bitmap Index Scan (campaigns_org_status_idx)
```

### 4,000,000 rows · 100 recipients · mixed (patients + addresses)

**without the indexes** (4.4 ms)

```
Nested Loop
  Index Scan (campaigns_pkey)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (0.8 ms)

```
Hash Join
  Bitmap Heap Scan
    BitmapOr
      Bitmap Index Scan (campaign_events_patient_sent_occurred_idx)
      Bitmap Index Scan (campaign_events_email_sent_occurred_idx)
  Hash
    Bitmap Heap Scan
      Bitmap Index Scan (campaigns_org_status_idx)
```

### 4,000,000 rows · 500 recipients · patients only (production)

**without the indexes** (4.1 ms)

```
Nested Loop
  Index Scan (campaigns_pkey)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (1.8 ms)

```
Hash Join
  Index Scan (campaign_events_patient_sent_occurred_idx)
  Hash
    Bitmap Heap Scan
      Bitmap Index Scan (campaigns_org_status_idx)
```

### 4,000,000 rows · 500 recipients · mixed (patients + addresses)

**without the indexes** (5.3 ms)

```
Nested Loop
  Index Scan (campaigns_pkey)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (4.3 ms)

```
Hash Join
  Bitmap Heap Scan
    BitmapOr
      Bitmap Index Scan (campaign_events_patient_sent_occurred_idx)
      Bitmap Index Scan (campaign_events_email_sent_occurred_idx)
  Hash
    Bitmap Heap Scan
      Bitmap Index Scan (campaigns_org_status_idx)
```

### 4,000,000 rows · 2000 recipients · patients only (production)

**without the indexes** (4.3 ms)

```
Nested Loop
  Index Scan (campaigns_pkey)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (5.2 ms)

```
Nested Loop
  Index Scan (campaigns_pkey)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

### 4,000,000 rows · 2000 recipients · mixed (patients + addresses)

**without the indexes** (5.3 ms)

```
Nested Loop
  Index Scan (campaigns_pkey)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

**with both partial indexes** (5.1 ms)

```
Nested Loop
  Index Scan (campaigns_pkey)
  Index Scan (campaign_events_campaign_patient_type_idx)
```

