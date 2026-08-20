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
8. Raw inputs/selects in the inbox → .form-input/.form-select (approval-inbox.tsx:835-1045).
9. Three amber notice dialects stacked (clinic-overview.tsx:377,418 + guardian-note-card.tsx:53) → one local AttentionBanner.
10. Sign-here stack keyboard path: →/n skip, ←/p previous.
11. Two of five trend tiles have no spark/delta (:719, :726).
12. ComingSoonCard = permanent dead chrome (:811,925) → footnote in Reviews tile.

### My Day
Already best-version: ClosedHeartbeat, undo-toast on tick-off.
1. [BATCH 10] loading.tsx max-w-6xl vs page max-w-[96rem] — guaranteed reflow (my-day/loading.tsx:11).
2. Tick-off circle not disabled during transition — double-fire (my-day-followups.tsx:110).
3. ~~Prep flags bare amber text~~ [BATCH 15: StatusPill warn].
4. Raw 🪑/🚪 emoji, no legend → GlyphCluster + EncodingLegend (page.tsx:192).
5. ~~Unread badge hand-rolled~~ [BATCH 15: StatusPill warn + hover meaning].
6. ~~"Claim" raw chip~~ [BATCH 15: ActionButton secondary sm + pending].
7. 7 KPI tiles in 3-col grid orphan the North-Star tile (page.tsx:55).
8. No primary action; "All my follow-ups" should be it (page.tsx:47).
9. digest-toggle: ~~no pending acknowledgment~~ [BATCH 15]; the orphaned placement stays (a deliberate quiet footnote).
10. Sparkline compat import → MiniTrend (closed-heartbeat.tsx:2).

### Follow-ups board
Already best-version: due-state grouping, optimistic complete with honest revert.
1. [BATCH 10] No PendingVeil on filter nav (followups-board.tsx:79).
2. [BATCH 10] One useTransition freezes rows during nav — split navPending/rowPending (:77,:226,:279,:309).
3. Settings card between filters and the work → one-line summary + disclosure (:191).
4. No tailored loading.tsx.
5. Empty states hand over no action — pass EmptyState action (:196).
6. "N due now" hand-rolled pill in the primary slot → StatusPill in subtitle (:150).
7. Tick circle drifted from My Day's → one shared TickButton.
8. Bordered select on every row → text that becomes select on hover/focus (:306).
9. Heartbeat hidden lg:flex — gone on tablets (:176).
10. Sparkline → MiniTrend (:10).

### Leads
Already best-version: tone/ball-in-court mapping, ageTitle, per-status empty copy, drawer action ladder, dedupe confirm.
1. [BATCH 10] Archive sub-panel escapes the drawer — add `relative` (lead-drawer.tsx:196).
2. [BATCH 10] Rows mouse-only — role/tabIndex/Enter (leads-view.tsx:341).
3. [BATCH 10] Hand-rolled search → SearchInput (leads-view.tsx:249).
4. [BATCH 10] Discarded pending flag → PendingVeil (:106,:173).
5. Empty states actionless (:411).
6. Drawer timeline uses browser-local time → formatClinicDayTime (lead-drawer.tsx:45).
7. leads/loading.tsx isn't the aging-card-stack shape.
8. Select-all orphaned between blocks (:279).
9. Two styles for the archive step's two exits (lead-drawer.tsx:391 vs :412).
10. Spark desktop-only + compat import (:258).

---

## Cluster 2 — Records + Comms (Patients · Appointments · Messages · Inbox · Intake)

### Patients list
1. ~~Sort headers unfocusable, no aria-sort, arrow shifts width~~ [BATCH 11: SortableTh — real buttons, aria-sort, fixed arrow slot].
2. Row dead outside the name cell — whole-row nav + name stays a real link (:649 vs :625).
3. Search needs Enter but never says so (:337) — inline ↵ hint.
4. Two raw selects amid FilterChips (source/tag, :397).
5. Bulk bar: ~~Invite/Pay-link ternaries~~ [BATCH 11: pending prop]; the "Tagging…" placeholder-select spinner remains (popover-menu candidate).
6. ~~No sticky thead~~ [BATCH 11].
7. Heartbeat hidden lg:flex (:426).
8. saved-views-bar re-implements FilterChip ×4 (:121,:175,:201,:228).
9. Saved-view delete hover-only, no confirm (:147).
10. window.prompt() for audience naming (:106).
11. text-gray-400 on meaningful labels (:119,:188).

### Patient detail
1. Six same-weight header actions — collapse to primary + More ▾ (patient-detail.tsx:255).
2. ~~Vanishing feedback spans~~ [BATCH 12: Send-intake/review/portal-invite report through the global toast; the pay-link nudge keeps its persistent inline confirmation by design].
3. Timeline filter is component-local → ?tab= param (:165).
4. Timeline empty state actionless (:360).
5. Needs-attention hand-rolled box → v2-card + StatusPill + ActionButton (:590).
6. Amber-emoji aging encoding not in any legend → agingBorderClass on the li (:872).
7. Raw back link where TrailBack exists (:205).
8. Header stat strip has no heartbeat — MiniTrend of visits/quarter (:288).
9. Timeline unbounded — "show older" break (:367).
10. Rail panels' empty prose ≠ EmptyState; note bodies at text-xs (notes-panel.tsx:51,:60; tags:103; documents:125; followups:107).
11. Note delete bare × no confirm (~16px) (notes-panel.tsx:65); doc upload no progress (documents-panel.tsx:105).

### Patients modals
1. ~~merge-duplicate unsafe shell~~ [BATCH 12: role=dialog + aria-modal + focus trap + Esc; scrim-click deliberately does NOT dismiss an irreversible flow].
2. Import wizard has no step indicator (import-patients-modal.tsx:132,157,231).
3. Import file picker raw input → v2-well drop target + filename echo (:138).
4. Edit modal: 14 fields, no section headings, no ✕ (edit-modal.tsx:88).
5. Bulk message: no recipient visibility; ternary send (:57,:110).
6. Add-patient doesn't autofocus first field (:76). (Duplicate card already best-version.)
7. Import close is text × → icon button (:120).
8. ~~SIX modals spin their Cancel~~ [BATCH 11: disabled, never pending, on every onClose].

### Agenda
Already best-version: emptyCopy() engine.
1. ~~Row is li onClick — mouse-only drawer~~ [BATCH 11: role=button + Enter/Space + aria-label].
2. Nine chips + two selects + search in one unlabeled row (:422).
3. Bulk bar ternaries; siblings show nothing (:511).
4. Right cluster shrink-0 squeezes patient name (:703).
5. ~~Sticky day header top-0 tucks under chrome~~ [BATCH 11: top-16].
6. Bulk follow-up composer: no focus trap/outside-click (:799).

### Appointment drawer + booking
1. ~~One useTransition spins five buttons at once~~ [BATCH 12: activeAction keys — only the clicked button spins, the rest disable].
2. No sticky footer action row — Drawer has the slot (:293 vs drawer.tsx:113).
3. ~~Reschedule always opens tomorrow 09:00~~ [BATCH 12: seeds from the visit's own local date+time; past visits fall back].
4. In-office undo is text-gray-400 micro-text (:487).
5. Reminder activity all text-xs incl. patient replies (:528).
6. Booking drawer slot grid collapses to text while loading → skeleton chips (book-from-patient-drawer.tsx:230).
7. ~~Walk-in defaults 09:00~~ [BATCH 12: now, rounded up to the next quarter hour].
8. Fast-pass summary tiny; Remove no confirm (waitlist-panel.tsx:52,:79).

### Messages (list + detail)
Already best-version: the message stream + receipts; per-row optimistic nav.
1. No keyboard nav while /inbox has j/k — reuse handler shape (clinic-thread-list.tsx).
2. ~~Metadata at text-gray-400: timestamp, You:, assignee~~ [BATCH 11: gray-500 floor]; read preview weight kept (unread bolding is the signal).
3. ~~Urgency badge hand-rolled rose~~ [BATCH 11: StatusPill tone=urgent].
4. 14px checkboxes on a batch surface (:128,:161).
5. Snooze popover: no Esc/outside-click (:303).
6. Empty states actionless (clinic-messages-view.tsx:270,:352).
7. ~~Composer rows=2 no auto-grow~~ [BATCH 11: grows to 280px, collapses on send].
8. ~~Send mislabels during unrelated actions~~ [BATCH 11: dedicated sending flag + pending prop].
9. Header stacks six blocks before the stream (:694-1012) — fold tags/follow-up behind a disclosure.
10. Four popovers, zero Esc (:779,:855,:1298,:1390).
11. Schedule confirm raw violet button (:1409).
12. Attachment remove opacity-0 hover-only (:1235).
13. Receipts/footnotes at text-gray-400 (:1121,:1449).

### Inbox
1. Route blocks first paint on sync+classify; generic skeleton (inbox/page.tsx:93; loading.tsx).
2. Arbitrary px type in reading pane (thread-view.tsx:191 etc.).
3. Raw surface colors → tokens (mailbox-sidebar.tsx:163, thread-view.tsx:134).
4. FilterChips hand-rolls FilterChip (filter-chips.tsx:111).
5. BulkActionBar swaps header in place; no toasts (mailbox-sidebar.tsx:164).
6. Trash/Archive: no confirm, no feedback (thread-view.tsx:106).
7. Unread emerald here vs amber in Messages — contract conflict (mailbox-sidebar.tsx:241).
8. Hover-revealed checkboxes; prose empty state; lowercase refresh (:253,:211,:377).
9. ToolbarButton re-implements primary (thread-view.tsx:348).

### Intake forms + builder
Already best-version: CompletedHeartbeat.
1. ~~Fill URL un-copyable gray mono~~ [BATCH 11: the new shared CopyChip primitive].
2. ~~"No submissions yet" dimmed below floor~~ [BATCH 11].
3. Three equal row buttons; Edit is the daily one (:163).
4. Packets: ~~uncopyable URLs + dim empty state~~ [BATCH 11: CopyChip + contrast]; raw rose Delete remains.
5. Submissions index actionless, unfiltered, silent 50-cap (submissions/page.tsx:42).
6. Builder reorder = 10px ▲▼ text glyphs (form-builder.tsx:303,:441).
7. Archive adjacent to Save in the sticky bar (:402).
8. Remove-section deletes questions with no confirm (:338).
9. No dirty-state indicator (:381).
10. Preview hidden under lg (:415).
11. Add-field native details dump, ungrouped (:723).
12. Raw back link where TrailBack exists (:227).

---

## Cluster 3 — Portal + Hubs + Settings

### Portal chrome & shell
1. Runtime Google-Fonts fetch for Fraunces → FOUT on cell data; self-host woff2 (app/(portal)/layout.tsx:151).
2. portal loading.tsx is cool-gray dashboard shimmer on the warm canvas (loading.tsx:9).
3. Header "Book a visit" stays primary ON /patient/book (self-link) (layout.tsx:210).

### Patient dashboard
1. Two hand-rolled amber strips → PortalNotice warn (+ one-off #EBDCB8 hex) (dashboard/page.tsx:99,116).
2. Balance amount buried mid-sentence → bold leading fragment (:107).
3. Verbs grid tiles: no active:scale pressed state (:231).
4. "See all visits" only shows >3 upcoming → show when >0 (:194).

### Appointments (portal)
1. Past-visit rows not tappable though [id] handles them (appointments/page.tsx:78).
2. Past list uncapped → ~10 + "Show older" (:78).
3. Empty Past section silently omitted → one quiet line (:73).

### Visit detail — mostly already best-version.
1. Pending-forms callout re-implements PortalNotice ([id]/page.tsx:86).
2. Bring-list emoji as bullets — quiet them (:115).

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
1. Hero KPI + FunnelStat hand-rolled → KpiStat (growth/page.tsx:129,:490).
2. NewsCard duplicated verbatim across two hubs → hoist (growth:522, website:581).
3. Funnel numbers lack heartbeats; "due & reachable" + "booked back" deserve MiniTrend.
4. Utility footer links ~20px hit height (:400).

### Reviews
1. Sixteen KPIs, zero heartbeats (:180-296).
2. Four identical bands → v2-well differentiation.
3. Google-link gate hand-rolled amber panel (:165).
4. Secondary competes with breath primary in header (:150).

### Audiences
1. ~~Full danger Delete on every card~~ [BATCH 13: ghost w/ rose hover].
2. ~~Recipient count whispered~~ [BATCH 13: mono-numeral hero].
3. ~~Empty state actionless~~ [BATCH 13: + New audience in the well].
4. ~~Shared pending spins all Deletes~~ [BATCH 13: per-card deletingId].
5. Per-audience counts resolved before first paint → stream w/ Suspense (page.tsx:28).

### Outreach queue
1. TIER_ACCENT_BG contradicts the tone contract (queue:39 vs legend :96).
2. Empty tiers render full-height → collapse to a line (:139).
3. Four primary Sends at once → largest tier primary, rest secondary (:157).

### Website hub
1. ~~"Your site is live" prints even when NOT live~~ [BATCH 13: gated on siteLiveAt].
2. 30-day KPI trio hand-rolled; delta detached from its tile (:399,:383).
3. Go-live checklist fake radio circles (:307).
4. Utility footer repeats hero facts (:541).

### Quick edits
1. ~~Save = raw bg-teal-500~~ [BATCH 13: ActionButton primary + pending].
2. ~~Errors, no live region~~ [BATCH 13: role=alert].
3. No focus trap in the modal (:209).
4. Services modal saves silently (:151).

### Design panel
1. ~~Four identical primaries on one surface~~ [BATCH 13: the hoisted SaveBar on all three cards; Browse-designs demoted to secondary].
2. ~~Saved ✓ self-destructs 2.5s~~ [BATCH 13: persists until next edit, role=status].
3. ~~Two cards allow no-op saves~~ [BATCH 13: dirty tracking everywhere].
4. ~~"Publish to go live" ×3~~ [BATCH 13: once at panel level].

### Pages manager
1. Three same-weight 12px links/row → one primary (pages-manager.tsx:87).
2. invisible-but-focusable chevron (:69).
3. ~~"N text edits" unexplained~~ [BATCH 14: title explains + points at the disclosure].

### Website forms
1. Submission rows not links (forms-panel.tsx:81).
2. Empty state plain sentence (:98).
3. count7d whispers at 12px (:69).

### Settings home
1. No tile carries state (Team invites, Billing trial…) (settings-home.tsx:106).
2. Search results unannounced/uncounted (:72).
3. Clear-search 20px target (:58).
4. No-match bare sentence (:86).

### Team
1. ~~Default tab = Invite~~ [BATCH 13: Members → Pending → Invite].
2. ~~Pending count invisible~~ [BATCH 13: "Pending (N)" in the tab label].
3. Shared pending spins every row (:108,:264,:333).
4. Raw amber vs TONE_TEXT.warn (:255).

### Practice — the SaveBar is the model.
1. ~~Hoist SaveBar~~ [BATCH 13: components/ui/save-bar.tsx; practice + design adopted; portal Profile still open].
2. View-only banner hand-rolled amber (:56).
3. Raw emerald tick vs TONE_TEXT.ok (:113).
4. Tabs never write the URL → ?tab= (settings-tabs.tsx:91).

### Billing panel
1. Four money facts as prose → label/value grid w/ mono numerals (subscription-panel.tsx:263).
2. One pending covers checkout/portal/cancel/resume (:112; pendingPlan :126 models the fix).
3. Upgrade nudge hand-rolled violet (:227).

### Payments hub
1. Doors restate the KPI band verbatim (hub-doors.tsx:31 vs page:73).
2. Only one of four KPIs has a heartbeat; "Outstanding" has none (:88).
3. Doors bespoke hover ≠ v2-card-interactive (:67).
4. Stripe notice hand-rolled violet (:62).

### Shop hub
1. ~~TWO "Connect Stripe" primaries~~ [BATCH 13: panel copy demoted to secondary].
2. Up to four stacked notices before data; raw ramps (:148-172).
3. Sales band can vanish entirely → EmptyState holds the layout (:263).
4. LowStockPanel outranks the Sales band (:260).
