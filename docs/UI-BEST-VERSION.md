# UI Best-Version Program — the standing backlog

Owner directive (2026-08-19): *"look through the UI, piece by piece, component
by component, page by page, and ask: what is this now, and what's the best
version of this that there could be?"* — keeping it logical (no mega-menus on
a clinic sidebar). Presentation/interaction only; the feature freeze holds.

Method: three scouts walked the surface clusters against DESIGN-SYSTEM.md v3
and the "employee, not the tool" doctrine. Their ranked findings live here;
each work batch takes the top of the list, ships it behind the full gate, and
checks items off. New findings append; done items get ~~struck~~ with the
batch number.

**System-level finds:**
- `--color-brand-600`/`--color-brand-50` are referenced but DEFINED NOWHERE —
  every `var(--color-brand-600, sky.600)` call site silently renders sky.
  (Approve button fixed in batch 10; `proposal-artifacts.tsx` renderings left
  as facsimiles.)
- ~35 sites still hand-roll `{pending ? 'Sending…' : 'Send'}` ternaries
  instead of `ActionButton pending=`; SIX modals put the shared pending on
  their **Cancel** button, turning the escape hatch into a second spinner.

---

## Cluster 1 — Daily (Overview · My Day · Follow-ups · Leads)

### Overview (`app/(default)/dashboard/`)
Already best-version: TodayChairRow, MorningReveal, ring+text pairing, GrantsStrip zero state.
1. [BATCH 10] Approve button → ActionButton primary + pending (approval-inbox.tsx:1155); Edit-first → ghost.
2. [BATCH 10] AttentionCard headline number → the link its subtitle promises (clinic-overview.tsx:849; recipe kpi-stat.tsx:107).
3. [BATCH 10] Dead preview rows → deep links: Unconfirmed (:472), Unmarked (:502) → `?appt=`; New inquiries (:571), Follow-ups due (:613) → their filtered lists.
4. ~~Proposal + standup cards on the retired etched recipe~~ [BATCH 15: .v2-card].
5. ~~Machine-handled sky pill~~ [BATCH 15: violet info tone on card + rail; the icon well drops its phantom brand-50 token too].
6. ~~Morning skeleton wrong shape~~ [BATCH 15: sign-here card + 4-card grid + 5 KPIs + feed].
7. ~~Feed rows hover where they can't click~~ [BATCH 15: hover gated on href]; MorningReveal on the feed left open (motion budget judgment).
8. ~~Raw inputs/selects in the inbox~~ [BATCH 29: form-input/form-textarea/form-select — the sky focus rings are gone].
9. ~~Three amber notice dialects stacked~~ [BATCH 29: readiness banner, site-health banner and guardian note all on the standard warn recipe bg-amber-500/10 + ring-inset].
10. ~~Sign-here stack keyboard path~~ [BATCH 29: →/n next, ←/p previous; guarded against typing targets and view-all].
11. Two of five trend tiles have no spark/delta (:719, :726). DEFERRED — those metrics have no per-day history series in getOverview; same reason class as the heartbeat deferrals (data-path work, not UI polish).
12. ~~ComingSoonCard permanent dead chrome~~ [BATCH 29: component deleted; a one-line texting footnote inside the Reviews card, gated on !smsLive].

### My Day
Already best-version: ClosedHeartbeat, undo-toast on tick-off.
1. [BATCH 10] loading.tsx max-w-6xl vs page max-w-[96rem] — guaranteed reflow (my-day/loading.tsx:11).
2. ~~Tick-off circle not disabled during transition~~ [BATCH 30: verified covered — the shared TickButton (batch 16) always disables while pending].
3. ~~Prep flags bare amber text~~ [BATCH 15: StatusPill warn].
4. ~~Raw 🪑/🚪 emoji, no legend~~ [BATCH 30: the agenda's own labeled StatusPill recipe (🪑 Seated ok / 🚪 Arrived info) — self-explaining, and the two surfaces can't drift].
5. ~~Unread badge hand-rolled~~ [BATCH 15: StatusPill warn + hover meaning].
6. ~~"Claim" raw chip~~ [BATCH 15: ActionButton secondary sm + pending].
7. ~~7 KPI tiles orphan~~ [BATCH 30: grid goes 4-up on lg when the conditional proposals tile joins — 4+3, no lone orphan].
8. ~~No primary action~~ [BATCH 30: "All my follow-ups" is the header primary].
9. digest-toggle: ~~no pending acknowledgment~~ [BATCH 15]; the orphaned placement stays (a deliberate quiet footnote).
10. ~~Sparkline compat import~~ [BATCH 30: MiniTrend everywhere — the compat wrapper itself is retired (kpi-stat + intake heartbeat swapped too, sparkline.tsx deleted)].

### Follow-ups board
Already best-version: due-state grouping, optimistic complete with honest revert.
1. [BATCH 10] No PendingVeil on filter nav (followups-board.tsx:79).
2. [BATCH 10] One useTransition freezes rows during nav — split navPending/rowPending (:77,:226,:279,:309).
3. ~~Settings card between filters and the work~~ [BATCH 30: collapsed one-line summary ("N of M on · morning digest on/off") + chevron disclosure; body stays mounted while hidden (settings-tabs law)].
4. ~~No tailored loading.tsx~~ [BATCH 16: chip row + rules line + grouped tick rows].
5. ~~Empty states hand over no action~~ [BATCH 30: the unfiltered caught-up state hands over Open patients; filtered already had Clear filters].
6. ~~"N due now" in the primary slot~~ [BATCH 16: StatusPill warn in the legend zone].
7. ~~Tick circle drifted~~ [BATCH 16: components/ui/tick-button.tsx, both boards adopted].
8. ~~Bordered select on every row~~ [BATCH 30: transparent until hover/focus — the assignee reads as quiet text, the control chrome appears when reached for].
9. ~~Heartbeat gone on tablets~~ [BATCH 16: label always shows; the spark stays desktop].
10. ~~Sparkline → MiniTrend~~ [BATCH 30].

### Leads
Already best-version: tone/ball-in-court mapping, ageTitle, per-status empty copy, drawer action ladder, dedupe confirm.
1. [BATCH 10] Archive sub-panel escapes the drawer — add `relative` (lead-drawer.tsx:196).
2. [BATCH 10] Rows mouse-only — role/tabIndex/Enter (leads-view.tsx:341).
3. [BATCH 10] Hand-rolled search → SearchInput (leads-view.tsx:249).
4. [BATCH 10] Discarded pending flag → PendingVeil (:106,:173).
5. ~~Empty states actionless~~ [BATCH 16: Share-your-website / Clear-filters handed over].
6. ~~Drawer timeline uses browser-local time~~ [BATCH 30: formatClinicDayTime with the clinic tz plumbed page → view → drawer].
7. ~~leads/loading.tsx wrong shape~~ [BATCH 30: chip row + select-all line + left-bordered card stack].
8. ~~Select-all orphaned~~ [BATCH 16: a label-clickable list header].
9. ~~Two styles for the archive exits~~ [BATCH 16: both ghost ActionButtons].
10. ~~Spark desktop-only + compat import~~ [BATCH 30: MiniTrend; the container was already hidden lg:flex].

---

## Cluster 2 — Records + Comms (Patients · Appointments · Messages · Inbox · Intake)

### Patients list
1. ~~Sort headers unfocusable, no aria-sort, arrow shifts width~~ [BATCH 11: SortableTh — real buttons, aria-sort, fixed arrow slot].
2. ~~Row dead outside the name cell~~ [BATCH 19: whole-row mouse nav (cursor-pointer, own controls excluded, rides the PendingVeil transition); the name Link stays the keyboard/AT path].
3. ~~Search needs Enter but never says so~~ [BATCH 19: SearchInput grows an opt-in `enterHint` ↵ kbd — shown only while typed text awaits submit; Messages' live search unaffected].
4. ~~Two raw selects amid FilterChips~~ [BATCH 19: the picker stays a select (long enumerations), but an ACTIVE source/tag presents as the shared active FilterChip with one-click clear].
5. Bulk bar: ~~Invite/Pay-link ternaries~~ [BATCH 11: pending prop]; the "Tagging…" placeholder-select spinner DEFERRED — a select is the honest control for a long tag enumeration, and its first-option pending label is visible feedback; a popover menu would re-implement the same list for chrome.
6. ~~No sticky thead~~ [BATCH 11].
7. ~~Heartbeat hidden lg:flex~~ [BATCH 19: label survives from sm up; the spark stays desktop — the followups precedent].
8. ~~saved-views-bar re-implements FilterChip~~ [BATCH 19: All-patients + view chips ride FilterChip href-mode; the action pills (+ Save view / Follow-up all / Send a campaign) stay deliberate — chips filter, they never act].
9. ~~Saved-view delete hover-only, no confirm~~ [BATCH 16: always visible at reduced contrast + useConfirm].
10. ~~window.prompt() for audience naming~~ [BATCH 16: the inline-naming recipe, Enter/Esc].
11. ~~text-gray-400 on meaningful labels~~ [BATCH 16: gray-500 floor].

### Patient detail
1. ~~Six same-weight header actions~~ [BATCH 18: Send message · Book · Edit + ONE More ▾ menu (intake/review/view-as) on the shared dismiss contract].
2. ~~Vanishing feedback spans~~ [BATCH 12: Send-intake/review/portal-invite report through the global toast; the pay-link nudge keeps its persistent inline confirmation by design].
3. ~~Timeline filter is component-local~~ [BATCH 18: ?tab= via history.replaceState — refresh/share lands on the same slice].
4. ~~Timeline empty state actionless~~ [BATCH 18: per-tab action — book / send message / send intake].
5. ~~Needs-attention hand-rolled box~~ [BATCH 18: v2-card + StatusPill warn/ok header].
6. ~~Amber-emoji aging encoding not in any legend~~ [BATCH 18: agingBorderClass left border on the li; icon tint dropped].
7. Raw back link where TrailBack exists (:205). DEFERRED: TrailBack is trail-context/header-slot-bound (the form-builder lesson) — the plain link is the honest fit here.
8. ~~Header stat strip has no heartbeat~~ [BATCH 18: Visit-rhythm MiniTrend bar — completed visits/quarter, trailing 2y, derived from the timeline already in hand].
9. ~~Timeline unbounded~~ [BATCH 18: 40-row pages + "Show older (N more)"].
10. ~~Note bodies at text-xs~~ [BATCH 18: text-sm; empty prose de-italicized]. EmptyState adoption in the rail DEFERRED: the py-12 well is sized for main-column lists — inside a 240px rail card it would be mostly chrome.
11. ~~Note delete bare × no confirm; doc upload no progress~~ [BATCH 18: useConfirm + 24px icon target; a live in-progress row with spinner + filename during upload].

### Patients modals
1. ~~merge-duplicate unsafe shell~~ [BATCH 12: role=dialog + aria-modal + focus trap + Esc; scrim-click deliberately does NOT dismiss an irreversible flow].
2. ~~Import wizard has no step indicator~~ [BATCH 20: StepRail — Upload → Match columns → Done; current ringed teal, finished ticked emerald, aria-current=step].
3. ~~Import file picker raw input~~ [BATCH 20: dashed drop well — click to browse or drop the CSV; filename + size echo back; non-CSV drops refused with a plain sentence].
4. ~~Edit modal: 14 fields, no section headings~~ [BATCH 20: Contact / Address / Insurance / Care preferences / Family access headings; the ✕ landed in batch 17].
5. ~~Bulk message: no recipient visibility; ternary send~~ [BATCH 20: "To: first three names +N more" with a full-list disclosure; Send rides the pending prop].
6. ~~Add-patient doesn't autofocus~~ [BATCH 17].
7. ~~Import close is text ×~~ [BATCH 17: the standard icon button; Edit modal gains a ✕ too].
8. ~~SIX modals spin their Cancel~~ [BATCH 11: disabled, never pending, on every onClose].

### Agenda
Already best-version: emptyCopy() engine.
1. ~~Row is li onClick — mouse-only drawer~~ [BATCH 11: role=button + Enter/Space + aria-label].
2. ~~Nine chips + two selects + search in one unlabeled row~~ [BATCH 22: When:/Show: group labels + a hairline divider before the pickers; search gains the enterHint ↵].
3. ~~Bulk bar ternaries~~ [BATCH 17: activeBulk key — only the pressed bulk button spins].
4. ~~Right cluster shrink-0 squeezes patient name~~ [BATCH 22: the pill cluster wraps onto a second row (max 45% width) instead of crushing the name].
5. ~~Sticky day header top-0 tucks under chrome~~ [BATCH 11: top-16].
6. ~~Bulk composer no dismiss contract~~ [BATCH 17: usePopoverDismiss on the trigger+panel wrapper].

### Appointment drawer + booking
1. ~~One useTransition spins five buttons at once~~ [BATCH 12: activeAction keys — only the clicked button spins, the rest disable].
2. ~~No sticky footer action row~~ [BATCH 31: the one-primary ladder moved to a sticky bottom footer (the shared Drawer's slot recipe); in-office + destructive rows stay in-flow — destructive never sits beside the primary].
3. ~~Reschedule always opens tomorrow 09:00~~ [BATCH 12: seeds from the visit's own local date+time; past visits fall back].
4. ~~In-office undo micro-text~~ [BATCH 17: gray-500 floor + underline].
5. ~~Patient replies at text-xs~~ [BATCH 17: reply bodies at text-sm full ink; metadata stays xs].
6. ~~Slot grid collapses to text while loading~~ [BATCH 17: six skeleton chips in the grid's shape].
7. ~~Walk-in defaults 09:00~~ [BATCH 12: now, rounded up to the next quarter hour].
8. Fast-pass: ~~Remove no confirm + sub-floor contrast~~ [BATCH 17]; the collapsed-by-default summary stays (a deliberate quiet panel).

### Messages (list + detail)
Already best-version: the message stream + receipts; per-row optimistic nav.
1. ~~No keyboard nav while /inbox has j/k~~ [BATCH 21: j/k walks the list (skips while typing; rides the same optimistic nav + veil)].
2. ~~Metadata at text-gray-400: timestamp, You:, assignee~~ [BATCH 11: gray-500 floor]; read preview weight kept (unread bolding is the signal).
3. ~~Urgency badge hand-rolled rose~~ [BATCH 11: StatusPill tone=urgent].
4. ~~14px checkboxes on a batch surface~~ [BATCH 21: 16px].
5. ~~Snooze popover: no Esc/outside-click~~ [BATCH 14: usePopoverDismiss on the wrapper — verified wired].
6. ~~Empty states actionless~~ [BATCH 21: Clear filters / Message-a-patient-from-their-chart handed over on both panes].
7. ~~Composer rows=2 no auto-grow~~ [BATCH 11: grows to 280px, collapses on send].
8. ~~Send mislabels during unrelated actions~~ [BATCH 11: dedicated sending flag + pending prop].
9. ~~Header stacks six blocks before the stream~~ [BATCH 22: tags + quick-follow-up fold behind one named disclosure ("Tags (N) & follow-up"); controls stay MOUNTED while collapsed (tabs law) so a half-typed follow-up survives].
10. ~~Four popovers, zero Esc~~ [BATCH 14: assign/snooze/templates/schedule all on usePopoverDismiss — verified wired].
11. ~~Schedule confirm raw violet button~~ [BATCH 21: ActionButton secondary + pending; Cancel goes ghost — violet stays a tone, never a button skin].
12. ~~Attachment remove opacity-0 hover-only~~ [BATCH 21: always visible at opacity-80 (touch had no way in)].
13. ~~Receipts/footnotes at text-gray-400~~ [BATCH 21: gray-500 floor; the activity-marker lines stay deliberately quiet per the markers law].

### Inbox
1. ~~Generic skeleton~~ [BATCH 23: inbox-shaped loading.tsx — list pane beside reading pane]. Moving sync+classify off first paint DEFERRED: a behavior change to the mailbox data path, not presentation — post-1.0 candidate.
2. ~~Arbitrary px type in reading pane~~ [BATCH 23: text-[20px]/[13px]/[12px]/[14px] + 15px icons onto the standard scale].
3. ~~Raw surface colors~~ [BATCH 23: sidebar → surface-1 token, reading pane → canvas token; the two translucent backdrop-blur strips keep alpha whites by necessity].
4. ~~FilterChips hand-rolls FilterChip~~ [BATCH 23: view toggles ride the shared FilterChip href mode; intent chips keep their tone colors on purpose].
5. ~~BulkActionBar: no toasts~~ [BATCH 31: every bulk act toasts its count ('3 conversations archived'), failures toast urgent. The header swap stays — selection swapping the toolbar is the Gmail grammar].
6. ~~Trash/Archive: no feedback~~ [BATCH 23: global toast ('Conversation archived' / 'Moved to trash'). No confirm on purpose — both are reversible, Gmail grammar].
7. ~~Unread emerald vs amber contract conflict~~ [BATCH 23: unread dot + count pill go amber; the emerald patient-link chip stays (identity, not unread)].
8. ~~Hover-revealed checkboxes; lowercase refresh~~ [BATCH 23: checkboxes always visible at half strength (touch has no hover); Refresh/Syncing… cased; the empty state was already EmptyState and now hands over Clear filters].
9. ~~ToolbarButton re-implements primary~~ [BATCH 23: the dead primary variant removed — Reply (ActionButton) is the pane's one primary by construction].

### Intake forms + builder
Already best-version: CompletedHeartbeat.
1. ~~Fill URL un-copyable gray mono~~ [BATCH 11: the new shared CopyChip primitive].
2. ~~"No submissions yet" dimmed below floor~~ [BATCH 11].
3. ~~Three equal row buttons~~ [BATCH 26: Edit leads at secondary weight; Preview/Kiosk demote to ghost].
4. Packets: ~~uncopyable URLs + dim empty state~~ [BATCH 11: CopyChip + contrast]; ~~raw rose Delete~~ [BATCH 26: quiet-until-hover rose, the audiences recipe — the confirm was already there].
5. ~~Silent 50-cap~~ [BATCH 26: honest footer line pointing at each form's full history]. Filters DEFERRED: the index is a glance surface; per-form pages carry the full lists.
6. ~~Builder reorder = 10px ▲▼ text glyphs~~ [BATCH 14: 28px grid targets — verified wired].
7. ~~Archive adjacent to Save~~ [BATCH 14: moved to a quiet footer above the bar — verified wired].
8. ~~Remove-section no confirm~~ [BATCH 14: confirms with the question count; empty sections skip the dialog — verified wired].
9. ~~No dirty-state indicator~~ [BATCH 26: the save bar says "Unsaved changes" (amber) whenever state differs from the last-saved shape; baseline resets on save].
10. Preview hidden under lg. DEFERRED: the builder is a desk task — a stacked live preview on phones would double the scroll for a surface nobody edits there.
11. ~~Add-field native details dump~~ — already a labeled button GRID behind a styled disclosure (scout stale); category grouping adds little at ten types.
12. Raw back link where TrailBack exists. DEFERRED: TrailBack is trail-context/header-slot-bound (the form-builder lesson) — the plain link is the honest fit.

---

## Cluster 3 — Portal + Hubs + Settings

### Portal chrome & shell
1. ~~Runtime Google-Fonts fetch for Fraunces~~ [BATCH 32: self-hosted variable woff2 (latin + latin-ext) in public/fonts on the Nunito pattern, preloaded — the third-party round trip and the Georgia flash are gone].
2. ~~portal loading.tsx cool-gray shimmer~~ [BATCH 32: warm sand-tone shimmer blocks on the portal's own cream palette].
3. ~~Header "Book a visit" self-link~~ [BATCH 32: on /patient/book the pill goes quiet-outline + aria-current instead of a primary that reloads the page you're on].

### Patient dashboard
1. ~~Two hand-rolled amber strips~~ [BATCH 32: both task strips ride PortalNotice warn; the one-off #EBDCB8 border retired].
2. ~~Balance amount buried mid-sentence~~ [BATCH 32: "$42.50 balance" leads in bold — the fact the patient came for doesn't hide].
3. ~~Verbs grid no pressed state~~ [BATCH 32: active:scale-[0.98] press feedback].
4. ~~"See all visits" gated on >3~~ [BATCH 32: shows whenever any visit is upcoming — the page also holds history].

### Appointments (portal)
1. ~~Past-visit rows not tappable~~ [BATCH 32: every row links to its visit page, with a › affordance + warm hover].
2. ~~Past list uncapped~~ [BATCH 32: latest 10 + "Show older visits (N more)" via ?all=1].
3. ~~Empty Past silently omitted~~ [BATCH 32: one quiet "No past visits with us yet" line].

### Visit detail — mostly already best-version.
1. ~~Pending-forms callout re-implements PortalNotice~~ [BATCH 32: rides the primitive].
2. ~~Bring-list emoji bullets~~ [BATCH 32: quieted to 0.85rem at 60% — markers, not headlines].

### Book / Request / Slot picker
1. ~~Slot buttons under the tap floor~~ [BATCH 33: py-3 on slot buttons + taken chips — 44px on the most-tapped control].
2. ~~Three files re-declare INK/MUTED/BORDER~~ [BATCH 33: all three import PORTAL_* aliased — one home for the palette].
3. ~~Submit buttons bypass BrandButton~~ [BATCH 33: book + request submits and the See-my-visits CTA ride BrandButton (tap feedback, disabled states); the .ics download stays a plain anchor by necessity].
4. ~~request-form lost sibling a11y~~ [BATCH 33: who-for + reason chips get role=group + aria-pressed; the error announces (role=alert); free-text fields ride PortalInput/PortalTextarea with real focus rings].
5. ~~"No openings" no next step~~ [BATCH 33: when the clinic has a phone, the empty state offers "Call us at (555)… and we'll find you something"].

### Billing / invoices
1. ~~pay-form primitive-starved~~ [BATCH 33: PORTAL_* tokens, BrandButton, role=alert on the error, focus-within ring on the amount pill].
2. ~~Post-Stripe success banner hand-rolled~~ [BATCH 33: PortalNotice success inside role=status].
3. ~~billing-history tabs 28px, ARIA half-wired~~ [BATCH 33: 40px min-height pills; tabs gain ids + aria-controls and the list is the labelled tabpanel].
4. plan-offer.tsx already best-version.

### Records
1. ~~Off-palette #B4452F error hex~~ [BATCH 33: PortalErrorText (palette ink + role=alert)].
2. ~~Success state hand-rolled, no live region~~ [BATCH 33: PortalNotice success inside role=status].
3. ~~"Not on file" dimmed below palette~~ [BATCH 33: PORTAL_MUTED].

### Portal messages
1. ~~Send feedback tiny, unannounced, self-clears~~ [BATCH 34: 0.85rem, role=status/alert, persists until the next action — no more 5s vanish].
2. ~~Composer vs tab bar on short phones~~ [BATCH 34: one line at rest, auto-grows with content to ~5 lines, collapses after send].
3. ~~Attachment remove 20px target~~ [BATCH 34: 24px].
4. ~~📎 emoji icon~~ [BATCH 34: new 'clip' stroke in the PortalIcon set].

### Profile
1. ~~No focus ring on 11 fields~~ [BATCH 34: every field rides PortalInput (real focus-visible ring); size overrides via inline style so utility conflicts can't regress it]. [was WCAG-level]
2. ~~Save confirmation vanishing whisper~~ [BATCH 34: role=status, persists until the next edit/submit].
3. ~~Sign out no pending state~~ [BATCH 34: 'Signing out…' + disabled].
4. ~~Opt-in toggle reverts silently~~ [BATCH 34: the revert now says so (role=alert line)].

### Family
1. ~~"Book for {name}" ~32px~~ [BATCH 34: BrandButton small — tap feedback + honest size].
2. ~~No-dependents state hides FamilyLinkRequest~~ [BATCH 34: the self-serve link-request card renders under the explainer — the exact flow the empty state describes].
3. ~~"· 8" age without unit~~ [BATCH 34: "· age 8"].

### Intake (portal)
1. ~~"Fill it out" ~32px pill~~ [BATCH 34: BrandButton small].
2. ~~Raw #7BA37E green~~ [BATCH 34: PORTAL_SUCCESS_INK].
3. ~~Empty to-fill state bare~~ [BATCH 34: PortalEmptyState + See-your-visits next step].

### Portal primitives + shared cards
1. ~~NPS row 36px circles + hover:scale on touch~~ [BATCH 35: 44px circles, active:scale press feedback (hover doesn't exist on the phone this renders on)].
2. ~~VisitCard Confirm no "Confirming…"~~ [BATCH 35: per-action key so only the pressed pill changes its label].
3. ~~VisitCard duplicates STATUS_STYLES + hand-rolls result notice~~ [BATCH 35: rides the shared VisitStatusPill (new labelOverride carries the deliberate "Needs confirming" divergence) and PortalNotice (which grew the danger tone)].
4. ~~loyalty-card text-rose-600~~ [BATCH 35: PORTAL_DANGER_INK + role=alert].
5. ~~PortalEmptyState hardcoded #9CAF9F fallback~~ [BATCH 35: falls back to PORTAL_INK — on-palette even unbranded].
6. ~~family-link-request placeholders-as-labels~~ [BATCH 35: real labels above each field; placeholders demote to examples].

### Growth hub
1. Hero KPI + FunnelStat → KpiStat. DEFERRED: the v3 hub's hero scoreboard and inline funnel row are deliberate owner-approved layouts (2026-07-26) — KpiStat's tile chrome would box what was designed to flow.
2. ~~NewsCard duplicated verbatim across two hubs~~ [BATCH 24: hoisted to components/ui/news-card.tsx (valueSuffix kept); both hubs import the one recipe].
3. Funnel heartbeats. DEFERRED: getRecallStats carries no weekly history — a new data series is server work beyond presentation; post-1.0 candidate.
4. ~~Utility footer links ~20px hit height~~ [BATCH 24: py-2 tap height on all three].

### Reviews
1. Sixteen KPIs, zero heartbeats. DEFERRED: every tile already rides KpiStat; sparks need per-metric history series the services don't keep — post-1.0 candidate.
2. ~~Four identical bands~~ [BATCH 24: each band now leads with its own header — the ask→review funnel · On Google right now · Where they reviewed · Patient pulse].
3. ~~Google-link gate hand-rolled amber panel~~ [BATCH 24: the standard warn recipe (amber-500/10 + inset ring)].
4. ~~Secondary competes with breath primary~~ [BATCH 24: Edit-request-email demotes to ghost].

### Audiences
1. ~~Full danger Delete on every card~~ [BATCH 13: ghost w/ rose hover].
2. ~~Recipient count whispered~~ [BATCH 13: mono-numeral hero].
3. ~~Empty state actionless~~ [BATCH 13: + New audience in the well].
4. ~~Shared pending spins all Deletes~~ [BATCH 13: per-card deletingId].
5. ~~Per-audience counts before first paint~~ [BATCH 31: countsPromise unawaited server-side; cards paint immediately, each number streams in via use() + Suspense with a quiet – fallback].

### Outreach queue
1. ~~TIER_ACCENT_BG contradicts the tone contract~~ [BATCH 25: tier headers ride the standard tone surface recipe (tone-500/10 + inset ring) — the *-50 dialect retired].
2. ~~Empty tiers render full-height~~ [BATCH 25: one quiet ✓ line — good news doesn't get the biggest box on the page].
3. ~~Four primary Sends at once~~ [BATCH 25: the largest tier's Send is the one primary; the rest demote to secondary].

### Website hub
1. ~~"Your site is live" prints even when NOT live~~ [BATCH 13: gated on siteLiveAt].
2. ~~Delta detached from its tile~~ [BATCH 25: the ▲/▼ moves under the visits number it describes]. The trio stays hand-shaped like the Growth hero (deliberate hub layout).
3. ~~Go-live checklist fake radio circles~~ [BATCH 25: the circle stays a to-do marker but hovers an → inside — the row navigates, it doesn't tick].
4. ~~Utility footer repeats hero facts~~ [BATCH 25: Design/Pages footer doors drop their fact echoes (the hero carries them); Domain keeps its address (its only editable home); all four links get py-2 tap height].

### Quick edits
1. ~~Save = raw bg-teal-500~~ [BATCH 13: ActionButton primary + pending].
2. ~~Errors, no live region~~ [BATCH 13: role=alert].
3. ~~No focus trap in the modal~~ [BATCH 31: the shared useFocusTrap (Tab cycle, initial focus, restore-on-close, Esc) replaces the bare window Escape listener].
4. ~~Services modal saves silently~~ [BATCH 31: reorder + remove now toast success in the picker (add + errors already did) — the auto-save is audible everywhere].

### Design panel
1. ~~Four identical primaries on one surface~~ [BATCH 13: the hoisted SaveBar on all three cards; Browse-designs demoted to secondary].
2. ~~Saved ✓ self-destructs 2.5s~~ [BATCH 13: persists until next edit, role=status].
3. ~~Two cards allow no-op saves~~ [BATCH 13: dirty tracking everywhere].
4. ~~"Publish to go live" ×3~~ [BATCH 13: once at panel level].

### Pages manager
1. ~~Three same-weight 12px links/row~~ [BATCH 31: verified already fixed in place — Open in editor leads (teal, font-medium), View live + manager sit quiet gray; a per-row button would out-shout a 12-row list].
2. ~~invisible-but-focusable chevron~~ [BATCH 31: verified already fixed — no-copy rows render plain text with the chevron simply absent, no dead tab stop].
3. ~~"N text edits" unexplained~~ [BATCH 14: title explains + points at the disclosure].

### Website forms
1. ~~Submission rows not links~~ [BATCH 31: each row deep-links to its own inquiry (/leads?status=all&lead=… — LeadsView opens the drawer from the param)].
2. ~~Empty state plain sentence~~ [BATCH 31: EmptyState + Share-your-website action].
3. ~~count7d whispers~~ [BATCH 31: the number leads at text-sm semibold mono; the label stays quiet].

### Settings home
1. ~~No tile carries state~~ [BATCH 27: server-fetched TileBadge map — Team shows "N invites pending", Billing shows "Trial — N days left"; best-effort, quiet when nothing's live].
2. ~~Search results unannounced/uncounted~~ [BATCH 27: role=status "N matches" line above the grid].
3. ~~Clear-search 20px target~~ [BATCH 27: 28px].
4. ~~No-match bare sentence~~ [BATCH 27: names the query + an inline clear-the-search action].

### Team
1. ~~Default tab = Invite~~ [BATCH 13: Members → Pending → Invite].
2. ~~Pending count invisible~~ [BATCH 13: "Pending (N)" in the tab label].
3. ~~Shared pending spins every row~~ [BATCH 27: per-action keys (remove-/resend-/cancel-id) — only the pressed button spins, the rest disable].
4. ~~Raw amber vs TONE_TEXT.warn~~ [BATCH 27: the expiry-soon text rides the token].

### Practice — the SaveBar is the model.
1. ~~Hoist SaveBar~~ [BATCH 13: components/ui/save-bar.tsx; practice + design adopted; portal Profile still open].
2. ~~View-only banner hand-rolled amber~~ [BATCH 31: standard warn recipe bg-amber-500/10 + inset ring].
3. ~~Raw emerald tick~~ [BATCH 31: TONE_TEXT.ok + role=status].
4. ~~Tabs never write the URL~~ [BATCH 31: tab + subtab clicks history.replaceState ?tab=&sub= (the patient-detail precedent) — refresh/share lands on the same tab; deep-link reads already existed].

### Billing panel
1. Four money facts as prose. DEFERRED: the facts read as warm sentences (the product's voice) with mono values already — a grid trades voice for scan speed on a rarely-visited page.
2. ~~One pending covers checkout/portal/cancel/resume~~ [BATCH 28: activeAction keys — portal/cancel/resume each spin alone; plan buttons ride their own pendingPlan].
3. ~~Upgrade nudge hand-rolled violet~~ — already the standard info recipe (violet-500/10 + inset ring); scout stale.

### Payments hub
1. ~~Doors restate the KPI band verbatim~~ [BATCH 28: doors drop the duplicated stats — only Online payments keeps its connect STATE (a door fact); tests pin the absence].
2. Outstanding heartbeat. DEFERRED: needs a balance-history series the services don't keep — post-1.0 candidate.
3. ~~Doors bespoke hover~~ [BATCH 28: v2-card-interactive].
4. ~~Stripe notice hand-rolled violet~~ — already the standard info recipe; scout stale.

### Shop hub
1. ~~TWO "Connect Stripe" primaries~~ [BATCH 13: panel copy demoted to secondary].
2. ~~Up to four stacked notices before data~~ [BATCH 28: the steady-state "storefront live" band demotes to a quiet one-line status — good news is not a standing banner; the off-state and transient connect banners stay actionable].
3. Sales band vanish. DEFERRED: hiding the $0 band during setup is a documented deliberate decision in the code (nobody stares at a $0 band while onboarding).
4. ~~LowStockPanel outranks the Sales band~~ [BATCH 28: restock is housekeeping — it now reads AFTER the money story].

---

## Cluster 4 — Platform tenant (scouted 2026-08-21; three scouts: core · prospecting · tail)

Scope notes: platform nav "Sales Pipeline" = /platform/prospecting; /marketing(+/pipeline)
are deep-link-reachable legacy routes and still audited; /developer is a bare redirect
(nothing to audit). No tenant-voice violations found anywhere — the platform owner never
reads clinic-voiced copy.

### Platform cross-cutting (mechanical sweeps)
1. Cancel-spins + shared-pending sweep. CORE FILES DONE [BATCH 36: clinics-list (delete-modal Cancel + View-as demoted from per-row primary + resend-invite failure surfaced + dead ternaries), partner-actions (per-action keys), referral-card, referred-clinics-table, delete-partner-modal, subscriptions-panel (per-action), plans-panel (per-price keys)]. Remaining sites ride their surface batches: pipeline-lead-drawer, add-lead-button, audiences-client, campaign-editor, blog-editor, review-board, library-entry-editor, prospecting files.
2. ~~FlashToast announces errors as success~~ [BATCH 36: role=alert + assertive when tone==='urgent'; partners-table and referred-clinics-table now pass urgent tones on every failure path (validation + catches). pipeline-board's silent move failure rides the /marketing batch].
3. Tone sweep: sky-as-info (subscriptions-attention.tsx:66-73, prospecting page.tsx:75, sales-pipeline-board.tsx:27, momentum-strip.tsx:24, communications/page.tsx:19, marketing terminology.ts:91-101) → violet; special misuse (subscriptions-attention.tsx:52 churn, client-messaging-stats count, [id]/page.tsx:39-47 in_progress, phone-queue.tsx:59) → warn/info; brand-teal-as-status (pipeline-panel.tsx:42, territory-table.tsx:172, sales-pipeline-board.tsx:36, deal-room :314-335, copilot done-line) → emerald/violet; violet-as-link (clinics-list.tsx:254, subscriptions-panel.tsx:268, subscriptions-attention.tsx:107, [id]/page.tsx:129) → teal.
4. Retired *-50 dialect sweep (~25 sites, both scouts' lists) → tone-500/10 + inset ring, or surface-sunk for neutral wells.
5. Missing loading.tsx: /ecommerce/customers, /ecommerce/invoices, /messages, /partners(+/[id]), /platform/prospecting, /platform/prospecting/call-mode, /call-list, /demo/[id], /website/blog, /platform/service-library; dashboard/loading.tsx is clinic-shaped for the platform tenant → branch by shape.
6. role=alert/status adoption: prospecting module has ZERO live regions (33 files); 9+ bare error divs on core surfaces; silent successes everywhere (subscriptions plan change/cancel, plans archive, drawer actions, resend-invite swallows failure clinics-list.tsx:322-346) → global useToast + role=alert.

### Platform Overview
1. No primary action in the header (platform-overview.tsx:120-129) → one primary, demote rest.
2. Guardian audience control: raw brand button + inline text confirm + Saving… ternary + sub-40px (guardian-audience-control.tsx:90-128) → ActionButton pending + useConfirm(danger) for opening the lock; note/error get toast/role=alert (:131-132).
3. Honesty banners amber-50 (guardian-panel.tsx:324, shared-brain-card.tsx:49) → warn recipe.
4. Etched card recipe in guardian/brain panels (guardian-panel.tsx:95/329/334, shared-brain-card.tsx:61) → .v2-card.
5. Engine/brain state chips hand-rolled + NO legend (guardian-panel.tsx:31-57/116, shared-brain-card.tsx:71-79) → StatusPill + EncodingLegend.
6. 3 of 4 KPIs no heartbeat — MRR spark from getMrrSnapshot, Needs-Attention delta (platform-overview.tsx:155-177).
7. Stripe-unavailable banner raw + silent (platform-overview.tsx:180-184; platform-revenue.tsx:60-65) → recipe + role=status.
8. PMS-demand clinic chips dead (platform-overview.tsx:216-224) → deep-link clinic pages.
9. Activity/attention hit target title-only (:326-346); QuickLink cards duplicate header links (:368-384).

### Platform Revenue (fintech/platform-revenue.tsx)
1. Contributor bars use semantic tones as series colors (:154-169; subscriptions-stats.tsx:71) → CHART_SERIES tokens.
2. Top-contributor + transaction rows dead-end (:145-178, :248-271) → deep-link clinics.
3. No primary (:48-57); KPIs no heartbeats though buckets computed (:69-89).
4. MiniTrend width={760} hardcoded in fluid column (:310); legend order off + local LegendDot (:104-106, :280-287).

### Clinics list (clinics-list.tsx)
1. Delete modal hand-rolled (no trap/Esc/scrim-click, raw scrim) + Cancel spins (:394-467, :456) → delete-partner-modal pattern.
2. Every row primary "View as" → N primaries (:470-483) → secondary; + Add clinic sole primary.
3. Resend-invite swallows failure (:322-346) → toast both paths.
4. Raw search input (:149-155) → SearchInput; filtered-empty dead end (:199-203) → Show-all action.
5. Raw hex avatar #6d28d9 (:248, [id]/page.tsx:150); thead bg-gray-50 (:175); pending+ternary doubled (:480/:493).

### Clinic detail ([id]/**, add-clinic-modal)
1. No PageHeader — hand-rolled eyebrow/H1/back/actions ([id]/page.tsx:128-173) → PageHeader + legend + TrailBack-or-link.
2. Violet identity (eyebrow :129, avatar :261) → teal; in_progress=special (:39-47) → info.
3. Pills + glyphs no EncodingLegend (:352-355, 29-37).
4. Project + invoice rows inert (:330-357, :383-410) → deep-link.
5. NexHealth card: raw violet button, raw checkboxes, shared transition (nexhealth-card.tsx:97-143); bind success no role=status (:156).
6. ReferralCard one transition spins Remove/Cancel/Save (:190-196); rose-50 errors no role=alert (referral-card.tsx:187, add-clinic-modal.tsx:342).
7. Server toLocaleDateString without tz helper (:160/:342/:400) — flag; modal success not live region, scrim gray-900/40, hardcoded domain (:169-193, :160, :176/:212).

### Client messaging (double-sidebar platform branch)
1. No thread-header identity — name is 12px uppercase in body (messages-body.tsx:59, messages-header.tsx:3-27) → real thread header.
2. Send never spins (disabled+ternary, messages-body.tsx:109-116) → pending prop.
3. New-conversation trigger 20px raw SVG (new-conversation-button.tsx:39-49).
4. Raw hex #151D2C + gray-400 flyout toggle (messages-header.tsx:8/14).
5. Stat strip hand-rolled + special misuse (client-messaging-stats.tsx:15-60) → KpiStat.
6. Empty states dead-end; /settings/team as prose (client-messaging-sidebar.tsx:212-231); raw search (:174-181); hand-rolled tab strip no aria (:158-173/:250-284); etched sidebar chrome (:141, stats :17).

### MRR / Subscriptions (ecommerce/invoices/**)
1. Local tone map w/ sky (subscriptions-attention.tsx:66-73) → TONE_* import; scheduled-to-cancel=special (:52) → warn.
2. Row actions share one transition; errors render in the Customer cell no role=alert (subscriptions-panel.tsx:300-335, :277).
3. All mutations silent on success (subscriptions-panel.tsx:231-252, plans-panel.tsx:47-77/140-161) → toast.
4. Header lacks primary while + New plan buried (plans-panel.tsx:165, invoices/page.tsx:63-71).
5. "+ N more" dead text (subscriptions-attention.tsx:137-141) → filter link; Stripe-error banner no role=alert (invoices/page.tsx:75-79).
6. Raw search + raw plan select (subscriptions-panel.tsx:117-139); PlanMixCard empty bare div (subscriptions-stats.tsx:41-47).

### Partners
1. Errors as success toasts (FlashToast) — see cross-cutting 2 (partners-table.tsx:78/93-108, referred-clinics-table.tsx:63-83).
2. Suspend + Pay-now share one transition (partner-actions.tsx:108/118); Cancels spin ×2 (referred-clinics-table.tsx:145, delete-partner-modal.tsx:235).
3. Filtered-empty dead end (partners-table.tsx:151-156); ledger/payout empties bare <p> ([id]/page.tsx:179/:204).
4. gray-400 on term/%/✕ (partners-table.tsx:183, referred-clinics-table.tsx:118/133, delete-partner-modal.tsx:170).
5. rose-50 errors no role=alert ×3 (partner-terms-editor.tsx:83, delete-partner-modal.tsx:227, add-partner-modal).
6. Terms editor no dirty contract (SaveBar) (partner-terms-editor.tsx:31-56/:84-88); two primaries on detail (Pay-now breath + Save terms).
7. Hand-rolled back link + server dates ([id]/page.tsx:71-73/:42-45); effectiveFilter silently re-points chip (partners-table.tsx:61-62).
Already best-version reference: delete-partner-modal, tone-aware toasts, per-row pendingId, legends, mono money columns.

### Prospecting — module-wide
1. Zero role=alert/status/aria-live in 33 files; useToast never imported — hand-rolled ephemeral feedback everywhere → adopt both module-wide.
2. No loading.tsx on any prospecting route (all force-dynamic, AI-bound) → shaped skeletons ×4.
3. sky ×4, brand-as-won ×3, *-50 ×20, raw hex ×3 → tone sweep (see cross-cutting).

### Prospecting workspace (page.tsx)
1. Two header primaries (AddClinic + Call Mode) → Call Mode primary+breath, Add secondary (page.tsx:155, add-clinic-button.tsx:104).
2. Two stacked underline tab rows → view switcher becomes FilterChips (page.tsx:163-189).
3. Raw search input (:284-290) → SearchInput+enterHint; kill-switch banner hand-rolled amber silent (:191-199) → recipe + role=status.
4. Only name deep-links; row otherwise dead (:332-401) → whole-row ?prospect= target; warmth avatars no legend (:72-77/:338-345) → EncodingLegend.
5. gray-400 "not checked yet" (:379); hand-rolled pagination + no PendingVeil on filter nav (:410-436).

### Daily briefing / hunt panel / focus banner
1. Briefing Empty helper gray-400 dead-end (:170-172) → inline column CTA; follow-ups amber card hand-rolled (:41), count gray-400 (:44).
2. Hero CTA raw Link-pill (:31-36) → ActionButton; overnightHot names not links (:123-127).
3. Hunt panel six KPI tiles hand-rolled, zero heartbeats (hunt-panel.tsx:24-32) → KpiStat + MiniTrend; sub gray-400 (:30); five coded pills no legend (:41-56).
4. Focus banner raw ~28px controls + silent clear (focus-banner.tsx:24-42) → ActionButton sm + toast.

### Copilot bar
1. Hand-rolled modal no trap/role/aria-modal (:137-145) → useFocusTrap; Esc global listener conflicts (:66-77).
2. All buttons raw (:164-253) → ActionButton/FilterChip; running disables ALL actions (:217) → per-action.
3. Success tiny teal vanishing line (:256-260) → toast (emerald); gray-400 meaningful copy (:177/:233/:265); trigger ~30px (:128).

### Prospect drawer + deal room
1. Hand-rolled <aside> drawer (prospect-drawer.tsx:51) → shared Drawer (Esc/scrim/trap); ✕ bare 20px (:60-67). HIGHEST VALUE.
2. drawer-actions one transition ×5 (:27-142) → per-action; suppress inline confirm → useConfirm (:121-142); all successes silent.
3. contacts-panel one pending across rows; delete NO confirm, 12px ✕ (:41-134).
4. Deal-room savings brand-tinted (:314-335) → emerald ok; gray-400 ×12; copy paths → CopyChip (demo-followup-drafter.tsx:60-69, call-card.tsx:152-166); drafter ternaries + never-clearing Logged ✓ (:119-179).

### Call Mode + call list
1. One pending disables five outcomes (call-session.tsx:82/535-549) → per-outcome; OutcomeButton emerald-as-primary (:565-599) → ActionButton grammar + kbd child.
2. Errors no role=alert (:467, practice-panel :111); pickers' Cancels 12px (:492-522); pass chips → FilterChip; skip gray-400 but state-changing (:283-289); session-strip color-only (:36-43/:270-281); practice-panel modal no trap/Esc/role (:73-74).
3. call-card one pending ×6 incl. Cancel toggle (:231/:314-331); every card variant=primary (:317) → header primary; 2.5s vanishing success + conversion in same slot (:235-243/:378-379) → toast, persistent for conversion.
4. ConvertForm 8 fields inline no SaveBar, unlabelled error (:61-133) → modal + SaveBar + role=alert; loss chips rose-50 + duplicated constants (:363-373 vs call-session :506-514); reply disclosure no aria-expanded (:141-147).
5. phone-queue "No website"=special vs urgent elsewhere (:59); dial CTA raw (:82-87); call-list raw hex ring + gray banner (:115-154).

### Demo prep (demo/[id])
1. THREE primaries, two breathing (prep-actions.tsx:14-16, track-picker.tsx:67-70, brief-panel.tsx:46) → one primary.
2. prep-actions shared pending (:9-34); re-enrich result bare never-clearing span (:39-48) → toast.
3. track-picker teal-50 selected (:44) → selected recipe; Suggested badge → StatusPill special (:53).
4. brief-panel dead ternaries under pending (:46-48/:75-77); AI failure no role=alert (:49-53).
5. KpiStats no heartbeat (page.tsx:85-102); "no verified gaps" bare p naming re-enrich w/o the button (:116-119) → EmptyState + action.

### Add-a-clinic modal
1. Cancel spins (:261-263); no trap/Esc/aria-labelledby (:109-117); two success-panel primaries (:131/:136); submit ternary (:264-266); duplicate warning amber-50 unannounced (:242); error/success no roles (:258, :118-145).

### Pipeline board / momentum / win-loss / territory (prospecting)
1. pipeline-panel 13× gray-400 meaningful numbers; W/L hand-rolled bg-gray-50 + Won-teal (:39-58) → KpiStat; empty bare paragraph (:15-29) → EmptyState + path.
2. Hand-rolled meters no aria (loss bars :75-79, warmth :132-136 bg-slate-400, territory worked-% :154-159) → tokened + labeled.
3. Board count pill + 4xl headline inert (:107-109/:158-160) → deep-link like momentum tiles; EmptyHint gray-400 dead-ends ×4; violet-50 soon card (:54); momentum flat deltas gray-400 (:32/:35/:57).
4. Territory: one pending all rows (:65/:181); ~26px hand-rolled toggles (:179-190); Won teal (:172); gray-400 (:133-143); empty dead end (:195-201); state cell <button> router.push → <Link> (:126-132).

### Marketing home + legacy pipeline (/marketing)
1. Stage accents sky + -50 + stone (terminology.ts:91-101 + consumers) → tone contract.
2. KPIs no heartbeats; funnel rows + activity rows + audience items dead → deep-link (page.tsx:91-247, :152, :202); stage chip → StatusPill (:162).
3. Board: move failure silent (pipeline-board.tsx:118-121) → toast; drawer shared transition + no error paths (pipeline-lead-drawer.tsx:43/:63-108); add-lead modal hand-rolled + Cancel spins + error no role (add-lead-button.tsx:66-156).
4. No board zero-state (:177-180); card double tab stop + no keyboard drag (:200/:214/:58-60); etched card/column recipes (:235/:221/:160); kanban loading shape; local FlashToasts ×3.

### Service library
1. library-entry-editor raw modal, outside-click close, NO unsaved guard (:93-99) → Drawer + useUnsavedChanges; monochrome primary no pending (:252-266).
2. Approve/Reject adjacent shared busy (review-board.tsx:320-336); note validation as toast → FieldError (:328/:345); dual toast channels (:220 vs :303).
3. Etched rows (:109) → v2-card; hand-rolled -50 chips + dev-speak (:125-133); error rose-50 no role (:123-127); counter gray-400 (:183); 28px controls (:304/:116); no SearchInput/loading.
ESCALATED primitive: editor-kit.tsx:20-25 stone palette + stone focus ring → form-input + brand ring.

### Platform blog (blog-editor + list)
1. One transition ×8 actions incl. autosave (:74 etc.) → per-action.
2. Publish-nudge teal-50 + raw teal button = second primary (:400-416); publishError no role (:394); autosave state gray-400 no role=status (:263-265).
3. gray-400 helper copy ×8; raw buttons ×5 → ActionButton; excerpt → form-textarea (:321).
4. List: gray-400 No-author (page.tsx:212); rows only title-linked (:188-199); no loading.tsx.

### Platform settings
1. Settings home hand-rolled search/hero — VERIFY vs batch-27 state first (settings-home.tsx:54-84/:42-52).
2. Platform taxonomy two tiles, no doors to Service Library/Blog/Prospecting settings (settings-nav.tsx:129-137). DEFER candidate (taxonomy/IA — STRUCTURE-AUDIT territory).
3. Notifications amber-50 (:241) → recipe; Includes gray-400 (:173/:222); Save ternary + no SaveBar + local FlashToast (:266-271).

### Shared growth surfaces (platform orientation)
1. Campaigns-list eyebrow "‹ Growth" → /growth bounces platform to /dashboard (growth/campaigns/page.tsx:104) → Platform eyebrow / ‹ Marketing.
2. Audiences two names one destination (eyebrow ‹ Marketing + button ← Sales pipeline, both /marketing; nav's Sales Pipeline is prospecting) (audiences-client.tsx:92-102).
3. Campaigns empty state dead end (:134-139) → hand over CTA.
4. Audience Delete shared-pending + rose-50 + 24px (audiences-client.tsx:178-185); CustomerAudienceEditor modal no Esc/trap/role/✕, Cancel spins, ternary, save no error path (:358-488).
5. Audience preview manual-refresh only (:453-479). DEFER candidate (auto-preview = action change).
6. Campaign editor leaks "Resend" vendor name (:303); Cancels spin ×4; channel picker 28px hand-rolled (:292-322); Delete 24px rose-50 (:275-281); gray-400 preview labels ×6; campaigns/[id] bare breadcrumb + no legend (:92-107).
