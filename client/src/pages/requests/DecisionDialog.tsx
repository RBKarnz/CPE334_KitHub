// Approve confirmation and reject dialog (contract F-06 4.4). Keyboard: focus moves into the
// dialog and Escape closes it, as the checkout dialog (SDS 5.3).
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { BorrowRequest } from "../../api/requests";

export const MAX_REASON = 500;

export interface DecisionDialogProps {
  kind: "approve" | "reject";
  request: BorrowRequest;
  submitting: boolean;
  /** A 400 from the API: shown inside the dialog, which stays open with the reason (contract F-06 4.4). */
  error?: string | null;
  onCancel: () => void;
  /** The reason is the trimmed text for a reject, undefined for an approve. */
  onConfirm: (reason?: string) => void;
}

export function DecisionDialog({ kind, request, submitting, error, onCancel, onConfirm }: DecisionDialogProps) {
  const [reason, setReason] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reasonId = useId();
  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= 1 && trimmed.length <= MAX_REASON;
  const borrower = request.borrower.displayName;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      // The dialog cannot be closed while the call runs (review of PR #91).
      if (!submitting) onCancel();
    }
  };

  const confirmDisabled = submitting || (kind === "reject" && !reasonOk);

  return (
    <>
      <div className="modal-backdrop show" />
      <div
        ref={dialogRef}
        className="modal d-block"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="modal-dialog">
          <div className="modal-content">
            <div className="modal-header">
              <h2 className="modal-title h5" id={titleId}>
                {kind === "approve"
                  ? `Approve Request #${request.id} for ${borrower}?`
                  : `Reject Request #${request.id} for ${borrower}`}
              </h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onCancel} disabled={submitting} />
            </div>
            {error && (
              <div className="modal-body pb-0">
                <div className="alert alert-warning mb-0" role="alert">
                  {error}
                </div>
              </div>
            )}
            {kind === "reject" && (
              <div className="modal-body">
                <label htmlFor={reasonId} className="form-label">
                  Reason
                </label>
                <textarea
                  id={reasonId}
                  className="form-control"
                  rows={3}
                  value={reason}
                  disabled={submitting}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="form-text text-end">
                  {trimmed.length}/{MAX_REASON}
                </div>
              </div>
            )}
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${kind === "approve" ? "btn-primary" : "btn-danger"}`}
                disabled={confirmDisabled}
                onClick={() => onConfirm(kind === "reject" ? trimmed : undefined)}
              >
                {submitting && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
                {kind === "approve" ? `Approve Request #${request.id}` : `Reject Request #${request.id}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
