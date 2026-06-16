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
    { id: 'messages',          path: '/messages',          label: 'Messages',         section: 'Daily',    icon: 'chat',     status: 'live', minPlan: 'pro', pinned: true, shortcut: '⌘2' },
    { id: 'appointments',      path: '/appointments',      label: 'Appointments',     section: 'Daily',    icon: 'cal',      status: 'live', minPlan: 'pro', pinned: true, shortcut: '⌘3' },
    { id: 'patients',          path: '/patients',          label: 'Patients',         section: 'Daily',    icon: 'users',    status: 'live', minPlan: 'pro' },
    { id: 'leads',             path: '/leads',             label: 'Leads',            section: 'Daily',    icon: 'megaphone',status: 'live', minPlan: 'pro' },
    { id: 'intake_forms',      path: '/intake-forms',      label: 'Intake Forms',     section: 'Daily',    icon: 'pen',      status: 'live', minPlan: 'pro' },

    // ── Growth ─────────────────────────────────────────────────────────
    { id: 'recall',            path: '/marketing',         label: 'Recall & Outreach',section: 'Growth',   icon: 'megaphone',status: 'live', minPlan: 'premium' },
    { id: 'reviews',           path: '/reviews',           label: 'Reviews',          section: 'Growth',   icon: 'star',     status: 'live', minPlan: 'pro' },
    // Social Posts is the unified multi-platform composer + content calendar —
    // compose once → publish/schedule to Google Business + the connected socials.
    // Posting is gated by what's CONNECTED (cap enforced at connect-time on
    // Integrations), so NO minPlan. See lib/types/social-entitlements.ts.
    { id: 'social_posts',      path: '/social-posts',      label: 'Social Posts',     section: 'Growth',   icon: 'megaphone',status: 'live' },
    // (The "Channels" connect surface folded into Integrations — the app-library
    //  there is now the single place to connect Google Business + social, so
    //  there's no separate sidebar entry. Connecting is owner/admin on any plan;
    //  social is bounded by the per-plan cap. See lib/types/social-entitlements.ts.)
    { id: 'analytics',         path: '/analytics',         label: 'Analytics',        section: 'Growth',   icon: 'chart',    status: 'live', minPlan: 'premium' },

    // ── Website (the trunk) ────────────────────────────────────────────
    { id: 'website',           path: '/website',           label: 'Website Editor',   section: 'Website',  icon: 'globe',    status: 'live' },
    { id: 'blog',              path: '/posts',              label: 'Blog Posts',       section: 'Website',  icon: 'pen',      status: 'live', minPlan: 'pro' },
    { id: 'seo',               path: '/seo',               label: 'SEO',              section: 'Website',  icon: 'search',   status: 'live', minPlan: 'pro' },
    { id: 'careers',           path: '/careers',           label: 'Careers',          section: 'Website',  icon: 'briefcase',status: 'live', minPlan: 'premium' },

    // ── Business ───────────────────────────────────────────────────────
    { id: 'shop',              path: '/shop',              label: 'Shop',             section: 'Business', icon: 'bag',      status: 'live', minPlan: 'premium' },
    // The /integrations page hosts BOTH the Premium PMS sync AND the free
    // Google Business card (free on every tier). The page renders the GBP card
    // for everyone + a Premium upsell for the PMS, so the sidebar entry is
    // visible on every plan (the page no longer redirects below-Premium).
    { id: 'integrations',      path: '/integrations',      label: 'Integrations',     section: 'Business', icon: 'plug',     status: 'live' },

    // ── Settings ───────────────────────────────────────────────────────
    { id: 'settings',          path: '/settings/account',  label: 'Settings',         section: 'Settings', icon: 'gear',     status: 'live' },
  ],
}
