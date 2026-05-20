import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type ErrorBoundaryProps = {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary-icon" aria-hidden="true">
          <AlertTriangle size={48} />
        </div>
        <h2 className="error-boundary-title">出现了意外错误</h2>
        <p className="error-boundary-message">
          页面在渲染时遇到问题。可以尝试重试，或刷新页面继续操作。
        </p>
        {import.meta.env.DEV && (
          <pre className="error-boundary-detail">{error.message}</pre>
        )}
        <div className="error-boundary-actions">
          <button className="button-primary" type="button" onClick={this.reset}>
            <RefreshCw size={16} />
            重试
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }
}
