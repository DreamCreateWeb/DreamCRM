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
 */
export const clinicModules: ModuleRegistry = {
  tenantType: 'clinic',
  modules: [
    // ── Daily ──────────────────────────────────────────────────────────
    { id: 'overview',          path: '/',                  label: 'Overview',         section: 'Daily',    icon: 'home',     status: 'live' },
    { id: 'patients',          path: '/patients',          label: 'Patients',         section: 'Daily',    icon: 'users',    status: 'live', minPlan: 'pro' },
    { id: 'appointments',      path: '/appointments',      label: 'Appointments',     section: 'Daily',    icon: 'cal',      status: 'live', minPlan: 'pro' },
    { id: 'leads',             path: '/leads',             label: 'Leads',            section: 'Daily',    icon: 'megaphone',status: 'live', minPlan: 'pro' },
    { id: 'messages',          path: '/messages',          label: 'Messages',         section: 'Daily',    icon: 'chat',     status: 'live', minPlan: 'pro' },
    { id: 'inbox',             path: '/inbox',             label: 'Inbox',            section: 'Daily',    icon: 'inbox',    status: 'live', minPlan: 'pro' },
    { id: 'intake_forms',      path: '/intake-forms',      label: 'Intake Forms',     section: 'Daily',    icon: 'pen',      status: 'live', minPlan: 'pro' },
    { id: 'tasks',             path: '/tasks/kanban',      label: 'Tasks',            section: 'Daily',    icon: 'check',    status: 'live', minPlan: 'pro' },

    // ── Growth ─────────────────────────────────────────────────────────
    { id: 'recall',            path: '/marketing',         label: 'Recall & Outreach',section: 'Growth',   icon: 'megaphone',status: 'live', minPlan: 'premium' },
    { id: 'reviews',           path: '/reviews',           label: 'Reviews',          section: 'Growth',   icon: 'star',     status: 'soon', minPlan: 'pro' },
    { id: 'analytics',         path: '/analytics',         label: 'Analytics',        section: 'Growth',   icon: 'chart',    status: 'soon', minPlan: 'premium' },

    // ── Website (the trunk) ────────────────────────────────────────────
    { id: 'website',           path: '/website',           label: 'Website Editor',   section: 'Website',  icon: 'globe',    status: 'live' },
    { id: 'blog',              path: '/blog',              label: 'Blog Posts',       section: 'Website',  icon: 'pen',      status: 'soon', minPlan: 'pro' },
    { id: 'seo',               path: '/seo',               label: 'SEO',              section: 'Website',  icon: 'search',   status: 'soon', minPlan: 'pro' },
    { id: 'careers',           path: '/careers',           label: 'Careers',          section: 'Website',  icon: 'briefcase',status: 'soon', minPlan: 'premium' },

    // ── Business ───────────────────────────────────────────────────────
    { id: 'shop',              path: '/shop',              label: 'Shop',             section: 'Business', icon: 'bag',      status: 'soon', minPlan: 'premium' },
    { id: 'invoices',          path: '/invoices',          label: 'Invoices',         section: 'Business', icon: 'receipt',  status: 'live', minPlan: 'pro' },
    { id: 'integrations',      path: '/integrations',      label: 'Integrations',     section: 'Business', icon: 'plug',     status: 'soon', minPlan: 'premium' },

    // ── Settings ───────────────────────────────────────────────────────
    { id: 'settings',          path: '/settings/account',  label: 'Settings',         section: 'Settings', icon: 'gear',     status: 'live' },
  ],
}
