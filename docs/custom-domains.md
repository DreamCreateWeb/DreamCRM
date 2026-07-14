# Custom domains — ops runbook

Clinics can point their **own** domain (e.g. `www.smilebright.com`) at their
DreamCRM public site. This is the operator-facing companion to the in-app
"Custom domain" card (**Website → Domain** in the dashboard; the old Settings → Clinic profile anchor now links there).

## What the clinic does

1. In **Website → Domain**, they enter a host — with
   OR without the `www.` (e.g. `nwasmiles.com` or `www.nwasmiles.com`). We treat
   an apex + its `www.` sibling as a **pair**: whichever they type, we resolve to
   the apex and associate it in App Runner with `EnableWWWSubdomain: true`, so one
   cert + one association covers **both** hosts. (A non-`www.` subdomain like
   `book.example.com` is associated on its own.)
2. They click **Connect**. We call App Runner `AssociateCustomDomain` and show a
   copy-paste **DNS records table** (each value is click-to-copy):
   - **Routing** — for a pair, TWO records: the apex (`ALIAS`/`ANAME` — a bare
     apex can't use a `CNAME`) and the `www.` host (`CNAME`), both pointing at
     the App Runner service hostname (`hq7ygyvjdp.us-east-1.awsapprunner.com`, or
     `APP_RUNNER_DEFAULT_HOST`). The apex record carries a note: use ALIAS/ANAME
     if the DNS host supports it, otherwise forward the apex → `https://www.…`.
   - **Certificate** — the ACM domain-validation `CNAME`(s) returned by App
     Runner (one set per host). These prove ownership so ACM can issue the cert.
3. They add those records at their DNS provider. **Usually live within an hour.**
4. They click **Check status** (calls `DescribeCustomDomains`); when App Runner
   reports `ACTIVE` the card flips to a green **Active** pill.
5. **Remove** disassociates the domain in App Runner and clears the clinic's
   `websiteDomain` + status — the site falls back to its
   `{slug}.dreamcreatestudio.com` subdomain.

## What happens on our side

- **DB:** `clinic_profile.website_domain` (the host) +
  `clinic_profile.custom_domain_status` jsonb (`CustomDomainStatus` —
  state/requestedAt/dnsRecords/lastCheckedAt/error). Migration `0056`.
- **Service:** `lib/services/custom-domain.ts` —
  `requestCustomDomain` / `checkCustomDomainStatus` / `removeCustomDomain`, all
  wrapping the App Runner SDK (`@aws-sdk/client-apprunner`). Credentials come
  from the default provider chain (the App Runner **instance role** in prod).
- **Routing:** `middleware.ts` fetches a cached `host → slug` map from
  `/api/internal/custom-domains` (`listActiveCustomDomains` in
  `lib/services/clinic-site.ts`, 5-min revalidate) and rewrites a matching host
  to `/site/<slug>` exactly like the subdomain branch. Unknown hosts / fetch
  failures **fail open** (fall through to normal behavior). The site serves as
  soon as the host's DNS resolves to App Runner — even before ACM finishes
  binding — because routing is ours and the cert is App Runner's.
- **Canonical URLs:** `publicSiteUrl()` already prefers `websiteDomain`, so once
  set, every SEO surface (canonical/OG/sitemap/JSON-LD) uses the custom domain.

## AWS prerequisites (orchestrator)

1. **IAM** — the App Runner instance role (`DreamCRMAppRunnerInstanceRole`) needs
   an inline policy allowing the three custom-domain actions on the service:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": [
         "apprunner:AssociateCustomDomain",
         "apprunner:DescribeCustomDomains",
         "apprunner:DisassociateCustomDomain"
       ],
       "Resource": "arn:aws:apprunner:us-east-1:952078552817:service/dreamcrm/*"
     }]
   }
   ```

2. **Env** — set `APP_RUNNER_SERVICE_ARN` (the `dreamcrm` service ARN) as an App
   Runner `RuntimeEnvironmentVariable`. Optionally `APP_RUNNER_DEFAULT_HOST`
   (defaults to `hq7ygyvjdp.us-east-1.awsapprunner.com`) and
   `NEXT_PUBLIC_APP_URL` (the canonical origin the middleware fetches the map
   from; defaults to `https://www.dreamcreatestudio.com`).

## Graceful degradation (no IAM / no env)

If the SDK call can't run (missing permission, missing `APP_RUNNER_SERVICE_ARN`,
or any error), the service **never throws at the clinic**. It persists
`{ state: 'pending_dns', error: 'manual' }` + the routing record + a
**placeholder** certificate record, and the card shows: *"We'll finish
provisioning — the certificate value above is a placeholder until then."* An
operator then finishes the association by hand:

```bash
aws apprunner associate-custom-domain \
  --service-arn "$APP_RUNNER_SERVICE_ARN" \
  --domain-name "www.smilebright.com" \
  --no-enable-www-subdomain
```

Take the returned `CertificateValidationRecords` to the clinic's DNS provider
(the routing `CNAME` is already shown in the card). Once App Runner reports the
domain `ACTIVE`, the next **Check status** click (or the next page load) flips
the stored state to `active`.

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
- **Apex** — supported as a pair with `www.` (App Runner `EnableWWWSubdomain`).
  A bare apex still can't use a `CNAME`, so the apex routing record must be an
  `ALIAS`/`ANAME` (Cloudflare, Route 53, name.com, and many others support it),
  or the clinic forwards the apex → `https://www.…` at their registrar. Both
  hosts route to the site via the middleware map (`servedHosts`), and the site's
  canonical/OG/sitemap URLs use the `www.` host.

---

## Platform domain DNS inventory (dreamcreatestudio.com — snapshot 2026-07-15)

Registrar: **name.com, via Replit's reseller integration** (Replit UI manages
it today; claim path = name.com support "push" into a retail account — zero
downtime, records untouched). Nameservers: ns1cny/ns2ckr/ns3jkl/ns4hny.name.com.

| Record | Type | Value |
|---|---|---|
| `@` (apex) | A | `216.150.1.1` (Replit-side apex→www redirect) |
| `www` | CNAME | `hq7ygyvjdp.us-east-1.awsapprunner.com` |
| `app` | CNAME | `hq7ygyvjdp.us-east-1.awsapprunner.com` |
| `*` (wildcard, clinic sites) | CNAME | `hq7ygyvjdp.us-east-1.awsapprunner.com` |
| `@` | TXT | `google-site-verification=3g0gSj_XXESfS5PFzu4urBoLzhpK37JfMzDpnbENAtA` |
| `send` | TXT | `v=spf1 include:amazonses.com ~all` (Resend) |
| `send` | MX | `10 feedback-smtp.us-east-1.amazonses.com` (Resend) |
| `resend._domainkey` | TXT | DKIM public key (full value in Resend dashboard) |
| (+ ACM validation CNAMEs for the wildcard cert — values in ACM console) |

TO ADD (pending, 2026-07-15): `in` MX → Resend Inbound (value shown when the
inbound domain is added in Resend — enables replies→/messages); `_dmarc` TXT →
`v=DMARC1; p=none; rua=mailto:dustin@dreamcreateweb.com` (none exists today —
the wildcard shadows the query; explicit record wins once added).
