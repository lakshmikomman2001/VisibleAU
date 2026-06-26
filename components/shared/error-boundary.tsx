"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: undefined };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-lg border border-destructive/50 p-4 text-sm text-destructive">
            Something went wrong in this section.
            <button
              onClick={() => this.setState({ hasError: false })}
              className="ml-2 underline"
            >
              Retry
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
