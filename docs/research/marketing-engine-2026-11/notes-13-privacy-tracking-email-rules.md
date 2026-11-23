# Privacy, tracking and email rules for a one-person US dental-SaaS marketer (as of 2026-11-23)

NOTE: Research summary, not legal advice. Budget-limited pass (~15 tool calls, mostly search snippets plus 2 page fetches). Items marked UNVERIFIED rest on search summaries or my background knowledge and need primary-source confirmation by counsel. Several law-firm/vendor sources disagree on dates; conflicts are flagged.

## 1. US state privacy laws, data brokers, consumer-health-data laws

### Takeaway
By Jan 2026 about 20 comprehensive state laws were in force (Indiana, Kentucky, Rhode Island added 1 Jan 2026); sources now count 24 states, with Oklahoma, Louisiana and Alabama arriving in 2027 (dates conflict). Most laws use volume thresholds (35k/100k consumers) that a tiny seller of B2B software will not meet, but California, the data-broker registration laws, and the small-business consent-to-sell-sensitive-data rules (TX/NE/MN) deserve a check. Prospect-database data-broker exposure turns on "sale" to third parties, which the company does not do.

### Cited Findings
- Indiana, Kentucky and Rhode Island comprehensive laws took effect 1 Jan 2026. IN/KY thresholds: 100,000 consumers, or 25,000 plus >50% revenue from data sales. RI: 35,000 consumers, or 10,000 plus >20% revenue from sales. (vendor/law-firm summaries; verify against statutes) — [TrustArc](https://trustarc.com/resource/new-in-2026-state-privacy-laws-in-indiana-kentucky-and-rhode-island/), [Sheppard Mullin](https://www.sheppard.com/insights/blogs/three-states-one-date-ringing-in-the-new-year-with-indiana-kentucky-and-rhode-island)
- By Oct 2026 a tracker counts 24 states with comprehensive privacy laws — [MultiState](https://www.multistate.us/insider/2026/10/28/twenty-four-states-now-have-comprehensive-consumer-privacy-laws); Venable mid-2026 update — [Venable](https://www.venable.com/insights/publications/2026/07/2026-mid-year-state-privacy-law-update)
- 2027 effective dates reported: Oklahoma 1 Jan 2027 (30-day cure); Louisiana 1 Jan 2027; Alabama 1 May 2027 per most sources (one says 1 Jan 2027); Vermont conflicting (1 Jan 2027 vs 1 Jan 2028) — search summary of IAB/Venable/Morgan Lewis etc.; see [IAB Sept 2026](https://www.iab.com/wp-content/uploads/2026/09/U.S.-State-Privacy-and-AI-Legislative-Insights-6.pdf), [Morgan Lewis July 2026](https://www.morganlewis.com/pubs/2026/07/us-state-consumer-privacy-law-update-notable-changes-across-existing-frameworks). CONFLICTING; UNVERIFIED.
- Connecticut CTDPA amendments (SB 1295) mostly effective 1 Jul 2026; Connecticut SB 4 effective 1 Jan 2027 adds data broker registration — [Morgan Lewis](https://www.morganlewis.com/pubs/2026/07/us-state-consumer-privacy-law-update-notable-changes-across-existing-frameworks) (via search summary; UNVERIFIED detail).
- Texas and Nebraska: "no minimum threshold" in vendor summaries refers to no data-sale revenue share requirement; they apply SBA-small-business tests and require even small businesses to get consent before SELLING sensitive data. Sources inconsistent; the "no revenue threshold" framing needs statute check — [Osano](https://www.osano.com/articles/multi-state-privacy-compliance), [Venable](https://www.venable.com/insights/publications/2026/07/2026-mid-year-state-privacy-law-update)
- Data-broker registration laws: California, Oregon, Texas, Vermont; Connecticut and New Jersey joined — same search summaries (UNVERIFIED primary text).
- California Delete Act: a "data broker" = business that knowingly collects AND SELLS to third parties personal information of consumers with whom it has no direct relationship. 2026 regulations (eff. 1 Jan 2026) say collecting info directly is not by itself a direct relationship (consumer must intend to interact) and sweep in third-party tracking-technology providers and businesses that augment first-party data with third-party data; DROP processing every 45 days began 1 Aug 2026; fines $200/day per deletion request; registration per legal entity. Enforcement: $56,600 (ROR Partners) and $45,000 (Datamasters) for failure to register — [Mofo Jan 2026](https://www.mofo.com/resources/insights/260115-think-you-re-not-a-data-broker-calprivacy-regulations), [CPPA DROP](https://cppa.ca.gov/data_brokers), [Manatt](https://www.manatt.com/insights/newsletters/client-alerts/california-s-first-of-its-kind-data-deletion-platform-goes-live-what-businesses-should-know)
- Delete Act exempts public-records information from deletion duty (not tied to NPPES in sources) — [Troutman](https://www.troutman.com/insights/understanding-the-california-delete-act-key-insights-and-implications/) (search snippet)

### Inferences
- A company that only uses its prospect list for its own first-party outreach and never sells/licenses it is NOT a "data broker" under the "sells" element; the risk appears if the list is shared, licensed, or used to power ad audiences sold to others. NPPES-derived data is public-record, helping on deletion duties but not clearly on registration.
- California CCPA thresholds (>$25M revenue indexed, or 100k consumers/households, or 50% revenue from selling/sharing) were not re-verified here; a one-person company likely falls under none, but "sharing" for cross-context behavioral ads is counted toward the 50% prong only if revenue-derived. Prospect data is personal info (no B2B exemption, per earlier research).
- Practical: even if exempt, publish a privacy policy and honor opt-outs/GPC as a low-cost hedge.

### Gaps
- Did not retrieve statute text for TX/NE small-business rules, Texas/Oregon/Vermont broker definitions, or Washington My Health My Data / Nevada / NY health information privacy act status. Not researched in this pass.
- CCPA 2026 regulation thresholds (risk assessments, cybersecurity audits, ADMT effective 1 Jan 2027 per search summary only) not verified.

## 2. Tracking-technology litigation (CIPA etc.)

### Takeaway
California SB 690 was signed 30 Sep 2026 but ONLY removes the private right of action for pen-register/trap-and-trace (Penal Code 638.51) claims over website/app tracking (AG-only; retroactive to pending claims filed within two years of effective date). Section 631 wiretap claims survive, as do other theories, so pixel/session-replay/chat-widget suits remain a live risk, though Article III standing (Popa v. Microsoft, 9th Cir. Aug 2025) and "contents" requirements make them harder.

### Cited Findings
- SB 690 enacted 30 Sep 2026; original "commercial business purpose" exemption dropped; only 638.51 private suits eliminated; 631/632 unchanged — [Morgan Lewis Oct 2026](https://www.morganlewis.com/ru/pubs/2026/10/california-eliminates-private-right-of-action-under-cipas-pen-register-and-trap-and-trace-provision), [Duane Morris Sept 2026](https://www.duanemorris.com/alerts/california_legislature_passes_sb690_creating_major_curb_pixel_tracking_lawsuits_under_cipa_0926.html), [Sidley Sept 2026](https://www.sidley.com/en/insights/newsupdates/2026/09/californias-sb-690-clears-the-legislature-what-it-means-for-cipa-website-tracking-claims) (effective date not stated in fetched text)
- Popa v. Microsoft (9th Cir. Aug 2025) raised standing bar; district courts split; Krzyzek v. OpenX (N.D. Cal. Jan 2026) denied dismissal of 631(a) claim; other 2026 dismissals; Drummer v. CoStar interlocutory appeal pending (outcome unconfirmed) — [Holland & Knight Feb 2026](https://www.hklaw.com/en/insights/publications/2026/02/uncertainty-continues-in-california-on-cipa-section-63851-claims), [WLF July 2026](https://www.wlf.org/2026/07/28/publishing/post-popa-v-microsoft-courts-in-california-keep-the-standing-bar-high-for-web-tracking-claims/), [Troutman Feb 2026](https://www.troutmanprivacy.com/2026/02/privacy-litigation-report-takeaways-from-january-2026-decisions/), [Mayer Brown Oct 2026](https://www.mayerbrown.com/ja/insights/publications/2026/10/california-district-court-draws-critical-line-between-browsing-data-and-contents-of-communications-under-cipa)
- Duane Morris advises not to build compliance strategy around a commercial-business-purpose defense — link above.

### Inferences
- Applicability to a small company: CIPA suits target any site reachable by Californians regardless of size; plaintiffs' firms favor sites with Meta/Google pixels, session replay, chat widgets. A first-party-only beacon with no third-party recipient is the lowest-risk posture. Consent banners with prior blocking of third-party tags are risk-reducing, not legally required for US-only traffic outside California-style opt-out rules (UNVERIFIED; no 2026 source retrieved).

### Gaps
- Typical demand-letter amounts (commonly cited $5,000 statutory per violation under 637.2; not retrieved), other-state wiretap suits (PA, MA, etc.), Consent Mode effect: not researched.

## 3. HIPAA and tracking; HHS; Security Rule

### Takeaway
Security Rule overhaul has been pushed out to July 2027 (long-term agenda); existing rule stays in force. I could not retrieve 2025-26 updates on OCR's tracking guidance post-AHA v. Becerra. Still, a business associate's pages that touch PHI (clinic sites/portals) should carry no ad pixels.

### Cited Findings
- OCR's March 2024 updated bulletin on tracking technologies on unauthenticated pages exists; caption AHA v. Rainer (N.D. Tex.) — [HHS](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/hipaa-online-tracking/) (fetch blocked 403; snippet only), [Loeb](https://loeb.com/en/insights/publications/2024/03/ocr-issues-updated-guidance-on-use-of-online-tracking-technologies)
- HIPAA Security Rule final rule postponed to July 2027; moved to Long-Term Actions; Privacy Rule update targeted Aug 2026 (issuance unconfirmed) — [Fierce Healthcare](https://www.fiercehealthcare.com/health-tech/feds-push-back-hipaa-security-rule-overhaul-july-2027), [DWT July 2026](https://www.dwt.com/blogs/privacy--security-law-blog/2026/07/hhs-updates-hipaa-rulemaking-timeframes), [Clark Hill](https://clarkhill.com/news-events/news/hipaa-security-rule-update-delayed-until-2027/). Some conflicting detail (an OMB-submission note).

### Inferences
- The vendor's own B2B marketing pages are not PHI-bearing, so HIPAA tracker rules do not directly apply; subdomain clinic sites/portals are different (company is a BA) and should have no Meta/Google/Microsoft pixels. First-party cookieless analytics on them is the conservative choice.

### Gaps
- AHA v. Becerra vacatur details (my background: June 2024 N.D. Tex. vacated the "proscribed combination" portion; UNVERIFIED here), FTC Health Breach Notification Rule and 2026 health-data ad cases, truthful BAA/HIPAA claim wording: not retrieved.

## 4. Ad-platform policies (Google, Meta, Microsoft, LinkedIn, AI claims)

### Takeaway
Meta restricts health-and-wellness data via Business Tools (three tiers; CAPI does not bypass); impact on a B2B dental-software advertiser is likely limited but should be monitored. Google's 2025 clarification allows remarketing/Customer Match for health brands marketing to licensed professionals. I did not retrieve Consent Mode v2 US requirements, Customer Match eligibility, Microsoft UET, LinkedIn, or AI-claims material.

### Cited Findings
- Meta categorizes sources; restrictions mild/moderate/severe; alerts by email/in-product; may restrict mid-/lower-funnel events; CAPI doesn't bypass — [Stape Oct 2026](https://stape.io/news/meta-data-sharing-restrictions-healthcare), [Search Engine Land](https://searchengineland.com/meta-ads-restrictions-health-wellness-campaigns-453094), [Foley Hoag](https://foleyhoag.com/news-and-insights/blogs/security-privacy-and-the-law/2025/january/meta-s-new-advertising-rules-key-considerations-for-health-and-wellness-businesses/) (vendor sources, not Meta's own docs)
- Google (July 2025) clarified personalized-health-interest ban does not apply to licensed healthcare professionals; remarketing and Customer Match usable — [Accelerated Digital Media](https://www.accelerateddigitalmedia.com/?p=8226) (secondary)

### Gaps
Consent Mode v2 for US-only traffic; Customer Match eligibility/uploads of registry-derived lists; advertiser verification; Meta custom-audience terms; lead-ad privacy policy URL; Microsoft UET; LinkedIn; AI ad claims (FTC Operation AI Comply): not researched. Treat all as open.

## 5. FTC / state rules for SaaS marketing

### Takeaway
Click-to-Cancel (2024 rule) was vacated by the 8th Circuit 8 Jul 2025; FTC restarted rulemaking with an ANPRM (March 2026, comments to 13 Apr 2026); no re-proposed rule found. ROSCA/Section 5 enforcement continues. Consumer Reviews Rule: first public enforcement was warning letters to 10 companies on 22 Dec 2025 (penalty exposure up to $53,088/violation); no civil-penalty case found.

### Cited Findings
- Vacatur and restart: [Gibson Dunn](https://gibsondunn.com/ftc-restarts-negative-option-rulemaking-after-eighth-circuit-vacatur-enforcement-under-rosca-continues/), [Covington Mar 2026](https://www.cov.com/en/news-and-insights/insights/2026/03/ftc-launches-new-rulemaking-on-the-negative-option-rule), [Jones Day May 2026](https://www.jonesday.com/en/insights/2026/05/ftc-revives-clicktocancel-rule-new-risks-for-subscription-businesses), [Kelley Drye](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/ftc-relaunches-negative-option-rulemaking-with-new-questions-new-branding.md); FTC alleged Section 5 violations (NextMed) for practices the vacated rule targeted (Jones Day).
- Consumer Reviews Rule warning letters 22 Dec 2025 — [Venable](https://www.venable.com/insights/publications/2025/12/ftc-signals-heightened-enforcement-of-new), [Kelley Drye](https://www.kelleydrye.com/viewpoints/blogs/ad-law-access/ftc-warns-companies-of-potential-violations-of-the-consumer-review-rule), [Arnold & Porter](https://www.arnoldporter.com/en/perspectives/blogs/consumer-products-and-retail-navigator/2026/01/ftc-warning-letters-over-consumer-review-rule)

### Inferences
- A 7-day no-card trial that does not auto-charge largely sidesteps ROSCA/ARL "free trial converts to paid" risk; if the trial converts only after the customer adds a card, disclose price/terms clearly and offer online cancel. B2B is not clearly exempt under ROSCA or state ARLs (UNVERIFIED).

### Gaps
16 CFR 233 former-price ("regularly $500") substantiation, 16 CFR 255 partner disclosures, Lanham Act comparative advertising, California ARL: no sources retrieved. Principle (background knowledge, UNVERIFIED here): a "regular" price must have been genuinely offered in good faith for a substantial period.

## 6. Email deliverability and CAN-SPAM

### Takeaway
Gmail/Yahoo/Microsoft bulk rules (5,000+/day thresholds) are enforced; a small opt-in nurture sender is under the threshold but should meet SPF/DKIM/DMARC alignment, one-click unsubscribe and <0.3% spam complaints anyway.

### Cited Findings
- Thresholds 5,000+/day; spam rate <0.3%; RFC 8058 one-click; Microsoft SPF/DKIM/DMARC alignment, enforcement from 5 May 2025; Gmail stricter phase from Nov 2025; harsher rejections (550) — [Red Sift](https://redsift.com/guides/bulk-email-sender-requirements), [PowerDMARC](https://powerdmarc.com/google-and-yahoo-email-authentication-requirements/), [Proofpoint](https://www.proofpoint.com/us/blog/email-and-cloud-threats/clock-ticking-stricter-email-authentication-enforcements-google-start). Vendor sources; dates differ; check official Google/Yahoo/Microsoft pages.

### Gaps
CAN-SPAM 2026 changes, Washington CEMA, Apple MPP/Gmail AI summaries effects, BIMI, 2026 benchmarks, ESP cold-email AUP changes: not researched.

## 7. Telemarketing / TCPA (brief)

### Takeaway
One-to-one consent rule was vacated (11th Cir., 24 Jan 2025; FCC formally removed it Sept 2025). The revoke-all rule's effective date was pushed to 31 Jan 2027 (DA 26-12), with a Sept 2026 FCC proposal to narrow it; finalization unconfirmed.

### Cited Findings
- [Mofo](https://www.mofo.com/resources/insights/250130-eleventh-circuit-vacates-fcc-s-tcpa-one-to-one-consent-rule), [Goodwin](https://www.goodwinlaw.com/en/insights/blogs/2025/09/the-fcc-issues-final-rule-formally-eliminating-the-one-to-one-consent-requirement), [FCC DA 26-12](https://docs.fcc.gov/public/attachments/DA-26-12A1.pdf), [Troutman Sept 2026](https://www.troutman.com/insights/fcc-revises-tcpa-revocation-of-consent-rules-that-were-set-to-go-into-effect-in-january/)

### Gaps
Texas SB 140 mini-TCPA, AI-voice rules in 2026, B2B scope: not retrieved.

## 8. Other (ADA/WCAG, measurement)

### Gaps
No sources retrieved on ADA/WCAG suits or server-side/CAPI/cookieless analytics treatment. Inference only: cookieless first-party analytics with no third-party transfer avoids the CIPA third-party-recipient theory and most consent regimes.

## Deliverable lists (derived; subject to the gaps above)

### Minimum compliant setup checklist
1. Publish Privacy Policy and Terms before any ad runs; include categories collected, purposes, no-sale/sharing statement or "Do Not Sell/Share" link if pixels fire, GPC honoring, state-rights request channel, contact, retention.
2. Keep ad pixels off clinic subdomains/portals entirely; load them only on www marketing pages.
3. Load third-party pixels only after consent/opt-out check for California-style opt-outs; honor Global Privacy Control; keep the first-party beacon cookieless.
4. Opt-in lead forms with explicit marketing consent and timestamp; keep the single consent spine; unsubscribe within 10 business days (CAN-SPAM, background).
5. Resend nurture: SPF, DKIM, DMARC aligned on a subdomain, RFC 8058 List-Unsubscribe-Post header, physical address, complaint rate under 0.3% (ideally <0.1%), opt-in list only.
6. Prospect DB: no sale/licensing; honor deletions; register as data broker only if ever selling; human-dialed, DNC-scrubbed calls.
7. Subscription terms: clear price, trial terms, easy online cancel.

### Do-not-do list
- No Meta/Google/Microsoft pixels, session replay or chat widgets on clinic sites or portals; no "HIPAA compliant" claim; no cold email through Resend/SES; no uploading prospect lists to ad platforms as audiences without confirmed policy permission (UNVERIFIED); no incentivized reviews conditioned on sentiment; no unsubstantiated "regularly $500" price; no cold SMS.

### Legal pages/disclosures to publish before ads run
Privacy Policy (with state-specific rights and opt-out/GPC language), Terms of Service, cookie/tracking notice (and "Your Privacy Choices" link if sharing), subscription/cancellation and trial terms, pricing disclosure basis for former price, partner-program disclosure terms (16 CFR 255, UNVERIFIED), accessibility statement (optional), contact/physical address, security/BAA accuracy statement.
