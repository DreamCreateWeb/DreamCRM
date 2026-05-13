/**
 * Icon registry — maps the string names used in the module registry
 * (lib/modules/) to actual SVG icon components.
 *
 * Keep these as inline SVGs so the bundle stays light. Add new icons here
 * as the registry grows.
 */

interface IconProps {
  className?: string
}

const Icon = ({ children, className }: IconProps & { children: React.ReactNode }) => (
  <svg className={className ?? 'shrink-0 fill-current'} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width={20} height={20}>
    {children}
  </svg>
)

const icons: Record<string, (p: IconProps) => React.ReactElement> = {
  home:     (p) => <Icon className={p.className}><path d="M12 3l9 8h-3v9h-4v-6h-4v6H6v-9H3z" /></Icon>,
  chart:    (p) => <Icon className={p.className}><path d="M3 13h2v8H3zm4-4h2v12H7zm4-6h2v18h-2zm4 8h2v10h-2zm4-4h2v14h-2z" /></Icon>,
  wallet:   (p) => <Icon className={p.className}><path d="M21 7H5V5h14V3H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h16v-2h-2zM6 9h13v10H6zm12 4a1 1 0 100 2 1 1 0 000-2z" /></Icon>,
  building: (p) => <Icon className={p.className}><path d="M12 2L3 7v13h6v-6h6v6h6V7zM7 11H5V9h2zm0 4H5v-2h2zm6-4h-2V9h2zm0 4h-2v-2h2zm6-4h-2V9h2zm0 4h-2v-2h2z" /></Icon>,
  receipt:  (p) => <Icon className={p.className}><path d="M19 3H5v18l3-2 2 2 2-2 2 2 2-2 3 2zM17 11H7V9h10zm0 4H7v-2h10z" /></Icon>,
  flag:     (p) => <Icon className={p.className}><path d="M5 3v18h2v-7h12L17 9l2-6z" /></Icon>,
  chat:     (p) => <Icon className={p.className}><path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h11c.55 0 1-.45 1-1z" /></Icon>,
  inbox:    (p) => <Icon className={p.className}><path d="M19 3H5c-1.11 0-2 .89-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 12h-4c0 1.66-1.35 3-3 3s-3-1.34-3-3H5V5h14z" /></Icon>,
  cal:      (p) => <Icon className={p.className}><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v16a2 2 0 002 2h14c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 18H5V8h14zM7 10h5v5H7z" /></Icon>,
  check:    (p) => <Icon className={p.className}><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></Icon>,
  megaphone:(p) => <Icon className={p.className}><path d="M18 11v2h4v-2zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9zm11.5 3a4.5 4.5 0 00-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" /></Icon>,
  gear:     (p) => <Icon className={p.className}><path d="M19.14 12.94a7.93 7.93 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.86 7.86 0 00-1.62-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54c-.59.24-1.13.55-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.71 8.84a.5.5 0 00.12.64l2.03 1.58a7.93 7.93 0 000 1.88L2.83 14.5a.5.5 0 00-.12.64l1.92 3.32a.5.5 0 00.6.22l2.39-.96c.49.39 1.03.7 1.62.94l.36 2.54a.5.5 0 00.5.42h3.84a.5.5 0 00.5-.42l.36-2.54c.59-.24 1.13-.55 1.62-.94l2.39.96a.5.5 0 00.6-.22l1.92-3.32a.5.5 0 00-.12-.64zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z" /></Icon>,
  users:    (p) => <Icon className={p.className}><path d="M16 11a4 4 0 100-8 4 4 0 000 8zm-8 0a4 4 0 100-8 4 4 0 000 8zm0 2c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4zm8 0c-.29 0-.62.02-.97.05A5.48 5.48 0 0118 17v3h6v-3c0-2.66-5.33-4-8-4z" /></Icon>,
  pen:      (p) => <Icon className={p.className}><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0L15.13 5.13l3.75 3.75z" /></Icon>,
  search:   (p) => <Icon className={p.className}><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 5 1.49-1.49zM9.5 14a4.5 4.5 0 110-9 4.5 4.5 0 010 9z" /></Icon>,
  briefcase:(p) => <Icon className={p.className}><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19a2 2 0 002 2h16c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm-6 0h-4V4h4z" /></Icon>,
  globe:    (p) => <Icon className={p.className}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93A8 8 0 014.06 13H7v1c0 1.1.9 2 2 2v3.93zM18.93 16c-.27-.83-1.05-1.5-2.02-1.5h-1v-3a1 1 0 00-1-1H8v-2h2a1 1 0 001-1V5.07a8.01 8.01 0 016.93 6.93c-.06 1.42-.46 2.74-1 4z" /></Icon>,
  plus:     (p) => <Icon className={p.className}><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z" /></Icon>,
  folder:   (p) => <Icon className={p.className}><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18a2 2 0 002 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8z" /></Icon>,
  user:     (p) => <Icon className={p.className}><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></Icon>,
}

export function NavIcon({ name, className }: { name?: string; className?: string }) {
  if (!name) return null
  const Component = icons[name]
  if (!Component) return null
  return <Component className={className} />
}
