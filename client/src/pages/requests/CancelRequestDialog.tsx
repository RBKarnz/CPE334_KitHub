// Cancel confirmation (contract F-05 4.4). Keyboard as the other dialogs: focus moves into the
// dialog, Escape closes it, and it cannot be closed while the call runs (SDS 5.3).
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import type { BorrowRequest } from "../../api/requests";

export interface CancelRequestDialogProps {
  request: BorrowRequest;
  submitting: boolean;
  onKeep: () => void;
  onConfirm: () => void;
}

export function CancelRequestDialog({ request, submitting, onKeep, onConfirm }: CancelRequestDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (!submitting) onKeep();
    }
  };

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
                Cancel Request #{request.id}? You cannot undo this.
              </h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onKeep} disabled={submitting} />
            </div>
            <div className="modal-body">
              <ul className="mb-0">
                {request.lines.map((line) => (
                  <li key={line.id}>
                    {line.itemType.name} × {line.quantity}
                  </li>
                ))}
              </ul>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onKeep} disabled={submitting}>
                Keep request
              </button>
              <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={submitting}>
                {submitting && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
                Cancel request
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
