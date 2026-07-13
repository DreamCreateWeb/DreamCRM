import ProspectingNav from './prospecting-nav'

/**
 * Prospecting workspace layout — mounts the persistent sub-nav above every
 * prospecting surface (pipeline, call list, sequences, demos, communications,
 * territory, settings) so they navigate like one tool instead of panel-only
 * deep links. Auth stays in each page (they all gate on platformAdmin); the
 * nav itself renders nothing sensitive.
 */
export default function ProspectingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProspectingNav />
      {children}
    </>
  )
}
