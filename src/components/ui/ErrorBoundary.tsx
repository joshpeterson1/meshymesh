import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.fallbackLabel ?? "Component"} crashed:`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
          <p className="text-sm">
            Something went wrong{this.props.fallbackLabel ? ` in ${this.props.fallbackLabel}` : ""}.
          </p>
          <button
            onClick={this.handleReset}
            className="px-3 py-1.5 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
