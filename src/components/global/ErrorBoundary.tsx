import { Component, type ErrorInfo, type ReactNode } from "react";
import { recordFrontendError } from "../../services/api";
import { Button } from "../ui/Button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info);

    // Persist it — see `recordFrontendError`'s doc comment for why. Never
    // let a failure here surface as a *second* error on top of the one
    // we're already handling.
    const stack = [error.stack, info.componentStack]
      .filter((part): part is string => !!part)
      .join("\n\nComponent stack:\n");
    void recordFrontendError(
      error.name || "Error",
      error.message || "An unexpected error occurred",
      stack || undefined,
    ).catch((reportingError) => {
      console.error("[ErrorBoundary] failed to record crash report", reportingError);
    });
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <div className="text-4xl text-(--wb-text-disabled)">⚠</div>
          <div>
            <p className="text-sm font-medium text-(--wb-text-primary)">
              Something went wrong
            </p>
            <p className="text-xs text-(--wb-text-secondary) mt-1 max-w-xs">
              {this.state.error?.message ?? "An unexpected error occurred"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="accent" onClick={() => this.reset()}>
              Retry
            </Button>
            <Button variant="subtle" onClick={() => window.location.reload()}>
              Reload Page
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
