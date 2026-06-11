# Custom domains — ops runbook

Clinics can point their **own** domain (e.g. `www.smilebright.com`) at their
DreamCRM public site. This is the operator-facing companion to the in-app
"Custom domain" card (Settings → Clinic profile).

## What the clinic does

1. In **Settings → Clinic profile → Custom domain**, they enter a host. We
   require a **subdomain** (e.g. `www.` or `book.`), **not a bare apex**
   (`example.com`) — a bare apex can't `CNAME` to App Runner, the same reason
   our own apex uses a redirect. The card explains this and tells them to point
   their apex at the www host via their registrar's ALIAS/ANAME/redirect.
2. They click **Connect**. We call App Runner `AssociateCustomDomain` and show a
   copy-paste **DNS records table**:
   - **Routing** — a `CNAME` from their host → the App Runner service hostname
     (`hq7ygyvjdp.us-east-1.awsapprunner.com`, or `APP_RUNNER_DEFAULT_HOST`).
   - **Certificate** — the ACM domain-validation `CNAME`(s) returned by App
     Runner. These prove ownership so ACM can issue the TLS cert.
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
- **Apex** — we deliberately reject bare apexes. The clinic should use a
  subdomain (`www.`) and redirect/ALIAS their apex to it at the registrar.
