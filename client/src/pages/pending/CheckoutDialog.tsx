// Checkout dialog (contract F-03 4.3, F-07 4): for each line of an APPROVED request, choose exactly
// its quantity of AVAILABLE units of the line's item type, then confirm. Keyboard: focus moves into
// the dialog, Tab stays inside, Escape closes (SDS 5.3).
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { checkoutRequest } from "../../api/checkout";
import { ApiError } from "../../api/client";
import type { BorrowRequest } from "../../api/requests";
import { fetchDueDatePreview, fetchUnits, type UnitSummary } from "../../api/units";
import { useLoad } from "../../api/useLoad";
import { AsyncState } from "../../components/AsyncState";
import { formatDateTime, formatWeekdayDateTime } from "../../format";

export interface CheckoutDialogProps {
  request: BorrowRequest;
  onClose: () => void;
  /** Called with the 201 response; the page closes the dialog and reloads the list. */
  onCheckedOut: (request: BorrowRequest) => void;
  /** The request was handled elsewhere or is gone (409 INVALID_STATE, 404): reload the list. */
  onStale: () => void;
}

/** "Request #12 checked out: KH-ARD-0001, KH-ARD-0002, due 7 Dec 2026, 17:00", from the 201 response. */
export function checkoutConfirmation(result: BorrowRequest): string {
  const tags = result.lines.flatMap((line) => line.loans.map((loan) => loan.unit.assetTag));
  const due = result.dueAt ? `, due ${formatDateTime(result.dueAt)}` : "";
  return `Request #${result.id} checked out${tags.length ? `: ${tags.join(", ")}` : ""}${due}`;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
const unitsText = (n: number) => `${n} unit${n === 1 ? "" : "s"}`;

/**
 * The due date a checkout now would get (F07-D3, F07-D4): with the request's loan length when it
 * has one; otherwise the earliest of the lines' previews, which is the smallest maxLoanDays.
 */
async function previewFor(request: BorrowRequest) {
  if (request.loanDays != null) return fetchDueDatePreview(request.lines[0].itemType.id, request.loanDays);
  const previews = await Promise.all(request.lines.map((line) => fetchDueDatePreview(line.itemType.id)));
  return previews.reduce((earliest, p) => (p.dueAt < earliest.dueAt ? p : earliest));
}

export function CheckoutDialog({ request, onClose, onCheckedOut, onStale }: CheckoutDialogProps) {
  const lines = request.lines;
  const loadUnits = useCallback(
    () => Promise.all(lines.map((line) => fetchUnits(line.itemType.id, "AVAILABLE"))),
    [lines],
  );
  const units = useLoad<UnitSummary[][]>(loadUnits);
  const loadPreview = useCallback(() => previewFor(request), [request]);
  // Only a hint: the server computes dueAt again at checkout (#71).
  const preview = useLoad(loadPreview);
  // Chosen unit IDs per line, in the order they were picked.
  const [selected, setSelected] = useState<Record<number, number[]>>({});
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

  const available = units.data ?? lines.map(() => []);
  const chosen = (lineId: number) => selected[lineId] ?? [];
  const toggle = (lineId: number, unitId: number) =>
    setSelected((s) => {
      const current = s[lineId] ?? [];
      return { ...s, [lineId]: current.includes(unitId) ? current.filter((id) => id !== unitId) : [...current, unitId] };
    });

  const total = lines.reduce((n, line) => n + line.quantity, 0);
  const complete = units.data !== undefined && lines.every((line) => chosen(line.id).length === line.quantity);

  const submit = async () => {
    if (inFlight.current || !complete) return;
    inFlight.current = true;
    setSubmitting(true);
    setAlert(null);
    try {
      const body = { units: lines.flatMap((line) => chosen(line.id).map((unitId) => ({ lineId: line.id, unitId }))) };
      onCheckedOut(await checkoutRequest(request.id, body));
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, "INTERNAL_ERROR", "Something went wrong.");
      // A 401 is handled by AuthProvider (session ended, SDS 5.3).
      if (apiError.code === "UNAUTHENTICATED") return;
      setAlert(apiError.message);
      if (apiError.code === "UNIT_NOT_AVAILABLE" || apiError.code === "UNIT_WRONG_ITEM_TYPE") {
        // Someone else took a unit: choose again from fresh lists.
        setSelected({});
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
                {request.borrower.displayName} ({request.borrower.username})
              </p>
              <p className="text-body-secondary">
                {preview.data
                  ? `Due if checked out now: ${formatWeekdayDateTime(preview.data.dueAt)}`
                  : preview.error
                    ? "Due date not available."
                    : "Calculating due date…"}
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
                isEmpty={false}
                empty={null}
              >
                {lines.map((line, i) => {
                  const lineUnits = available[i] ?? [];
                  const short = lineUnits.length < line.quantity;
                  const full = chosen(line.id).length >= line.quantity;
                  return (
                    <fieldset key={line.id} disabled={submitting} className="mb-3">
                      {short ? (
                        <>
                          <legend className="kh-legend fs-6">{line.itemType.name}</legend>
                          <p className="text-warning-emphasis">
                            Only {lineUnits.length} of {line.quantity} available. The request cannot be checked out yet.
                          </p>
                        </>
                      ) : (
                        <legend className="kh-legend fs-6">
                          {line.itemType.name} — choose {line.quantity} of {lineUnits.length} available
                        </legend>
                      )}
                      {/* Each unit is a chip pressed into anti-static foam; the whole chip selects it. */}
                      <div className="kh-chips kh-foam">
                        {lineUnits.map((unit) => {
                          const checked = chosen(line.id).includes(unit.id);
                          const inputId = `${titleId}-line-${line.id}-unit-${unit.id}`;
                          return (
                            <div className={`kh-chip${checked ? " is-selected" : ""}`} key={unit.id}>
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id={inputId}
                                checked={checked}
                                disabled={!checked && full}
                                onChange={() => toggle(line.id, unit.id)}
                              />
                              <label className="kh-tag" htmlFor={inputId}>
                                {unit.assetTag}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                })}
              </AsyncState>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={!complete || submitting} onClick={submit}>
                {submitting && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
                {complete ? `Check out ${unitsText(total)} for Request #${request.id}` : "Check out"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
