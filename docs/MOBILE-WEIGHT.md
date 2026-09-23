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

## Before — 2026-09-22, production (`www.dreamcreatestudio.com`)

**This is the BEFORE table.** The hero fix (DREAMCRM-108, #698, `66d087dc`)
deployed 2026-09-23 06:05Z and the after-numbers are in "After the hero fix"
below. Everything in this section is kept verbatim as the record the fix was
argued from — do not update it in place, because the whole value of a before
table is that it says what was true before.

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

## After the hero fix — 2026-09-23, production (`www.dreamcreatestudio.com`)

Same script, same profile, same base URL, same box. `.mkt-rise` deployed at
06:05Z (DREAMCRM-108, #698, `66d087dc`); measured 07:47–07:57Z. Median of 5
runs over **4 clean passes** (20 samples per surface); the bracket is the
spread across pass medians.

**Nine passes were taken and five are excluded**, on the criterion this file
already used once: a pass whose transfer bytes fall short of every other pass
was still pulling resources when the quiet window closed, so every number in
it is about the rig rather than about the page. The tell is unambiguous —
excluded passes read 463–523 KB on surfaces the clean passes read 571–573 KB
on, and carry 552–3,267 ms of scroll blocking against 0 ms.

| surface | transfer | script | FCP | LCP | CLS | load blocking |
|---|---|---|---|---|---|---|
| **home** | **572 KB** [571–573] | **212 KB** | 2,540ms [2,516–2,728] | **2,540ms** [2,516–2,728] | 0.000 | 171ms [151–196] |
| home, reduced motion | 571 KB [571–573] | 212 KB | 2,478ms [2,388–2,560] | **2,546ms** [2,424–2,844] | 0.000 / 0.013 | 114ms [66–164] |
| pricing (control) | 500 KB | 198 KB | 2,190ms [2,084–2,244] | 2,190ms [2,084–2,536] | **0.116** | 140ms [130–265] |

Against the before table, surface by surface:

| | before | after | |
|---|---|---|---|
| home LCP | 3,424ms | **2,540ms** | **−884ms, −26%** |
| home load blocking | 315ms | **171ms** | −144ms |
| home, reduced-motion LCP | 2,472ms | 2,546ms | +74ms (noise) |
| pricing LCP | 2,944ms | 2,190ms | −754ms |
| home transfer / script | 565 / 211 KB | 572 / 212 KB | +7 / +1 KB |

### The one number, answered

**The ~950 ms the homepage charged a phone for motion it cannot see is gone.**
Home LCP now reads 2,540 ms against 2,546 ms on the identical page under
`prefers-reduced-motion: reduce` — a 6 ms gap where the before table had
952 ms, which is to say the two paths are the same page now. Load blocking
closed the same way: 171 ms against the control's 140 ms, where it was 315 ms
against 190 ms.

**And the LCP element no longer flips.** This is the half that mattered more
than the number, and it is now clean on every one of 20 runs:

| path | LCP element, before | LCP element, after (20/20 runs) |
|---|---|---|
| home, motion | `div.absolute.inset-0` (the film grain) *or* the sentence | `p.mkt-rise.mkt-d2` :: *"DreamCRM is the patient-relationship platform…"* |
| home, reduced motion | the sentence, every run | `p.mkt-rise.mkt-d2` :: the same sentence |
| pricing (control) | `h1.mkt-enter.mkt-d1` or its sibling `<p>` | `h1.mkt-rise.mkt-d1` :: *"One plan. The whole platform."* |

The metric Google ranks the homepage on is now measuring the sentence a
visitor reads, on every run, on both paths. The mechanism and the measurement
agree in the same direction they did going in — `.mkt-rise` removed the
opacity ramp and the ~0.81 s of unpaintable text went with it.

**`/pricing` moved too, and it is no longer a pure control.** Say it plainly
rather than quoting a −754 ms improvement on a page nothing was supposed to
change: #698 applied `.mkt-rise` to `PageHero`, which is fifteen call sites
across eight subpages, so the control got the same fix. It remains a useful
control for BYTES and for ordinary per-request cost — it is still the
marketing page with no unusual work — and it is no longer a control for
entrance-motion LCP, because it now has the same entrance the homepage does.
A future entrance-motion question needs a surface `PageHero` does not touch.

**Bytes were never the story and still are not.** +7 KB transfer and +1 KB
script across a fix worth 884 ms. This is the finding from the before table
surviving its own fix: the living stage is not heavy, it was late, and four
lines of CSS were the whole of it.

**The stage is still off on a phone**, read off the DOM on all 20 runs:
`.is-cinematic` absent, the particle `<canvas>` at `display: none`,
`(hover: hover) and (pointer: fine)` false, document 19,068 px. `legal()`
holds.

### What the re-measure FOUND, which is a different thing from what it confirmed

**`/pricing` carries a 0.116 CLS that the before table recorded as 0.000, and
it is not a regression from #698.** Measured on production 2026-09-23,
because "the fix I shipped this morning broke layout stability" is exactly the
claim that needs to be wrong carefully rather than assumed wrong.

*What shifts.* One layout shift, at ~2.6 s, value **0.1157**, on a 412×823
viewport. The hero `<section>` grows from **293.25 px to 320.53 px** — a
**+27.28 px** step, which is one line of the sub paragraph at `1.05rem` on
`leading-relaxed` (16.8 × 1.625 = 27.3 px). The `<h1>` measures 76.69 px
before and after, so the headline is not what moved. Everything below the
hero — the first pricing panel,
`div.relative.overflow-hidden.rounded-[14px].border.bg-white` — drops 27.28 px
with it.

*Why it shifts.* It lands within ~30 ms of `document.fonts.ready` on every
run. Self-hosted Inter replaces the fallback face, the sub paragraph rewraps
from two lines to three, and the page below it moves down. Nothing to do with
motion: it reproduces identically under `prefers-reduced-motion: reduce`,
where `.mkt-rise` and `.mkt-enter` are both `animation: none`.

*Why it is not #698's.* Re-created the pre-#698 condition on the live page —
injected, before first paint, a stylesheet holding `.mkt-rise` at `opacity: 0`
through the same delay and duration `.mkt-enter` used — and ran the arms
interleaved, 8 single runs each:

| arm | hero reflows | CLS reported |
|---|---|---|
| as it ships now (`.mkt-rise`) | **8 / 8** | 0.1157 in 5 / 8 |
| forced back to an opacity ramp (pre-#698) | **8 / 8** | 0.1157 in 6 / 8 |
| sub paragraph given a 3-line `min-height` | **0 / 8** | 0.0073 in 4 / 8, 0.000 in 4 |

Holding the text transparent does not suppress the shift or its CLS. The
reflow predates the hero fix; #698 neither caused it nor hid it.

*So why did the before table read 0.000 across 25 samples?* Because **this
metric is timing-sensitive on this rig, and the before run was contended.** A
shift is only counted against content that has already painted — in the 8-run
control above, the three runs that reported 0.000 are exactly the three whose
FCP was ≥ 3,156 ms, where the font arrived before the text did and there was
nothing left to move. The before run's own notes record a contended machine
and a discarded pass with a 9,672 ms FCP. **"CLS 0.000" in the before table
was a property of the measurement, not of the page** — which is worth more
than this defect is, because it is the second time this rig's contention has
produced a number rather than a finding.

*The homepage has the same defect, rarely.* Home reads 0.000 on the motion
path across all 20 samples and 0.013 on two of four reduced-motion passes.
Probed: the same +28.08 px step, the hero CTA row (`div.mkt-enter.mkt-d3`)
dropping at `fonts.ready`, on a run where the font did not arrive until
6,999 ms. One defect, one mechanism, two surfaces — `/pricing` reliably
because eight `PageHero` subpages share the geometry, home rarely because its
hero usually paints late enough not to care.

**Not fixed here, and the reason is this file's own recommendation 1 rather
than a deferral.** The fix is typographic — reserve the sub paragraph's line
box so the swap cannot rewrap it, or give the fallback face metric overrides
so it wraps the way Inter does — and that is `BRAND.md` Part 4, on eight
subpages, wanting its own issue and its own before/after. Recorded in
`docs/RELEASE.md` Part 5 with this reproduction.

## Recommendations

Recommendation 1 below is **DONE** — it is kept rather than deleted because
the shape of it is the reusable part, and because the after table above only
means something next to the argument it was taken from.

1. ~~**Do not fix this from here.**~~ **DONE (DREAMCRM-108, #698,
   `66d087dc`, deployed 2026-09-23 06:05Z).** It went exactly the way this
   line asked: its own issue, in Neon's lane, as a brand-motion decision under
   `BRAND.md` Part 6 rather than a performance patch in an unrelated PR — and
   it took the narrower of the two options named here, animating only the
   transform on the two LCP candidates and leaving the rest of the hero
   stagger alone. Worth **−884 ms of home LCP**; see "After the hero fix".
2. **Get a real-device number before the push.** Unchanged and still open.
   Everything in both tables is emulated CPU and emulated network on a
   developer machine. `--base` at production from a real mid-range Android is
   one afternoon and replaces every "should be comparable" caveat in this
   file. This is the mobile twin of `LOAD-SANITY.md`'s recommendation 3, and
   the fix landing does not weaken it: what a real device would settle is the
   SIZE of a win whose direction is now measured twice.
3. **Re-run after any change to the marketing hero, the entrance classes, the
   spine, or `next build`'s chunking, and compare the table.** The script
   prints the LCP element, so a regression that changes *what* the metric is
   about shows up as a different row rather than as a slightly worse number.
   This one has now paid for itself once: the LCP-element row is how the fix
   was verified as a fix rather than as 884 fewer milliseconds of something
   else.

   **It now prints the worst layout shift the same way**, added on
   DREAMCRM-118 for the same reason and after a throwaway probe had to be
   written to learn what a 0.116 was about. Per surface it reports the moved
   element, the pixels, the millisecond and **how many runs saw it** — that
   last one because a shift is only counted against content that already
   painted, so the run count is what separates "the page is fine" from "the
   rig was slow". It reproduces the font-swap reflow below unprompted:

   ```
   pricing (control): worst layout shift 0.1157 at 5,817ms (3/3 runs)
     div.relative.overflow-hidden.rounded-[14px].border moved 27.28px
   home (reduced motion): worst layout shift 0.0131 at 8,307ms (3/3 runs)
     div.mkt-enter.mkt-d3.mt-9.flex moved 28.08px
   ```
4. **Run it on an otherwise idle box, and discard passes by transfer bytes.**
   New, and it is the lesson of this file's second run rather than a tidiness
   note. Five of nine passes here were contended, and contention does not just
   add noise — it silently *removes* a finding: a slow first paint means the
   font lands before the text does, which is why the before table reported
   CLS 0.000 on a page that reliably shifts 0.116. The discard criterion is
   transfer bytes falling short of every other pass, because that one is
   unambiguous and does not require deciding in advance which metric you
   distrust.
5. **The budget, now that there are after-numbers to argue it from.** The note
   at the top still holds — a budget is a new blocking assertion and routes to
   Forge intake before implementation, which it now has (DREAMCRM-118 →
   DREAMCRM-114, 2026-09-23). The proposal's shape follows this file's own
   recommendation: the load-bearing assertion is *"the homepage's LCP element
   is text a visitor reads"*, a statement about the page that this script
   already checks, with millisecond and kilobyte ceilings as the weaker
   companions rather than the headline — a threshold in milliseconds measures
   the runner, and the runner is not the thing under test.

## Related

- `docs/LOAD-SANITY.md` — the server half: which surface saturates first.
- `docs/RELEASE.md` Part 1 — performance/load, logged as "Never run".
- `BRAND.md` Part 6 — the motion rules and the cinematic spine's laws;
  Part 4 owns the type metrics behind the font-swap reflow above.
- `docs/RELEASE.md` Part 5 — "Deliverable 3b", reconciled against this run,
  and the `PageHero` font-swap reflow entry this run found.
- `components/marketing/cinematic-spine.tsx` — `legal()`, the gate that keeps
  the stage off a phone.
