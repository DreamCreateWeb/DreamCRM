// Load sanity (release program R3). No dependencies — Node's own fetch.
//
// WHAT THIS IS: a repeatable way to find which surfaces fall over first under
// concurrency, and to prove a perf fix actually moved the number.
//
// WHAT THIS IS NOT: a measurement of production capacity. Run against a local
// box it tells you about the APPLICATION (N+1 queries, slow renders, lock
// contention); it says nothing about the prod t4g.micro's ceiling, which has
// different CPU, memory and a network hop to RDS. To get the real ceiling,
// point BASE at a staging deploy on prod-shaped hardware.
//
//   node scripts/load-sanity.mjs [--conc 10] [--reqs 100] [--base URL]
//
// Reports p50/p90/p99 + error rate per path. Percentiles, not averages: an
// average hides the tail, and the tail is what a patient experiences.

const args = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt
}

const BASE = flag('base', process.env.LOAD_BASE ?? 'http://127.0.0.1:3100')
const CONC = Number(flag('conc', 10))
const REQS = Number(flag('reqs', 100))

// Public, read-only, unauthenticated surfaces. Deliberately no write paths:
// a load script must never be able to fabricate bookings or send email.
const PATHS = [
  ['health', '/api/health'],
  ['marketing home', '/'],
  ['pricing', '/pricing'],
  ['clinic site', '/site/e2e-dental'],
  ['clinic booking', '/site/e2e-dental/book'],
]

function pct(sorted, p) {
  if (!sorted.length) return 0
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return Math.round(sorted[i])
}

async function measure(label, path) {
  const times = []
  let errors = 0
  let inFlight = 0
  let started = 0
  const startedAt = Date.now()

  await new Promise((resolve) => {
    const pump = () => {
      while (inFlight < CONC && started < REQS) {
        started++
        inFlight++
        const t0 = performance.now()
        fetch(`${BASE}${path}`, { redirect: 'manual' })
          .then((res) => {
            // 2xx and 3xx are both fine here — several of these paths redirect
            // by design, and counting a correct redirect as an error would
            // make the numbers lie.
            if (res.status >= 400) errors++
            return res.arrayBuffer().catch(() => null)
          })
          .catch(() => {
            errors++
          })
          .finally(() => {
            times.push(performance.now() - t0)
            inFlight--
            if (times.length >= REQS) resolve()
            else pump()
          })
      }
    }
    pump()
  })

  const sorted = times.slice().sort((a, b) => a - b)
  const wall = (Date.now() - startedAt) / 1000
  return {
    label,
    path,
    p50: pct(sorted, 50),
    p90: pct(sorted, 90),
    p99: pct(sorted, 99),
    max: Math.round(sorted[sorted.length - 1] ?? 0),
    rps: Math.round((REQS / wall) * 10) / 10,
    errors,
  }
}

console.log(`load-sanity → ${BASE}  (concurrency ${CONC}, ${REQS} requests per path)\n`)
const rows = []
for (const [label, path] of PATHS) {
  rows.push(await measure(label, path))
}

const pad = (s, n) => String(s).padEnd(n)
console.log(pad('surface', 18) + pad('p50', 8) + pad('p90', 8) + pad('p99', 8) + pad('max', 8) + pad('req/s', 8) + 'errors')
console.log('-'.repeat(66))
for (const r of rows) {
  console.log(
    pad(r.label, 18) + pad(`${r.p50}ms`, 8) + pad(`${r.p90}ms`, 8) + pad(`${r.p99}ms`, 8) +
    pad(`${r.max}ms`, 8) + pad(r.rps, 8) + (r.errors ? `${r.errors} ⚠` : '0'),
  )
}

const worst = rows.slice().sort((a, b) => b.p99 - a.p99)[0]
console.log(`\nslowest tail: ${worst.label} at p99 ${worst.p99}ms`)
const failed = rows.filter((r) => r.errors > 0)
if (failed.length) {
  console.log(`\nERRORS on: ${failed.map((f) => f.label).join(', ')}`)
  process.exit(1)
}
