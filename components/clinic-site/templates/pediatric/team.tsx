import SkinnedTeam, { type TeamSkin } from '../shared/team-layout'
import type { TeamPageBodyProps } from '@/lib/site-templates/subpage-props'

/** Pediatric's own Team body: the shared skinned layout in this template's register. */
const SKIN: TeamSkin = {
  eyebrowClass: 'inline-flex items-center rounded-full px-4 py-1.5 text-sm font-bold',
  eyebrowPill: true,
  headingClass: 'text-[34px] sm:text-[52px] lg:text-[64px] font-bold leading-[1.05]',
  portraitRadius: '38% 62% 58% 42% / 45% 42% 58% 55%',
  buttonClass: 'rounded-full font-bold',
  emptyCardClass: 'rounded-[2rem]',
  closing: 'brand',
}

export default function PediatricTeam(props: TeamPageBodyProps) {
  return <SkinnedTeam {...props} skin={SKIN} />
}
