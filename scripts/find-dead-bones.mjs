#!/usr/bin/env node
/**
 * Dev-only: lists the dead bones — components/* modules nothing imports, and
 * app/** page routes nothing references. The two guards
 * (tests/guards/dead-components.test.ts, tests/guards/reachable-routes.test.ts)
 * reuse the exported walkers, so the script and the tests cannot disagree.
 *
 *   node scripts/find-dead-bones.mjs [--tests]   # --tests: count test imports as importers
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP = new Set(['node_modules', '.next', '.git', '.claude', 'coverage', 'playwright-report', 'test-results'])
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs']

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const rel = (p) => relative(ROOT, p).split('\\').join('/')

/** Every source file that can import (code, tests, e2e, scripts, root configs). */
export function sourceFiles() {
  const all = []
  for (const d of ['app', 'components', 'lib', 'tests', 'e2e', 'scripts']) {
    if (existsSync(join(ROOT, d))) all.push(...walk(join(ROOT, d)))
  }
  for (const f of readdirSync(ROOT)) {
    const p = join(ROOT, f)
    if (statSync(p).isFile() && /\.(m?[jt]s|tsx?)$/.test(f)) all.push(p)
  }
  return all.filter((f) => /\.(m?[jt]sx?|css)$/.test(f))
}

const SPEC = /(?:from\s*|import\s*\(\s*|import\s+|require\(\s*|vi\.(?:mock|importActual|doMock)\(\s*)['"]([^'"]+)['"]/g

function resolveSpec(spec, fromFile) {
  let base
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2))
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else return null
  const cands = [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => join(base, 'index' + e))]
  for (const c of cands) if (existsSync(c) && statSync(c).isFile()) return c
  return null
}

/** Map<resolved file, Set<importer rel path>> */
export function importGraph(files = sourceFiles()) {
  const g = new Map()
  for (const f of files) {
    if (!/\.(m?[jt]sx?)$/.test(f)) continue
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(SPEC)) {
      const t = resolveSpec(m[1], f)
      if (!t || t === f) continue
      if (!g.has(t)) g.set(t, new Set())
      g.get(t).add(rel(f))
    }
  }
  return g
}

const isTest = (r) => r.startsWith('tests/') || r.startsWith('e2e/')

/** components/** modules with no importer. Returns { dead, testOnly } (rel paths). */
export function deadComponents(graph = importGraph()) {
  const dead = []
  const testOnly = {}
  for (const f of walk(join(ROOT, 'components'))) {
    if (!/\.(tsx?|jsx?)$/.test(f)) continue
    const importers = [...(graph.get(f) ?? [])]
    if (importers.length === 0) dead.push(rel(f))
    else if (importers.every(isTest)) testOnly[rel(f)] = importers
  }
  return { dead: dead.sort(), testOnly }
}

/** Every app/**\/page.tsx → its URL pattern (route groups dropped). */
export function pageRoutes() {
  const out = []
  for (const f of walk(join(ROOT, 'app'))) {
    if (!/\/page\.(tsx|ts|jsx|js)$/.test(f)) continue
    const segs = rel(f).split('/').slice(1, -1).filter((s) => !(s.startsWith('(') && s.endsWith(')')))
    out.push({ file: rel(f), url: '/' + segs.join('/') })
  }
  return out
}

/**
 * Pages whose URL is referenced nowhere outside their own folder. A static
 * page is "referenced" when its URL appears as a string literal / template
 * prefix in any source file (app, components, lib, tests, e2e, middleware);
 * dynamic segments match by their static prefix. Heuristic by design — the
 * guard keeps a dated allowlist, so a false positive costs one line.
 */
export function unreferencedRoutes() {
  const files = sourceFiles().filter((f) => /\.(m?[jt]sx?)$/.test(f))
  const SELF = new Set(['scripts/find-dead-bones.mjs', 'tests/guards/reachable-routes.test.ts', 'tests/guards/dead-components.test.ts'])
  const corpus = files.filter((f) => !SELF.has(rel(f))).map((f) => ({ r: rel(f), s: readFileSync(f, 'utf8') }))
  const dead = []
  for (const { file, url } of pageRoutes()) {
    if (url === '/') continue
    const staticPart = url.split('/').filter((s) => !s.startsWith('[')).join('/')
    const needle = url.includes('[') ? url.slice(0, url.indexOf('[')).replace(/\/$/, '') || staticPart : url
    const folder = file.replace(/\/page\.[a-z]+$/, '/')
    const hit = corpus.some(({ r, s }) => !r.startsWith(folder) && !r.startsWith('lib/db/migrations') && s.includes(needle))
    if (!hit) dead.push({ file, url })
  }
  return dead
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const g = importGraph()
  const { dead, testOnly } = deadComponents(g)
  console.log(`# components with ZERO importers (${dead.length})`)
  for (const d of dead) console.log(d)
  console.log(`\n# components imported ONLY by tests/e2e (${Object.keys(testOnly).length})`)
  for (const [k, v] of Object.entries(testOnly)) console.log(`${k}  <- ${v.join(', ')}`)
  const r = unreferencedRoutes()
  console.log(`\n# page routes whose URL no other file mentions (${r.length})`)
  for (const x of r) console.log(`${x.url}  (${x.file})`)
}
