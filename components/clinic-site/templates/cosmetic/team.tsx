import SkinnedTeam, { type TeamSkin } from '../shared/team-layout'
import type { TeamPageBodyProps } from '@/lib/site-templates/subpage-props'

/** Cosmetic's own Team body: the shared skinned layout in this template's register. */
const SKIN: TeamSkin = {
  eyebrowClass: 'text-sm font-semibold uppercase tracking-[0.24em]',
  headingClass: 'text-[36px] sm:text-[56px] lg:text-[72px] font-normal leading-[1.04] tracking-tight',
  portraitRadius: '2px',
  buttonClass: 'rounded-full',
  emptyCardClass: 'rounded-[2px]',
  closing: 'brand',
}

export default function CosmeticTeam(props: TeamPageBodyProps) {
  return <SkinnedTeam {...props} skin={SKIN} />
}
