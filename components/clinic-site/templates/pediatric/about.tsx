import SkinnedAbout, { type AboutSkin } from '../shared/about-layout'
import type { AboutPageBodyProps } from '@/lib/site-templates/subpage-props'

/** Pediatric's own About body: the shared skinned layout in this template's register. */
const SKIN: AboutSkin = {
  heroEyebrowClass: 'inline-flex items-center rounded-full px-4 py-1.5 text-sm font-bold',
  sectionEyebrowClass: 'inline-flex items-center rounded-full px-4 py-1.5 text-sm font-bold',
  teamEyebrowClass: 'inline-flex items-center rounded-full px-4 py-1.5 text-sm font-bold',
  eyebrowPill: true,
  headingClass: 'text-[34px] sm:text-[52px] lg:text-[64px] font-bold leading-[1.05]',
  sectionHeadingClass: 'text-3xl sm:text-4xl lg:text-[48px] font-bold leading-[1.08]',
  findHeadingClass: 'text-3xl sm:text-4xl font-bold leading-[1.1]',
  buttonClass: 'rounded-full font-bold',
  storyClass: 'font-semibold',
  statsCardClass: 'rounded-[2rem]',
  statValueClass: 'font-bold',
  portraitRadius: '38% 62% 58% 42% / 45% 42% 58% 55%',
  photoClass: 'rounded-[2rem]',
  mapRadius: '32px',
  closing: 'brand',
}

export default function PediatricAbout(props: AboutPageBodyProps) {
  return <SkinnedAbout {...props} skin={SKIN} />
}
