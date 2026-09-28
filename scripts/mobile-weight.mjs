// NO SHEBANG, DELIBERATELY — run it as `node scripts/mobile-weight.mjs`, the
// same way `scripts/load-sanity.mjs` is run. Nothing schedules this.
//
/**
 * MOBILE WEIGHT — what the marketing homepage costs a phone.
 *
 * `docs/RELEASE.md` Part 1 lists performance as "Never run"; `docs/LOAD-SANITY.md`
 * answered the SERVER half of that (which surface falls over first, measured
 * in req/s and p99). This is the CLIENT half, and the two do not overlap: the
 * homepage's living stage — the cinematic spine, its four scenes and a canvas
 * particle layer, ~2,800 lines — costs the server nothing at all and costs a
 * phone every byte of it.
 *
 * Verified only in headless Chromium at 1440 / 1920 / 2560, and never once on
 * a mid-range phone on a real network, which is the population a marketing
 * push sends here.
 *
 * ── THIS IS AN INSTRUMENT, NOT A GATE ────────────────────────────────────
 *
 * It asserts nothing, fails nothing and is on no required check. That is
 * deliberate and it is `dreamcrm-conventions` §2's rule rather than modesty:
 * a new blocking assertion inside `test` or `e2e` changes what can merge, and
 * changing what can merge is a policy change that routes to Forge BEFORE it
 * is implemented. If a budget is ever wanted here — "the homepage ships no
 * more than N KB of script to a phone" — that is the intake, and this script
 * is the evidence it would be argued from. Do not quietly grow an `exit(1)`.
 *
 * ── WHAT IT MEASURES AND WHY EACH NUMBER IS HERE ─────────────────────────
 *
 * Per page, on a cold cache, under one profile:
 *
 *  - TRANSFER BYTES, split by resource type. `encodedDataLength` off the
 *    wire, not `resource.transferSize` — the latter is 0 for anything a
 *    cross-origin policy hides, and quietly under-reports.
 *  - SCRIPT BYTES specifically, because on this page that is the whole
 *    question (see the finding in `docs/MOBILE-WEIGHT.md`).
 *  - FCP / LCP / CLS, from the browser's own observers rather than from
 *    wall-clock arithmetic here.
 *  - LONG TASKS, split at the moment the scripted scroll starts. Load
 *    blocking and scroll blocking are different complaints — one is "the
 *    page took a while", the other is "it stutters in my hand" — and a
 *    single total hides which one this page has.
 *  - WHETHER THE CINEMATIC STAGE ACTUALLY ACTIVATED, read off the DOM. It
 *    is gated on a fine pointer and a large window, so on a phone it does
 *    not run — and a number for a phone is only honest if it says whether
 *    the expensive thing was even switched on.
 *
 * ── THE PROFILE, AND WHY THESE EXACT NUMBERS ─────────────────────────────
 *
 * Lighthouse's mobile defaults, so the result is comparable to any
 * Lighthouse run anyone does later rather than to this script alone: 4x CPU
 * slowdown, 1,638.4 Kbps down / 750 Kbps up, 150ms RTT ("Slow 4G"), a
 * 412x823 viewport at DPR 1.75. That is a Moto-G-class phone on a mediocre
 * connection, which is the honest middle of the dental-practice-owner
 * population, not a worst case.
 *
 * Usage:
 *   node scripts/mobile-weight.mjs
 *   node scripts/mobile-weight.mjs --base http://127.0.0.1:3000
 *   node scripts/mobile-weight.mjs --runs 3 --json
 *
 * No dependencies — Node's own `fetch` and `WebSocket` (Node >= 22), the
 * same standard `load-sanity.mjs` holds itself to. A measurement script that
 * needs an install is a measurement nobody re-runs.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/* ── Arguments ───────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 || i === argv.length - 1 ? fallback : argv[i + 1]
}
const flag = (name) => argv.includes(`--${name}`)

const BASE = arg('base', 'https://www.dreamcreatestudio.com').replace(/\/+$/, '')
const RUNS = Math.max(1, Number(arg('runs', 3)))
const AS_JSON = flag('json')

/**
 * THE PROFILE. Lighthouse mobile, spelled out rather than imported, because
 * the point of the table this produces is that somebody can reproduce it.
 */
const PROFILE = {
  label: 'Moto-G-class phone, Slow 4G',
  width: 412,
  height: 823,
  deviceScaleFactor: 1.75,
  cpuSlowdown: 4,
  // Kbps -> bytes/sec. CDP wants bytes.
  downloadThroughput: (1638.4 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
  userAgent:
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
}

/**
 * The pages, and why each one.
 *
 * `/pricing` is the CONTROL and it is the same control `docs/LOAD-SANITY.md`
 * used, on purpose: that run established it as the page with no unusual
 * per-request work, so a client-side reading of it is the marketing site's
 * ordinary cost. The homepage's number means nothing on its own — "1.2 MB" is
 * a number, "1.2 MB where an ordinary page on the same site is 400 KB" is a
 * finding.
 */
const PAGES = [
  { key: 'home', path: '/', reducedMotion: false },
  { key: 'home (reduced motion)', path: '/', reducedMotion: true },
  { key: 'pricing (control)', path: '/pricing', reducedMotion: false },
]

/* ── Finding a browser ───────────────────────────────────────────────────── */

const CHROME_CANDIDATES = [
  process.env.MOBILE_WEIGHT_CHROME,
  process.env.E2E_CHROMIUM_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

function findChrome() {
  for (const c of CHROME_CANDIDATES) if (existsSync(c)) return c
  throw new Error(
    'No Chrome/Chromium found. Set MOBILE_WEIGHT_CHROME to a binary path. Tried:\n  ' +
      CHROME_CANDIDATES.join('\n  '),
  )
}

/* ── A very small CDP client ─────────────────────────────────────────────── */

class Cdp {
  constructor(ws) {
    this.ws = ws
    this.next = 1
    this.pending = new Map()
    this.handlers = new Map()
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id != null) {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        if (msg.error) p.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error)})`))
        else p.resolve(msg.result)
        return
      }
      const hs = this.handlers.get(msg.method)
      if (hs) for (const h of hs) h(msg.params, msg.sessionId)
    })
  }

  static async open(url) {
    const ws = new WebSocket(url)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', () => reject(new Error(`cannot connect to ${url}`)), { once: true })
    })
    return new Cdp(ws)
  }

  on(method, handler) {
    if (!this.handlers.has(method)) this.handlers.set(method, [])
    this.handlers.get(method).push(handler)
  }

  off(method) {
    this.handlers.delete(method)
  }

  send(method, params = {}, sessionId) {
    const id = this.next++
    const payload = { id, method, params }
    if (sessionId) payload.sessionId = sessionId
    this.ws.send(JSON.stringify(payload))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  close() {
    try {
      this.ws.close()
    } catch {
      /* the browser is going away anyway */
    }
  }
}

const sleep = (waitMs) => new Promise((r) => setTimeout(r, waitMs))

/* ── The observers we inject before anything on the page runs ────────────── */

const OBSERVER_SOURCE = `(() => {
  const w = { fcp: null, lcp: null, lcpEl: null, cls: 0, shifts: [], long: [], scrollAt: null };
  window.__weight = w;
  const obs = (type, cb) => {
    try { new PerformanceObserver(cb).observe({ type: type, buffered: true }); } catch (e) {}
  };
  obs('paint', (l) => {
    for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') w.fcp = e.startTime;
  });
  obs('largest-contentful-paint', (l) => {
    const es = l.getEntries(); if (!es.length) return;
    const e = es[es.length - 1];
    w.lcp = e.startTime;
    // WHICH element, not just when. Two LCP numbers a second apart are a
    // riddle until you know whether they are even the same element — and if
    // they are not, the difference is a different picture rather than a
    // slower one. This is what keeps the write-up a measurement instead of
    // an attribution (conventions section 10).
    const el = e.element;
    w.lcpEl = el
      ? (el.tagName.toLowerCase() +
         (el.id ? '#' + el.id : '') +
         (typeof el.className === 'string' && el.className
           ? '.' + el.className.trim().split(/\\s+/).slice(0, 4).join('.')
           : '') +
         ' :: ' + (el.textContent || el.currentSrc || '').trim().slice(0, 60))
      : '(none)';
  });
  obs('layout-shift', (l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      w.cls += e.value;
      // WHICH element moved, and from where to where. Same argument as the
      // LCP element above: a CLS of 0.116 is a riddle, and "the pricing panel
      // dropped 27px at 2.6s" is a defect with a mechanism. DREAMCRM-118
      // needed a throwaway probe to learn this and the probe is the thing
      // worth keeping -- the doc's own recommendation 3 is to re-run and
      // COMPARE, which wants the subject of the metric and not only its size.
      const src = (e.sources || []).find((x) => x.node && x.node.nodeType === 1);
      const n = src && src.node;
      w.shifts.push({
        t: Math.round(e.startTime),
        value: e.value,
        afterScroll: w.scrollAt != null,
        el: n
          ? (n.tagName.toLowerCase() +
             (n.id ? '#' + n.id : '') +
             (typeof n.className === 'string' && n.className
               ? '.' + n.className.trim().split(/[ ]+/).slice(0, 4).join('.')
               : ''))
          : '(no element)',
        movedY:
          src && src.previousRect && src.currentRect
            ? Math.round((src.currentRect.y - src.previousRect.y) * 100) / 100
            : null,
      });
    }
  });
  obs('longtask', (l) => {
    for (const e of l.getEntries()) w.long.push({ start: e.startTime, dur: e.duration });
  });
})()`

/**
 * Drive the page the way a reader does. The stage is SCROLL-driven, so a
 * measurement that only loads the page and stops has measured the half of it
 * that does nothing — and on this page the scroll half is the whole pitch.
 *
 * Steps with an awaited frame between them rather than `scrollTo(bottom)`:
 * one jump produces one scroll event and one paint, which is the opposite of
 * what a thumb does.
 */
const SCROLL_SOURCE = `(async () => {
  const w = window.__weight;
  w.scrollAt = performance.now();
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const end = () => document.documentElement.scrollHeight - window.innerHeight;
  const STEPS = 60;
  for (let i = 0; i < STEPS; i++) {
    window.scrollBy(0, Math.max(1, end() / STEPS));
    await frame();
  }
  for (let i = 0; i < 20; i++) await frame();
  return true;
})()`

/** What the page turned out to be, read off the DOM rather than assumed. */
const STATE_SOURCE = `(() => {
  const el = document.querySelector('.is-cinematic, [class*="is-cinematic"]');
  const canvas = document.querySelector('canvas');
  const canvasPainted = !!canvas && getComputedStyle(canvas).display !== 'none';
  return {
    cinematicActive: !!el,
    canvasPresent: !!canvas,
    canvasPainted: canvasPainted,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    finePointer: window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    docHeight: document.documentElement.scrollHeight,
  };
})()`

/* ── One measured page load ──────────────────────────────────────────────── */

const TYPE_BUCKETS = {
  Document: 'document',
  Script: 'script',
  Stylesheet: 'css',
  Font: 'font',
  Image: 'image',
  Media: 'image',
  XHR: 'other',
  Fetch: 'other',
}

async function measure(cdp, targetId, page) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })

  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)
  await cdp.send('Network.enable', {}, sessionId)
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true }, sessionId)
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    {
      width: PROFILE.width,
      height: PROFILE.height,
      deviceScaleFactor: PROFILE.deviceScaleFactor,
      mobile: true,
    },
    sessionId,
  )
  // mobile:true alone does not make `(pointer: coarse)` true — touch emulation
  // does, and the stage's gate reads the pointer. Getting this wrong would
  // report the stage as ACTIVE on a phone, which is the single claim this
  // whole script exists to settle.
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }, sessionId)
  await cdp.send(
    'Emulation.setUserAgentOverride',
    {
      userAgent: PROFILE.userAgent,
      userAgentMetadata: {
        mobile: true,
        platform: 'Android',
        platformVersion: '11',
        architecture: '',
        model: 'moto g power',
        brands: [],
      },
    },
    sessionId,
  )
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: PROFILE.cpuSlowdown }, sessionId)
  await cdp.send(
    'Network.emulateNetworkConditions',
    {
      offline: false,
      latency: PROFILE.latency,
      downloadThroughput: PROFILE.downloadThroughput,
      uploadThroughput: PROFILE.uploadThroughput,
    },
    sessionId,
  )
  await cdp.send(
    'Emulation.setEmulatedMedia',
    { features: page.reducedMotion ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [] },
    sessionId,
  )
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER_SOURCE }, sessionId)

  /* Byte accounting. Keyed on requestId so a redirect chain or a retry is
   * counted once per response rather than once per URL. */
  const types = new Map()
  const bytes = new Map()
  let inflight = 0
  let lastActivity = Date.now()

  const onRequest = (p, sid) => {
    if (sid !== sessionId) return
    inflight++
    lastActivity = Date.now()
  }
  const onResponse = (p, sid) => {
    if (sid !== sessionId) return
    types.set(p.requestId, p.type)
  }
  const settle = (p, sid) => {
    if (sid !== sessionId) return
    inflight = Math.max(0, inflight - 1)
    lastActivity = Date.now()
    if (p.encodedDataLength != null) bytes.set(p.requestId, p.encodedDataLength)
  }
  cdp.on('Network.requestWillBeSent', onRequest)
  cdp.on('Network.responseReceived', onResponse)
  cdp.on('Network.loadingFinished', settle)
  cdp.on('Network.loadingFailed', settle)

  const started = Date.now()
  await cdp.send('Page.navigate', { url: BASE + page.path }, sessionId)

  // Quiet rather than `load`: the page hydrates after `load`, and hydration is
  // most of what this measures.
  const QUIET_MS = 2_000
  const CAP_MS = 60_000
  while (Date.now() - started < CAP_MS) {
    await sleep(200)
    if (inflight === 0 && Date.now() - lastActivity > QUIET_MS) break
  }

  const readLoad = await cdp.send(
    'Runtime.evaluate',
    { expression: 'JSON.stringify(window.__weight)', returnByValue: true },
    sessionId,
  )
  const atLoad = JSON.parse(readLoad.result.value ?? '{}')

  await cdp.send(
    'Runtime.evaluate',
    { expression: SCROLL_SOURCE, awaitPromise: true, returnByValue: true },
    sessionId,
  )

  const readAll = await cdp.send(
    'Runtime.evaluate',
    { expression: 'JSON.stringify(window.__weight)', returnByValue: true },
    sessionId,
  )
  const after = JSON.parse(readAll.result.value ?? '{}')

  const readState = await cdp.send(
    'Runtime.evaluate',
    { expression: STATE_SOURCE, returnByValue: true },
    sessionId,
  )
  const state = readState.result.value ?? {}

  cdp.off('Network.requestWillBeSent')
  cdp.off('Network.responseReceived')
  cdp.off('Network.loadingFinished')
  cdp.off('Network.loadingFailed')

  const byType = { document: 0, script: 0, css: 0, font: 0, image: 0, other: 0 }
  let total = 0
  for (const [id, n] of bytes) {
    total += n
    byType[TYPE_BUCKETS[types.get(id)] ?? 'other'] += n
  }

  /* Total blocking time, the Lighthouse definition: everything a long task
   * spends past 50ms. The raw duration would count the 50ms every task is
   * allowed, which makes a page of many short-ish tasks look like a page that
   * froze. */
  const blocking = (tasks) => tasks.reduce((a, t) => a + Math.max(0, t.dur - 50), 0)
  const longest = (tasks) => (tasks.length ? Math.max(...tasks.map((t) => t.dur)) : 0)
  const loadTasks = atLoad.long ?? []
  const scrollTasks = (after.long ?? []).filter(
    (t) => after.scrollAt != null && t.start >= after.scrollAt,
  )

  return {
    bytes: { total, ...byType },
    fcp: after.fcp ?? atLoad.fcp ?? null,
    lcp: after.lcp ?? atLoad.lcp ?? null,
    lcpEl: after.lcpEl ?? atLoad.lcpEl ?? null,
    cls: after.cls ?? 0,
    shifts: after.shifts ?? [],
    load: { tasks: loadTasks.length, blockingMs: blocking(loadTasks), longestMs: longest(loadTasks) },
    scroll: {
      tasks: scrollTasks.length,
      blockingMs: blocking(scrollTasks),
      longestMs: longest(scrollTasks),
    },
    state,
  }
}

/* ── Reporting ───────────────────────────────────────────────────────────── */

const kb = (n) => `${Math.round((n ?? 0) / 1024).toLocaleString('en-US')} KB`
const showMs = (n) => (n == null ? '—' : `${Math.round(n).toLocaleString('en-US')}ms`)

/** The median, not the mean — one unlucky run on a shared network should not
 *  move the number anybody quotes. Same reasoning as load-sanity's p50. */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  if (!s.length) return null
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function fold(samples) {
  const pick = (f) => median(samples.map(f).filter((n) => n != null))
  return {
    bytes: {
      total: pick((s) => s.bytes.total),
      script: pick((s) => s.bytes.script),
      document: pick((s) => s.bytes.document),
      css: pick((s) => s.bytes.css),
      font: pick((s) => s.bytes.font),
      image: pick((s) => s.bytes.image),
      other: pick((s) => s.bytes.other),
    },
    fcp: pick((s) => s.fcp),
    lcp: pick((s) => s.lcp),
    cls: pick((s) => s.cls),
    // The worst single shift seen across the runs, not a median: a shift that
    // only lands on some runs is still the page's defect, and it is exactly
    // the shape this metric hides -- a shift is only counted against content
    // that already painted, so a slow run reports 0.000 for a page that moves
    // every time. Report the subject whenever ANY run saw one.
    worstShift: samples
      .flatMap((s) => s.shifts ?? [])
      .sort((a, b) => b.value - a.value)[0] ?? null,
    shiftRuns: samples.filter((s) => (s.shifts ?? []).length > 0).length,
    runs: samples.length,
    lcpEl: samples[samples.length - 1].lcpEl,
    loadBlockingMs: pick((s) => s.load.blockingMs),
    loadLongestMs: pick((s) => s.load.longestMs),
    scrollBlockingMs: pick((s) => s.scroll.blockingMs),
    scrollLongestMs: pick((s) => s.scroll.longestMs),
    state: samples[samples.length - 1].state,
  }
}

async function main() {
  const chrome = findChrome()
  const userDataDir = mkdtempSync(join(tmpdir(), 'mobile-weight-'))
  const port = 9222 + Math.floor(Math.random() * 500)

  const proc = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--mute-audio',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )

  let wsUrl = null
  for (let i = 0; i < 100 && wsUrl == null; i++) {
    await sleep(150)
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`)
      wsUrl = (await r.json()).webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
  }
  if (!wsUrl) {
    proc.kill()
    throw new Error(`Chrome did not expose a debugging endpoint on ${port}`)
  }

  const cdp = await Cdp.open(wsUrl)
  const results = {}

  try {
    for (const page of PAGES) {
      const samples = []
      for (let run = 0; run < RUNS; run++) {
        // A FRESH TARGET PER RUN, not a re-navigation: the observers are
        // installed per document and the byte ledger is per target, and a
        // second navigation in the same tab inherits a warm JS engine, which
        // is exactly the cold-visit cost this is trying to read.
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
        try {
          samples.push(await measure(cdp, targetId, page))
        } finally {
          await cdp.send('Target.closeTarget', { targetId })
        }
      }
      results[page.key] = fold(samples)
      if (!AS_JSON) process.stderr.write(`  measured ${page.key}\n`)
    }
  } finally {
    cdp.close()
    proc.kill()
    try {
      rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      /* Windows holds the profile briefly; a temp dir is not worth a retry loop */
    }
  }

  if (AS_JSON) {
    process.stdout.write(
      JSON.stringify(
        { base: BASE, profile: PROFILE, runs: RUNS, at: new Date().toISOString(), results },
        null,
        2,
      ) + '\n',
    )
    return
  }

  console.log(`\nMOBILE WEIGHT — ${BASE}`)
  console.log(
    `${PROFILE.label}: ${PROFILE.width}x${PROFILE.height} @${PROFILE.deviceScaleFactor}, ` +
      `CPU ${PROFILE.cpuSlowdown}x, 1638/750 Kbps, ${PROFILE.latency}ms RTT`,
  )
  console.log(`cold cache, median of ${RUNS} runs, ${new Date().toISOString()}\n`)

  const rows = Object.entries(results)
  const head = ['surface', 'transfer', 'script', 'FCP', 'LCP', 'CLS', 'load block', 'scroll block', 'worst task']
  const body = rows.map(([k, r]) => [
    k,
    kb(r.bytes.total),
    kb(r.bytes.script),
    showMs(r.fcp),
    showMs(r.lcp),
    (r.cls ?? 0).toFixed(3),
    showMs(r.loadBlockingMs),
    showMs(r.scrollBlockingMs),
    showMs(Math.max(r.loadLongestMs ?? 0, r.scrollLongestMs ?? 0)),
  ])
  const widths = head.map((_, i) => Math.max(head[i].length, ...body.map((b) => b[i].length)))
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ')
  console.log(line(head))
  console.log(widths.map((w) => '-'.repeat(w)).join('  '))
  for (const b of body) console.log(line(b))

  console.log('')
  for (const [k, r] of rows) {
    console.log(
      `${k}: LCP element ${r.lcpEl ?? '(unknown)'}
  ` +
        `cinematic stage ${r.state.cinematicActive ? 'ACTIVE' : 'not active'}` +
        `, canvas ${r.state.canvasPresent ? (r.state.canvasPainted ? 'painted' : 'display:none') : 'absent'}` +
        `, fine pointer ${r.state.finePointer}, ${r.state.innerWidth}x${r.state.innerHeight}` +
        `, document ${r.state.docHeight}px`,
    )
    if (r.worstShift) {
      console.log(
        `  worst layout shift ${r.worstShift.value.toFixed(4)} at ${r.worstShift.t}ms` +
          ` (${r.shiftRuns}/${r.runs} runs)` +
          `: ${r.worstShift.el}` +
          (r.worstShift.movedY != null ? ` moved ${r.worstShift.movedY}px` : '') +
          (r.worstShift.afterScroll ? ' [during scroll]' : ''),
      )
    }
  }
  console.log('')
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
