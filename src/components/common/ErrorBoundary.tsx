'use client';
import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  resetKey?: unknown;
  fallback?: React.ReactNode;
  handler?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private handle: (error: Error, info: React.ErrorInfo) => void;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
    this.handle = props.handler || ((err) => console.log('[ErrorBoundary]', err));
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.handle(error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && this.props.resetKey !== prevProps.resetKey) {
      // Retry rendering on resetKey change
      this.setState({ error: null });
      return;
    }

    if (this.props.handler !== prevProps.handler) {
      this.handle = this.props.handler || ((err) => console.log('[ErrorBoundary]', err));
    }

    if (!this.state.error) {
      // BUG what is this for? this.lastValid is not available when trying to build
      // this.lastValid = this.props.children;
    }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback || (
        <pre className="text-red-600">Error: {this.state.error.message}</pre>
      );
    }

    return this.props.children;
  }
}
