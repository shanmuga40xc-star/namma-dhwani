import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('NAGRIK UI ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F5F7FA] p-4">
          <div className="w-full max-w-md rounded-lg border border-[#BA1A1A]/30 bg-white p-6 text-center civic-shadow-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FFDAD6] text-[#BA1A1A]">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="mt-4 font-display text-lg font-bold text-[#0A1D2B]">
              Something went wrong
            </h1>
            <p className="mt-2 text-xs text-[#43474D]">{this.state.errorMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded bg-[#102A43] px-5 text-sm font-semibold text-white hover:bg-[#0B1D2F] cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              Reload NAGRIK
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
