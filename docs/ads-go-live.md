# Paid search go-live — the Google Ads runbook

**Status (2026-11-24): DEFERRED by owner ruling — do not open the account
yet.** Paid ads wait until the organic work in `docs/organic-go-live.md` has
been exhausted; that file's Part 7 proposes what "exhausted" means. No ad
account existed when this was written (2026-11-23), and none should be opened
on the strength of this page alone. Everything below is kept current by the
tree — the campaign block is generated — so it will be ready on the day the
gate is met. The research behind every choice is `docs/marketing-engine.md`
Part 11 and `docs/research/marketing-engine-2026-11/`.

Google relabels its screens often. Where a label below was confirmed on a
Google help page on 2026-11-23 it is marked **(confirmed)**; the rest are the
names the settings carried at that date and may differ on your screen. The
SETTING is what matters, not its label.

## The target, and what it takes

**Two new paying practices a month from web marketing.**

The arithmetic changed on 2026-11-23, when the owner ruled the trial to be 14
days with a card required to sign up. A "trial" on this page now means a
practice that **added its card**; a signup that stops at the card step is not
one, and the platform's Acquisition panel counts those separately ("No card
yet").

| If this share of card-on-file trials pays | Trials needed a month |
|---|---|
| 25% (the low end of the survey's "good" band) | 8 |
| 31% (the survey's illustrative funnel) | 7 |
| 50% (its "great" band) | 4 |

The source is ChartMogul's March 2026 survey of 200 software products: 25–35%
is "good" and 50–60% "great" for a card-required trial, against 4–6% and
10–15% for a no-card one. Its illustrative funnel has about 35 card-required
signups per 1,000 visitors against 45 for a no-card trial (those two figures
were read off a graphic, so treat them as an estimate). Fewer people start,
and far more of them pay.

**What that does to cost is not known.** If a no-card signup would have cost
about $120, the same ratio puts a card-on-file trial near $155 and seven of
them near $1,100 a month — an estimate on an estimate. Neither the search
demand for these terms nor our own trial-to-paid rate has been measured; the
first weeks of the campaign exist to measure both, and the card step is now
the place most likely to lose people.

## 1. Open the account (about 20 minutes, then a wait)

Have ready: the business Google login, the legal business name and address
exactly as on the registration or tax documents, and a business card.

1. Go to ads.google.com → **Start now** → sign in with the business login.
2. Enter the business name and `https://www.dreamcreatestudio.com`. The account
   name cannot contain a URL **(confirmed)**.
3. On the screen that offers to link YouTube or a Business Profile, skip
   linking and choose to **create an account without a campaign**
   **(confirmed: Google's sign-up guide offers this at that step, and
   recommends creating the account before any campaign)**. If a goal or budget
   screen appears instead, look for a skip or "Expert Mode" link. Do not let
   the sign-up flow build a campaign: what it builds is the automation this
   plan switches off.
4. Billing country United States; time zone **Central**; currency USD. Check
   the time zone before continuing — reports, statistics and billing all run
   on it **(confirmed: "choose carefully")**.
5. Payments profile: account type **Organization** **(confirmed default)**,
   legal name and address exactly as registered. Add the card and submit. A
   temporary hold or a small refundable prepayment request is normal
   **(confirmed)**.
6. Inside the account, before any campaign:
   - **Billing → Advertiser verification** — start it now. Google says review
     takes up to five business days; the documents must match the payments
     profile, and a missed deadline pauses the account.
   - **Recommendations → Auto-apply** — make sure nothing is selected
     **(confirmed: the feature exists and is off unless turned on)**.
   - **Admin → Account settings → Auto-tagging** — confirm it is on. It adds
     the click ID that the site stores with each signup.
   - **Admin → Access and security** — require 2-step verification.
7. **Tools → Keyword Planner → Get search volume and forecasts.** Paste every
   keyword from section 3 (without the brackets), set the location to United
   States, and download the result. That file is the one thing the research
   could not obtain: how many people search these terms and what a click
   costs. It decides whether $50 a day can even be spent.

## 2. Before the campaign goes live

| Needed | Why | State on 2026-11-23 |
|---|---|---|
| The working branch merged | The ads land on comparison pages that were corrected on it, and the click-ID tracking ships with it | Not merged |
| A Privacy Policy and Terms page on www | Google requires a policy for lead and audience features; a careful buyer looks for both — and a trial that bills a card when it ends needs its terms written down somewhere a customer can point to | Published at `/privacy` and `/terms` on the working branch (2026-11-23). **Not read by a lawyer** |
| Stripe's trial messaging settings | Stripe shows a cancellation-policy link on receipts and can send its own reminder before a trial ends; both are off until switched on (Settings → Billing → Subscriptions and emails → Manage free trial messaging). The app sends its own notice a week before and the day before the charge. The link to give Stripe is `https://www.dreamcreatestudio.com/terms#billing` | Not set |
| A decision on "regularly $500" | It is on the pages the ads land on, and no practice has paid it | Open |
| Advertiser verification passed | Google can pause an unverified account | Not started |

## 3. Build the campaign

**Campaigns → New campaign.** Choose to create a campaign **without a goal's
guidance**, then **Search**. Then, in the order the builder asks:

- **Bidding:** focus on **Clicks**, and set a maximum cost-per-click bid limit
  (the amount is in the brief below). With a handful of conversions a month,
  the conversion-based strategies have nothing to learn from.
- **Networks:** untick **Search partners** and untick **Display Network**.
  Google is replacing these two switches with a "channel prioritization"
  control and retires the old Display allocation in February 2027 — if you see
  that control, set Search to high and the other two to the lowest available.
- **Locations:** United States. Open the location options and choose
  **Presence** (people in or regularly in the location), not "presence or
  interest" **(confirmed: the default includes both)**.
- **Languages:** English.
- **AI Max:** turn it **off** **(confirmed: on by default for new Search
  campaigns)**. With it on, a bracketed keyword is no longer exact — one
  analysis found over a quarter of "exact" impressions arrived through its
  matching. Inside its settings the parts are search term matching, text
  customization and final URL expansion; all three stay off.
- **Broad match keywords** (campaign setting): off. **Automatically created
  assets:** off.
- **Campaign URL options → Final URL suffix:** paste the suffix from the brief.
- **Keywords and ads:** one ad group per block in the brief. Paste the
  keywords with their brackets, set the final URL, and enter the headlines,
  descriptions and display path. Pin nothing.
- **Budget:** the daily amount in the brief.

After it is created: **Audiences, keywords and content → Search keywords →
Negative keywords** → add the negative list to the campaign. Then add the
sitelinks and callouts under **Assets**.

**A rival's name appears in the keywords and nowhere in the ads.** Google
allows the first and restricts the second.

<!-- campaign:start — generated from lib/marketing/ad-campaigns.ts; do not edit by hand -->

**Campaign name:** Search — Competitor terms (exact)
**Daily budget:** $50
**Bidding:** Maximize clicks, with a maximum cost-per-click bid limit of $8

**Final URL suffix** (campaign settings → Campaign URL options):

```
utm_source=google&utm_medium=cpc&utm_campaign=competitor-exact&utm_term={keyword}
```

**Negative keywords** (campaign level — paste as is; the quotes make them phrase match):

```
"login"
"log in"
"sign in"
"support"
"customer service"
"phone number"
"jobs"
"careers"
"salary"
"stock"
"investor"
"hair"
"sew"
"wig"
"braids"
"extensions"
"closure"
"salon"
"basket"
"fabric"
"loom"
```

#### Ad group: Weave — alternative & pricing

Final URL: `https://www.dreamcreatestudio.com/compare/weave`

Keywords (the brackets make them exact match):

```
[weave dental pricing]
[weave software pricing]
[weave dental alternative]
[weave dental alternatives]
[weave software alternatives]
[weave dental competitors]
[weave dental software cost]
[getweave pricing]
```

#### Ad group: NexHealth — alternative & pricing

Final URL: `https://www.dreamcreatestudio.com/compare/nexhealth`

Keywords (the brackets make them exact match):

```
[nexhealth pricing]
[nexhealth cost]
[nexhealth alternative]
[nexhealth alternatives]
[nexhealth competitors]
[nexhealth vs weave]
```

#### Ad group: Solutionreach — alternative & pricing

Final URL: `https://www.dreamcreatestudio.com/compare/solutionreach`

Keywords (the brackets make them exact match):

```
[solutionreach pricing]
[solutionreach cost]
[solutionreach alternative]
[solutionreach alternatives]
[solutionreach competitors]
[solution reach pricing]
```

#### The ad (the same responsive search ad in every ad group; only the final URL changes)

Display path: `dental-software` / `compare`

Headlines:

```
Dental Front Office, $200/mo
14-Day Free Trial
Month-to-Month. No Contract.
Website, Booking & Portal
Keep the PMS You Already Run
Published Price, No Sales Call
Recall, Reviews & Reminders
Built Only for Dental Offices
See the Honest Comparison
Online Booking Included
One Plan. Everything Included.
Patient Portal in Your Brand
Start Free. Cancel Anytime.
DreamCRM for Dental Practices
Comparing Dental Software?
```

Descriptions:

```
Website, online booking, patient portal, reviews & recall in one system. $200/mo flat.
Try everything free for 14 days. No contract, no setup fee, no sales call. Keep your PMS.
See a side-by-side comparison: pricing, features, and what each one does better.
Built only for dental practices. Month-to-month, and you cancel from Settings.
```

#### Assets (campaign level)

Sitelinks:

- See Pricing → `https://www.dreamcreatestudio.com/pricing`
- Tour the Platform → `https://www.dreamcreatestudio.com/product`
- Grade Your Practice Free → `https://www.dreamcreatestudio.com/grade`
- All Comparisons → `https://www.dreamcreatestudio.com/compare`

Callouts: No Contract · No Setup Fee · 14-Day Free Trial · Published Pricing · Dental-Only

<!-- campaign:end -->

## 4. The first two weeks

- **Daily, five minutes:** open **Insights and reports → Search terms**. Any
  search that is not a practice weighing software goes into the negative list.
  This is the whole job in week one.
- **Do not accept** recommendations to add broad match, raise the budget,
  switch bidding to conversions, or turn AI Max back on. Each is the
  automation this campaign is built without.
- **Enter the month's spend** on the platform's Marketing page (the dials).
  The site already files each visit and signup from these ads under Google
  Ads, with the campaign and the keyword, so cost per trial needs only the
  spend figure.
- **Ad groups exist only for comparison pages re-read against the vendor's own
  site.** Three were on 2026-11-23 (Weave, NexHealth, Solutionreach). Re-read
  another page, give its registry entry a dated check and keywords, and its ad
  group appears in the brief.

## 5. How it is judged

- **Cost per trial under $150** after two weeks → raise the budget to $100 a
  day. **Over $150** → fix the search terms and the landing page before
  spending more. That bar was set when a trial needed no card. A trial with a
  card on file is worth roughly three times as much, so $150 is now a cautious
  bar rather than a fair one; whether to raise it is the owner's decision, and
  the same goes for the $120 bar the platform's Marketing page grades against.
- **Watch the card step first.** Signups that stop there appear as "No card
  yet" on the Acquisition panel, per channel. If most paid signups end there,
  the ad is working and the card step is not.
- **Trial-to-paid is not judged on this campaign alone.** At these volumes a
  month produces zero, one or two customers; read it on trials pooled from
  every source.
- **If the keyword export shows the searches are too few** to spend the
  budget, the surplus goes to a second campaign on category searches, not to a
  second ad platform.

## Not built yet

- **Reporting conversions back to Google.** The click ID is stored with each
  signup from the day this ships; the upload of "trial started" and "became
  paying" through Google's Data Manager is the next slice, and it is what lets
  Google's own reports show which keyword produced a customer.
- **Microsoft Advertising.** A copy of this campaign once Google has two to
  four weeks of data. The site already files Microsoft clicks under their own
  channel, including when an imported campaign still says `utm_source=google`.
