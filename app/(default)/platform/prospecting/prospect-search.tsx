'use client'

import { useState } from 'react'
import { SearchInput } from '@/components/ui/search-input'

/**
 * The workspace's GET-form search box, riding the shared SearchInput (icon,
 * clear ✕, ↵ hint). Local state feeds a hidden `q` so the server-rendered
 * form still submits as a plain GET.
 */
export default function ProspectSearch({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial)
  return (
    <div className="w-56">
      <input type="hidden" name="q" value={value} />
      <SearchInput
        value={value}
        onChange={setValue}
        onClear={() => setValue('')}
        placeholder="Search name, city, dentist…"
        ariaLabel="Search prospects"
        enterHint
      />
    </div>
  )
}
