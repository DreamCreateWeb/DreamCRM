import HometownHome from '@/components/clinic-site/templates/hometown/home'
import HometownHeader from '@/components/clinic-site/templates/hometown/header'
import HometownFooter from '@/components/clinic-site/templates/hometown/footer'
import HometownMobileActions from '@/components/clinic-site/templates/hometown/mobile-actions'
import { buildHometownPalette } from './palette'
import type { SiteTemplateDef } from '../types'

/**
 * Playfair Display — the high-contrast classic serif that makes "Welcome to
 * {Practice}" read like a hand-painted sign. Runtime <link> like every
 * template (never next/font; the build env can't reach Google Fonts — PR #166).
 */
const PLAYFAIR_HREF =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&display=swap'

/**
 * Hometown Classic — the no-photos-needed template (owner brief 2026-07-23):
 * a lot of clinics have NO photo library, and the three existing templates
 * all lean on imagery. This one is designed to look finished with zero
 * uploads — a deep brand hero with the signature marigold contact/hours
 * card, checkmark clarity, and calm information-first bands. Any photo a
 * clinic does add is optional decoration, never load-bearing.
 */
export const hometownTemplate: SiteTemplateDef = {
  id: 'hometown',
  label: 'Hometown Classic',
  description:
    'Straightforward and trustworthy — solid brand hero, phone and hours front and center, checkmark clarity. Looks complete without a single photo upload.',
  chrome: {
    Header: HometownHeader,
    Footer: HometownFooter,
    MobileActions: HometownMobileActions,
  },
  pages: { Home: HometownHome },
  extraMarketingPages: [],
  buildPalette: buildHometownPalette,
  fonts: [{ id: 'dc-playfair', href: PLAYFAIR_HREF }],
  fontCss: "--font-display: 'Playfair Display', Georgia, serif;",
  bookLabel: 'Schedule a Visit',
  copyKeys: [
    { key: 'hometownHome.heroIntro', label: 'Homepage hero introduction (hometown)', fallback: 'If you’re looking for a dental practice that treats your whole family like neighbors — because you are — you’ve found it. Honest recommendations, comfortable visits, and a team that remembers your name.', page: '/' },
    { key: 'hometownHome.hoursCardHeading', label: 'Hero contact-card heading (hometown)', fallback: 'Schedule your visit with us today', page: '/' },
    { key: 'hometownHome.servicesHeading', label: 'Homepage services headline (hometown)', fallback: 'Our dental services', page: '/' },
    { key: 'hometownHome.aboutHeading', label: 'Homepage about headline (hometown)', fallback: 'Straightforward care from people who know you', page: '/' },
    { key: 'hometownHome.aboutBody', label: 'Homepage about paragraph (hometown)', fallback: 'No upsells, no mystery bills, no rushing you out of the chair. We explain what we see, tell you what can wait, and treat the schedule like a promise. That’s how a practice earns a family for decades — one honest visit at a time.', page: '/' },
    { key: 'hometownHome.testimonialsHeading', label: 'Homepage testimonials headline (hometown)', fallback: 'Kind words from our patients', page: '/' },
    { key: 'hometownHome.closerHeading', label: 'Homepage closing headline (hometown)', fallback: 'Ready to schedule your visit?', page: '/' },
    { key: 'hometownHome.closerSub', label: 'Homepage closing subhead (hometown)', fallback: 'New patients are always welcome — call us or request a time online.', page: '/' },
  ],
  copyDefaults: {},
}
