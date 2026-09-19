import React, { ReactNode, ErrorInfo } from "react";
import { ErrorBoundary as ReactErrorBoundary, FallbackProps } from "react-error-boundary";
import { EmergencyModeView } from "./EmergencyModeView";
import { toOTelLog } from "@/lib/telemetry/otel-neutral";

export interface IsabellaErrorBoundaryProps {
  children?: ReactNode;
  onReset?: () => void;
  onError?: (error: unknown, info: ErrorInfo) => void;
  FallbackComponent?: React.ComponentType<FallbackProps>;
}

/**
 * Fallback Component rendered by react-error-boundary when an unhandled runtime error occurs.
 */
export function EmergencyFallback({ error, resetErrorBoundary }: FallbackProps) {
  const err = error instanceof Error ? error : new Error(String(error ?? "Fallo no controlado"));

  return (
    <EmergencyModeView
      mode="critical_error"
      errorDetails={{
        code: err.name || "CROWN-CLIENT-CRASH",
        message: err.message || "Fallo crítico no controlado en la aplicación.",
        traceId: `err-boundary-${Date.now().toString(16)}`,
        timestamp: new Date().toISOString(),
      }}
      onRetry={() => {
        resetErrorBoundary();
      }}
    />
  );
}

/**
 * Global Isabella Error Boundary wrapping the application with react-error-boundary.
 * Captures unhandled runtime exceptions and renders EmergencyModeView.
 */
export function IsabellaErrorBoundary({
  children,
  onReset,
  onError,
  FallbackComponent,
}: IsabellaErrorBoundaryProps) {
  const handleError = (error: unknown, info: ErrorInfo) => {
    const err = error instanceof Error ? error : new Error(String(error ?? "Unknown client error"));
    console.error(
      "[Isabella AI] Uncaught Runtime Exception caught by react-error-boundary:",
      err,
      info,
    );

    toOTelLog({
      traceId: `client-error-${Date.now().toString(16)}`,
      kind: "error",
      name: "frontend.critical.error",
      status: "error",
      attributes: {
        error_code: err.name || "CROWN-CLIENT-CRASH",
        error_message: err.message || "Unknown client error",
        component_stack: info?.componentStack || "",
      },
      timestamp: new Date().toISOString(),
    });

    if (onError) {
      onError(error, info);
    }
  };

  return (
    <ReactErrorBoundary
      FallbackComponent={FallbackComponent || EmergencyFallback}
      onError={handleError}
      onReset={() => {
        if (onReset) onReset();
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}

export const ErrorBoundary = IsabellaErrorBoundary;
export default IsabellaErrorBoundary;
