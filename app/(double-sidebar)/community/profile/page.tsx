export const metadata = {
  title: 'Profile - DreamCRM',
  description: 'Page description',
}

import { FlyoutProvider } from '@/app/flyout-context'
import ProfileSidebar from './profile-sidebar'
import ProfileBody from './profile-body'

function ProfileContent() {
  return (
    <div className="relative flex">

      {/* Profile sidebar */}
      <ProfileSidebar />

      {/* Profile body */}
      <ProfileBody />

    </div>
  )
}

export default function Profile() {
  return (
    <FlyoutProvider>
      <ProfileContent />
    </FlyoutProvider>
  )
}