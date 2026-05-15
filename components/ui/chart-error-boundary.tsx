'use client'

import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: boolean }

export default class ChartErrorBoundary extends Component<Props, State> {
  state: State = { error: false }

  static getDerivedStateFromError() {
    return { error: true }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grow flex items-center justify-center py-10 text-sm text-gray-400 dark:text-gray-500">
          Chart unavailable
        </div>
      )
    }
    return this.props.children
  }
}
