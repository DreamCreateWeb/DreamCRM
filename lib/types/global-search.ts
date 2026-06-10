// Client-safe result shapes for the global ⌘K palette.

export type SearchResultKind =
  | 'patient'
  | 'appointment'
  | 'lead'
  | 'thread'
  | 'clinic'
  | 'page'
  | 'action'

export interface SearchResult {
  id: string
  label: string
  sublabel: string | null
  href: string
  kind: SearchResultKind
}

export interface SearchGroup {
  label: string
  results: SearchResult[]
}
