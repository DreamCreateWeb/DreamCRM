import { useFlyoutContext } from '@/app/flyout-context'

export default function MessagesHeader() {
  const { flyoutOpen, setFlyoutOpen } = useFlyoutContext()

  return (
    <div className="sticky top-16">
      <div className="flex items-center justify-between before:absolute before:inset-0 before:backdrop-blur-md before:bg-gray-50/90 dark:before:bg-[#151D2C]/90 before:-z-10 border-b border-gray-200 dark:border-gray-700/60 px-4 sm:px-6 md:px-5 h-16">
        {/* Mobile: toggle the conversation list (flyout) — the header's one
            functional control. The Mosaic stock avatar links + decorative
            info/check buttons that used to sit here went nowhere (href="#0",
            no onClick), so they were removed rather than left as dead UI. */}
        <button
          className="md:hidden text-gray-400 hover:text-gray-500"
          onClick={() => setFlyoutOpen(!flyoutOpen)}
          aria-controls="messages-sidebar"
          aria-expanded={flyoutOpen}
        >
          <span className="sr-only">Toggle conversation list</span>
          <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M10.7 18.7l1.4-1.4L7.8 13H20v-2H7.8l4.3-4.3-1.4-1.4L4 12z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
