import SkinnedServices, { type ServicesSkin } from '../shared/services-layout'
import type { ServicesPageBodyProps } from '@/lib/site-templates/subpage-props'

/** Hometeam's own Services body: the shared skinned layout in this template's register. */
const SKIN: ServicesSkin = {
  hero: 'banner',
  headingClass: 'text-[2.4rem] sm:text-6xl lg:text-[4.25rem] font-bold uppercase leading-[1.02] tracking-[-0.015em]',
  eyebrowClass: 'text-sm font-bold uppercase tracking-[0.2em]',
  cardClass: () => 'rounded-md shadow-[0_6px_0_0_var(--c-deep,#1F2327)]',
  iconWellClass: 'w-12 h-12 rounded-sm',
  numbered: true,
  buttonClass: 'rounded-md font-bold',
  learnMore: 'Details',
  closing: 'teal',
  sectionHeadingClass: 'text-3xl sm:text-4xl lg:text-[44px] font-bold uppercase leading-[1.08]',
  rule: 'none',
}

export default function HometeamServices(props: ServicesPageBodyProps) {
  return <SkinnedServices {...props} skin={SKIN} />
}
