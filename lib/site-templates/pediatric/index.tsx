import PediatricHome from '@/components/clinic-site/templates/pediatric/home'
import PediatricHeader from '@/components/clinic-site/templates/pediatric/header'
import PediatricFooter from '@/components/clinic-site/templates/pediatric/footer'
import PediatricMobileActions from '@/components/clinic-site/templates/pediatric/mobile-actions'
import { buildPediatricPalette } from './palette'
import { PEDIATRIC_EXTRA_PAGES } from './pages'
import type { SiteTemplateDef } from '../types'

/**
 * Fredoka — a rounded, friendly variable sans that reads "storybook" without
 * tipping into Comic Sans. Runtime <link> like every template (never
 * next/font; the build env can't reach Google Fonts — PR #166).
 */
const FREDOKA_HREF =
  'https://fonts.googleapis.com/css2?family=Fredoka:wght@400..700&display=swap'

/**
 * Pediatric — DESIGN.md variant 3. Soft pastels + one bright bouncy accent,
 * rounded everything, cartoon SVG decor, parent-focused reassurance voice —
 * and the kids' coloring corner: the first template to declare an extra
 * marketing page (/coloring) on the canon coloringPages content.
 */
export const pediatricTemplate: SiteTemplateDef = {
  id: 'pediatric',
  label: 'Pediatric Play',
  description:
    'Soft pastels, rounded type, cartoon touches — built for kids’ practices. Parent-reassuring voice, plus a coloring corner kids can print or color online.',
  chrome: {
    Header: PediatricHeader,
    Footer: PediatricFooter,
    MobileActions: PediatricMobileActions,
  },
  pages: { Home: PediatricHome },
  extraMarketingPages: PEDIATRIC_EXTRA_PAGES,
  buildPalette: buildPediatricPalette,
  fonts: [{ id: 'dc-fredoka', href: FREDOKA_HREF }],
  fontCss: "--font-display: 'Fredoka', 'Trebuchet MS', sans-serif;",
  bookLabel: 'Book a Visit',
  copyKeys: [
    { key: 'pediatricHome.heroStatement', label: 'Homepage hero statement (pediatric)', fallback: 'Gentle visits, silly jokes, and zero scary stuff. We help kids actually look forward to the dentist — and give parents straight answers. No judgment, ever.', page: '/' },
    { key: 'pediatricHome.servicesHeading', label: 'Homepage services headline (pediatric)', fallback: 'What we do (it doesn’t hurt, promise)', page: '/' },
    { key: 'pediatricHome.coloringHeading', label: 'Coloring corner headline (pediatric)', fallback: 'The coloring corner', page: '/' },
    { key: 'pediatricHome.coloringBlurb', label: 'Coloring corner blurb (pediatric)', fallback: 'Free coloring pages from our team — color them right here on the site, or print them out for the car ride over.', page: '/' },
    { key: 'pediatricHome.teamHeading', label: 'Homepage team headline (pediatric)', fallback: 'The friendly faces your kids will love', page: '/' },
    { key: 'pediatricHome.testimonialsHeading', label: 'Homepage testimonials headline (pediatric)', fallback: 'Notes from happy parents', page: '/' },
    { key: 'pediatricHome.closerHeading', label: 'Homepage closing headline (pediatric)', fallback: 'Ready for a visit that ends in high-fives?', page: '/' },
    { key: 'pediatricHome.closerSub', label: 'Homepage closing subhead (pediatric)', fallback: 'New families welcome — bring the whole crew.', page: '/' },
  ],
  copyDefaults: {},
}
