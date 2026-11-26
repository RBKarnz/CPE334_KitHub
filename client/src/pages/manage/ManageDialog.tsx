// The dialog frame of the Manage catalog forms and the retire confirmation (contract F-09 4.3, 4.4).
// Keyboard as the other dialogs: focus moves into the dialog, Escape closes it, and it cannot be
// closed while its call runs (SDS 5.3).
import { useEffect, useId, useRef, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

export interface ManageDialogProps {
  title: string;
  submitting: boolean;
  onClose: () => void;
  /** Called on submit; the form's submit button is in `footer`. */
  onSubmit: () => void;
  children?: ReactNode;
  footer: ReactNode;
}

export function ManageDialog({ title, submitting, onClose, onSubmit, children, footer }: ManageDialogProps) {
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
      if (!submitting) onClose();
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
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
          <form className="modal-content" onSubmit={handleSubmit} noValidate>
            <div className="modal-header">
              <h2 className="modal-title h5" id={titleId}>
                {title}
              </h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} disabled={submitting} />
            </div>
            {children && <div className="modal-body">{children}</div>}
            <div className="modal-footer">{footer}</div>
          </form>
        </div>
      </div>
    </>
  );
}

/** A labelled input with its error under it (SDS 5.3: errors under the field on submit). */
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (props: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      {children({ id, "aria-invalid": Boolean(error), "aria-describedby": error ? errorId : undefined })}
      {error && (
        <div id={errorId} className="invalid-feedback d-block">
          {error}
        </div>
      )}
    </div>
  );
}

/** A whole number from min to max, or the error text (contract F-09 3.4 bounds). */
export function checkWhole(text: string, min: number, max: number): { value?: number; error?: string } {
  const value = Number(text);
  if (text.trim() === "" || !Number.isInteger(value) || value < min || value > max)
    return { error: `Enter a whole number from ${min} to ${max}.` };
  return { value };
}

/** A trimmed name of 1 to 100 characters, or the error text (F09-D2). */
export function checkName(text: string): { value?: string; error?: string } {
  const value = text.trim();
  if (value === "") return { error: "Enter a name." };
  if (value.length > 100) return { error: "Use at most 100 characters." };
  return { value };
}

export const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/**
 * The fields of an edit that differ from the record as the form opened it. An edit sends only
 * these, so it never puts back a field another Custodian changed meanwhile (review of #98).
 */
export function changedFields<T extends object>(body: T, before: T): Partial<T> {
  return Object.fromEntries(Object.entries(body).filter(([k, v]) => before[k as keyof T] !== v)) as Partial<T>;
}
