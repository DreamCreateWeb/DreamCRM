import EstablishedHome from '@/components/clinic-site/templates/established/home'
import EstablishedHeader from '@/components/clinic-site/templates/established/header'
import EstablishedFooter from '@/components/clinic-site/templates/established/footer'
import EstablishedMobileActions from '@/components/clinic-site/templates/established/mobile-actions'
import { buildEstablishedPalette } from './palette'
import type { SiteTemplateDef } from '../types'

/**
 * Fraunces with the italic axis — the one italic word in every headline is
 * the template's signature, and Fraunces' italic has the swash to carry it.
 * Runtime <link> like every template (never next/font; the build env can't
 * reach Google Fonts — PR #166).
 */
const FRAUNCES_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500..700;1,9..144,500..700&display=swap'

/**
 * Established — the credentialed practice (owner brief 2026-09-28: "serious
 * and sharp", the register of the Arkansas State Dental Association site the
 * owner built and is known for). Cream ground, navy ink, the clinic's brand
 * as ONE accent, a fixed gold hairline; a lettered crest where other
 * templates put a lifestyle photo; a box-score stat row; editorial section
 * openers with a tracked eyebrow and an italic accent word. Looks finished
 * with a logo and a phone number and gets better with photography — the same
 * law Hometown Classic keeps, in a different suit.
 */
export const establishedTemplate: SiteTemplateDef = {
  id: 'established',
  label: 'Established',
  description:
    'Cream, navy and one accent — a lettered crest, serif numerals, editorial sections. For the practice that wants to look like it sits on the board.',
  chrome: {
    Header: EstablishedHeader,
    Footer: EstablishedFooter,
    MobileActions: EstablishedMobileActions,
  },
  pages: { Home: EstablishedHome },
  extraMarketingPages: [],
  buildPalette: buildEstablishedPalette,
  fonts: [{ id: 'dc-fraunces-established', href: FRAUNCES_HREF }],
  fontCss: "--font-display: 'Fraunces', Georgia, serif;",
  bookLabel: 'Book a Visit',
  copyKeys: [
    { key: 'establishedHome.heroEyebrow', label: 'Homepage hero eyebrow (established)', fallback: 'Family & general dentistry', page: '/' },
    { key: 'establishedHome.heroIntro', label: 'Homepage hero introduction (established)', fallback: 'A practice built on plain answers, unhurried visits, and work that holds up. We tell you what we see, what can wait, and what it costs — before anything happens.', page: '/' },
    { key: 'establishedHome.servicesEyebrow', label: 'Homepage services eyebrow (established)', fallback: 'What we do', page: '/' },
    { key: 'establishedHome.servicesHeading', label: 'Homepage services headline (established)', fallback: 'Complete care, under one roof.', page: '/' },
    { key: 'establishedHome.practiceEyebrow', label: 'Homepage practice eyebrow (established)', fallback: 'The practice', page: '/' },
    { key: 'establishedHome.practiceHeading', label: 'Homepage practice headline (established)', fallback: 'Standards you can see.', page: '/' },
    { key: 'establishedHome.practiceBody', label: 'Homepage practice paragraph (established)', fallback: 'The same doctor at every visit. Modern equipment, kept current. A schedule that runs on time because we book it honestly. Those are not slogans — they are how the office is run, and you will notice on your first visit.', page: '/' },
    { key: 'establishedHome.testimonialsEyebrow', label: 'Homepage testimonials eyebrow (established)', fallback: 'In their words', page: '/' },
    { key: 'establishedHome.testimonialsHeading', label: 'Homepage testimonials headline (established)', fallback: 'What patients say when we are not in the room.', page: '/' },
    { key: 'establishedHome.detailsEyebrow', label: 'Homepage details eyebrow (established)', fallback: 'The details', page: '/' },
    { key: 'establishedHome.detailsHeading', label: 'Homepage details headline (established)', fallback: 'Hours, insurance, and where to find us.', page: '/' },
    { key: 'establishedHome.closerHeading', label: 'Homepage closing headline (established)', fallback: 'Ready when you are.', page: '/' },
    { key: 'establishedHome.closerSub', label: 'Homepage closing subhead (established)', fallback: 'New patients are welcome. Book online, or call and a person will answer.', page: '/' },
  ],
  copyDefaults: {},
}
