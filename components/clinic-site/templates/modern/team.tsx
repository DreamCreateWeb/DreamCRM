import SkinnedTeam, { MODERN_TEAM_SKIN } from '../shared/team-layout'
import type { TeamPageBodyProps } from '@/lib/site-templates/subpage-props'

/** Modern's Team body: the shared layout wearing Modern's own skin (ML-52b). */
export default function ModernTeam(props: TeamPageBodyProps) {
  return <SkinnedTeam {...props} skin={MODERN_TEAM_SKIN} />
}
