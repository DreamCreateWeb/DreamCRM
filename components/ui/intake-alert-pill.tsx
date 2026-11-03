import { StatusPill } from '@/components/ui/status-pill'

/**
 * The "⚠ Allergic to penicillin" pill (ML-27) — the intake form's medical
 * alerts on a schedule row, in the warn tone (needs OUR attention before the
 * visit). One line: the first alert, then "+N" for the rest; the full list
 * rides the title and the drawer's Intake section. Staff-only surfaces — the
 * same role already reads the whole form on the submission page.
 */
export function IntakeAlertPill({ alerts, className = '' }: { alerts: string[]; className?: string }) {
  const lines = alerts.filter((a) => a.trim() !== '')
  if (lines.length === 0) return null
  const [first, ...rest] = lines
  return (
    <StatusPill
      tone="warn"
      title={`From their intake form: ${lines.join(' · ')}`}
      className={`max-w-full ${className}`}
    >
      <span aria-hidden="true">⚠</span>
      <span className="ml-1 truncate max-w-[14rem]">{first}</span>
      {rest.length > 0 && <span className="ml-1 tabular-nums">+{rest.length}</span>}
    </StatusPill>
  )
}
