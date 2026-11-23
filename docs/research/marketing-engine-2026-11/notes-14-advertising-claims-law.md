# US advertising-claims and website-disclosure law for DreamCRM's marketing site (as of 2026-11-23)

Not legal advice. This is research for a small Arkansas B2B SaaS seller; have a licensed attorney review before relying on it. Source-quality note: eCFR/Cornell and statute pages were fetched through a summarizing tool (quotes limited to short fragments); many case/trend items come from law-firm alerts and aggregators and are marked. Items marked UNVERIFIED are background knowledge or search-snippet only. Does not repeat the first-round notes (state privacy thresholds, CIPA, email sender rules, TCPA).

## 1. Privacy policy duty (fact 5: no Privacy Policy / Terms, but collects emails)

### Takeaway
CalOPPA has no size threshold or in-state-presence requirement on its face, but it only protects "consumers" (individuals buying for personal/family/household purposes), so a pure B2B email list is a weaker fit; Delaware has a similar statute (unverified detail). Regardless of statute, Google Ads, Meta and review platforms effectively require a posted privacy policy, and an unposted-policy site that collects emails through a grader and signup is the cheapest gap to close.

### Cited Findings
- CalOPPA duty: an operator of a commercial website or online service that collects personally identifiable information from California consumers must "conspicuously post its privacy policy on its Web site" — [Cal. Bus. & Prof. Code 22575 (Justia)](https://law.justia.com/codes/california/code-bpc/division-8/chapter-22/section-22575/) (snippet via search; full text on leginfo not retrieved).
- Conspicuous = homepage or first significant page, or a text link on it including the word "privacy" (22577(b)) — [search summary of 22577](https://law.justia.com/codes/california/2007/bpc/22575-22579.html).
- Notice-and-cure: "An operator shall be in violation of this subdivision only if the operator fails to post its policy within 30 days after being notified of noncompliance" — [22575(a) via Justia](https://law.justia.com/codes/california/code-bpc/division-8/chapter-22/section-22575/). Section 22576 also makes it a violation to fail to comply with one's own posted policy — [22576](https://california.public.law/codes/ca_bus_and_prof_code_section_22576).
- Definitions: PII includes an email address; "consumer" means "any individual who seeks or acquires, by purchase or lease, any goods, services, money, or credit" for personal, family or household purposes — [22577 (California Public.Law)](https://california.public.law/codes/ca_bus_and_prof_code_section_22577).
- Required contents (22575(b)): categories of PII collected, categories of third parties it is shared with, process to review/change PII (if offered), notice of material changes, effective date, and Do Not Track disclosure (2013 amendment) — [Pillsbury chaptered AB 370 text](https://pillsburylaw.com/a/web/5281/9dhmpk/ab2037020chaptered1.pdf) (title only retrieved; contents list is from background, UNVERIFIED in this pass).
- Delaware's DOPPA reportedly requires website/app operators collecting PII of Delaware residents to conspicuously post a privacy policy; section-level text not retrieved — [Nixon Peabody Apr 2026 (secondary)](https://nixonpeabody.com/insights/alerts/2026/04/21/practical-guidance-for-organizations-navigating-us-state-law-requirements). Nevada NRS 603A.340: not confirmed.
- Google Ads: advertisers using data segments must disclose in their privacy policy how data is used for online advertising; a lead form asset requires a link to a privacy policy — [Google Ads Help 2549063](https://support.google.com/google-ads/answer/2549063).
- Meta Custom Audiences/lead ads: secondary sources say customer-list uploads must be disclosed in the privacy policy and data lawfully collected; Meta's own terms NOT retrieved — [Usercentrics (secondary)](https://usercentrics.com/guides/social-media-email-marketing-compliance/facebook-gdpr/).
- G2 and Capterra: gift-card incentives are run through the platforms' own programs and labeled/disclosed (see section 7); no privacy-policy requirement was found for listing a vendor.

### Inferences
- A CalOPPA claim against a B2B-only site is arguable on the "consumer" definition, but the grader and partner form also collect from individuals (owners/staff), the site is free to avoid the argument, and the 30-day cure window means the realistic first-stage penalty is a notice letter. Penalties flow through unfair-competition law (UNVERIFIED; commonly cited up to $2,500 per violation under Bus. & Prof. 17206).
- Section 5 deception: once any policy exists, it must match practice (22576 and FTC Act). Posting an inaccurate policy is worse than none, so draft it against the real data flows (Resend, Stripe, S3, Anthropic API, Zernio, analytics).
- Terms of Service are not statutorily required, but they are needed for the trial/cancel/AUP terms, limitation of liability and the BAA reference; Stripe Checkout/Connect require the merchant to display terms/refund policy and contact info (Stripe rules NOT retrieved; UNVERIFIED).

### Gaps
- Official leginfo text for 22575(b) contents and penalty text; Nevada/Delaware statute text; Meta's Custom Audience Terms; Stripe business-website requirements.

## 2. Former-price and introductory-price claims (fact 1: "$200/mo founding rate (regularly $500)")

### Takeaway
This is the highest-risk claim. The FTC Guide says a former/regular price must be a price "actually" offered "on a regular basis"; a "regularly $500" never charged to anyone is the textbook fictitious comparison. Fix by dropping "regularly $500," or restating as a genuine future price with a date and a real intention.

### Cited Findings
- 16 CFR 233.1(a): the former price must be "the actual, bona fide price at which the article was offered to the public on a regular basis for a reasonably substantial period of time"; otherwise the bargain is fictitious — [Cornell LII 16 CFR 233.1](https://www.law.cornell.edu/cfr/text/16/233.1) (paraphrase and short fragments via summarizer; (c) says the reduced-from-inflated example is "obviously a false claim"). 233.1(b)-(d) list fictitious cases: a price never offered, an undisclosed price from the distant past, one not maintained long enough.
- 16 CFR 233.5 does NOT cover introductory offers; it warns against an advance sale where the seller does not "in good faith expect to increase the price" and a "limited" offer that "in fact, is not limited" — [Cornell 233.5](https://www.law.cornell.edu/cfr/text/16/233.5). The closest on-point hook for a "founding rate" is therefore 233.5's good-faith-intent language (plus 233.1 if "regularly $500" stays).
- The Guides are interpretive, not rules; FTC enforces through Section 5. They are consumer-oriented in drafting ("retail"), but Section 5 reaches B2B deception — UNVERIFIED here, background (15 U.S.C. 45(a)(1) covers acts "in or affecting commerce").
- California 17501: do not advertise a former price unless it was the prevailing market price within three months before the ad, or the ad "clearly, exactly and conspicuously" states the date it last prevailed; 4 CCR 1302 adds locality — [Cal. B&P 17501 (Public.Law)](https://california.public.law/codes/business_and_professions_code_section_17501), summarized at [Snell & Wilmer](https://www.swlaw.com/publication/californias-strike-through-pricing-law-what-companies-should-know-to-minimize-their-litigation-exposure/). Whether 17501 protects business buyers is NOT confirmed (the UCL/FAL generally allow business plaintiffs; UNVERIFIED).
- Litigation climate: wave of fake-reference-price class actions in consumer goods (Sheex, Snapfish, Best Buy per [Truth in Advertising list](https://truthinadvertising.org/class-action/sheexs-discounts/?pg=8), aggregator, verify dockets); a proposed class action over struck-through prices on Google AI Pro/Ultra subscriptions was dismissed as to the named plaintiff only, no class certified — [OpenClassActions Oct 2026](https://openclassactions.com/lawsuits/deceptive-pricing/google-gemini-ai-subscription-pricing-class-action-lawsuit.php). I found no software-specific fake-regular-price settlement.

### Inferences
- A one-person B2B seller is an unlikely class-action target but a plausible target of a competitor (Lanham Act 43(a), see section 4) or a Section 5 complaint; also bad for credibility if a prospect asks "who ever paid $500?"
- Legitimate wording options: (a) "$200/mo. Founding-practice rate: locked in for as long as you stay subscribed. List price will become $X for new practices starting [date]" ONLY if a date and price are actually decided and will be implemented; (b) simply "$200/mo, one plan, no contract" with no comparison; (c) "founding rate for the first N practices" only if the cap is real and enforced (233.5 "limited" warning). Do not say "regularly $500" or "save $300" unless $500 was truly offered to the public for a substantial period (test: some real sales or, at minimum, a genuine published price over a substantial period; none for DreamCRM today).
- A future-price claim is more defensible when it is clearly labeled future, dated, and the owner has a documented intention (decision record) to raise it.

### Gaps
- FTC/state case specifically on "introductory" or "founding member" SaaS pricing; whether 17501/UCL reaches a B2B buyer; Arkansas DTPA (Ark. Code 4-88-107) text not retrieved.

## 3. Free trial to paid, B2B (fact: 7-day no-card trial, then subscribe, month-to-month)

### Takeaway
ROSCA and California's ARL are consumer statutes; a no-card trial that does nothing unless the practice affirmatively subscribes is outside the "free-to-pay conversion" structure those laws regulate. New York GOL 5-903 is the one state law found that covers business service contracts, but it excludes renewal periods of one month or less. Keep clear "cancel anytime" claims truthful.

### Cited Findings
- ROSCA 15 U.S.C. 8403: unlawful "to charge or attempt to charge any consumer for any goods or services sold in a transaction effected on the Internet through a negative option feature" without disclosure, express informed consent and a simple cancellation mechanism — [govinfo 15 USC 8403](https://www.govinfo.gov/link/uscode/15/8403) (via search snippet). No B2B case or guidance found; reading rests on the word "consumer" — UNVERIFIED. A Quarles note says state law covers only B2C but is mixed on ROSCA — [Quarles](https://www.quarles.com/newsroom/publications/negative-option-plans-is-your-subscription-plan-compliant) (secondary).
- California ARL, Bus. & Prof. 17601: "consumer" is "any individual who seeks or acquires, by purchase or lease, any goods, services, money, or credit" for personal/family/household use; "free-to-pay conversion" is where a customer gets a product free for an initial period and must pay unless they "take affirmative action to cancel before the end of that period" — [17601 (Public.Law)](https://california.public.law/codes/ca_bus_and_prof_code_section_17601). AB 2863 amendments (signed 24 Sep 2024) apply to contracts entered/amended/extended on or after 1 Jul 2025 and add express affirmative consent and click-to-cancel/save-offer rules — [Fenwick](https://fenwick.com/insights/publications/california-tightens-requirements-for-automatically-renewing-subscriptions), [Barnes & Thornburg](https://btlaw.com/en/insights/alerts/2025/california-expands-automatic-renewal-law-new-requirements-now-in-effect).
- New York GOL 5-903: covers service/maintenance contracts for real or personal property with automatic renewal; courts construe it broadly (including IP-related service contracts per commentary); excludes renewal periods of one month or less and personal services — [Morgan Lewis](https://www.morganlewis.com/ja/blogs/sourcingatmorganlewis/2014/05/the-enforceability-of-automatic-renewal-provisions-under-new-york-law) (summary; statute text not retrieved, notice-window details unconfirmed). NY GBL 527 is consumer-only (same source set).
- Click-to-Cancel rule vacated by 8th Cir. 8 Jul 2025; FTC ANPRM Mar 2026; ROSCA/Section 5 continues — see first-round notes.

### Inferences
- With no card taken and no automatic charge, there is no negative option. Once a practice subscribes with a card, it is a month-to-month evergreen contract: the prudent step is to disclose before purchase price, billing date/frequency, that it renews monthly until canceled, and where to cancel (Settings), plus a confirmation email with those terms. Cheap insurance even though B2B likely falls outside ARL.
- A sole-proprietor dentist is still a business buyer, but mixed-use arguments exist; the safe design is B2C-grade disclosure.
- "Cancel anytime"/"no contract" must be literally true: cancel online without calls, state the effect on the billing period and refund policy (no source retrieved on a specific rule; FTC Section 5 general; UNVERIFIED).

### Gaps
- No case applying ROSCA to a B2B subscription; NY 5-903 text; other states' B2B ARLs (not researched).

## 4. Comparative advertising (fact 2: "DreamCRM vs Weave / NexHealth" with competitors' "reported pricing")

### Takeaway
Truthful comparative advertising is encouraged (FTC) and naming competitors is generally fine, but any literally false or misleading statement about a competitor's price can support a Lanham Act 43(a)(1)(B) suit by that competitor. Unsourced "reported pricing" is the exposure; cite, date and hedge, or remove numbers.

### Cited Findings
- 15 U.S.C. 1125(a)(1)(B): liability for one who, "in commercial advertising or promotion, misrepresents the nature, characteristics, qualities, or geographic origin of his or her or another person's goods, services, or commercial activities" — [Cornell 15 USC 1125](https://www.law.cornell.edu/uscode/text/15/1125). (Elements — false/misleading statement of fact, deception, materiality, interstate commerce, injury — are background, UNVERIFIED in this pass; literal falsity lets a court presume deception per a 2026 practitioner piece in [Troutman Aug 2026](https://www.troutman.com/insights/false-advertising-liability-ftc-scrutiny-and-competitive-litigation-in-the-age-of-ai-marketing.html).)
- 16 CFR 14.15: FTC policy "encourages the naming of, or reference to competitors" but "requires clarity, and, if necessary, disclosure to avoid deception of the consumer"; no higher substantiation standard for comparative claims — [Cornell 16 CFR 14.15](https://www.law.cornell.edu/cfr/text/16/14.15).
- Closest dispute: ChowNow v. Owner.com (N.D. Cal., Jan 2026) — Lanham Act and state false-advertising claims against a rival in restaurant software allowed to proceed — [Bloomberg Gov](https://news.bgov.com/ip-law/chownows-false-advertising-claims-against-rival-move-forward), [opinion page](https://law.counselstack.com/opinion/chownow-inc-v-ownercom-cand-2026) (not read; details unverified). General competitors can have standing even outside the exact subcategory (N.D. Tex. Sept 2025) — [Tushnet](https://tushnet.com/2025/09/04/general-competitor-has-lanham-act-standing-even-if-it-doesnt-compete-in-alleged-false-advertiser-s-subcategory/).
- Nominative fair use of competitor names: only a generic summary retrieved; no controlling opinion verified (background: Third Circuit's three-factor test; Ninth Circuit New Kids test; UNVERIFIED).

### Inferences
- Page titles/URLs using "Weave" or "NexHealth" as plain names to describe the comparison are normal nominative use, if no logos, no implied endorsement, and a disclaimer ("not affiliated"). Avoid stylized logos.
- "Reported pricing" is a factual claim; hedge only helps if the source is real and cited ("per [named source], retrieved [date]"), the claim is not stale, and an invitation to confirm with the vendor is included. Where no source exists, say "does not publish pricing; ask for a quote" instead of a number. Comparison of features should be dated and checked (competitors change).
- Competitors who dislike a page usually send a cease-and-desist first; a correction process costs little.

### Gaps
- No 2023-26 dispute found specific to SaaS vs-pages with price tables; no verified nominative-fair-use authority.

## 5. AI claims (fact 3: "AI employee" that drafts work and "fills chairs")

### Takeaway
FTC AI enforcement in 2025-26 targets claims with no substantiation (accuracy, earnings, replacing professionals), and increasingly claims aimed at small businesses. "Fills chairs" is a results claim needing evidence; "drafts work for your approval" is defensible if true.

### Cited Findings
- Operation AI Comply (Sept 2024): DoNotPay (robot lawyer, no testing that output equaled a human lawyer; $193,000 proposed), Click Profit and others — [FTC press release](https://www.ftc.gov/news-events/news/press-releases/2024/09/ftc-announces-crackdown-deceptive-ai-claims-schemes), [Mofo](https://www.mofo.com/resources/insights/241008-ftc-first-ai-related-enforcement-actions).
- Workado (Aug 2025): claimed 98% accuracy for AI-detector; FTC said 53% — per [Benesch Oct 2025](https://www.beneschlaw.com/insight/one-year-in-ftcs-operation-ai-comply-continues-under-new-administration-signaling-enduring-enforcement-focus/pdf/) (secondary). Air AI: FTC suit over earnings and refund claims to small businesses; status unconfirmed.
- 2026: FTC action over an AI "Active Listening" marketing tool sold to small businesses (21 May 2026); of the last eight AI-washing cases seven involve claims made to businesses — [DLA Piper May 2026](https://www.dlapiper.com/en-us/insights/publications/2026/05/ftc-ai-washing-action-underscores-enforcement-in-business-to-business-context). Holland & Knight (Aug-Sept 2026) says enforcement is back to Section 5 basics on false claims about AI offerings and that vendors supplying deceptive marketing materials can be charged; keep testing/validation records — [H&K Aug 2026](https://www.hklaw.com/en/insights/publications/2026/08/operation-ai-comply-2-years-later-continued-enforcement). All secondary; no FTC primary read.
- 16 CFR 255.2: advertiser must "possess and rely upon adequate substantiation" for performance implied by testimonials; "Consumer endorsements themselves are not competent and reliable scientific evidence" — [Cornell 16 CFR 255.2](https://www.law.cornell.edu/cfr/text/16/255.2) (short quotes via summarizer). Typicality: a result story is read as typical unless disclosed otherwise.

### Inferences
- "AI employee" is puffery-adjacent but implies substituting for a worker; pair with a plain description ("drafts messages and tasks; your team approves"). "Fills chairs" / revenue-uplift language needs tracked data (e.g., bookings attributable) or a modest wording ("helps fill open appointments"); no "guaranteed" or "typical results" without data and a disclosure.
- Keep an evidence file (dated screenshots, pilot numbers, test logs) as FTC guidance expects substantiation at the time the claim is made.

### Gaps
- FTC primary documents for 2026 cases; the status of the July 2026 AI accuracy proposed policy statement (only a snippet).

## 6. HIPAA statements and BAAs (fact 4: no HIPAA claim; some subprocessor BAAs not executed)

### Takeaway
Silence is safer than an unsupported claim, but the legal duty is separate: a clinic may disclose PHI to a business associate only with a written BAA, and the BA must have BAAs downstream with its own subcontractors that touch PHI. Execute the BAA with each clinic and with each subprocessor before PHI flows.

### Cited Findings
- 45 CFR 164.502(e)(1)(i): covered entity may disclose PHI to a business associate if it obtains "satisfactory assurance" the BA will safeguard it; (e)(2): documented through "a written contract or other written agreement or arrangement" meeting 164.504(e) — [Cornell 45 CFR 164.502](https://www.law.cornell.edu/cfr/text/45/164.502). 164.504(e) text (including BA subcontractor obligations) not fetched in this pass; subcontractor requirement is background, UNVERIFIED.
- HHS does not certify HIPAA compliance or endorse private "certifications": [HHS FAQ 2003](https://www.hhs.gov/hipaa/for-professionals/faq/2003/are-we-required-to-certify-our-organizations-compliance-with-the-standards/) (snippet).
- FTC Henry Schein Practice Solutions (announced 5 Jan 2016; final order May 2016): Dentrix G5 marketed as industry-standard encryption helping dentists meet HIPAA; FTC said it used weaker data masking, not NIST-recommended AES; $250,000 and customer notification; first FTC money in a data-security marketing-claims case per Winston — [FTC final order release](https://search.ftc.gov/news-events/news/press-releases/2016/05/ftc-approves-final-order-henry-schein-practice-solutions-case), [FTC Jan 2016 release](https://search.ftc.gov/news-events/news/press-releases/2016/01/dental-practice-software-provider-settles-ftc-charges-it-misled-customers-about-encryption-patient), [Winston](https://www.winston.com/print/v2/content/132450/dental-software-provider-fined-by-ftc-for-deceptive-encryption.pdf).
- Other FTC examples: SkyMed (government-endorsement claim) and BetterHelp (no third-party had reviewed it as HIPAA-compliant) — per [Fisher Phillips](https://www.fisherphillips.com/en/insights/insights/how-healthcare-organizations-must-vet-ai-vendors-that-overstate-their-compliance) (secondary).

### Inferences
- A business associate can truthfully say: "We sign a HIPAA Business Associate Agreement with every clinic," and "we build safeguards to help practices meet their HIPAA obligations" ONLY if true and not overstated; never "HIPAA compliant/certified" without a documented risk analysis (Security Rule) and BAAs everywhere. Don't claim "encrypted" without verified specifics (Henry Schein lesson).
- Since some subprocessor BAAs are unsigned, either (a) do not send PHI to those subprocessors, or (b) get them signed before onboarding clinics. A BAA statement on the marketing site is therefore a later step. Marketing silence does not cure a missing BAA.

### Gaps
- HHS OCR enforcement against small BAs for missing subcontractor BAAs not researched; AI vendor (Anthropic) BAA availability not checked.

## 7. Partner commissions and review incentives (facts 6 and 7)

### Takeaway
Paying a 10% commission is a "material connection" any partner must disclose when endorsing DreamCRM; the company is responsible for monitoring. For reviews, the FTC rule bars paying for a particular sentiment and covers "consumer" reviews; whether B2B reviews on G2/Capterra fall within it is uncertain, so follow platform programs and the same principles.

### Cited Findings
- 16 CFR 255.5: "Material connections can include a business, family, or personal relationship"; disclosure "must clearly communicate the nature of the connection sufficiently for consumers to evaluate its significance" — [Cornell 16 CFR 255.5](https://www.law.cornell.edu/cfr/text/16/255.5). Examples there say advertisers should monitor and train endorsers (255.1(d) text not retrieved).
- 16 CFR 465.4: "It is an unfair or deceptive act or practice ... for a business to provide compensation or other incentives in exchange for, or conditioned expressly or by implication on, the writing or creation of consumer reviews expressing a particular sentiment, whether positive or negative" — [Cornell 16 CFR 465.4](https://www.law.cornell.edu/cfr/text/16/465.4). Rule effective 21 Oct 2024, civil penalties up to $53,088 per violation (first-round notes); first warning letters 22 Dec 2025.
- 465.1 definitions: "consumer review" is "a consumer's evaluation ... of a product, service, or business" published to a platform dedicated to such evaluations — [Cornell 16 CFR 465.1](https://www.law.cornell.edu/cfr/text/16/465.1). Whether a business customer is a "consumer" is NOT stated; one summary notes that testimonial definitions exclude endorsements by businesses/entities — [FTC FAQ page](https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers) (not read directly; snippet interpretation, UNVERIFIED).
- G2 labels incentivized reviews and runs gift-card campaigns through its own offers — [G2 docs](https://documentation.g2.com/help/docs/how-gift-card-offers-work); Capterra pays nominal gift-card incentives via a vendor-portal link, bans unapproved incentive vendors, and removes undisclosed incentivized reviews — [Capterra community guidelines](https://www.capterra.ca/legal/community-guidelines), [Capterra incentive FAQ](https://review.capterra.com/Incentive-Program-FAQ) (regional text, check US page).

### Inferences
- Partner program: require partners in the agreement to disclose the commission ("I earn a commission if you sign up") clearly and close to the claim, restrict claims to approved ones (no earnings/AI results claims) and monitor/terminate. Liability can reach the advertiser (255.1(d); UNVERIFIED text). Also: recurring commissions paid to other businesses are fine; but "partners earn $X per month" income claims need substantiation (FTC Business Opportunity/Earnings guidance; UNVERIFIED).
- Review incentives: offer the same incentive for any honest review regardless of rating, ask all customers (no gating), use the platform program, never reward only positive reviews, never write reviews for customers.

### Gaps
- The FTC FAQ's explicit position on B2B reviews; Capterra/G2 current US vendor terms.

## Prioritized fix list
1. Remove "regularly $500" (and any "save $300") from the site, emails, ads and the grader, or replace with a dated, genuinely intended future-price statement; keep "$200/mo founding rate" with the real cap/lock-in terms. (Highest risk; zero cost.)
2. Do not onboard any clinic with PHI until clinic-level BAAs are signed and every subprocessor touching PHI has a BAA (or is removed from the PHI path); keep "HIPAA compliant/certified/secure" claims off the site; if a statement is wanted, "we sign a BAA with every clinic" once true.
3. Publish a Privacy Policy (CalOPPA contents, accurate to the actual vendors, "privacy" link on home page, effective date, DNT/GPC line, contact) and Terms of Service (trial, month-to-month, cancel-in-Settings, refunds, AUP, BAA reference) before running any Google/Meta ads or sending partner/grader traffic. Link the policy at each email-collecting form.
4. Rework the comparison pages: remove competitor price figures that have no dated, cited source; label date checked; add "not affiliated" notice; no logos; correction contact; re-verify before each publish.
5. Soften/support AI results claims: describe what it drafts and who approves; substantiate "fills chairs" with real data or rephrase; keep an evidence file.
6. Partner program terms: disclosure rule, approved-claims sheet, monitoring/termination clause; disclosure on the partner landing page too.
7. Review program: platform-run incentives only, nominal, sentiment-neutral, disclosed; no gating.
8. Subscription disclosures: state price, monthly renewal, and cancel path before purchase and in the confirmation email; make "cancel anytime/no contract" literally true.
9. Calendar: AI claims/accuracy policy (FTC July 2026 proposal) and any negative-option rulemaking after the March 2026 ANPRM; California ARL already effective for contracts on/after 1 Jul 2025.

## Source reliability summary
Primary text read via summarizer: 16 CFR 233.1/233.5, 14.15, 255.2, 255.5, 465.1, 465.4; 15 USC 1125(a)(1)(B); 45 CFR 164.502; Cal. B&P 17601, 22577 (via Public.Law). Everything else is search snippets or law-firm/aggregator summaries and should be verified before publication.
