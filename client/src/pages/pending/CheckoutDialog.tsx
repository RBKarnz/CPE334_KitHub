// Checkout dialog (contract F-03 4.3): choose one AVAILABLE unit of the line's item type and
// confirm. Keyboard: focus moves into the dialog, Tab stays inside, Escape closes (SDS 5.3).
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { checkoutRequest } from "../../api/checkout";
import { ApiError } from "../../api/client";
import type { BorrowRequest } from "../../api/requests";
import { fetchUnits } from "../../api/units";
import { useLoad } from "../../api/useLoad";
import { AsyncState } from "../../components/AsyncState";
import { formatDateTime } from "../../format";

export interface CheckoutDialogProps {
  request: BorrowRequest;
  onClose: () => void;
  /** Called with the 201 response; the page closes the dialog and reloads the list. */
  onCheckedOut: (request: BorrowRequest) => void;
  /** The request was handled elsewhere or is gone (409 INVALID_STATE, 404): reload the list. */
  onStale: () => void;
}

/** "Request #12 checked out: KH-ARD-0007, due 20 Nov 2026, 14:30", from the 201 response. */
export function checkoutConfirmation(result: BorrowRequest): string {
  const loan = result.lines[0]?.loans[0];
  const due = result.dueAt ? `, due ${formatDateTime(result.dueAt)}` : "";
  return `Request #${result.id} checked out${loan ? `: ${loan.unit.assetTag}` : ""}${due}`;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function CheckoutDialog({ request, onClose, onCheckedOut, onStale }: CheckoutDialogProps) {
  // Every Sprint 1 request has exactly one line (BR-01).
  const line = request.lines[0];
  const loadUnits = useCallback(() => fetchUnits(line.itemType.id, "AVAILABLE"), [line.itemType.id]);
  const units = useLoad(loadUnits);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  // Blocks a second call even before React re-renders the disabled button.
  const inFlight = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Focus moves into the dialog, and back to where it was when the dialog closes.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const available = units.data ?? [];
  const selected = available.find((u) => u.id === selectedId) ?? null;

  const submit = async () => {
    if (inFlight.current || !selected) return;
    inFlight.current = true;
    setSubmitting(true);
    setAlert(null);
    try {
      const result = await checkoutRequest(request.id, { units: [{ lineId: line.id, unitId: selected.id }] });
      onCheckedOut(result);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, "INTERNAL_ERROR", "Something went wrong.");
      // A 401 is handled by AuthProvider (session ended, SDS 5.3).
      if (apiError.code === "UNAUTHENTICATED") return;
      setAlert(apiError.message);
      if (apiError.code === "UNIT_NOT_AVAILABLE" || apiError.code === "UNIT_WRONG_ITEM_TYPE") {
        // Someone else took the unit: choose again from a fresh list.
        setSelectedId(null);
        units.reload();
      } else if (apiError.code === "INVALID_STATE" || apiError.status === 404) {
        onStale();
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    // Keep Tab inside the dialog.
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const noUnits = units.data !== undefined && available.length === 0;

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
                Check out Request #{request.id}
              </h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">
              <p>
                {request.borrower.displayName} ({request.borrower.username}) · {line.itemType.name}
              </p>
              {alert && (
                <div className="alert alert-warning" role="alert">
                  {alert}
                </div>
              )}
              <AsyncState
                loading={units.loading && !units.data}
                error={units.error}
                onRetry={units.reload}
                isEmpty={noUnits}
                empty={`No unit of ${line.itemType.name} is available. The request stays pending.`}
              >
                <fieldset disabled={submitting}>
                  <legend className="form-label fs-6">Available units</legend>
                  {available.map((unit) => (
                    <div className="form-check" key={unit.id}>
                      <input
                        className="form-check-input"
                        type="radio"
                        name="checkout-unit"
                        id={`${titleId}-unit-${unit.id}`}
                        checked={selectedId === unit.id}
                        onChange={() => setSelectedId(unit.id)}
                      />
                      <label className="form-check-label font-monospace" htmlFor={`${titleId}-unit-${unit.id}`}>
                        {unit.assetTag}
                      </label>
                    </div>
                  ))}
                </fieldset>
              </AsyncState>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={!selected || submitting} onClick={submit}>
                {submitting && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
                {selected ? `Check out ${selected.assetTag} for Request #${request.id}` : "Check out"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
