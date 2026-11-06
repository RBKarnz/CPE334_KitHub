// Loading, empty and error states for every list and detail view (SDS 5.3, NFR-12).
import type { ReactNode } from "react";
import type { ApiError } from "../api/client";

interface AsyncStateProps {
  loading: boolean;
  error: ApiError | null;
  onRetry: () => void;
  /** True when the data loaded and there is nothing to show */
  isEmpty: boolean;
  empty: ReactNode;
  children: ReactNode;
}

export function AsyncState({ loading, error, onRetry, isEmpty, empty, children }: AsyncStateProps) {
  if (loading)
    return (
      <div className="py-4" role="status">
        <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
        Loading…
      </div>
    );
  if (error)
    return (
      <div className="alert alert-danger d-flex align-items-center justify-content-between" role="alert">
        <span>{error.message}</span>
        <button type="button" className="btn btn-outline-danger btn-sm" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  if (isEmpty) return <div className="py-4 text-body-secondary">{empty}</div>;
  return <>{children}</>;
}
