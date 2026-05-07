import { Component, type ErrorInfo, type ReactNode } from "react";
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
          <Button variant="accent" onClick={() => this.reset()}>
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
