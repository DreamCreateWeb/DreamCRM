import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireTenant } from '@/lib/auth/context'
import { getClinicSiteBySlug, publicSiteUrl } from '@/lib/services/clinic-site'
import { db, schema } from '@/lib/db'
import { and, eq, isNull } from 'drizzle-orm'

export const metadata = {
  title: 'Website - DreamCRM',
  description: 'Your clinic\'s storefront — the trunk every other module attaches to.',
}

export const dynamic = 'force-dynamic'

/**
 * Website Editor v1 — the front door for the clinic's storefront.
 *
 * Per DESIGN.md "the website is the trunk", this page promotes website
 * management out of buried Settings into a first-class top-level surface.
 * Shows:
 *   - Public URL + "View site" CTA
 *   - Snapshot stats (template, brand, pages live)
 *   - Setup checklist — every editable section with status + edit link
 *   - List of public surfaces with view links
 *   - Deep editor link to /settings/clinic
 *
 * v1.1 candidates: multi-page editor (custom landing pages, blog posts),
 * template switcher with live preview, page-level SEO controls, real
 * publish/draft workflow.
 */

type Status = 'done' | 'partial' | 'missing'

interface ChecklistItem {
  label: string
  description: string
  status: Status
  required: boolean
  detail?: string
  editPath?: string
}

const PILL_CLS: Record<Status, string> = {
  done: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  partial: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  missing: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300',
}

const PILL_LABEL: Record<Status, string> = {
  done: '✓ Set',
  partial: '~ Partial',
  missing: '⚠ Missing',
}

const PILL_LABEL_OPTIONAL: Record<Status, string> = {
  done: '✓ Set',
  partial: '~ Partial',
  missing: '◯ Optional',
}

export default async function WebsiteEditorPage() {
  const ctx = await requireTenant()
  if (ctx.tenantType === 'patient') redirect('/patient/dashboard')
  if (ctx.tenantType === 'platform') redirect('/dashboard')

  const site = await getClinicSiteBySlug(ctx.organizationSlug)
  if (!site) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-3xl mx-auto">
        <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-700/60 p-8 text-center">
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-2">
            Your clinic profile isn&apos;t set up yet
          </p>
          <p className="text-[13px] text-stone-500 dark:text-stone-400 mb-4">
            Finish the onboarding flow to publish your clinic&apos;s public site.
          </p>
          <Link
            href="/settings/clinic"
            className="inline-block text-sm font-semibold px-4 py-2 rounded-lg bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
          >
            Set up your clinic
          </Link>
        </div>
      </div>
    )
  }

  const { profile, primaryLocation } = site
  const url = publicSiteUrl(site)

  // Count live intake forms so the public surfaces list shows them.
  const intakeForms = await db
    .select({ slug: schema.formTemplate.slug, title: schema.formTemplate.title })
    .from(schema.formTemplate)
    .where(
      and(
        eq(schema.formTemplate.organizationId, ctx.organizationId),
        isNull(schema.formTemplate.archivedAt),
      ),
    )

  // ── Derived counts/flags ─────────────────────────────────────────
  const servicesCount = Array.isArray(profile.services) ? (profile.services as unknown[]).length : 0
  const staffCount = Array.isArray(profile.staff) ? (profile.staff as unknown[]).length : 0
  const testimonialsCount = Array.isArray(profile.testimonials) ? (profile.testimonials as unknown[]).length : 0
  const officePhotoCount = Array.isArray(profile.officePhotos) ? (profile.officePhotos as unknown[]).length : 0
  const statsCount = Array.isArray(profile.stats) ? (profile.stats as unknown[]).length : 0
  const hasHours = profile.hours && typeof profile.hours === 'object' && Object.keys(profile.hours).length > 0
  const hasAddress = !!profile.addressLine1 && !!profile.city
  const planTier = profile.planTier ?? 'basic'

  const stringDone = (v: string | null | undefined): Status => (v?.trim() ? 'done' : 'missing')
  const countDone = (count: number, target: number): Status =>
    count >= target ? 'done' : count > 0 ? 'partial' : 'missing'

  const checklist: ChecklistItem[] = [
    // Required for credible homepage
    {
      label: 'Logo',
      description: 'Shown in the site header. If missing, the modern template falls back to a letter-mark.',
      status: stringDone(profile.logoUrl),
      required: true,
      editPath: '/settings/clinic',
    },
    {
      label: 'Tagline',
      description: 'One-line promise under the hero headline. Keep it short — "Bright smiles, gentle care" not a paragraph.',
      status: stringDone(profile.tagline),
      required: true,
      editPath: '/settings/clinic',
    },
    {
      label: 'Hero image',
      description: 'Photo behind the homepage headline. Real staff or interior shots outperform stock smile-women.',
      status: stringDone(profile.heroImageUrl),
      required: true,
      editPath: '/settings/clinic',
    },
    {
      label: 'About the practice',
      description: 'A paragraph or two — what makes the practice different, who the dentists are, why a patient should trust you.',
      status: stringDone(profile.about),
      required: true,
      editPath: '/settings/clinic',
    },
    {
      label: 'Services',
      description: `4–6 numbered pillars work best per DESIGN.md. You have ${servicesCount}.`,
      status: countDone(servicesCount, 4),
      required: true,
      detail: `${servicesCount} services`,
      editPath: '/settings/clinic',
    },
    {
      label: 'Staff / team',
      description: `Headshot grid with bios. You have ${staffCount}. Consistent crops + real photos build trust.`,
      status: countDone(staffCount, 2),
      required: true,
      detail: `${staffCount} team members`,
      editPath: '/settings/clinic',
    },
    {
      label: 'Office hours',
      description: '7-day schedule used by the public site, booking widget, and SEO JSON-LD.',
      status: hasHours ? 'done' : 'missing',
      required: true,
      editPath: '/settings/clinic',
    },
    {
      label: 'Address + phone',
      description: 'Powers the contact section, sticky mobile call button, Maps embed, and Dentist JSON-LD.',
      status: hasAddress && profile.phone ? 'done' : !hasAddress || !profile.phone ? 'partial' : 'missing',
      required: true,
      editPath: '/settings/clinic',
    },
    // Optional but valuable
    {
      label: 'Testimonials',
      description: `Long-form patient quotes (with photo + first name) boost conversion. You have ${testimonialsCount}.`,
      status: countDone(testimonialsCount, 2),
      required: false,
      detail: `${testimonialsCount} quotes`,
      editPath: '/settings/clinic',
    },
    {
      label: 'Office photos',
      description: `Interior architecture shots. You have ${officePhotoCount}. Pediatric and cosmetic practices benefit most.`,
      status: countDone(officePhotoCount, 3),
      required: false,
      detail: `${officePhotoCount} photos`,
      editPath: '/settings/clinic',
    },
    {
      label: 'Stat anchors',
      description: `Numbers shown under the hero ("8,000 5-star reviews", "Same-week appointments"). You have ${statsCount}.`,
      status: countDone(statsCount, 3),
      required: false,
      detail: `${statsCount} stats`,
      editPath: '/settings/clinic',
    },
    {
      label: 'Brand color',
      description: 'The accent color used for CTAs. Defaults to the warm-neutral sage if unset.',
      status: stringDone(profile.brandColor),
      required: false,
      detail: profile.brandColor ?? undefined,
      editPath: '/settings/clinic',
    },
  ]

  const requiredMissing = checklist.filter((c) => c.required && c.status !== 'done').length
  const completionTotal = checklist.length
  const completionDone = checklist.filter((c) => c.status === 'done').length

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8 w-full max-w-[80rem] mx-auto">
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400 mb-2">
          Website
        </p>
        <h1 className="text-2xl md:text-3xl font-bold text-stone-900 dark:text-stone-100 tracking-tight">
          {profile.displayName ?? site.orgName}
        </h1>
        <p className="text-[13px] text-stone-500 dark:text-stone-400 mt-1 max-w-2xl">
          Your storefront — the trunk every other module attaches to. Edit the homepage,
          publish what patients see, and check that nothing&apos;s missing before sharing the URL.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:hover:bg-stone-200 dark:text-stone-900 inline-flex items-center gap-2"
          >
            View live site →
          </a>
          <Link
            href="/settings/clinic"
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 hover:border-stone-300 text-stone-700 dark:text-stone-200"
          >
            Edit content
          </Link>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-mono text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 truncate max-w-[24rem]"
          >
            {url.replace(/^https?:\/\//, '')}
          </a>
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard
          label="Template"
          value={(profile.template ?? 'modern').replace(/^./, (c) => c.toUpperCase())}
          hint="Cosmetic + Pediatric variants coming"
        />
        <StatCard
          label="Brand color"
          value={profile.brandColor ?? 'Default sage'}
          swatch={profile.brandColor ?? undefined}
        />
        <StatCard
          label="Plan"
          value={planTier.replace(/^./, (c) => c.toUpperCase())}
          hint={planTier === 'basic' ? 'Booking + intake on Pro+' : 'All website features unlocked'}
        />
        <StatCard
          label="Setup"
          value={`${completionDone} / ${completionTotal}`}
          hint={requiredMissing > 0 ? `${requiredMissing} required missing` : 'All required items set'}
          tone={requiredMissing > 0 ? 'warn' : 'ok'}
        />
      </div>

      {/* ── Setup checklist ───────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-3">
          Setup checklist
        </h2>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
          <ul className="divide-y divide-stone-100 dark:divide-stone-700/40">
            {checklist.map((item) => {
              const labels = item.required ? PILL_LABEL : PILL_LABEL_OPTIONAL
              return (
                <li key={item.label}>
                  <Link
                    href={item.editPath ?? '/settings/clinic'}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800/30"
                  >
                    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded shrink-0 ${PILL_CLS[item.status]}`}>
                      {labels[item.status]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-stone-800 dark:text-stone-100 flex items-center gap-2">
                        {item.label}
                        {!item.required && (
                          <span className="text-[10px] font-normal text-stone-400 dark:text-stone-500">(optional)</span>
                        )}
                        {item.detail && (
                          <span className="text-[10px] font-normal text-stone-500 dark:text-stone-400 tabular-nums">· {item.detail}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                        {item.description}
                      </p>
                    </div>
                    <span className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0 mt-1">
                      Edit →
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {/* ── Public surfaces ───────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-3">
          Public surfaces
        </h2>
        <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
          <ul className="divide-y divide-stone-100 dark:divide-stone-700/40">
            <PublicSurface label="Homepage" href={url} hint="The main /  landing page" />
            {(planTier === 'pro' || planTier === 'premium') && (
              <PublicSurface label="Book a Visit" href={`${url}/book`} hint="Online booking widget with slot picker" />
            )}
            {intakeForms.map((f) => (
              <PublicSurface
                key={f.slug}
                label={`Intake form: ${f.title}`}
                href={`${url}/intake/${f.slug}`}
                hint="Public form fill, no patient login required"
              />
            ))}
            <PublicSurface label="Sitemap" href={`${url}/sitemap.xml`} hint="Auto-generated for Google indexing" />
            <PublicSurface label="robots.txt" href={`${url}/robots.txt`} hint="Crawler instructions" />
            <PublicSurface label="Open Graph image" href={`${url}/opengraph-image`} hint="Auto-rendered preview for social shares" />
          </ul>
        </div>
      </section>

      {/* ── Coming soon footer ────────────────────────────────────── */}
      <section className="mb-8">
        <div className="bg-stone-100 dark:bg-stone-800/40 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 p-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400 mb-2">
            Coming next
          </p>
          <ul className="text-[12px] text-stone-600 dark:text-stone-300 space-y-1">
            <li>· Multi-page editor — about page, service detail pages, custom landing pages</li>
            <li>· <Link href="/blog" className="underline">Blog</Link> + <Link href="/seo" className="underline">SEO dashboard</Link> + <Link href="/careers" className="underline">careers page</Link></li>
            <li>· Template switcher with live preview (Cosmetic / Pediatric variants per DESIGN.md)</li>
            <li>· Custom domain wiring — connect your own clinicname.com instead of the platform subdomain</li>
            <li>· Per-page SEO controls (title, meta, OG image overrides)</li>
          </ul>
        </div>
      </section>

      {/* ── Locations summary ─────────────────────────────────────── */}
      {site.locations.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-stone-800 dark:text-stone-100">
              Locations
            </h2>
            <Link
              href="/settings/locations"
              className="text-[11px] font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            >
              Manage →
            </Link>
          </div>
          <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 overflow-hidden">
            <ul className="divide-y divide-stone-100 dark:divide-stone-700/40">
              {site.locations.map((loc) => (
                <li key={loc.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-stone-800 dark:text-stone-100">
                      {loc.name}
                      {loc.isPrimary === 1 && (
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                          primary
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                      {loc.addressLine1}{loc.city && `, ${loc.city}`}{loc.state && `, ${loc.state}`}
                    </p>
                  </div>
                  {loc.phone && (
                    <span className="text-[11px] font-mono text-stone-500 dark:text-stone-400">{loc.phone}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
      {primaryLocation && null /* avoid unused-var warning if locations array is empty edge case */}
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
  swatch,
  tone,
}: {
  label: string
  value: string
  hint?: string
  swatch?: string
  tone?: 'ok' | 'warn'
}) {
  return (
    <div className="bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700/60 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-stone-500 dark:text-stone-400">
        {label}
      </p>
      <div className="flex items-center gap-2 mt-1">
        {swatch && (
          <span className="inline-block w-4 h-4 rounded-full border border-stone-300 dark:border-stone-600 shrink-0" style={{ backgroundColor: swatch }} aria-hidden="true" />
        )}
        <p className={`text-base font-bold tabular-nums truncate ${tone === 'warn' ? 'text-amber-700 dark:text-amber-300' : 'text-stone-900 dark:text-stone-100'}`}>
          {value}
        </p>
      </div>
      {hint && <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">{hint}</p>}
    </div>
  )
}

function PublicSurface({ label, href, hint }: { label: string; href: string; hint: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-stone-50 dark:hover:bg-stone-800/30"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-stone-800 dark:text-stone-100 truncate">{label}</p>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">{hint}</p>
        </div>
        <span className="text-[10px] font-mono text-stone-400 dark:text-stone-500 truncate max-w-[16rem]">
          {href.replace(/^https?:\/\//, '')}
        </span>
        <span className="text-[11px] text-stone-400 dark:text-stone-500 shrink-0">View →</span>
      </a>
    </li>
  )
}
