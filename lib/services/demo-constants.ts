/**
 * Slug of the singleton "Acme Dental Demo" clinic that the platform admin
 * seeds for "view as clinic" previews. It is NOT a real paying customer —
 * it carries planTier='premium' + subscriptionStatus='active' so the demo
 * showcases premium features, but it has no real Stripe subscription.
 *
 * Platform business metrics (MRR, active-subscriber count, plan mix, new-
 * clinic signups) must EXCLUDE this org so the demo never inflates the
 * platform owner's real numbers. Keep this in sync with the slug produced
 * by createDemoClinic() — guarded by a test.
 */
export const DEMO_CLINIC_SLUG = 'acme-dental-demo'
