/**
 * Public-site surface tokens — THE names for the derived-palette CSS vars
 * (set on :root by app/site/[slug]/layout.tsx via clinicPaletteCss). Every
 * page and shared component reads these instead of re-declaring local
 * BG/INK/... consts; the literal fallbacks keep a surface painting even when
 * rendered outside the site layout (previews, tests).
 *
 * Client-safe, zero imports — usable from server pages and client components.
 * Guarded by tests/a11y/site-tokens.test.ts: re-declaring these var() strings
 * locally fails CI.
 */
export const SITE_BG = 'var(--c-bg, #FAF7F2)'
export const SITE_INK = 'var(--c-ink, #1C1A17)'
export const SITE_INK_MUTED = 'var(--c-ink-muted, #6B635A)'
export const SITE_SURFACE = 'var(--c-surface, #FFFFFF)'
export const SITE_BORDER = 'var(--c-border, #E8E2D9)'
export const SITE_DEEP = 'var(--c-deep, #36514c)'
export const SITE_DEEP_INK = 'var(--c-deep-ink, #FFFFFF)'
export const SITE_DEEP_MUTED = 'var(--c-deep-muted, #C5CFCC)'
