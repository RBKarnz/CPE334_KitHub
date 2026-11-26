// The request form (contract F-04 4.3, F04-D8): lines of item type and quantity, and one loan length
// for the whole request. Used by New request (F-04) and Edit request (F-05). The limits shown here
// are hints; the API checks every rule again (DD-10).
import { useMemo, useRef, useState } from "react";
import type { CatalogCategory, CatalogItemType } from "../../api/catalog";
import { ApiError } from "../../api/client";
import type { RequestInput } from "../../api/requests";

export const MAX_LINES = 10;

export interface FormLine {
  itemTypeId: number | null;
  quantity: number;
}

export interface RequestFormProps {
  categories: CatalogCategory[];
  initialLines: FormLine[];
  initialLoanDays: number | null;
  submitLabel: string;
  /** Sends the body; a thrown ApiError is shown by the form. */
  onSubmit: (body: RequestInput) => Promise<void>;
  /** Called after a 409, so the page can load the item types again (counts may have changed). */
  onConflict?: () => void;
  /** Edit (contract F-05 4.3): the button stays disabled until the form differs from the start. */
  requireChange?: boolean;
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
let nextKey = 0;

export function RequestForm({ categories, initialLines, initialLoanDays, submitLabel, onSubmit, onConflict, requireChange = false }: RequestFormProps) {
  const itemTypes = useMemo(() => new Map(categories.flatMap((c) => c.itemTypes.map((t) => [t.id, t] as const))), [categories]);
  const [lines, setLines] = useState(() => initialLines.map((l) => ({ ...l, key: nextKey++ })));
  const [loanDays, setLoanDays] = useState(initialLoanDays === null ? "" : String(initialLoanDays));
  const [alert, setAlert] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  // A double click sends one call (4.3).
  const busy = useRef(false);

  const chosen = lines.map((l) => (l.itemTypeId === null ? undefined : itemTypes.get(l.itemTypeId)));
  const picked = chosen.filter((t): t is CatalogItemType => t !== undefined);
  // The smallest maximum and the first line that sets it (BR-08); the largest, for the hint (FR-10).
  const limit = picked.reduce<CatalogItemType | undefined>((min, t) => (!min || t.maxLoanDays < min.maxLoanDays ? t : min), undefined);
  const longest = picked.reduce<CatalogItemType | undefined>((max, t) => (!max || t.maxLoanDays > max.maxLoanDays ? t : max), undefined);

  const days_ = Number(loanDays);
  const daysWhole = loanDays.trim() !== "" && Number.isInteger(days_) && days_ >= 1;
  const daysError =
    loanDays.trim() === ""
      ? undefined
      : !daysWhole
        ? "Enter a whole number of days"
        : limit && days_ > limit.maxLoanDays
          ? `At most ${days(limit.maxLoanDays)}`
          : undefined;
  // Lines compared by item type in any order, and the loan length (F05-D5).
  const contentKey = (ls: FormLine[], d: string) =>
    JSON.stringify([[...ls].map((l) => [l.itemTypeId, l.quantity]).sort((a, b) => Number(a[0]) - Number(b[0])), d.trim()]);
  const [startKey] = useState(() => contentKey(initialLines, initialLoanDays === null ? "" : String(initialLoanDays)));
  const changed = contentKey(lines, loanDays) !== startKey;
  const ready = lines.every((l) => l.itemTypeId !== null) && daysWhole && !daysError && !submitting && (!requireChange || changed);

  const update = (index: number, change: Partial<FormLine>) =>
    setLines((current) =>
      current.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, ...change };
        const max = next.itemTypeId === null ? 1 : (itemTypes.get(next.itemTypeId)?.maxQuantityPerRequest ?? 1);
        return { ...next, quantity: Math.min(next.quantity, max) };
      }),
    );

  const submit = async () => {
    if (busy.current || !ready) return;
    busy.current = true;
    setSubmitting(true);
    setAlert(null);
    setFieldErrors({});
    try {
      await onSubmit({ lines: lines.map((l) => ({ itemTypeId: l.itemTypeId!, quantity: l.quantity })), loanDays: days_ });
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, "INTERNAL_ERROR", "Something went wrong.");
      // A 401 is handled by AuthProvider (session ended, SDS 5.3).
      if (apiError.code !== "UNAUTHENTICATED") {
        if (apiError.status === 400 && apiError.details.length > 0)
          setFieldErrors(Object.fromEntries(apiError.details.map((d) => [d.field, d.issue])));
        else setAlert(apiError.message);
        if (apiError.status === 409) onConflict?.();
      }
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form
      className="kh-panel kh-panel-body"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {alert && (
        <div className="alert alert-warning" role="alert">
          {alert}
        </div>
      )}
      {fieldErrors.lines && <div className="invalid-feedback d-block mb-2">{fieldErrors.lines}</div>}

      <div className="kh-lines">
        {lines.map((line, i) => {
          const n = i + 1;
          const t = chosen[i];
          const takenElsewhere = new Set(lines.filter((_, j) => j !== i).map((l) => l.itemTypeId));
          const lineError = fieldErrors[`lines[${i}].itemTypeId`] ?? fieldErrors[`lines[${i}].quantity`];
          // Column labels show once, above the first line; every control also has its own name (aria-label).
          const labelClass = i === 0 ? "form-label" : "visually-hidden";
          return (
            <div key={line.key} className="kh-line row g-2 align-items-end">
              <div className="col-12 col-md-6">
                <label className={labelClass} htmlFor={`line-${line.key}-type`}>
                  Item type
                </label>
                <select
                  id={`line-${line.key}-type`}
                  aria-label={`Item type for line ${n}`}
                  className="form-select"
                  value={line.itemTypeId ?? ""}
                  disabled={submitting}
                  onChange={(e) => update(i, { itemTypeId: e.target.value === "" ? null : Number(e.target.value) })}
                >
                  <option value="">Choose an item type</option>
                  {categories.map((c) => {
                    const options = c.itemTypes.filter((it) => !takenElsewhere.has(it.id));
                    if (options.length === 0) return null;
                    return (
                      <optgroup key={c.id} label={c.name}>
                        {options.map((it) => (
                          <option key={it.id} value={it.id}>
                            {it.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              <div className="col-5 col-md-2">
                <label className={labelClass} htmlFor={`line-${line.key}-qty`}>
                  Quantity
                </label>
                <select
                  id={`line-${line.key}-qty`}
                  aria-label={`Quantity for line ${n}`}
                  className="form-select"
                  value={line.quantity}
                  disabled={submitting || !t}
                  onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                >
                  {Array.from({ length: t?.maxQuantityPerRequest ?? 1 }, (_, q) => q + 1).map((q) => (
                    <option key={q} value={q}>
                      {q}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-4 col-md-2 small text-body-secondary kh-line-note">{t ? `${t.availableCount} available` : ""}</div>
              <div className="col-3 col-md-2 text-end">
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    aria-label={`Remove line ${n}`}
                    disabled={submitting}
                    onClick={() => setLines((current) => current.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                )}
              </div>
              {lineError && <div className="col-12 invalid-feedback d-block">{lineError}</div>}
            </div>
          );
        })}
      </div>

      {lines.length < MAX_LINES && (
        <button
          type="button"
          className="btn btn-outline-primary btn-sm mt-2"
          disabled={submitting}
          onClick={() => setLines((current) => [...current, { itemTypeId: null, quantity: 1, key: nextKey++ }])}
        >
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          Add line
        </button>
      )}

      <div className="mt-4">
        <label className="form-label" htmlFor="loan-days">
          Loan length (days)
        </label>
        <input
          id="loan-days"
          type="number"
          min={1}
          max={limit?.maxLoanDays}
          className={`form-control${daysError || fieldErrors.loanDays ? " is-invalid" : ""}`}
          style={{ maxWidth: "10rem" }}
          value={loanDays}
          disabled={submitting}
          aria-invalid={Boolean(daysError || fieldErrors.loanDays)}
          aria-describedby="loan-days-hint"
          onChange={(e) => setLoanDays(e.target.value)}
        />
        {(daysError || fieldErrors.loanDays) && <div className="invalid-feedback d-block">{daysError ?? fieldErrors.loanDays}</div>}
        <div id="loan-days-hint" className="form-text">
          {limit && <div>{`Loan length: up to ${days(limit.maxLoanDays)} (limited by ${limit.name})`}</div>}
          {limit && longest && longest.maxLoanDays > limit.maxLoanDays && (
            <div>{`Need ${longest.name} for longer? Submit it as a separate request.`}</div>
          )}
        </div>
      </div>

      <div className="kh-form-actions">
        <button type="submit" className="btn btn-primary" disabled={!ready}>
          {submitting && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
