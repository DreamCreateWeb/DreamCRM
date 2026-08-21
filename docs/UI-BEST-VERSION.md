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
3. Tone sweep. PARTIAL [BATCH 42: prospecting sky retired — cool score band → violet, communicated stage + replies tile → fuchsia (special: a human reaching back), email channel dot → violet; brand-teal-as-status → emerald across pipeline-panel Won, territory Won, board reply tone, deal-room savings, copilot done-line (now a toast); plus the module's *-50 surfaces → surface-sunk and the demos/call-list raw hex (#ddd6fe/#f59e0b) → tokens]. Remainder: marketing terminology.ts sky/stone stage accents ride the /marketing batch. (Subscriptions-attention + clinic-detail + violet-as-link were closed in earlier batches; phone-queue special deliberately kept.)
4. Retired *-50 dialect sweep (~25 sites, both scouts' lists) → tone-500/10 + inset ring, or surface-sunk for neutral wells.
5. Missing loading.tsx: /ecommerce/customers, /ecommerce/invoices, /messages, /partners(+/[id]), /platform/prospecting, /platform/prospecting/call-mode, /call-list, /demo/[id], /website/blog, /platform/service-library; dashboard/loading.tsx is clinic-shaped for the platform tenant — DEFERRED: loading.tsx is static and tenant-blind; branching would need the skeleton moved into the page or a cookie-reading client shim, disproportionate for the one-user platform surface.
6. role=alert/status adoption: prospecting module has ZERO live regions (33 files); 9+ bare error divs on core surfaces; silent successes everywhere (subscriptions plan change/cancel, plans archive, drawer actions, resend-invite swallows failure clinics-list.tsx:322-346) → global useToast + role=alert.

### Platform Overview
1. ~~No primary action in the header~~ [BATCH 37: + Add clinic is the one primary (lands on /ecommerce/customers?add=1, which now opens the modal on arrival); Revenue's header slot moved to the quick-link grid].
2. ~~Guardian audience control raw mechanics~~ [BATCH 37: ActionButtons with pending + real targets; note role=status, error role=alert. The INLINE confirm stays deliberately — the audited Phase-4 design keeps the would-hear count beside the decision; a modal would detach it].
3. ~~Honesty banners amber-50~~ [BATCH 37: standard warn recipe on both].
4. ~~Etched card recipe in guardian/brain panels~~ [BATCH 37: .v2-card everywhere].
5. ~~Engine/brain state chips hand-rolled + no legend~~ [BATCH 37: StatusPill tones (urgent/warn/neutral/ok) + an EncodingLegend in the panel header rendered FROM the same table].
6. KPI heartbeats. PARTIAL [BATCH 37: Revenue page's Total + Project KPIs gained sparks from their existing weekly buckets]. Overview MRR/Needs-Attention DEFERRED — getMrrSnapshot is a point-in-time tier count with no stored monthly series; a spark needs new history bookkeeping (post-1.0 data-path).
7. ~~Stripe-unavailable banner raw + silent~~ [BATCH 37: standard warn recipe + role=status on both pages].
8. ~~PMS-demand clinic chips dead~~ [BATCH 37: each chip opens its clinic page (service now carries the org id)].
9. ~~Activity rows title-only targets~~ [BATCH 37: the whole row is the link]. QuickLink duplication resolved by the header restructure — Revenue's only top door is now the quick-link grid.

### Platform Revenue (fintech/platform-revenue.tsx)
1. ~~Contributor bars use semantic tones as series~~ [BATCH 37: CHART_SERIES tokens on the split bars + the transaction source dot goes neutral. subscriptions-stats' PlanMixCard rides the MRR batch].
2. ~~Top-contributor + transaction rows dead-end~~ [BATCH 37: contributor names and transaction clinic names deep-link (RevenueTransaction now carries clinicId)].
3. ~~KPIs no heartbeats~~ [BATCH 37: Total rides the combined buckets, Project Revenue its own]. The page keeps two quiet secondaries by design — Revenue is a REPORT; its jobs live on the pages it links.
4. ~~Legend order off~~ [BATCH 37: fixed 1..3 order; the trend width stays a bounded constant (the card is max-width-capped) and LegendDot stays local — a one-page helper].

### Clinics list (clinics-list.tsx)
1. ~~Delete modal hand-rolled~~ [BATCH 38: focus trap + Esc + scrim-click (all blocked mid-delete), role=dialog, ink-token scrim, modal shadow, role=alert error; the Cancel spin fell in batch 36].
2. ~~Every row primary "View as"~~ [BATCH 36: secondary — + Add clinic is the page's one primary].
3. ~~Resend-invite swallows failure~~ [BATCH 36: a failed send reads 'Failed — try again' on the button].
4. ~~Raw search input + dead filtered-empty~~ [BATCH 38: SearchInput with clear; the no-match state hands over Show all clinics].
5. ~~Raw hex avatars / gray-50 thead / doubled ternaries~~ [BATCH 38: brand token fallback on both avatar sites, surface-sunk thead; ternaries fell in batch 36].

### Clinic detail ([id]/**, add-clinic-modal)
1. Hand-rolled identity header — DEFERRED as deliberate: this is an ENTITY page (logo + name + tagline), which PageHeader has no slot for; forcing it would lose the identity treatment. The eyebrow hue and legend landed (below).
2. ~~Violet identity + special misuse~~ [BATCH 38: teal eyebrow; in_progress rides info].
3. Pills + glyphs no EncodingLegend (:352-355, 29-37).
4. Rows inert. INVOICES DONE [BATCH 38: each links to its Stripe hosted page (service carries hostedInvoiceUrl)]. Project rows DEFERRED — no per-project destination exists (/ecommerce/orders has no row-targeting param); an IA gap, post-1.0.
5. ~~NexHealth card raw mechanics~~ [BATCH 38: ActionButton primary with per-action pending (bind vs write-back no longer share fate), form-checkbox class, success role=status].
6. ~~ReferralCard shared pending + rose-50 errors~~ [BATCH 36 split the pending; BATCH 38 moved both error blocks to the urgent recipe + role=alert].
7. Server dates — N/A BY DESIGN: this is a platform-global surface with no clinic tz to anchor to (the tz law binds clinic-facing renders); dates are day-granular. ~~Modal success not live region / gray scrim~~ [BATCH 38: role=status + ink-token scrim]. Hardcoded domain string stays (display copy mirroring the SITE_DOMAIN default).

### Client messaging (double-sidebar platform branch)
1. ~~No thread-header identity~~ [BATCH 39: the conversation title renders at real heading size/ink in the pane; the sticky chrome keeps its one mobile control].
2. ~~Send never spins~~ [BATCH 39: pending prop].
3. ~~New-conversation trigger 20px~~ [BATCH 39: 40px circular hit area with hover wash].
4. ~~Raw hex + gray-400 toggle~~ [BATCH 39: gray-900 token + gray-500 floor].
5. ~~Stat strip special misuse~~ [BATCH 39: active-count goes neutral ink (a count is not a celebration), numerals ride font-mono-num, strip chrome on surface tokens. The compact 3-up strip layout stays — KpiStat tiles are too heavy for a 20rem rail].
6. ~~Sidebar gaps~~ [BATCH 39: team empty state hands over an Invite-a-teammate button; SearchInput with clear; tab strip gains aria-pressed; chrome on surface/hairline tokens].

### MRR / Subscriptions (ecommerce/invoices/**)
1. Local tone map w/ sky (subscriptions-attention.tsx:66-73) → TONE_* import; scheduled-to-cancel=special (:52) → warn.
2. ~~Shared row transition + orphaned errors~~ [BATCH 36 split the pending; BATCH 39 moves the error beside the buttons that caused it, role=alert].
3. ~~Mutations silent on success~~ [BATCH 39: cancel/keep/plan-change/archive/price-toggle/create-plan all toast].
4. + New plan placement — DEFERRED as deliberate: creating a Stripe plan is a rare act; promoting it to the page primary would out-shout the daily job (managing subscriptions). The button stays with the Plans card it creates into.
5. ~~"+N more" dead + silent banner~~ [BATCH 39: each bucket's +N-more deep-links ?status= (the table now reads it); the Stripe banner announces role=alert on the urgent recipe].
6. Raw search + raw plan select (subscriptions-panel.tsx:117-139); PlanMixCard empty bare div (subscriptions-stats.tsx:41-47).

### Partners
1. ~~Errors as success toasts~~ [BATCH 36: FlashToast announces urgent as alert; both tables pass urgent tones].
2. ~~Shared transitions + spinning Cancels~~ [BATCH 36: per-action keys everywhere; Cancels disabled-not-spinning].
3. ~~Filtered-empty dead end~~ [BATCH 40: EmptyState + Show-all-partners action]. Ledger/payout empties stay quiet one-liners DELIBERATELY — the in-card quiet-line precedent (portal batch 32; EmptyState wells inside side-by-side cards are mostly chrome).
4. ~~gray-400 on meaningful text~~ [BATCH 40: gray-500 floor on the term, the % unit, and the ✕ (which also grew a 32px hit area)].
5. ~~rose-50 errors, no role=alert~~ [BATCH 40: urgent recipe + role=alert in all three].
6. ~~Terms editor no dirty contract + two primaries~~ [BATCH 40: Save lights only when something changed ('Unsaved changes' hint), the baseline moves on save, and Save demotes to secondary — Pay-now keeps the page's one primary. A floating SaveBar would be heavy for a one-card form].
7. Back link stays a plain link (the TrailBack context-bound precedent). Server dates N/A — platform-global surface, day-granular. ~~effectiveFilter silent re-point~~ [BATCH 40: the fallback writes the state, so the chip row always shows the truth].
Already best-version reference: delete-partner-modal, tone-aware toasts, per-row pendingId, legends, mono money columns.

### Prospecting — module-wide
1. Zero role=alert/status/aria-live in 33 files; useToast never imported — hand-rolled ephemeral feedback everywhere → adopt both module-wide.
2. ~~No loading.tsx on any prospecting route~~ [BATCH 41: shaped skeletons for /prospecting, /call-mode, /call-list, /demo/[id]].
3. sky ×4, brand-as-won ×3, *-50 ×20, raw hex ×3 → tone sweep (see cross-cutting).

### Prospecting workspace (page.tsx)
1. ~~Two header primaries~~ [BATCH 41: Call Mode is the one primary with breath; Add-a-clinic demotes to secondary].
2. ~~Two stacked underline tab rows~~ [BATCH 43: the page's view switcher becomes FilterChips (href mode, counts inside) — no longer confusable with the workspace's underline sub-nav].
3. ~~Raw search + hand-rolled kill-switch banner~~ [BATCH 41: SearchInput (a small client wrapper keeps the plain GET form) with ↵ hint + clear; the banner rides the warn recipe + role=status].
4. ~~Name-only deep link + no warmth legend~~ [BATCH 43: the whole practice cell (avatar + name + phone) is one deep-link target — a literal anchor-spanning-a-<tr> isn't valid HTML, so the cell is the honest maximum; the filter row gains an EncodingLegend for the four warmth tiles].
5. ~~gray-400 "not checked yet"~~ [BATCH 43: gray-500]. Pagination already rides ActionButtons; PendingVeil on filter nav DEFERRED — the page is server-rendered (chips are plain GETs) and batch 41's loading.tsx covers the transition.

### Daily briefing / hunt panel / focus banner
1. ~~Briefing empties + amber card~~ [BATCH 43: Empty lifts to gray-500 and grows per-column CTAs (see demos / browse prospects / see hot); the follow-ups card moves onto the standard amber recipe; the count onto font-mono-num gray-500].
2. Hero CTA + overnight rows. PARTIAL [BATCH 43: 🎯 New-overnight arrivals now carry ids from the service and deep-link to their deal rooms]. The hero's white-on-teal pill DELIBERATELY stays a styled Link — no ActionButton variant expresses white-fill-on-brand-gradient, and matching Call Mode's dial-block language is the point.
3. Hunt panel. PARTIAL [BATCH 43: the five engine pills gain an EncodingLegend; tile subs lift to gray-500]. KpiStat+MiniTrend heartbeats DEFERRED — HuntStats stores 24h totals only; sparks need a new hourly aggregate (post-program depth item).
4. ~~Focus banner~~ [BATCH 43: both controls become ActionButtons (view=secondary, clear=ghost w/ pending); clearing announces via toast; banner onto the ring recipe].

### Copilot bar
1. ~~Hand-rolled modal no trap/role/aria-modal~~ [BATCH 42: useFocusTrap + role=dialog/aria-modal/aria-label on the ⌘J panel; Esc moves off the global listener into the trap].
2. ~~running disables ALL actions~~ [BATCH 42: per-action key — only the tapped action reads "Running…"; suggested-action buttons keep their compact chip form (a palette's chips, not page CTAs) — raw-button conversion accepted as-is].
3. ~~Success vanishing line / gray-400 floors / trigger~~ [BATCH 42: mutation success → global toast; "Try asking"/matched-name/footer/thinking line to gray-500 + role=status; trigger grows to a 40px target].

### Prospect drawer + deal room
1. ~~Hand-rolled drawer~~ [BATCH 41: a client ProspectDrawerShell supplies scrim + Esc + focus trap + role=dialog while the CONTENT stays server-rendered (the ?prospect= deep link is the part worth keeping — the shared client Drawer would have lost it); ✕ grows a 36px target + Esc hint].
2. ~~drawer-actions shared transition + silent successes~~ [BATCH 41: per-action keys; suppress rides useConfirm(danger); enroll/stop/re-enrich/suppress all toast; error role=alert].
3. ~~contacts-panel shared pending + confirm-less delete~~ [BATCH 41: per-act keys (re-verify/add/pin-id/del-id with live labels), delete asks by address, ✕ gets a 24px boxed target off gray-400].
4. Deal-room savings + drafter. PARTIAL [BATCH 42: savings panel rides the emerald ok recipe (brand teal was reading as a status)]. Remainder (gray-400 ×12, CopyChip adoptions, drafter ternaries + never-clearing Logged ✓) rides the next batch.

### Call Mode + call list
1. ~~One pending disables five outcomes / OutcomeButton emerald-as-primary~~ [BATCH 42: per-outcome active key ("Logging…" only on the tapped one); OutcomeButton grows a busy prop; the primary outcome's fill moves to the brand token].
2. ~~Errors/pickers/skip/practice modal~~ [BATCH 42: role=alert on call-session + practice-panel errors; both pickers' Cancels become ghost ActionButtons; pass chips show live "Logging…" labels; Skip lifts to a legible gray-500 underline; practice-panel gains scrim-click + Esc + focus trap + role=dialog + a 32px ✕]. Session-strip color-only markers ride the next batch.
3. ~~call-card one pending / all-primary / vanishing success~~ [BATCH 42: per-outcome keys incl. per-loss-reason; ALL outcome buttons go secondary (no per-card primary in a list of cards); the 2.5s flash becomes a global toast; Not-interested toggle never spins].
4. ConvertForm + loss chips. PARTIAL [BATCH 42: submit gains the pending prop + role=alert error + a success toast; loss chips move to rose-500/10 with a live label]. Remainder (SaveBar/modal shape, shared loss-reason constants, reply aria-expanded) deliberately deferred: the inline form is 4 visible fields in practice and works; constants + disclosure ride the next batch.
5. ~~call-list ring + queue~~ [BATCH 42: raw #f59e0b fallback → var(--color-amber-500)] [BATCH 43: phone-queue's "No website" flips to urgent to match the prospects table (same fact, same tone) + hover title; the dial CTA moves onto the secondary recipe so a queue of rows isn't a queue of primaries (tel: can't ride Link/ActionButton)].

### Demo prep (demo/[id])
1. ~~THREE primaries~~ [BATCH 42: prep-actions' pair and the brief's Generate demote to secondary — the track-picker launcher is the page's one breathing primary].
2. ~~prep-actions shared pending~~ [BATCH 42: per-action keys ('demo'/'enrich'); the re-enrich note gains role=status].
3. ~~track-picker teal-50 selected~~ [BATCH 42: selected state onto the token recipe].
4. ~~brief-panel ternaries + alert~~ [BATCH 42: dead ternaries under the pending prop removed; AI failure carries role=alert].
5. KpiStats no heartbeat (page.tsx:85-102); "no verified gaps" bare p naming re-enrich w/o the button (:116-119) → EmptyState + action.

### Add-a-clinic modal
1. ~~Add-a-clinic modal~~ [BATCH 41: Cancel no longer spins; trigger demoted to secondary] [BATCH 42: focus trap + Esc (guarded while pending) + aria-labelledby onto the dialog; success panel + duplicate warning gain role=status (the warning also drops a broken dark-mode class for the standard amber recipe); submit ternary removed under the pending prop; footer Cancel disabled-only; ✕ grows a 32px target. The success panel's two buttons were already one-primary-at-a-time by condition].

### Pipeline board / momentum / win-loss / territory (prospecting)
1. ~~pipeline-panel~~ [BATCH 42: tiles onto surface-sunk; Won → emerald] [BATCH 43: all seven gray-400 floors → gray-500; loss meters tokened (surface-sunk track, rose-500 fill) + aria-hidden since counts sit beside them]. KpiStat adoption DEFERRED — the tiles already match the token recipe and have no spark data; the zero-state prose card stays (in-card precedent).
2. ~~Hand-rolled meters~~ [BATCH 43: loss/worked-% bars tokened + aria-hidden (their numbers are textual siblings); the warmth bar's cool segment moves off bg-slate-400 onto violet to match the cool band everywhere else].
3. ~~Board inert numbers + hints~~ [BATCH 42: violet-50 soon card → tokens] [BATCH 43: column count pills and the 4xl Prospects headline deep-link to their lists; EmptyHints lift to gray-500 (their copy explains how a column fills — kept); momentum flat/zero deltas lift to gray-500].
4. ~~Territory~~ [BATCH 42: Won → emerald; sunk surfaces tokened] [BATCH 43: per-row pending keys (only the tapped Focus toggle reads Saving…) + aria-pressed + 32px targets; the suggested-focus CTA becomes an ActionButton; state cells become real Links; banners onto ring recipes; gray-400 floors → gray-500; the empty row links straight to settings → state rollout; Won stat tile → emerald].

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
