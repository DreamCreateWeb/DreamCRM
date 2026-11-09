import SkinnedServices, { type ServicesSkin } from '../shared/services-layout'
import type { ServicesPageBodyProps } from '@/lib/site-templates/subpage-props'

/** Pediatric's own Services body: the shared skinned layout in this template's register. */
const SKIN: ServicesSkin = {
  hero: 'center',
  headingClass: 'text-[34px] sm:text-[52px] lg:text-[64px] font-bold leading-[1.05]',
  eyebrowClass: 'inline-flex items-center rounded-full px-4 py-1.5 text-sm font-bold',
  eyebrowPill: true,
  cardClass: (i) => `rounded-[2rem] hover:-translate-y-1.5 ${i % 2 === 0 ? 'hover:-rotate-1' : 'hover:rotate-1'}`,
  iconWellClass: 'w-16 h-16 rounded-full text-4xl',
  numbered: false,
  buttonClass: 'rounded-full font-bold',
  learnMore: 'See more',
  closing: 'brand',
  sectionHeadingClass: 'text-3xl sm:text-4xl lg:text-[48px] font-bold leading-[1.08]',
  rule: 'dots',
}

export default function PediatricServices(props: ServicesPageBodyProps) {
  return <SkinnedServices {...props} skin={SKIN} />
}
