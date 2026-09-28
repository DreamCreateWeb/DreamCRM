import HometeamHome from '@/components/clinic-site/templates/hometeam/home'
import HometeamHeader from '@/components/clinic-site/templates/hometeam/header'
import HometeamFooter from '@/components/clinic-site/templates/hometeam/footer'
import HometeamMobileActions from '@/components/clinic-site/templates/hometeam/mobile-actions'
import { buildHometeamPalette } from './palette'
import type { SiteTemplateDef } from '../types'

/**
 * Two faces, one runtime <link> each (never next/font; the build env can't
 * reach Google Fonts — PR #166): Roboto Slab for the headlines — sturdy,
 * old-ballpark-signage — and Barlow Condensed for the scoreboard numerals,
 * the pennants and the jersey numbers.
 */
const ROBOTO_SLAB_HREF = 'https://fonts.googleapis.com/css2?family=Roboto+Slab:wght@500;600;700&display=swap'
const BARLOW_CONDENSED_HREF =
  'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&display=swap'

/**
 * Home Team — the practice everyone in town knows (owner brief 2026-09-28,
 * built for a clinic that is decorated like a ballpark inside). Baseball
 * carries the STRUCTURE and the VOICE — a home-plate crest, a scoreboard for
 * the stats, pennant eyebrows, jersey-numbered services, "the lineup", "the
 * skipper", "from the stands" — and never the imagery: no stitching, no
 * bats, no diamonds. The clinic's brand color is the team color and does
 * every job a team color does; charcoal and home whites are the uniform.
 * Serious in construction, theirs in personality.
 */
export const hometeamTemplate: SiteTemplateDef = {
  id: 'hometeam',
  label: 'Home Team',
  description:
    'Your color as the team color — a home-plate crest, a scoreboard for the numbers, pennant eyebrows, the lineup. Team spirit with a straight face.',
  chrome: {
    Header: HometeamHeader,
    Footer: HometeamFooter,
    MobileActions: HometeamMobileActions,
  },
  pages: { Home: HometeamHome },
  extraMarketingPages: [],
  buildPalette: buildHometeamPalette,
  fonts: [
    { id: 'dc-roboto-slab-hometeam', href: ROBOTO_SLAB_HREF },
    { id: 'dc-barlow-condensed-hometeam', href: BARLOW_CONDENSED_HREF },
  ],
  fontCss:
    "--font-display: 'Roboto Slab', Georgia, serif; --font-score: 'Barlow Condensed', 'Arial Narrow', sans-serif;",
  bookLabel: 'Book a Visit',
  copyKeys: [
    { key: 'hometeamHome.heroEyebrow', label: 'Homepage hero pennant (home team)', fallback: 'The home team', page: '/' },
    { key: 'hometeamHome.heroIntro', label: 'Homepage hero introduction (home team)', fallback: 'Straight answers, steady hands, and a schedule we keep. The office the whole family goes to, and keeps going to.', page: '/' },
    { key: 'hometeamHome.servicesEyebrow', label: 'Homepage services pennant (home team)', fallback: 'The lineup', page: '/' },
    { key: 'hometeamHome.servicesHeading', label: 'Homepage services headline (home team)', fallback: 'Everything a family needs, in one place.', page: '/' },
    { key: 'hometeamHome.servicesIntro', label: 'Homepage services intro (home team)', fallback: 'From the cleaning that keeps you out of trouble to the crown that gets you back to dinner, done here, by people you already know.', page: '/' },
    { key: 'hometeamHome.skipperEyebrow', label: 'Homepage doctor pennant (home team)', fallback: 'The skipper', page: '/' },
    { key: 'hometeamHome.practiceHeading', label: 'Homepage practice headline (home team)', fallback: 'Standards we keep.', page: '/' },
    { key: 'hometeamHome.practiceBody', label: 'Homepage practice paragraph (home team)', fallback: 'The same doctor at every visit. Modern equipment, kept current. A schedule that runs on time because we book it honestly. You will notice on your first visit, and you will keep noticing.', page: '/' },
    { key: 'hometeamHome.rulesEyebrow', label: 'Homepage ground-rules label (home team)', fallback: 'Ground rules', page: '/' },
    { key: 'hometeamHome.testimonialsEyebrow', label: 'Homepage testimonials pennant (home team)', fallback: 'From the stands', page: '/' },
    { key: 'hometeamHome.testimonialsHeading', label: 'Homepage testimonials headline (home team)', fallback: 'What patients say.', page: '/' },
    { key: 'hometeamHome.detailsEyebrow', label: 'Homepage details pennant (home team)', fallback: 'Before your visit', page: '/' },
    { key: 'hometeamHome.detailsHeading', label: 'Homepage details headline (home team)', fallback: 'Hours, insurance, and where to park.', page: '/' },
    { key: 'hometeamHome.closerHeading', label: 'Homepage closing headline (home team)', fallback: 'Ready for your next visit?', page: '/' },
    { key: 'hometeamHome.closerSub', label: 'Homepage closing subhead (home team)', fallback: 'New patients are always welcome. Book online, or call and a person will answer.', page: '/' },
  ],
  copyDefaults: {},
}
