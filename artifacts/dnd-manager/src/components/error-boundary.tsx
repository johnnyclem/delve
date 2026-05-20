import { Component } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
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

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    window.location.href = `${import.meta.env.BASE_URL}dashboard`;
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-4"
          data-testid="error-boundary"
        >
          <AlertCircle className="h-10 w-10 text-destructive" />
          <h1 className="text-xl font-semibold text-foreground">
            Something went wrong
          </h1>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={this.handleRetry}
              data-testid="error-boundary-retry"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Button
              onClick={this.handleGoHome}
              data-testid="error-boundary-home"
            >
              <Home className="mr-2 h-4 w-4" />
              Go to Dashboard
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
