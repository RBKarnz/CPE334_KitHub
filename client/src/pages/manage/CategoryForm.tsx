// New and edit category dialog (contract F-09 4.3).
import { useRef, useState } from "react";
import type { CatalogCategory } from "../../api/catalog";
import { ApiError } from "../../api/client";
import { createCategory, updateCategory, type CategoryInput } from "../../api/manage";
import { changedFields, checkName, checkWhole, Field, ManageDialog } from "./ManageDialog";

type FieldName = "name" | "description" | "defaultMaxLoanDays" | "defaultMaxQuantity";
export type FormErrors = Partial<Record<FieldName | "form", string>>;

/** Puts an API error where the form shows it: NAME_TAKEN and 400 details under the fields. */
export function apiErrorsFor<F extends string>(err: ApiError, fields: readonly F[]): Partial<Record<F | "form", string>> {
  if (err.code === "NAME_TAKEN") return { name: err.message } as Partial<Record<F | "form", string>>;
  const errors: Partial<Record<F | "form", string>> = {};
  for (const d of err.status === 400 ? err.details : []) {
    if ((fields as readonly string[]).includes(d.field)) errors[d.field as F] = d.issue;
  }
  if (Object.keys(errors).length === 0) errors.form = err.message;
  return errors;
}

const FIELDS: readonly FieldName[] = ["name", "description", "defaultMaxLoanDays", "defaultMaxQuantity"];

export interface CategoryFormProps {
  /** Absent for New category. */
  category?: CatalogCategory;
  onClose: () => void;
  onSaved: (name: string) => void;
  /** A 404: the page shows the message, closes the form and loads the list again (4.3). */
  onNotFound: (message: string) => void;
}

export function CategoryForm({ category, onClose, onSaved, onNotFound }: CategoryFormProps) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [loanDays, setLoanDays] = useState(category ? String(category.defaultMaxLoanDays) : "");
  const [quantity, setQuantity] = useState(category ? String(category.defaultMaxQuantity) : "");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  // A double click sends one call (4.3).
  const busy = useRef(false);

  const submit = async () => {
    if (busy.current) return;
    const n = checkName(name);
    const d = checkWhole(loanDays, 1, 365);
    const q = checkWhole(quantity, 1, 10);
    const desc = description.trim();
    const found: FormErrors = {
      name: n.error,
      defaultMaxLoanDays: d.error,
      defaultMaxQuantity: q.error,
      description: desc.length > 1000 ? "Use at most 1000 characters." : undefined,
    };
    if (Object.values(found).some(Boolean)) return setErrors(found);

    const body: CategoryInput = {
      name: n.value!,
      description: desc === "" ? null : desc,
      defaultMaxLoanDays: d.value!,
      defaultMaxQuantity: q.value!,
    };
    const changes = category
      ? changedFields(body, {
          name: category.name,
          description: category.description ?? null,
          defaultMaxLoanDays: category.defaultMaxLoanDays,
          defaultMaxQuantity: category.defaultMaxQuantity,
        })
      : body;
    // An edit with no change needs no call (the API refuses an empty edit).
    if (Object.keys(changes).length === 0) return onClose();
    busy.current = true;
    setSubmitting(true);
    setErrors({});
    try {
      const saved = category ? await updateCategory(category.id, changes) : await createCategory(body);
      onSaved(saved.name);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, "INTERNAL_ERROR", "Something went wrong.");
      if (apiError.status === 404) return onNotFound(apiError.message);
      setErrors(apiErrorsFor(apiError, FIELDS));
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ManageDialog
      title={category ? `Edit category ${category.name}` : "New category"}
      submitting={submitting}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting && <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />}
            Save category
          </button>
        </>
      }
    >
      {errors.form && (
        <div className="alert alert-warning" role="alert">
          {errors.form}
        </div>
      )}
      <Field label="Name" error={errors.name}>
        {(p) => <input {...p} className="form-control" value={name} disabled={submitting} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Description" error={errors.description}>
        {(p) => (
          <textarea
            {...p}
            className="form-control"
            rows={2}
            value={description}
            disabled={submitting}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>
      <Field label="Default maximum loan length (days)" error={errors.defaultMaxLoanDays}>
        {(p) => (
          <input
            {...p}
            type="number"
            min={1}
            max={365}
            className="form-control"
            value={loanDays}
            disabled={submitting}
            onChange={(e) => setLoanDays(e.target.value)}
          />
        )}
      </Field>
      <Field label="Default maximum quantity" error={errors.defaultMaxQuantity}>
        {(p) => (
          <input
            {...p}
            type="number"
            min={1}
            max={10}
            className="form-control"
            value={quantity}
            disabled={submitting}
            onChange={(e) => setQuantity(e.target.value)}
          />
        )}
      </Field>
    </ManageDialog>
  );
}
