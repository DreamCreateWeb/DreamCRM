/**
 * MEASURE THE FREQUENCY-CAP QUERY (DREAMCRM-123, RELEASE.md Part 5 `:1840`).
 *
 * The ledger entry asks for a partial index "if it shows in slow logs", and we
 * have no slow logs until DREAMCRM-42 lands — so the entry could not be closed
 * under any verdict. This is the instrument that replaces the missing signal:
 * it stands a `campaign_events` table up at a stated row count on a throwaway
 * Postgres, runs the cap's REAL statement under `EXPLAIN (ANALYZE, BUFFERS)`,
 * and reports the same statement again with the candidate indexes in place.
 *
 * `docs/FREQUENCY-CAP-MEASUREMENT.md` is the run this repo decided on, with
 * the numbers and the verdict. This file is how you reproduce or re-take it.
 *
 * HOW TO RUN IT
 *
 *   # stand up the throwaway cluster the E2E harness uses, then:
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:55432/dreamcrm_perf \
 *     npx tsx scripts/frequency-cap-explain.ts
 *
 * Flags: `--levels`, `--recipients`, `--orgs`, `--patients-per-org`,
 * `--campaigns-per-org`, `--repeat`, `--history-days`, `--out <file>`, and
 * `--reuse` (keep a fixture that already matches, instead of re-seeding).
 *
 * The database must already carry the schema (`node scripts/migrate.mjs`).
 * Everything else is seeded here and the seed is DESTRUCTIVE — see the refusal
 * below.
 *
 * WHY THE STATEMENT IS BUILT HERE RATHER THAN IMPORTED (§2d).
 *
 * `lib/services/marketing-frequency.ts` is `server-only` and reaches the live
 * `db` proxy, neither of which a plain `tsx` process can load. So the cap's
 * SELECT is rebuilt below through drizzle's own `QueryBuilder` — the real
 * dialect, the real schema, the real column types — and
 * `tests/marketing/frequency-cap-explain-parity.test.ts` asserts, inside the
 * unit gate, that the SQL this file renders is BYTE-IDENTICAL to the SQL the
 * service renders. A measurement of a lookalike query is not a measurement of
 * the query, and that test is what stops this one drifting into a lookalike.
 */
import pg from 'pg'
import { QueryBuilder } from 'drizzle-orm/pg-core'
import { and, eq, gte, inArray, or, type SQL } from 'drizzle-orm'
import * as schema from '@/lib/db/schema'
import { writeFile } from 'node:fs/promises'

// ---------------------------------------------------------------- the query

/**
 * The cap's SELECT, built exactly as `partitionByFrequencyCap` builds it.
 * Kept in one exported function so the parity test has something to compare
 * against rather than a copy buried in a measurement loop.
 */
export function capQuery(organizationId: string, ids: string[], emails: string[], since: Date) {
  const clauses: SQL[] = []
  if (ids.length > 0) clauses.push(inArray(schema.campaignEvents.patientId, ids))
  if (emails.length > 0) clauses.push(inArray(schema.campaignEvents.recipientEmail, emails))
  const keyMatch = clauses.length === 1 ? clauses[0] : or(...clauses)
  return new QueryBuilder()
    .select({
      email: schema.campaignEvents.recipientEmail,
      patientId: schema.campaignEvents.patientId,
    })
    .from(schema.campaignEvents)
    .innerJoin(schema.campaigns, eq(schema.campaigns.id, schema.campaignEvents.campaignId))
    .where(
      and(
        eq(schema.campaigns.organizationId, organizationId),
        eq(schema.campaignEvents.type, 'sent'),
        gte(schema.campaignEvents.occurredAt, since),
        keyMatch,
      ),
    )
    .toSQL()
}

/**
 * The two candidate indexes, as the migration would write them. Both halves of
 * the OR: one partial index serves `patient_id IN (…)` and the other serves
 * `recipient_email IN (…)`, and Postgres needs both before it can bitmap-OR a
 * mixed recipient list.
 */
export const CANDIDATE_INDEXES = [
  {
    name: 'campaign_events_patient_sent_occurred_idx',
    ddl: `CREATE INDEX campaign_events_patient_sent_occurred_idx
            ON campaign_events (patient_id, occurred_at)
            WHERE type = 'sent'`,
  },
  {
    name: 'campaign_events_email_sent_occurred_idx',
    ddl: `CREATE INDEX campaign_events_email_sent_occurred_idx
            ON campaign_events (recipient_email, occurred_at)
            WHERE type = 'sent'`,
  },
] as const

// ------------------------------------------------------------------- config

const FREQUENCY_WINDOW_DAYS = 7

function numList(raw: string | undefined, fallback: number[]): number[] {
  if (!raw) return fallback
  const out = raw.split(',').map((s) => Number(s.trim()))
  if (out.some((n) => !Number.isFinite(n) || n <= 0)) {
    throw new Error(`not a list of positive numbers: ${raw}`)
  }
  return out
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`))
  return eq ? eq.slice(name.length + 3) : undefined
}

const CONFIG = {
  /** Total `campaign_events` rows, measured at each step of the ladder. */
  levels: numList(arg('levels'), [250_000, 1_000_000, 4_000_000]),
  /** Recipient-list sizes — how many people one send is capping at once. */
  recipients: numList(arg('recipients'), [500]),
  orgs: Number(arg('orgs') ?? 40),
  patientsPerOrg: Number(arg('patients-per-org') ?? 2_500),
  campaignsPerOrg: Number(arg('campaigns-per-org') ?? 60),
  /** Executions per measurement; the reported number is the median. */
  repeat: Number(arg('repeat') ?? 7),
  /** Days of history the seeded events are spread over. */
  historyDays: Number(arg('history-days') ?? 365),
}

// ------------------------------------------------------------- the refusal

/**
 * THIS SCRIPT TRUNCATES `organization` AND EVERYTHING THAT CASCADES FROM IT.
 *
 * A measurement instrument that can be pointed at a populated database by a
 * typo is not an instrument, it is an incident. Two conditions, both required:
 * the server is loopback, and the database name says it is disposable. Neither
 * is a permission prompt — a run that fails either stops with a sentence.
 */
function assertDisposable(url: string): void {
  const u = new URL(url)
  const loopback = u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '::1'
  const name = u.pathname.replace(/^\//, '')
  const disposable = /(^|[_-])(e2e|perf|test)([_-]|$)/.test(name)
  if (!loopback) {
    throw new Error(`refusing: ${u.hostname} is not loopback. This script truncates tables.`)
  }
  if (!disposable) {
    throw new Error(
      `refusing: database "${name}" is not named as disposable (needs e2e/perf/test as a word). This script truncates tables.`,
    )
  }
}

// -------------------------------------------------------------------- seed

/**
 * `--reuse`: keep a fixture that already matches this run's configuration.
 *
 * Seeding four million events takes minutes, and the seed is deterministic —
 * re-running it produces the byte-equivalent table. Worth having because the
 * alternative is that a second look at one number costs a full re-seed, and a
 * measurement nobody re-takes is a measurement nobody checks.
 *
 * It compares the fixture's SHAPE, not merely that rows exist: an org, patient
 * or campaign count that disagrees with the flags means the numbers would not
 * be about the configuration the run claims.
 */
async function fixtureMatches(c: pg.Client): Promise<boolean> {
  const { orgs, patientsPerOrg, campaignsPerOrg } = CONFIG
  const { rows } = await c.query<{ o: string; p: string; c: string }>(
    `SELECT (SELECT count(*) FROM organization)::text AS o,
            (SELECT count(*) FROM patient)::text AS p,
            (SELECT count(*) FROM campaigns)::text AS c`,
  )
  const [r] = rows
  return (
    Number(r.o) === orgs &&
    Number(r.p) === orgs * patientsPerOrg &&
    Number(r.c) === orgs * campaignsPerOrg
  )
}

async function seedFixtures(c: pg.Client): Promise<void> {
  const { orgs, patientsPerOrg, campaignsPerOrg } = CONFIG
  if (process.argv.includes('--reuse') && (await fixtureMatches(c))) {
    say(`reusing the existing fixture (${orgs} orgs × ${patientsPerOrg} patients × ${campaignsPerOrg} campaigns)`)
    return
  }
  say(`seeding ${orgs} orgs × ${patientsPerOrg} patients × ${campaignsPerOrg} campaigns`)
  // RESTART IDENTITY is load-bearing, not tidiness. A plain TRUNCATE leaves
  // the `campaigns` serial where the last run left it, so on a second run the
  // ids no longer start at 1 and the arithmetic below — which is how the event
  // seed knows which campaigns belong to which org — points at rows that do
  // not exist. It fails loudly (a foreign-key violation) rather than quietly,
  // but only on the second run, which is the worst time to find out.
  await c.query('TRUNCATE organization RESTART IDENTITY CASCADE')
  await c.query(
    `INSERT INTO organization (id, name, slug)
     SELECT 'org_' || i, 'Clinic ' || i, 'clinic-' || i FROM generate_series(1, $1) i`,
    [orgs],
  )
  await c.query(
    `INSERT INTO patient (id, organization_id, first_name, last_name, email)
     SELECT 'p_' || o || '_' || n, 'org_' || o, 'First' || n, 'Last' || n,
            'p' || n || '.org' || o || '@example.test'
     FROM generate_series(1, $1) o, generate_series(1, $2) n`,
    [orgs, patientsPerOrg],
  )
  // Campaign ids are a serial, and they are inserted in org order — so org k
  // owns exactly [(k-1)*campaignsPerOrg + 1 .. k*campaignsPerOrg]. The event
  // seed below relies on that arithmetic instead of a second round trip.
  await c.query(
    `INSERT INTO campaigns (organization_id, name, automation_key)
     SELECT 'org_' || o, 'Campaign ' || o || '-' || n,
            CASE WHEN n % 10 = 0 THEN 'welcome:' || o || '-' || n ELSE NULL END
     FROM generate_series(1, $1) o, generate_series(1, $2) n`,
    [orgs, campaignsPerOrg],
  )
}

/**
 * Put `campaign_events` at EXACTLY `target` rows — growing by seeding more,
 * shrinking by starting over (the seed is deterministic, so a rebuild is the
 * same table).
 *
 * "Exactly", and the assertion at the bottom, are not belt-and-braces. The
 * first version returned early whenever the table already held enough rows,
 * which is right while a ladder only climbs — and became wrong the moment
 * `--reuse` let a run start against a table left at the TOP of the previous
 * ladder. Every level then measured the same four million rows and reported
 * them under three different headings. Nothing failed; the table just said
 * something false. So the count is now asserted rather than assumed.
 */
async function setEvents(c: pg.Client, target: number): Promise<void> {
  const { rows } = await c.query<{ n: string }>('SELECT count(*)::bigint AS n FROM campaign_events')
  let have = Number(rows[0].n)
  if (have > target) {
    say(`  (table holds ${have.toLocaleString()} rows, above this level — rebuilding from empty)`)
    await c.query('TRUNCATE campaign_events RESTART IDENTITY')
    have = 0
  }
  if (have === target) return
  const add = target - have
  say(`seeding ${add.toLocaleString()} more campaign_events (→ ${target.toLocaleString()})`)
  // EVERY VALUE IS A HASH OF THE ROW NUMBER, NOT `random()`, and that is two
  // decisions at once.
  //
  // Reproducibility is the smaller one: the same ladder produces the same
  // table on every box, so a re-measurement is comparable with the numbers in
  // `docs/FREQUENCY-CAP-MEASUREMENT.md` rather than merely similar to them.
  //
  // The larger one is that the first version of this seed was WRONG in a way
  // that produced a confident, meaningless table. It drew the org and the
  // patient in `LATERAL (SELECT 1 + floor(random() * n))` subqueries that
  // referenced nothing from `g` — so Postgres, correctly, evaluated each one
  // ONCE and reused it: all 20,000 seeded events landed on a single org and a
  // ten-campaign span. The measurement still ran and still printed a speedup.
  // A hash of `g` cannot be hoisted, because it depends on the row.
  //
  // Separate salts per column so the org, the patient and the campaign are
  // independent of each other and of `g % 5` (the type), which they would not
  // be under plain modular arithmetic on `g`.
  //
  // 40% 'sent', the rest the delivery/engagement rows a real send also writes.
  // occurred_at carries microseconds, so the two unique indexes on
  // (campaign_id, key, type, occurred_at) cannot collide in practice.
  await c.query(
    `INSERT INTO campaign_events (campaign_id, recipient_email, patient_id, type, occurred_at)
     SELECT (o - 1) * $2 + 1 + (abs(hashtextextended(g::text, 33)) % $2)::int,
            'p' || pn || '.org' || o || '@example.test',
            'p_' || o || '_' || pn,
            (CASE WHEN g % 5 < 2 THEN 'sent'
                  WHEN g % 5 = 2 THEN 'delivered'
                  WHEN g % 5 = 3 THEN 'open'
                  ELSE 'click' END)::campaign_event_type,
            now() - make_interval(secs => (abs(hashtextextended(g::text, 44)) % ($5 * 86400))::float8)
     FROM generate_series($6::bigint, $6::bigint + $1::bigint - 1) g,
          LATERAL (SELECT 1 + (abs(hashtextextended(g::text, 11)) % $3)::int AS o,
                          1 + (abs(hashtextextended(g::text, 22)) % $4)::int AS pn) k`,
    [add, CONFIG.campaignsPerOrg, CONFIG.orgs, CONFIG.patientsPerOrg, CONFIG.historyDays, have + 1],
  )
  await c.query('ANALYZE campaign_events')
  await c.query('ANALYZE campaigns')

  const { rows: check } = await c.query<{ n: string }>('SELECT count(*)::bigint AS n FROM campaign_events')
  if (Number(check[0].n) !== target) {
    throw new Error(
      `campaign_events holds ${check[0].n} rows, not the ${target} this level claims. Every number below would be labelled with the wrong row count.`,
    )
  }

  // The fixture's own shape, printed into the record. It is what a later
  // reader needs to decide whether these numbers describe their clinic.
  const { rows: spread } = await c.query<{ orgs: string; lo: string; hi: string }>(
    `SELECT count(*)::text AS orgs, min(per_org)::text AS lo, max(per_org)::text AS hi
       FROM (SELECT c.organization_id, count(*) AS per_org
               FROM campaign_events e JOIN campaigns c ON c.id = e.campaign_id
              GROUP BY 1) s`,
  )
  const { rows: window } = await c.query<{ n: string }>(
    `SELECT count(*)::text AS n
       FROM campaign_events e JOIN campaigns c ON c.id = e.campaign_id
      WHERE c.organization_id = 'org_1' AND e.type = 'sent'
        AND e.occurred_at >= now() - make_interval(days => $1)`,
    [FREQUENCY_WINDOW_DAYS],
  )
  const s = spread[0]
  say(
    `  spread: ${s.orgs} orgs carry events (${Number(s.lo).toLocaleString()}–${Number(
      s.hi,
    ).toLocaleString()} each); org_1 has ${Number(window[0].n).toLocaleString()} 'sent' rows inside the ${FREQUENCY_WINDOW_DAYS}-day window`,
  )
}

// ----------------------------------------------------------------- measure

interface Measurement {
  ms: number
  sharedHit: number
  sharedRead: number
  plan: string
  rows: number
}

/** The plan's node types, outermost first — enough to say "Seq Scan" or
 *  "Bitmap Index Scan" in a table without pasting 40 lines of EXPLAIN. */
function planShape(node: Record<string, unknown>, depth = 0): string[] {
  const self = `${'  '.repeat(depth)}${String(node['Node Type'])}${
    node['Index Name'] ? ` (${String(node['Index Name'])})` : ''
  }`
  const kids = (node['Plans'] as Record<string, unknown>[] | undefined) ?? []
  return [self, ...kids.flatMap((k) => planShape(k, depth + 1))]
}

async function explain(c: pg.Client, sql: string, params: unknown[]): Promise<Measurement> {
  const { rows } = await c.query(
    { text: `EXPLAIN (ANALYZE, BUFFERS, TIMING ON, FORMAT JSON) ${sql}`, values: params },
  )
  const root = rows[0]['QUERY PLAN'][0]
  const plan = root['Plan'] as Record<string, unknown>
  return {
    ms: Number(root['Execution Time']),
    sharedHit: Number(plan['Shared Hit Blocks'] ?? 0),
    sharedRead: Number(plan['Shared Read Blocks'] ?? 0),
    rows: Number(plan['Actual Rows'] ?? 0),
    plan: planShape(plan).join('\n'),
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

async function measure(c: pg.Client, sql: string, params: unknown[]): Promise<Measurement> {
  // One discarded warm-up: the first execution pays for reading the relation
  // into shared buffers, which is a property of the cluster's cold start and
  // not of the plan under test.
  await explain(c, sql, params)
  const runs: Measurement[] = []
  for (let i = 0; i < CONFIG.repeat; i++) runs.push(await explain(c, sql, params))
  const last = runs[runs.length - 1]
  return {
    ms: median(runs.map((r) => r.ms)),
    sharedHit: median(runs.map((r) => r.sharedHit)),
    sharedRead: median(runs.map((r) => r.sharedRead)),
    rows: last.rows,
    plan: last.plan,
  }
}

// --------------------------------------------------------- the other side

/**
 * WHAT THE INDEXES COST TO WRITE, which is the half of this trade that decides
 * it.
 *
 * The cap query runs ONCE per campaign send. `campaign_events` gets one INSERT
 * per RECIPIENT of that send — so a 2,000-person recall writes 2,000 rows and
 * asks the cap once. Pricing the read saving without pricing the write is how
 * you talk yourself into an index that loses.
 *
 * Measured inside a transaction that is rolled back: index maintenance is done
 * for real, the table is left exactly as it was found.
 */
async function insertCost(c: pg.Client, rows: number): Promise<number> {
  const { rows: at } = await c.query<{ n: string }>('SELECT count(*)::text AS n FROM campaign_events')
  const from = Number(at[0].n) + 1_000_000_000 // far outside the seeded g range
  await c.query('BEGIN')
  const started = process.hrtime.bigint()
  await c.query(
    `INSERT INTO campaign_events (campaign_id, recipient_email, patient_id, type, occurred_at)
     SELECT (o - 1) * $2 + 1 + (abs(hashtextextended(g::text, 33)) % $2)::int,
            'p' || pn || '.org' || o || '@example.test',
            'p_' || o || '_' || pn,
            'sent'::campaign_event_type,
            now() - make_interval(secs => (abs(hashtextextended(g::text, 44)) % 604800)::float8)
     FROM generate_series($5::bigint, $5::bigint + $1::bigint - 1) g,
          LATERAL (SELECT 1 + (abs(hashtextextended(g::text, 11)) % $3)::int AS o,
                          1 + (abs(hashtextextended(g::text, 22)) % $4)::int AS pn) k`,
    [rows, CONFIG.campaignsPerOrg, CONFIG.orgs, CONFIG.patientsPerOrg, from],
  )
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  await c.query('ROLLBACK')
  return ms
}

// -------------------------------------------------------------------- main

const out: string[] = []
function say(line = ''): void {
  console.log(line)
  out.push(line)
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  assertDisposable(url)

  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    await run(c)
  } finally {
    // Without this an error leaves the socket open, node's event loop never
    // drains, and a script that has already failed sits there looking busy.
    await c.end()
  }
}

async function run(c: pg.Client): Promise<void> {
  // TRUNCATE ... CASCADE names ~100 tables; the list is noise, not evidence.
  await c.query(`SET client_min_messages = warning`)
  const { rows: v } = await c.query<{ version: string }>('SELECT version()')
  say(`# frequency-cap measurement`)
  say()
  say(`- ${v[0].version}`)
  say(`- taken ${new Date().toISOString()}`)
  say(
    `- fixture: ${CONFIG.orgs} orgs × ${CONFIG.patientsPerOrg} patients × ${CONFIG.campaignsPerOrg} campaigns, events spread over ${CONFIG.historyDays} days`,
  )
  say(`- each number is the median of ${CONFIG.repeat} EXPLAIN (ANALYZE, BUFFERS) executions`)
  say()

  await seedFixtures(c)

  const rowsTable: string[] = []
  const plans: string[] = []
  const sized = new Set<number>()

  for (const level of CONFIG.levels) {
    await setEvents(c, level)
    for (const n of CONFIG.recipients) {
      // A real send's recipient list: patients of ONE clinic, every one of
      // them carrying a patient id (see the doc's "what production actually
      // asks" section), so `emails` is empty and the predicate is a single
      // IN rather than an OR. The mixed shape is measured beside it because
      // the function still admits it.
      // PATIENTS WITH A RECENT SEND COME FIRST, then everybody else.
      //
      // Not a thumb on the scale — it is what a recall audience IS. The
      // clinic is emailing the people it has been emailing, so the overlap
      // between "this send's list" and "already had a send this week" is
      // exactly the population the cap exists to find. Drawing the list in
      // patient-id order instead made it miss the 7-day window entirely at
      // the smaller levels, and a plan over an empty result measures the cost
      // of proving a set empty rather than the cost of the cap.
      const { rows: picked } = await c.query<{ id: string; email: string }>(
        `SELECT p.id, p.email
           FROM patient p
           LEFT JOIN LATERAL (
             SELECT 1 AS hit
               FROM campaign_events e
               JOIN campaigns c ON c.id = e.campaign_id
              WHERE c.organization_id = p.organization_id
                AND e.patient_id = p.id
                AND e.type = 'sent'
                AND e.occurred_at >= now() - make_interval(days => $2)
              LIMIT 1
           ) recent ON true
          WHERE p.organization_id = 'org_1'
          ORDER BY (recent.hit IS NOT NULL) DESC, p.id
          LIMIT $1`,
        [n, FREQUENCY_WINDOW_DAYS],
      )
      const ids = picked.map((p) => p.id)
      const emails = picked.map((p) => p.email)
      const since = new Date(Date.now() - FREQUENCY_WINDOW_DAYS * 86_400_000)

      const shapes = [
        { label: 'patients only (production)', ids, emails: [] as string[] },
        { label: 'mixed (patients + addresses)', ids, emails },
      ]

      for (const shape of shapes) {
        const q = capQuery('org_1', shape.ids, shape.emails, since)
        const before = await measure(c, q.sql, q.params)
        // A PLAN OVER AN EMPTY RESULT IS NOT A MEASUREMENT. The first version
        // of the seed put every event on one org, so this query matched
        // nothing — and the run still produced a table with a 7x speedup in
        // it. Refuse rather than report: a fixture that answers zero rows is
        // measuring the cost of proving a set empty, which is not the cost the
        // cap pays in production.
        if (before.rows === 0) {
          throw new Error(
            `fixture is wrong: the cap query matched 0 rows at ${level} events / ${n} recipients. ` +
              `Check that seeded events are spread across orgs and that org_1 has 'sent' rows inside the ${FREQUENCY_WINDOW_DAYS}-day window.`,
          )
        }
        for (const idx of CANDIDATE_INDEXES) await c.query(idx.ddl)
        await c.query('ANALYZE campaign_events')
        if (!sized.has(level)) {
          sized.add(level)
          // WHAT THE INDEXES COST, not just what they buy. On a t4g.micro the
          // deciding question is what stays resident, so the size of the thing
          // being added is half the argument.
          const { rows: sz } = await c.query<{ what: string; size: string }>(
            `SELECT 'campaign_events (heap+all indexes)' AS what, pg_size_pretty(pg_total_relation_size('campaign_events')) AS size
             UNION ALL SELECT 'campaign_events (heap only)', pg_size_pretty(pg_relation_size('campaign_events'))
             UNION ALL SELECT i, pg_size_pretty(pg_relation_size(i::regclass))
               FROM unnest($1::text[]) i`,
            [CANDIDATE_INDEXES.map((x) => x.name)],
          )
          for (const r of sz) say(`  size: ${r.what} = ${r.size}`)
        }
        const after = await measure(c, q.sql, q.params)
        for (const idx of CANDIDATE_INDEXES) await c.query(`DROP INDEX ${idx.name}`)
        await c.query('ANALYZE campaign_events')

        // Buffers are reported as hit/read rather than summed, because the
        // two are the whole difference between this box and production. Every
        // `read` here comes from the OS page cache on a laptop with hundreds
        // of gigabytes free; the same `read` on the t4g.micro is EBS. A run
        // that hides the split flatters itself.
        rowsTable.push(
          `| ${level.toLocaleString()} | ${n} | ${shape.label} | ${before.ms.toFixed(1)} | ${after.ms.toFixed(
            1,
          )} | ${(before.ms / Math.max(after.ms, 0.0001)).toFixed(1)}× | ${before.sharedHit}/${
            before.sharedRead
          } | ${after.sharedHit}/${after.sharedRead} | ${after.rows} |`,
        )
        plans.push(
          `### ${level.toLocaleString()} rows · ${n} recipients · ${shape.label}\n\n` +
            `**without the indexes** (${before.ms.toFixed(1)} ms)\n\n\`\`\`\n${before.plan}\n\`\`\`\n\n` +
            `**with both partial indexes** (${after.ms.toFixed(1)} ms)\n\n\`\`\`\n${after.plan}\n\`\`\``,
        )
      }
    }
  }

  say()
  say('## The numbers')
  say()
  say(
    '| campaign_events rows | recipients | predicate shape | before (ms) | after (ms) | speedup | buffers before (hit/read) | buffers after (hit/read) | rows returned |',
  )
  say('|---|---|---|---|---|---|---|---|---|')
  for (const r of rowsTable) say(r)
  say()
  say('## What the indexes cost to write')
  say()
  say(
    `At the largest level measured, one send's worth of \`campaign_events\` rows, inserted with and without the two candidate indexes (median of ${CONFIG.repeat} transactions, each rolled back):`,
  )
  say()
  say('| rows inserted (one send) | without the indexes (ms) | with both (ms) | write penalty |')
  say('|---|---|---|---|')
  for (const batch of [200, 2000]) {
    const bare: number[] = []
    for (let i = 0; i < CONFIG.repeat; i++) bare.push(await insertCost(c, batch))
    for (const idx of CANDIDATE_INDEXES) await c.query(idx.ddl)
    const withIdx: number[] = []
    for (let i = 0; i < CONFIG.repeat; i++) withIdx.push(await insertCost(c, batch))
    for (const idx of CANDIDATE_INDEXES) await c.query(`DROP INDEX ${idx.name}`)
    const a = median(bare)
    const b = median(withIdx)
    say(`| ${batch.toLocaleString()} | ${a.toFixed(1)} | ${b.toFixed(1)} | ${b >= a ? '+' : ''}${(b - a).toFixed(1)} ms |`)
  }

  say()
  say('## The plans')
  say()
  for (const p of plans) {
    say(p)
    say()
  }

  const target = arg('out')
  if (target) {
    await writeFile(target, out.join('\n') + '\n', 'utf8')
    console.error(`wrote ${target}`)
  }
}

// Not a top-level await: `tsx` transpiles a `.ts` in this package to CJS
// (no `"type": "module"`), and CJS has none. The `.mts` that would have is
// worse — the schema barrel is CJS too, and an ESM `import * as schema` of it
// yields `{ default, 'module.exports' }` rather than the tables.
if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
}
