'use client'

/**
 * Print / Save-as-PDF button for a receipt. Lives outside the `#receipt`
 * element so the print-isolation CSS (in the receipt page) hides it when
 * printing — only the receipt sheet ends up on paper / in the PDF.
 */
export default function PrintReceiptButton({ brand }: { brand: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[0.88rem] font-semibold text-white transition-opacity hover:opacity-90"
      style={{ backgroundColor: brand }}
    >
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M4 1.5h8V5H4V1.5ZM3 6h10a2 2 0 0 1 2 2v4a1 1 0 0 1-1 1h-2v1.5H4V13H2a1 1 0 0 1-1-1V8a2 2 0 0 1 2-2Zm2 5.5v3h6v-3H5Zm7.5-3.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" />
      </svg>
      Print / Save PDF
    </button>
  )
}
