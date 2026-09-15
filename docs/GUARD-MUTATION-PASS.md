# The guard mutation pass (DREAMCRM-50, 2026-09-14)

A one-time mutation pass over the **existing** guard suite. For each guard:
reintroduce the defect it protects against, **in its real shape**, confirm the
guard goes red, revert. Fix or delete the ones that stay green.

## Why it happened

Three reviews in a row ended on a guard that could not fail:

- **#557 case 3** — a `^`-anchored regex with no `m` flag.
- **#559** — a rule blind to one source site rendered N times.
- **#563** — a sweep narrower than the defect's real spelling.

Every one was green the whole time its defect was live. DREAMCRM-35 covers
*new* guards; nothing had ever audited the stock. This is that audit.

## The headline

**42 mutations across 31 guards. Seven guards were blind**, between them
missing 12 distinct real-shaped defects. Widening them found **14 live
defects** in the product that no guard had ever been able to see.

The pattern in the misses is worth more than the count. Not one of the seven
was blind to the defect it was written for — every guard caught its canonical
shape. They were blind to the *same defect written the way this codebase
actually writes it*: through `cn()`, after a `_` separator, with a trailing
comment, in a directory the scope note claimed to cover but the path list did
not.

> A guard is not tested by the shape its author had in mind. It is tested by
> the shape the next author will write.

## What was fixed

### Blindness with a consequence (#574)

| Guard | Defect that stayed GREEN | Why it mattered |
|---|---|---|
| `server-only-services` | `// import 'server-only'`, and the banner named only in a header comment | The check ran against raw source, so a commented-out banner read as protection. That is the difference between a client import being a build error and database code shipping to a browser. |
| `no-native-dialogs` | bare `confirm('…')` | Caught bare `alert(` and `window.confirm(` but not bare `confirm(` — an asymmetry, not a decision. |

The `no-native-dialogs` widening is the cautionary half: matching the bare name
alone reported **all 42 correct uses** in the repo, because the sanctioned
replacement is bound as `const confirm = useConfirm()`. The two are told apart
by their argument — the native dialog takes a string, the hook takes an options
object. Both rules now carry a self-test pinning **both** directions.

### Scope and spelling (#580)

| Guard | Defect that stayed GREEN | Found live |
|---|---|---|
| `legibility-floor` | `text-[10px]` in `components/` outside `components/ui`; `text-[11.5px]` | sub-12px text in 9 files |
| `retired-tones` | `theme(colors.sky.500/40%)`; `sky-*` outside `components/ui` | `bg-sky-500` in the welcome modal every new clinic sees |
| `portal-tokens` | a raw meaning-hex on a token landing page | the pay, confirm and survey pages painting `#B4231F` and `#6B635A` raw |

Both `components/ui` scopes were written when the doc comment said "shared UI
components", and the two drifted apart silently: 31 dashboard component files
— `search-modal.tsx`, `dropdown-notifications.tsx`, the tags / onboarding /
demo trees — were chrome staff read all day and outside every sweep.

`legibility-floor`'s size floors were regex branches enumerating the literals
present when they were written. They are now parsed and compared numerically,
which cannot drift from the rule the way a list of spellings does.

### Regex shape (#583)

| Guard | Defect that stayed GREEN | Found live |
|---|---|---|
| `kpi-numerals` | `className={cn('text-3xl tabular-nums', …)}`; any class list over 400 chars | none — the rule is honest now, not newly strict |
| `site-tokens` | trailing `//` comment; double quotes; the conditional shape | `numbered-steps.tsx` re-declaring `--c-bg` |

`kpi-numerals` now reads the attribute through `ownAttrs` in
`tests/design-system/jsx-attrs.ts` — the brace- and quote-balanced tag reader
the other design-system guards already share — instead of its own
`className=` regex. `site-tokens` derives its banned names from
`components/clinic-site/tokens.ts` rather than copying them, and reports every
offending line rather than the first.

## Traps worth carrying forward

The first two cost a draft of a fix in this pass, and both will bite the next
rule:

- **`\b` is not a token boundary when your tokens contain hyphens.** A hyphen
  is a non-word character, so `\b` after `surface` matches *inside*
  `--c-surface-alt`. Use `(?![\w-])`.
- **`\b` also fails where Tailwind puts a `_`.** An arbitrary value spells
  spaces as `_`, which *is* a word character, so `\btheme\(` never matches
  `1px_theme(`.

Two more, added by the axe-baseline ratchet's own mutation pass (#588,
DREAMCRM-60). Both are the same family as the two above — an identity check
that is loose in a direction nobody pictured — in a third and fourth spelling:

- **A PREFIX IS NOT A NAME. If a guard identifies anything by substring,
  `<MARKER>_V2` is the mutation to try.** The ratchet found its marker with
  `indexOf`, so renaming `A11Y_BASELINE` to `A11Y_BASELINE_V2` and aliasing the
  old name left every assertion green while the parser happily read the *old*
  literal — a red run that came back GREEN and changed the code. Fixed with a
  `(?![\w$])` lookahead and pinned by a unit test. `\b` would not have saved it
  either: `_` is a word character, so `\bA11Y_BASELINE\b` matches the V2 name
  too. This is the one to reach for whenever a guard says `includes(`,
  `indexOf(`, or `startsWith(` on an identifier.
- **Assert the ANSWER, not a proxy for it.** The ratchet's "a raise cannot merge
  unseen" test first checked that the gate's source *mentioned*
  `e2e/axe-baseline-raises.ts`. Deleting the pattern from `GATE_RULES` left that
  test green — the filename survived in a `why` string and a comment. Calling
  `gateFindings(['e2e/axe-baseline-raises.ts'])` and asserting on the result
  fails correctly, because it asks the classifier the question the guard is
  really about. Grep the implementation only when you cannot run it; a guard
  that greps a module it could have imported is testing the file, not the rule.

## Guards verified honest

The other 24 went red on their real defect, first try, with no change needed:

`css-var-definitions` · `form-labels` · `portal-brand` · `dark-mode-parity` ·
`token-contrast` rules 2/3/4 · `design-system/tokens` · `encodings` ·
`pending-feedback` · `shared-pending` · `clickable-rows` · `one-mrr-number` ·
`cron-auth-shared` · `timestamp-aggregate-mapping` · `read-check-catalog` ·
`read-only-role-revokes` · `review-gate` · `e2e-flaky-summary` ·
`e2e-doc-axe-count` · `e2e-past-visit-window` · `e2e-seed-scopes` · and **all
six `tests/tenant-scoping/` guards**.

Tenant scoping being clean across the board is the single most reassuring
result in the pass.

`e2e-doc-axe-count` deserves a note: it is narrow **by design** — it grades
only the exact prose shape that drifted (`<N>, all \`color-contrast\``) and
says so in its header. A mutation in any other shape passes, correctly. Narrow
is not the same as blind when the narrowness is written down.

## Out of scope, deliberately

The component unit tests in `tests/design-system/` that render a primitive and
assert on it (`primitives`, `nav-shell`, `keyboard-shortcuts`, `quick-create`,
`toggle`, `demo-chrome`, `drawer-transitions`, `dropdown-profile`,
`editor-kit-field`, `encoding-legend`, `focal-point-picker`, `glyph-cluster`)
are ordinary tests over fixtures, not source-scanning rules holding the tree at
zero. They fail when their component changes, which is the whole mechanism;
there is no "scope" or "spelling" for them to be blind to.

## Known, not fixed here

`app/r/[token]/review-form.tsx` re-declares the clinic-site surface tokens
locally (`const INK_MUTED = 'var(--c-ink-muted, #6B635A)'`), which
`tests/a11y/site-tokens.test.ts` bans — but that guard's scope is `app/site` +
`components/clinic-site`, so the token landing page sits outside it. The same
page is exempted from `portal-tokens` for the mirror reason: it paints the
clinic-site palette, whose `--c-ink-muted` fallback happens to be the hex
`PORTAL_MUTED` owns.

Widening `site-tokens` to cover the token landing pages is the obvious next
move and was left out of this pass rather than done in passing. Whoever picks
it up: the reproduction is one line above, and the exemption in
`portal-tokens.test.ts` re-checks its own reason, so it will fail rather than
hide if that page moves onto the portal palette.

## How to re-run this

There is no committed harness, on purpose — a framework for a one-time pass is
more to maintain than it is worth, and every mutation above is written out
precisely enough to re-apply by hand. The loop is:

1. Pick the guard. Read its doc comment for the defect it claims to catch.
2. Find the defect's **real** shape — `git log -S` the commit that introduced
   the guard and read the lines it removed. Do not invent a stand-in; a
   simplified defect only proves the guard can see the simplified version.
3. Reintroduce it, run **only** that guard, and watch it fail naming the site
   you broke. Revert.
4. Then do it again in a shape a real developer would plausibly write: through
   `cn()`, in a sibling directory, with a conditional, in the other quote
   style. **This is the step that finds things.** Every one of the seven
   blind guards passed step 3.

If a widening reports dozens of hits, suspect the widening before the tree.
That happened twice here, and both times the guard was wrong.
