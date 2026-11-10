import SkinnedAbout, { type AboutSkin } from '../shared/about-layout'
import type { AboutPageBodyProps } from '@/lib/site-templates/subpage-props'

/** Cosmetic's own About body: the shared skinned layout in this template's register. */
const SKIN: AboutSkin = {
  heroEyebrowClass: 'text-sm font-semibold uppercase tracking-[0.24em]',
  sectionEyebrowClass: 'text-sm font-semibold uppercase tracking-[0.24em]',
  teamEyebrowClass: 'text-sm font-semibold uppercase tracking-[0.24em]',
  headingClass: 'text-[36px] sm:text-[56px] lg:text-[72px] font-normal leading-[1.04] tracking-tight',
  sectionHeadingClass: 'text-3xl sm:text-4xl lg:text-[48px] font-normal leading-[1.08] tracking-tight',
  findHeadingClass: 'text-3xl sm:text-4xl font-normal leading-[1.1] tracking-tight',
  buttonClass: 'rounded-full',
  storyClass: 'font-normal',
  statsCardClass: 'rounded-[2px]',
  statValueClass: 'font-normal tracking-tight',
  portraitRadius: '2px',
  photoClass: 'rounded-[2px]',
  mapRadius: '2px',
  closing: 'brand',
}

export default function CosmeticAbout(props: AboutPageBodyProps) {
  return <SkinnedAbout {...props} skin={SKIN} />
}
