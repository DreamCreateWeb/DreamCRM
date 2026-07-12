import type { ModuleRegistry } from './types'

/**
 * Clinic dashboard module registry — what a dental clinic sees in the
 * sidebar after signing up. Grounded in DESIGN.md:
 *
 *   - We are the **orbital-layer replacement** (booking / comms / forms /
 *     website / reviews / marketing / shop / portal) — NOT a PMS, NOT a
 *     clinical chart. Treatment plans, charting, claims live in the
 *     clinic's existing PMS (Open Dental, Dentrix, Eaglesoft, CareStack).
 *
 *   - The website is the trunk. Every patient-facing surface (booking,
 *     shop, intake, portal) lives ON the clinic's branded site.
 *
 *   - Competitors are Weave / NexHealth / Modento / Adit / RevenueWell /
 *     Solutionreach / Lighthouse / PBHS / ProSites — not Open Dental.
 *
 * Sidebar grouping reflects how a front-desk user thinks about their day:
 *
 *   Daily      — every-day cockpit (patients, appointments, leads, comms)
 *   Growth     — weekly-rhythm acquisition + retention (recall, reviews,
 *                analytics)
 *   Website    — set-and-forget storefront (editor, blog, SEO, careers)
 *   Business   — money + integrations (shop, invoices, PMS sync)
 *   Settings   — rare-touch config
 *
 * Plan tier gating:
 *   - Basic:    Overview + Settings + Website Editor (the trunk; everyone gets it)
 *   - Pro:      Daily-cockpit modules + Reviews + Blog (core practice ops)
 *   - Premium:  Growth analytics + Shop + Integrations + Recall + Careers + SEO
 *
 * Deliberately NOT in clinic sidebar (route files may still exist):
 *   - Tasks (/tasks/kanban) — generic Mosaic kanban. Research across 8
 *     mature dental products: 0 ship a generic todo/kanban; the dental
 *     pattern is patient-attached followups (Weave Task Center, DI Team
 *     Tasks, Lighthouse 360 Front Desk Task List). DreamCRM already
 *     surfaces this contextually (Overview attention cards, Patients
 *     needs-attention panel, Appointments aging-color, Leads rot). When
 *     a unified followups view is wanted, ship it as a "Followups" tab
 *     inside Patients detail — not a top-level module.
 *   - Invoices (/invoices) — Mosaic stub that 404s. Clinical billing
 *     belongs to the PMS (out of scope per DESIGN.md). Shop payments +
 *     booking deposits + memberships will live inside Shop (Phase 3)
 *     as "Orders & Payments." Text-to-pay for PMS balances is a Phase 4
 *     PMS-integration unlock.
 */
export const clinicModules: ModuleRegistry = {
  tenantType: 'clinic',
  modules: [
    // ── Daily ──────────────────────────────────────────────────────────
    // Overview / Messages / Appointments are ALSO pinned into the cockpit
    // zone (⌘1/⌘2/⌘3) — see ModuleDef.pinned/shortcut + DESIGN-SYSTEM Part 4.
    // Inbox is intentionally absent: it folds into Messages at nav level (the
    // /inbox route stays alive; Messages exposes a Mailbox tab to it).
    { id: 'overview',          path: '/',                  label: 'Overview',         section: 'Daily',    icon: 'home',     status: 'live', pinned: true, shortcut: '⌘1' },
    { id: 'my_day',            path: '/my-day',            label: 'My Day',           section: 'Daily',    icon: 'user',     status: 'live', minPlan: 'pro' },
    { id: 'messages',          path: '/messages',          label: 'Messages',         section: 'Daily',    icon: 'chat',     status: 'live', minPlan: 'pro', pinned: true, shortcut: '⌘2' },
    { id: 'appointments',      path: '/appointments',      label: 'Appointments',     section: 'Daily',    icon: 'cal',      status: 'live', minPlan: 'pro', pinned: true, shortcut: '⌘3' },
    { id: 'patients',          path: '/patients',          label: 'Patients',         section: 'Daily',    icon: 'users',    status: 'live', minPlan: 'pro' },
    { id: 'followups',         path: '/followups',         label: 'Follow-ups',       section: 'Daily',    icon: 'check',    status: 'live', minPlan: 'pro' },
    { id: 'leads',             path: '/leads',             label: 'Leads',            section: 'Daily',    icon: 'megaphone',status: 'live', minPlan: 'pro' },
    { id: 'intake_forms',      path: '/intake-forms',      label: 'Intake Forms',     section: 'Daily',    icon: 'pen',      status: 'live', minPlan: 'pro' },

    // ── Growth ─────────────────────────────────────────────────────────
    // ONE workspace entry — the /growth hub is the marketing home (outreach,
    // campaigns, audiences, reviews, social, analytics). No minPlan gate: the
    // hub admits every plan and renders honest upsell cards for below-plan
    // areas (mirrors the Website workspace). Sub-pages carry their own gates;
    // the Social door reflects connected channels (see lib/integrations/
    // bundles — the old bundle-gated sidebar entry folded into the hub).
    { id: 'growth',            path: '/growth',            label: 'Growth',           section: 'Growth',   icon: 'chart',    status: 'live' },

    // ── Website (the trunk) ────────────────────────────────────────────
    // ONE workspace entry — the /website hub is the "Online Store"-style home
    // (live site + editor + blog + SEO + careers + domain + share). No roles
    // or minPlan gate: members have always been able to use blog/SEO/careers,
    // so the hub must admit them; the editor page enforces its own owner/admin
    // gate and plan-gated sub-areas render honest upsell cards on the hub.
    { id: 'website',           path: '/website',           label: 'Website',          section: 'Website',  icon: 'globe',    status: 'live' },

    // ── Business ───────────────────────────────────────────────────────
    // Shop is the Ecommerce & Payments bundle's feature surface. Premium-tier
    // (minPlan) AND auto-derived: it appears once the bundle is active — Stripe
    // Connect engaged, or a storefront/membership already set up (the safety net
    // so a clinic with a live shop never loses it). Hidden for a Premium clinic
    // that hasn't started commerce; reachable via the Ecommerce bundle on
    // /integrations. See lib/integrations/bundles.
    { id: 'shop',              path: '/shop',              label: 'Shop',             section: 'Business', icon: 'bag',      status: 'live', minPlan: 'premium', requiresBundle: ['payments'] },
    // The /integrations page hosts BOTH the Premium PMS sync AND the free
    // Google Business card (free on every tier). The page renders the GBP card
    // for everyone + a Premium upsell for the PMS, so the sidebar entry is
    // visible on every plan (the page no longer redirects below-Premium).
    { id: 'integrations',      path: '/integrations',      label: 'Integrations',     section: 'Business', icon: 'plug',     status: 'live' },

    // ── Settings ───────────────────────────────────────────────────────
    { id: 'settings',          path: '/settings',          label: 'Settings',         section: 'Settings', icon: 'gear',     status: 'live' },
  ],
}
