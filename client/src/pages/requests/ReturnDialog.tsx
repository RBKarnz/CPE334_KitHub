// Return dialog (contract F-08 4): "Return all" lists every ACTIVE loan of the request; "Return this
// unit" holds one loan. Each loan has a condition, Good by default (F08-D3). Escape and Cancel are
// ignored while the call runs, as the F-06 decision dialog.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { ReturnConditionValue } from "../../api/loans";

export interface ReturnItem {
  loanId: number;
  assetTag: string;
  itemTypeName: string;
}

export interface ReturnDialogProps {
  title: string;
  confirmLabel: string;
  items: ReturnItem[];
  submitting: boolean;
  /** A 400 from the API, shown inside the dialog. */
  error?: string | null;
  onCancel: () => void;
  onConfirm: (conditions: { loanId: number; condition: ReturnConditionValue }[]) => void;
}

export function ReturnDialog({ title, confirmLabel, items, submitting, error, onCancel, onConfirm }: ReturnDialogProps) {
  const [conditions, setConditions] = useState<Record<number, ReturnConditionValue>>({});
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const conditionOf = (loanId: number) => conditions[loanId] ?? "GOOD";

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (!submitting) onCancel();
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
                {title}
              </h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onCancel} disabled={submitting} />
            </div>
            <div className="modal-body">
              {error && (
                <div className="alert alert-warning" role="alert">
                  {error}
                </div>
              )}
              {items.map((item) => (
                <fieldset key={item.loanId} className="mb-2" disabled={submitting}>
                  <legend className="fs-6 mb-1">
                    <span className="kh-tag">{item.assetTag}</span> {item.itemTypeName}
                  </legend>
                  {(["GOOD", "DAMAGED"] as const).map((value) => {
                    const id = `${titleId}-${item.loanId}-${value}`;
                    return (
                      <div className="form-check form-check-inline" key={value}>
                        <input
                          className="form-check-input"
                          type="radio"
                          id={id}
                          name={`${titleId}-${item.loanId}`}
                          checked={conditionOf(item.loanId) === value}
                          onChange={() => setConditions((c) => ({ ...c, [item.loanId]: value }))}
                        />
                        <label className="form-check-label" htmlFor={id}>
                          {value === "GOOD" ? "Good" : "Damaged"}
                        </label>
                      </div>
                    );
                  })}
                </fieldset>
              ))}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={() => onConfirm(items.map((i) => ({ loanId: i.loanId, condition: conditionOf(i.loanId) })))}
              >
                {submitting && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
