'use client'

import * as React from 'react'

import { TriangleAlert, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Props = { children: React.ReactNode }
type State = { error: Error | null }

/**
 * Client-side error boundary.
 *
 * A render-time crash in ONE view (a bad prop, a browser-API quirk, an
 * unexpected response shape) used to blank the ENTIRE app into Next's
 * "Application error: a client-side exception has occurred" page — the user
 * lost even the logout button. This confines the blast radius to the failed
 * section, explains what happened in plain language, and offers one-tap
 * recovery while the header and footer keep working.
 *
 * React still requires a class component for error boundaries — kept tiny
 * on purpose. It catches render/lifecycle errors only (never event handlers
 * or async callbacks); navigating between views remounts it, clearing the
 * error state automatically.
 */
export default class SafeBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[hajira] view crashed:', error)
  }

  private reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-rust/30 bg-rust/5 px-6 py-12 text-center"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rust/10">
            <TriangleAlert className="h-5 w-5 text-rust" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-heading">This screen failed to load</p>
          <p className="max-w-sm text-xs text-label">
            A temporary glitch stopped this section. Your data is safe — open it again, or reload
            the app.
          </p>
          <Button
            onClick={this.reset}
            size="sm"
            className="btn-3d btn-ink mt-1 h-10 gap-2 px-5 font-semibold"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Try again
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
