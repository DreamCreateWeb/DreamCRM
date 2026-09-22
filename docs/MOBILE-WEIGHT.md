# Mobile weight

Release program **R3**, the client half. `docs/LOAD-SANITY.md` answered the
SERVER question — which surface falls over first, in req/s and p99. This
answers the one it structurally cannot see: **what the marketing homepage
costs a phone.**

The two do not overlap. The homepage's living stage — the cinematic spine, its
four scenes and a canvas particle layer, ~2,800 lines — costs the server
nothing at all and costs a phone every byte of it. It had been verified in
headless Chromium at 1440 / 1920 / 2560 and never once on a mid-range phone on
a real network, which is the population a marketing push sends here.

```bash
node scripts/mobile-weight.mjs                              # production
node scripts/mobile-weight.mjs --base http://127.0.0.1:3000 # a local build
node scripts/mobile-weight.mjs --runs 5 --json              # machine-readable
```

No dependencies — Node's own `fetch` and `WebSocket` drive a headless Chrome
over CDP, the same no-install standard `scripts/load-sanity.mjs` holds itself
to. A measurement script that needs a setup step is a measurement nobody
re-runs.

**This is an instrument, not a gate.** It asserts nothing, fails nothing, and
is on no required check. That is `dreamcrm-conventions` §2's rule and not
modesty: a new blocking assertion inside `test` or `e2e` changes what can
merge, which is a policy change that routes to Forge **before** it is
implemented. If a budget is wanted here — *"the homepage ships no more than N
KB of script to a phone"*, *"LCP under 2.5s on the mobile profile"* — that is
the intake, and this file is the evidence it would be argued from.

## The profile

Lighthouse's mobile defaults, spelled out rather than inherited, so a result
here is comparable to any Lighthouse run anybody does later:

| | |
|---|---|
| device | 412 × 823 CSS px at DPR 1.75, `mobile: true`, touch emulation ON |
| CPU | 4× slowdown |
| network | 1,638.4 Kbps down / 750 Kbps up, 150 ms RTT ("Slow 4G") |
| cache | disabled — a cold first visit, which is what a marketing click is |

Touch emulation is load-bearing rather than cosmetic. `mobile: true` alone
does not make `(pointer: coarse)` true, and the stage's own gate reads the
pointer — without it the measurement would report the stage as ACTIVE on a
phone, which is the single claim this whole exercise exists to settle.

**`/pricing` is the control**, the same control `docs/LOAD-SANITY.md` used.
That run established it as the marketing page with no unusual per-request
work, so a client-side reading of it is this site's ordinary cost. "565 KB" is
a number; "565 KB where an ordinary page on the same site is 495 KB" is a
finding.

## Baseline — 2026-09-22, production (`www.dreamcreatestudio.com`)

Median of 5 runs, repeated over 5 passes (25 samples per surface); the bracket
is the spread across pass medians. Measured from a Windows dev box on a home
connection — the CPU and network are EMULATED, so those are comparable; the
absolute wall-clock is not a datacentre number.

| surface | transfer | script | FCP | LCP | CLS | load blocking |
|---|---|---|---|---|---|---|
| **home** | **565 KB** [563–566] | **211 KB** | 2,600ms [2,364–2,768] | **3,424ms** [2,904–4,004] | 0.000 | 315ms |
| home, reduced motion | 564 KB | 211 KB | 2,472ms | **2,472ms** [2,396–3,472] | 0.000 | 187ms |
| pricing (control) | 495 KB [495–497] | 197 KB | 2,316ms | 2,944ms [2,408–3,420] | 0.000 | 190ms |

### The one number

**The homepage costs a phone ~950 ms of Largest Contentful Paint for motion
the phone cannot see** — LCP 3,424 ms against 2,472 ms on the identical page
under `prefers-reduced-motion: reduce`. It also carries ~1.7× the control's
main-thread blocking at load (315 ms vs 190 ms), and that difference
disappears under reduced motion too (187 ms).

Bytes are **not** the story, which is the part that surprised us: the homepage
ships 70 KB more transfer and only **14 KB more script** than a plain pricing
page. The living stage is not heavy. It is *late*.

## What the numbers say

**The living stage never activates on a phone, and that is by design working.**
Read off the DOM on every run, not assumed: `.is-cinematic` absent, the
particle `<canvas>` at `display: none`, `(hover: hover) and (pointer: fine)`
false. `cinematic-spine.tsx`'s `legal()` requires a fine pointer, width ≥ 1024
and height ≥ 760; a phone fails all three, so the stacked layout — six
ordinary sections, each a card and its finished picture — is what a phone
gets. The spine's own law ("the stacked layout is the DEFAULT, not the
fallback") holds up under measurement.

**So the weight is not the stage. It is the hero's entrance animation, and
it is four lines of CSS.** `components/marketing/ui.tsx:72`:

```css
.mkt-enter { opacity: 0; animation: mkt-fade-up 0.65s cubic-bezier(0.16,1,0.3,1) forwards; }
.mkt-d2    { animation-delay: 0.16s; }
```

The hero paragraph — the LCP element on this page — starts at `opacity: 0` and
is not paintable until 0.16 s + 0.65 s ≈ **0.81 s** after the style applies.
The measured gap is ~0.95 s. The mechanism and the measurement agree, which is
the only reason this is written as a cause rather than a suspicion.

**And the LCP element itself flips, which is worse than the number.** Captured
per run rather than inferred:

| path | LCP element |
|---|---|
| home, motion | `div.absolute.inset-0` (empty) — *and sometimes* `p.mkt-enter.mkt-d2` |
| home, reduced motion | `p.mkt-enter.mkt-d2 :: "DreamCRM is the patient-relationship platform…"` — **every run** |
| pricing (control) | `h1.mkt-enter.mkt-d1 :: "One plan…"` or its sibling `<p>` — always real copy |

That empty `div.absolute.inset-0` is `DaylightSky`'s film-grain layer
(`components/marketing/ui.tsx:467`) — `aria-hidden`, decorative, and an LCP
candidate because it carries a `background-image`. With the real copy held at
`opacity: 0` it can win. **On the motion path, the metric Google ranks this
page on is sometimes measuring a texture.** Under reduced motion it is the
sentence a visitor reads, every single run.

**The reduced-motion path is already the mobile path, and that is a finding
rather than a footnote.** `prefers-reduced-motion` turns off exactly one thing
a phone was ever going to run — the CSS entrance — because the stage was gated
off by the pointer test long before the media query got a say. A
reduced-motion visitor on a phone therefore gets the *faster* homepage, not a
degraded one.

**CLS is 0.000 everywhere.** The entrance animates `opacity` and
`transform` only, which is what Part 6 asks for, and it shows.

## What did NOT reproduce, and is therefore not reported as a fact

**Scroll blocking.** The scripted scroll (60 stepped `scrollBy` calls, one
awaited frame apart, top to bottom of a 17,603 px document) produced a median
of **0 ms** of blocking on all three surfaces — and, on passes taken while the
measuring machine was also running the vitest suite, values up to 1,894 ms on
the homepage against 0 ms on the control. That spread is machine contention,
not a property of the page, and a number that moves by 1.9 s between passes is
not a baseline.

It is written down rather than dropped because the *direction* was consistent
across every contended pass (home > home-reduced > control > 0), which is
either a real effect this rig is too noisy to see or an artefact of a 3× taller
document. **What would settle it:** a real mid-range device, or this script on
an otherwise idle machine, at `--runs 15`. Do that before anybody acts on a
scroll-performance theory.

Pass 1 of the six taken is excluded from the table above on the same grounds —
it reported 484–492 KB transfer and a 9,672 ms FCP, both outside every other
pass's range, under the same contention.

## Recommendations

1. **Do not fix this from here.** The entrance animation is brand motion, and
   `BRAND.md` Part 6 owns it. The change worth considering is narrow — let the
   hero's LCP element paint at full opacity and animate only its transform, or
   drop `.mkt-enter` from the single largest above-the-fold element — and it is
   a *brand-motion* decision on the marketing site's most-looked-at surface,
   not a performance patch to slip into an unrelated PR. It is Neon's lane and
   wants its own issue.
2. **Get a real-device number before the push.** Everything above is emulated
   CPU and emulated network on a developer machine. `--base` at production
   from a real mid-range Android is one afternoon and replaces every "should
   be comparable" caveat in this file. This is the mobile twin of
   `LOAD-SANITY.md`'s recommendation 3.
3. **Re-run after any change to the marketing hero, the entrance classes, the
   spine, or `next build`'s chunking, and compare the table.** The script
   prints the LCP element, so a regression that changes *what* the metric is
   about shows up as a different row rather than as a slightly worse number.
4. **If a budget is ever wanted, route the intake first.** See the note at the
   top. The candidate today is LCP rather than bytes, and the honest form of it
   would be *"the homepage's LCP element is text a visitor reads"* — a
   statement about the page, which this script can already check, rather than a
   millisecond threshold that would measure the runner.

## Related

- `docs/LOAD-SANITY.md` — the server half: which surface saturates first.
- `docs/RELEASE.md` Part 1 — performance/load, logged as "Never run".
- `BRAND.md` Part 6 — the motion rules and the cinematic spine's laws.
- `components/marketing/cinematic-spine.tsx` — `legal()`, the gate that keeps
  the stage off a phone.
