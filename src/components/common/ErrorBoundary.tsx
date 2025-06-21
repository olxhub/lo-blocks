import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  resetKey?: unknown;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private lastValid: React.ReactNode = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && this.props.resetKey !== prevProps.resetKey) {
      // Retry rendering on resetKey change
      this.setState({ error: null });
      return;
    }

    if (!this.state.error) {
      this.lastValid = this.props.children;
    }
  }

  render() {
    if (this.state.error) {
      if (this.lastValid) return <>{this.lastValid}</>;
      return this.props.fallback || (
        <pre className="text-red-600">Error: {this.state.error.message}</pre>
      );
    }

    return this.props.children;
  }
}
