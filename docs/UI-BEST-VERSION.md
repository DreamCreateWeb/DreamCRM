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
1. Slot buttons ~36px — UNDER the tap floor on the most-tapped control (slot-picker.tsx:213). 
2. Three files re-declare INK/MUTED/BORDER locally → import PORTAL_* (book-form.tsx:19, request-form.tsx:18, profile-form.tsx:13).
3. Submit buttons bypass BrandButton (book-form.tsx:256, request-form.tsx:210, confirmation CTAs :126).
4. request-form lost sibling a11y: no role=group/aria-pressed (:105,:133), no role=alert (:203), outline-none no ring (:181,:199).
5. "No openings" box has no next step — pair with the phone link (slot-picker.tsx:178).

### Billing / invoices
1. pay-form.tsx most primitive-starved file: raw hexes, hand pill, error sans role=alert (:46-77).
2. Post-Stripe success banner hand-rolled + never announced → PortalNotice + role=status (invoices/page.tsx:117).
3. billing-history tabs ~28px, tab ARIA half-wired (:65).
4. plan-offer.tsx already best-version.

### Records
1. Off-palette #B4452F error hex → PortalErrorText (request-records.tsx:69).
2. Success state hand-rolled, no live region (:36).
3. "Not on file" dimmed to #B9B0A5 → PORTAL_MUTED (records/page.tsx:27).

### Portal messages
1. Send feedback 0.78rem, unannounced, self-clears (messages-view.tsx:321).
2. Composer vs tab bar on short phones; rows=2 fixed (:144; layout pb-28).
3. Attachment remove 20px target (:255).
4. 📎 emoji icon → PortalIcon stroke (:289).

### Profile
1. outline-none, NO focus ring on 11 fields → PortalInput (profile-form.tsx:57). [WCAG-level]
2. Save confirmation vanishing whisper, no live region (:150).
3. Sign out no pending state (:196).
4. Opt-in toggle reverts silently on failure (:98).

### Family
1. "Book for {name}" ~32px → BrandButton small (family/page.tsx:88).
2. No-dependents state hides FamilyLinkRequest — render it (:32).
3. "· 8" age without unit (:75).

### Intake (portal)
1. "Fill it out" ~32px pill (intake/page.tsx:110).
2. Raw #7BA37E green → PORTAL_SUCCESS_INK (:138).
3. Empty to-fill state not PortalEmptyState, no next step (:89).

### Portal primitives + shared cards
1. NPS row 36px circles + hover:scale on touch (survey-card.tsx:74).
2. VisitCard Confirm has no "Confirming…" label (visit-card.tsx:204).
3. VisitCard duplicates STATUS_STYLES + hand-rolls result notice (:36,:318).
4. loyalty-card text-rose-600 (:99).
5. PortalEmptyState hardcoded #9CAF9F fallback brand (ui.tsx:180).
6. family-link-request placeholders-as-labels (:76).

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
