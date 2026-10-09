# Patient financing providers — how each one connects to a website, and what we built

**Status:** SHIPPED 2026-10-09 (Website → Content → Financing; the public
`/payment-financing` page; the site-wide floating button).
**Code:** `lib/financing-providers.ts` (the registry, pure, client-safe) ·
`components/clinic-site/financing-widgets.tsx` (the embeds) ·
`app/(default)/settings/clinic/financing-partners-editor.tsx` (the setup) ·
`lib/clinic-content-parse.ts` (the server re-validation) ·
`lib/services/clinic-site-cache.ts` + `app/site/[slug]/layout.tsx` (the
floating button on every page).

## Why

The first client's office manager (Mary, Complete Family Dentistry / Ted
Pinney DDS) forwarded Cherry's onboarding thread: Cherry's rep had sent
their web designer a widget generator link, a PDF guide and the practice's
application link, and asked for Cherry to be listed FIRST on the financing
page and for a reply once it was live so they could verify it. That email
is written for a web developer. Nearly every US dental practice offers
financing through one or more of the same handful of companies, and every
company hands the practice something different — a script snippet, a
custom link, an iframe. The clinic should never have to read that email:
it picks the provider, pastes the ONE thing the provider gave them, and
the site does the rest.

## The research record — how each provider connects

| Provider | What the practice is handed | How it goes on a website | Where the clinic finds it | What we render |
|---|---|---|---|---|
| **Cherry** (withcherry.com) | A per-practice application link `https://pay.withcherry.com/{slug}` (Cherry adds `?utm_source=merchant&utm_medium=website` for site placements) | A single script `https://files.withcherry.com/widgets/widget.js` with a queueing loader `_hw`; the practice's generator emits `_hw('init', config, sections)` and a container `<div>` per section. Full-page sections: `hero`, `calculator`, `howitworks`, `faq`. A site-wide `floatingEstimator` section paints a "Pay over time" button. The config carries the slug, the practice name, `imageCategory`, a primary/secondary colour (secondary = primary at `10` alpha), fonts, and for the floating button its position/offset/zIndex/colours. | Cherry Practice Portal → the practice's application link; the onboarding email names it. | The full-page widget (all four sections) leading the financing page when Cherry is the primary partner and the toggle is on; the floating button bottom-RIGHT on every public page when its toggle is on (the chat bubble owns bottom-left); the apply button to the pay link. Colours come from the clinic's brand palette, fonts inherit the site's. |
| **CareCredit** (carecredit.com, Synchrony) | A location-specific **custom link** tied to the Merchant ID (Provider Center → carecredit.com/customlink); the apply page itself is CareCredit's | A link; CareCredit's "web buttons" are images pointing at the custom link, and their "widget" offerings are iframes of the same apply flow | Provider Center → Custom Link | An apply button to the custom link (host-checked to carecredit.com / synchrony.com). |
| **Sunbit** (sunbit.com) | A per-practice pre-qualification page `https://apply.sunbit.com/{slug}` | Linked, or framed as an iframe | Sunbit merchant portal → marketing kit | The pre-qualify frame (1080px tall, lazy) leading the page when Sunbit is primary and the toggle is on; the apply button to the page. |
| **Proceed Finance** | A per-practice apply link on proceedfinance.com | A link / button | Provider portal or the Proceed representative | Apply button (host-checked). |
| **Alphaeon Credit** (Comenity) | A per-practice apply link (myalphaeoncredit.com / goalphaeon.com) | A link / button | Provider portal / enrollment team | Apply button (host-checked). |
| **LendingClub Patient Solutions** | A per-practice apply link on lendingclub.com | A link / button | Provider portal | Apply button (host-checked). |
| **Scratchpay** | A per-practice consumer page on scratchpay.com | A link / button | Provider dashboard | Apply button (host-checked). |
| **Another provider** | Anything | A link | — | The old free-form row: name, link, blurb, logo. |

Two connection kinds cover all of them: a **slug** the provider mints per
practice (Cherry, Sunbit — it both builds the apply link and drives the
widget) and a **link** the provider mints per practice (everyone else).
Where a provider also offers a script or iframe snippet, it is a
presentation of the same slug or link; we never need the snippet.

## The laws

1. **No raw HTML or script is ever accepted.** A clinic pastes a link or a
   slug; the site builds the embed. The only third-party script this
   feature can load is `CHERRY_WIDGET_SRC`, named once in code. Links must
   be https and on the provider's own hosts (`parseConnectValue`). The
   server re-validates every row on save (`parseFinancingPartners`): a slug
   provider keeps only a well-formed slug, a link provider only a
   host-checked link, `showWidget` only with a slug, `floatingButton` only
   for Cherry with a slug, an unknown provider id is dropped.
2. **The first partner is the primary** and leads the page with its widget
   (Cherry asked for exactly that). Order is the editor's order; the
   editor labels the first row "Primary" when there are several.
3. **The floating button is site-wide and rides the published chrome.**
   `PublishedSiteChrome.financingFloating` is derived from the PUBLISHED
   `financing_partners` column (never the draft), so the layout paints it
   on every public page without a second read; it is suppressed inside the
   template preview frames.
4. **Draft → Publish applies.** `financing_partners` is a website draft
   column, so a change stages and goes live on Publish like every other
   website edit.
5. **The demo clinic shows links only.** A real slug would frame a
   stranger's practice page; the demo partners are tagged with provider
   ids for the cards but carry no slug, no widget, no floating button.

## Cherry's contract, verbatim from their generator (the aurora example)

```html
<script>
  (function (w, d, s, o, f, js, fjs) {
    w[o] = w[o] || function () { (w[o].q = w[o].q || []).push(arguments) };
    js = d.createElement(s); fjs = d.getElementsByTagName(s)[0];
    js.id = o; js.src = f; js.async = 1; fjs.parentNode.insertBefore(js, fjs);
  }(window, document, 'script', '_hw', 'https://files.withcherry.com/widgets/widget.js'));
  _hw('init', {
    debug: false,
    variables: { slug: 'your-practice', name: 'Your Practice', images: [21], customLogo: '',
                 defaultPurchaseAmount: 2000, customImage: '', imageCategory: 'dental', language: 'en' },
    styles: { primaryColor: '#596FD4', secondaryColor: '#596FD410', fontFamily: 'Montserrat', headerFontFamily: 'Montserrat' },
  }, ['hero', 'calculator', 'howitworks', 'faq']);
</script>
<div id="hero"></div><div id="calculator"></div><div id="howitworks"></div><div id="faq"></div>
```

The floating button is the same init with `styles.floatingEstimator`
(`position`, `offset {x,y}`, `zIndex`, `ctaFontFamily`, `bodyFontFamily`,
`ctaColor`, `ctaTextColor`) and the single section `['floatingEstimator']`
into `<div id="floatingEstimator"></div>`. `cherryWidgetConfig` in
`lib/financing-providers.ts` writes that object from the clinic's brand;
`CherryWidget` in `components/clinic-site/financing-widgets.tsx` is the
loader (one script per document, one queued init per mount).

## What the first client does

Website → Content → Financing → **Add financing partner** → **Cherry** →
paste the application link Cherry sent (`https://pay.withcherry.com/ted-pinney-dds-pa?utm_source=merchant&utm_medium=website`,
or just `ted-pinney-dds-pa`) → tick "Show Cherry's payment estimator on the
financing page" and "Floating 'Pay over time' button on every page" → keep
Cherry as the first partner → Save → **Publish**. Then reply to Cherry's
rep (srobertson@withcherry.com on the thread) that it is live so they can
verify the placement — Cherry asked for that step and it is theirs, not
ours.

## Open items

- Cherry's widget renders only in a browser (the suite asserts the loader,
  the queued init and the containers; the first live render on the client's
  site is the visual check).
- Sunbit's and the link providers' per-practice URLs are from their public
  materials; the first clinic on each proves the host allowlist. A refused
  host is visible in the editor ("that link isn't on …"), never silent.
- CareCredit also sells an "Apply widget" iframe of the same custom link; if
  a clinic asks, it is the same slug/link pattern as Sunbit's frame.
