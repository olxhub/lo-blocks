'use client';
import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  resetKey?: unknown;
  fallback?: React.ReactNode;
  /** Render the fallback from the caught error (and component stack). Takes
   *  precedence over `fallback` — lets the boundary show the actual error. */
  fallbackRender?: (error: Error, info: React.ErrorInfo | null) => React.ReactNode;
  handler?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
  info: React.ErrorInfo | null;
}

/** Compare resetKeys. Arrays are compared shallowly so a caller can pass
 *  `resetKey={[a, b]}` (a fresh array every render) and have it count as
 *  changed only when a member actually changes — not on every render. */
function resetKeyChanged(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length !== b.length || a.some((v, i) => v !== b[i]);
  }
  return a !== b;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private handle: (error: Error, info: React.ErrorInfo) => void;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, info: null };
    this.handle = props.handler || ((err) => console.log('[ErrorBoundary]', err));
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ info });
    this.handle(error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && resetKeyChanged(prevProps.resetKey, this.props.resetKey)) {
      // Retry rendering on resetKey change
      this.setState({ error: null, info: null });
      return;
    }

    if (this.props.handler !== prevProps.handler) {
      this.handle = this.props.handler || ((err) => console.log('[ErrorBoundary]', err));
    }

    if (!this.state.error) {
      // TODO the logic should be trying to render. If it fails, we
      // switch back to the last valid version
      // this.lastValid = this.props.children;
    }
  }

  render() {
    if (this.state.error) {
      if (this.props.fallbackRender) {
        return this.props.fallbackRender(this.state.error, this.state.info);
      }
      return this.props.fallback || (
        <pre className="text-error">Error: {this.state.error.message}</pre>
      );
    }

    return this.props.children;
  }
}
