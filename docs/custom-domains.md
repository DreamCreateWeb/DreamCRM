# Custom domains — ops runbook

Clinics can point their **own** domain (e.g. `www.smilebright.com`) at their
DreamCRM public site. This is the operator-facing companion to the in-app
"Custom domain" card (**Website → Domain** in the dashboard; the old Settings → Clinic profile anchor now links there).

## Two drivers — CloudFront is the live one

`lib/services/custom-domain.ts` dispatches on `customDomainDriver()`:
`CUSTOM_DOMAIN_DRIVER=cloudfront` (set in prod) makes every **new** domain a
**tenant of the multi-tenant CloudFront distribution** (`E176U1KOAVOGGO`,
`CreateDistributionTenantCommand`). Legacy domains attached before the switch
are **App Runner associations** and keep working: status checks and removal
dispatch on the `driver` stamped on each row's `custom_domain_status`, **not**
the env switch — flipping the env never strands an already-attached domain
(absent `driver` = `'apprunner'`).

Why CloudFront: App Runner hard-caps at **5 associations per service** (the
wall `mammothspringsdental.com` hit); tenants have **no cap** (~$0.10/domain/mo
at scale) and certs are **fully zero-touch** — a `ManagedCertificateRequest`
with the `cloudfront`-hosted validation token issues by itself once DNS points
at the connection group's routing endpoint. No ACM CNAMEs for anyone to add.

## What the clinic does (CloudFront path)

1. In **Website → Domain**, they enter a host — with OR without the `www.`
   (e.g. `nwasmiles.com` or `www.nwasmiles.com`). An apex + its `www.` sibling
   is a **pair**: whichever they type, both hosts are served under one tenant.
   (A non-`www.` subdomain like `book.example.com` stands alone.)
2. They click **Connect**. We create the distribution tenant and show a
   copy-paste **DNS records table** (each value click-to-copy):
   - **Routing** — apex `ALIAS`/`ANAME` + `www` `CNAME` (or one CNAME for a
     lone subdomain), pointing at the connection group's routing endpoint
     (`d33npqpgmkgof7.cloudfront.net`, from `CF_ROUTING_ENDPOINT`).
   - **`_cf-challenge` TXT** per served host (value = the routing endpoint) —
     CloudFront's explicit domain-ownership proof, which lets the tenant be
     created before DNS moves and activates the domain deterministically.
   If CloudFront refuses the create because ownership isn't provable *yet*
   (records not added), we persist the record set as pending and the status
   poll retries the create once they land — no operator needed.
3. They add those records at their DNS provider. **Usually live within an hour.**
4. Nothing else — the card **auto-polls every 45s** while pending
   (`custom-domain-card.tsx`) and flips itself to a green **Active** pill.
   The poll also attaches the managed cert once issued (issuance alone leaves
   the tenant's `Customizations` null — observed live 2026-07-23) and nudges
   activation via `VerifyDnsConfiguration`. A manual **Check now** button
   remains for the impatient.
5. **Remove** disables + deletes the tenant and clears the clinic's
   `websiteDomain` + status — the site falls back to its
   `{slug}.dreamcreatestudio.com` subdomain.

## Legacy App Runner path (existing rows only)

Rows whose status carries `driver: 'apprunner'` (or no driver) keep polling
App Runner `DescribeCustomDomains`; removal calls `DisassociateCustomDomain`.
The record set they were given: apex ALIAS/ANAME + `www` CNAME → the service
hostname (`hq7ygyvjdp.us-east-1.awsapprunner.com`, or `APP_RUNNER_DEFAULT_HOST`)
plus the ACM domain-validation CNAMEs App Runner returned. An apex pair was
associated with `EnableWWWSubdomain: true` (one cert covers both hosts).
No NEW domains take this path while `CUSTOM_DOMAIN_DRIVER=cloudfront`.

## What happens on our side (both drivers)

- **DB:** `clinic_profile.website_domain` (the host) +
  `clinic_profile.custom_domain_status` jsonb (`CustomDomainStatus` —
  state/driver/requestedAt/dnsRecords/lastCheckedAt/error). Migration `0056`.
- **Service:** `lib/services/custom-domain.ts` —
  `requestCustomDomain` / `checkCustomDomainStatus` / `removeCustomDomain`,
  wrapping `@aws-sdk/client-cloudfront` and `@aws-sdk/client-apprunner`
  (dynamically imported). Credentials come from the default provider chain
  (the App Runner **instance role** in prod).
- **Routing:** `middleware.ts` fetches a cached `host → slug` map from
  `/api/internal/custom-domains` (`listActiveCustomDomains` in
  `lib/services/clinic-site.ts`, 5-min revalidate) and rewrites a matching host
  to `/site/<slug>` exactly like the subdomain branch. Unknown hosts / fetch
  failures **fail open** (fall through to normal behavior).
- **Canonical URLs:** `publicSiteUrl()` already prefers `websiteDomain`, so once
  set, every SEO surface (canonical/OG/sitemap/JSON-LD) uses the custom domain.

## AWS prerequisites (orchestrator)

**CloudFront path (current):**

1. **Env** — `CUSTOM_DOMAIN_DRIVER=cloudfront` + the tenant trio (all three
   required or the service degrades to the pending/manual state):
   `CF_TENANT_DISTRIBUTION_ID` (`E176U1KOAVOGGO`), `CF_CONNECTION_GROUP_ID`,
   `CF_ROUTING_ENDPOINT` (`d33npqpgmkgof7.cloudfront.net`).
2. **IAM** — the instance role needs the CloudFront tenant actions the service
   calls: `cloudfront:CreateDistributionTenant`,
   `GetDistributionTenantByDomain`, `GetManagedCertificateDetails`,
   `UpdateDistributionTenant`, `VerifyDnsConfiguration`,
   `DeleteDistributionTenant`.

**App Runner path (legacy rows):**

1. **IAM** — the instance role (`DreamCRMAppRunnerInstanceRole`) needs
   `apprunner:AssociateCustomDomain`, `apprunner:DescribeCustomDomains`,
   `apprunner:DisassociateCustomDomain` on
   `arn:aws:apprunner:us-east-1:952078552817:service/dreamcrm/*`.
2. **Env** — `APP_RUNNER_SERVICE_ARN` (the `dreamcrm` service ARN). Optionally
   `APP_RUNNER_DEFAULT_HOST` (defaults to
   `hq7ygyvjdp.us-east-1.awsapprunner.com`) and `NEXT_PUBLIC_APP_URL` (the
   origin the middleware fetches the map from; defaults to
   `https://www.dreamcreatestudio.com`).

## Graceful degradation (no IAM / no env)

If the SDK call can't run (missing permission, missing env, or any error), the
service **never throws at the clinic**. It persists
`{ state: 'pending_dns', error: 'manual' }` + the routing records + a
**placeholder** certificate record, and the card says we'll finish
provisioning. On the CloudFront path the status poll usually self-heals
(it retries the tenant create and rebuilds the record set from the live plan);
an operator can also finish by hand — create the tenant in the CloudFront
console (distribution `E176U1KOAVOGGO`), or for a legacy App Runner row:

```bash
aws apprunner associate-custom-domain \
  --service-arn "$APP_RUNNER_SERVICE_ARN" \
  --domain-name "www.smilebright.com" \
  --no-enable-www-subdomain
```

Once the edge reports the domain active, the next poll flips the stored state.

## Buy-a-domain (in-platform)

`lib/services/domain-purchase.ts` + the buy-domain card on **Website → Domain**:
search (name.com availability + suggestions; premium and >$100/yr filtered
out) → charge the clinic's saved card via Stripe (auto-refund if registration
fails; one domain ≤$25/yr purchase AND renewal is **plan-included**, no
charge) → register on the **platform's** name.com account → **zero-touch
attach**: `requestCustomDomain` runs as usual and the returned DNS records are
written straight into the zone we now own — the clinic never sees a DNS
screen. `NAMECOM_LIVE_PURCHASES!=1` = dry-run (no charge, no registration).
If the attach degrades to `manual`, platform owners/admins are paged
(forced email) so an operator finishes before the clinic notices.

## Renewals (clinic-purchased domains)

Registrar autorenew is deliberately **OFF** for clinic-purchased domains — the
daily `domain-renewals` cron (`/api/cron/domain-renewals`, `Bearer
$CRON_SECRET`) owns renewal: 30-day window, active clinic + plan-included →
platform renews; active clinic + paid → charge the card first, then renew
(refund on registrar failure); inactive subscription → mark **released** and
let it lapse (never renewed on the platform's dime for a churned clinic).
The platform's own `dreamcreatestudio.com` keeps registrar autorenew **ON**.

## Redrive (edge migrations)

`POST /api/admin/redrive-custom-domains` (`Bearer $CRON_SECRET`; allow-listed
in `middleware.ts`) re-runs `requestCustomDomain` for every clinic whose stored
status isn't already CloudFront-driven — creates/recovers the tenant and
re-stamps status + DNS records. Idempotent; used once per edge migration.

## Caveats

- **Website Studio iframe** keeps loading the clinic's `{slug}` **subdomain**
  (`/site/[slug]?edit=1`), never the custom domain. The editor and the public
  site share `X-Frame-Options`/CSP rules; pointing the Studio at the custom
  domain could break framing. The custom domain is for the public-facing site
  only.
- **Google Search Console** — clinics are covered by the shared
  `sc-domain:dreamcreatestudio.com` property only for their **subdomain**. A
  custom domain is a different property and is **not** covered by the shared
  connection. A per-clinic GSC connection for custom domains is future work.
- **Apex** — supported as a pair with `www.`. A bare apex still can't use a
  `CNAME`, so the apex routing record must be an `ALIAS`/`ANAME` (Cloudflare,
  Route 53, name.com, and many others support it), or the clinic forwards the
  apex → `https://www.…` at their registrar. Both hosts route via the
  middleware map (`servedHosts`); canonical/OG/sitemap URLs use the `www.` host.

---

## Platform domain DNS inventory (dreamcreatestudio.com — current, 2026-07-23)

> The 2026-07-15 snapshot (Replit-reseller registrar, apex A record to a
> Replit-side redirect, pending `in` MX + DMARC) is **superseded**: the domain
> transferred into **our own name.com account 2026-07-23**, and the pending
> items were executed that day — with DMARC at `p=quarantine`, not the
> originally planned `p=none` (full email-auth posture in
> `docs/inbound-email.md`).

Registrar: **name.com, our own account** (autorenew ON). The Replit/Vercel
redirect hop is fully retired — the apex points straight at App Runner and
`middleware.ts` 308s apex (and `app.`) → `www`.

| Record | Type | Value |
|---|---|---|
| `@` (apex) | ANAME | `hq7ygyvjdp.us-east-1.awsapprunner.com` (middleware 308s → www) |
| `www` | CNAME | `hq7ygyvjdp.us-east-1.awsapprunner.com` |
| `app` | CNAME | `hq7ygyvjdp.us-east-1.awsapprunner.com` |
| `*` (wildcard, clinic sites) | CNAME | `hq7ygyvjdp.us-east-1.awsapprunner.com` |
| `@` | TXT | `google-site-verification=3g0gSj_XXESfS5PFzu4urBoLzhpK37JfMzDpnbENAtA` |
| `@` | TXT | `v=spf1 include:amazonses.com -all` (apex SPF, hard fail) |
| `@` | MX | `10 inbound-smtp.us-east-1.amazonaws.com` (Resend receiving on the sending domain) |
| `_dmarc` | TXT | `v=DMARC1; p=quarantine; rua=mailto:dustin@dreamcreateweb.com; pct=100; adkim=r; aspf=r` |
| `send` | TXT | `v=spf1 include:amazonses.com ~all` (Resend MAIL FROM) |
| `send` | MX | `10 feedback-smtp.us-east-1.amazonses.com` (Resend) |
| `resend._domainkey` | TXT | DKIM public key (full value in Resend dashboard) |
| `in` | MX + DKIM | Resend Inbound domain (replies → /messages; values in Resend dashboard) |
| (+ ACM validation CNAMEs for the wildcard cert — values in ACM console) |
