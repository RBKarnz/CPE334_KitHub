// New and edit item type dialog (contract F-09 4.3). On a new item type the two limits start at the
// category's defaults (D-08, F09-D4).
import { useRef, useState } from "react";
import type { CatalogCategory, CatalogItemType } from "../../api/catalog";
import { ApiError } from "../../api/client";
import { createItemType, updateItemType, type ItemTypeInput } from "../../api/manage";
import { apiErrorsFor } from "./CategoryForm";
import { changedFields, checkName, checkWhole, Field, ManageDialog } from "./ManageDialog";

type FieldName = "categoryId" | "name" | "description" | "maxLoanDays" | "maxQuantityPerRequest";
const FIELDS: readonly FieldName[] = ["categoryId", "name", "description", "maxLoanDays", "maxQuantityPerRequest"];

export interface ItemTypeFormProps {
  categories: CatalogCategory[];
  /** The category the form starts in. */
  categoryId: number;
  /** Absent for New item type. */
  itemType?: CatalogItemType;
  onClose: () => void;
  onSaved: (name: string) => void;
  onNotFound: (message: string) => void;
}

export function ItemTypeForm({ categories, categoryId, itemType, onClose, onSaved, onNotFound }: ItemTypeFormProps) {
  const start = categories.find((c) => c.id === categoryId);
  const [category, setCategory] = useState(String(categoryId));
  const [name, setName] = useState(itemType?.name ?? "");
  const [description, setDescription] = useState(itemType?.description ?? "");
  const [isKit, setIsKit] = useState(itemType?.isKit ?? false);
  const [loanDays, setLoanDays] = useState(String(itemType?.maxLoanDays ?? start?.defaultMaxLoanDays ?? ""));
  const [quantity, setQuantity] = useState(String(itemType?.maxQuantityPerRequest ?? start?.defaultMaxQuantity ?? ""));
  const [errors, setErrors] = useState<Partial<Record<FieldName | "form", string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);

  const submit = async () => {
    if (busy.current) return;
    const n = checkName(name);
    const d = checkWhole(loanDays, 1, 365);
    const q = checkWhole(quantity, 1, 10);
    const desc = description.trim();
    const found = {
      name: n.error,
      maxLoanDays: d.error,
      maxQuantityPerRequest: q.error,
      description: desc.length > 1000 ? "Use at most 1000 characters." : undefined,
    };
    if (Object.values(found).some(Boolean)) return setErrors(found);

    const body: ItemTypeInput = {
      categoryId: Number(category),
      name: n.value!,
      description: desc,
      isKit,
      maxLoanDays: d.value!,
      maxQuantityPerRequest: q.value!,
    };
    const changes = itemType
      ? changedFields(body, {
          categoryId,
          name: itemType.name,
          description: itemType.description,
          isKit: itemType.isKit,
          maxLoanDays: itemType.maxLoanDays,
          maxQuantityPerRequest: itemType.maxQuantityPerRequest,
        })
      : body;
    // An edit with no change needs no call (the API refuses an empty edit).
    if (Object.keys(changes).length === 0) return onClose();
    busy.current = true;
    setSubmitting(true);
    setErrors({});
    try {
      const saved = itemType ? await updateItemType(itemType.id, changes) : await createItemType(body);
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
      title={itemType ? `Edit ${itemType.name}` : "New item type"}
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
            Save item type
          </button>
        </>
      }
    >
      {errors.form && (
        <div className="alert alert-warning" role="alert">
          {errors.form}
        </div>
      )}
      <Field label="Category" error={errors.categoryId}>
        {(p) => (
          <select {...p} className="form-select" value={category} disabled={submitting} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
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
      <div className="form-check mb-3">
        <input
          id="item-type-kit"
          type="checkbox"
          className="form-check-input"
          checked={isKit}
          disabled={submitting}
          onChange={(e) => setIsKit(e.target.checked)}
        />
        <label htmlFor="item-type-kit" className="form-check-label">
          Kit
        </label>
      </div>
      <Field label="Maximum loan length (days)" error={errors.maxLoanDays}>
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
      <Field label="Maximum per request" error={errors.maxQuantityPerRequest}>
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
