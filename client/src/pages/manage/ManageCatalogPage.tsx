// Manage catalog (/manage, Custodian): categories with their default limits and item types with
// their limits and available counts (contract F-09 4.2).
import { useState } from "react";
import { Link } from "react-router-dom";
import { fetchCategories, type CatalogCategory, type CatalogItemType } from "../../api/catalog";
import { useLoad } from "../../api/useLoad";
import { AsyncState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { CategoryForm } from "./CategoryForm";
import { ItemTypeForm } from "./ItemTypeForm";
import { days } from "./ManageDialog";

type Dialog =
  | { kind: "category"; category?: CatalogCategory }
  | { kind: "itemType"; categoryId: number; itemType?: CatalogItemType };

export function ManageCatalogPage() {
  const { data, error, loading, reload } = useLoad(fetchCategories);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<{ kind: "success" | "warning"; text: string } | null>(null);
  const categories = data ?? [];

  const saved = (text: string) => {
    setDialog(null);
    setNotice({ kind: "success", text });
    reload();
  };
  const notFound = (text: string) => {
    setDialog(null);
    setNotice({ kind: "warning", text });
    reload();
  };

  return (
    <main className="container kh-main">
      <div className="kh-title-bar">
        <PageHeader>Manage catalog</PageHeader>
        <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: "category" })}>
          <i className="bi bi-plus-lg me-1" aria-hidden="true" />
          New category
        </button>
      </div>
      {notice && (
        <div className={`alert alert-${notice.kind}`} role={notice.kind === "success" ? "status" : "alert"}>
          {notice.text}
        </div>
      )}
      {/* A reload after a save keeps the list on screen; only the first load shows Loading…. */}
      <AsyncState
        loading={loading && data === undefined}
        error={error}
        onRetry={reload}
        isEmpty={categories.length === 0}
        empty="The catalog is empty. Add a category to start."
      >
        {categories.map((category) => (
          <section key={category.id} className="kh-panel kh-category-panel">
            <div className="kh-panel-head">
              <div>
                <h2>{category.name}</h2>
                {category.description && <p>{category.description}</p>}
                <p className="small">
                  Defaults: {days(category.defaultMaxLoanDays)}, {category.defaultMaxQuantity} per request
                </p>
              </div>
              <div className="kh-actions">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  aria-label={`Edit category ${category.name}`}
                  onClick={() => setDialog({ kind: "category", category })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm"
                  aria-label={`New item type in ${category.name}`}
                  onClick={() => setDialog({ kind: "itemType", categoryId: category.id })}
                >
                  <i className="bi bi-plus-lg me-1" aria-hidden="true" />
                  New item type
                </button>
              </div>
            </div>
            {category.itemTypes.length === 0 ? (
              <p className="kh-panel-body text-body-secondary">No item types yet.</p>
            ) : (
              <div className="table-responsive">
                {/* Fixed column widths, so the columns line up from one category to the next (#103). */}
                <table className="table align-middle kh-table kh-table-fixed kh-table-cards">
                  <colgroup>
                    <col />
                    <col className="kh-col-value" />
                    <col className="kh-col-value" />
                    <col className="kh-col-value" />
                    <col className="kh-col-actions" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">Item type</th>
                      <th scope="col">Loan length</th>
                      <th scope="col">Per request</th>
                      <th scope="col">Available</th>
                      <th scope="col">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {category.itemTypes.map((t) => (
                      <tr key={t.id}>
                        <td className="fw-semibold">
                          {t.name}
                          {t.isKit && <span className="badge kh-kit ms-2">Kit</span>}
                        </td>
                        <td data-label="Loan length" className="kh-nowrap">{days(t.maxLoanDays)}</td>
                        <td data-label="Per request" className="kh-nowrap">{t.maxQuantityPerRequest} per request</td>
                        <td data-label="Available" className={`kh-nowrap${t.availableCount === 0 ? " text-body-secondary" : ""}`}>
                          {t.availableCount} available
                        </td>
                        <td className="text-end kh-nowrap kh-row-actions">
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm me-2"
                            aria-label={`Edit ${t.name}`}
                            onClick={() => setDialog({ kind: "itemType", categoryId: category.id, itemType: t })}
                          >
                            Edit
                          </button>
                          <Link className="btn btn-outline-primary btn-sm" to={`/manage/item-types/${t.id}`} aria-label={`Units of ${t.name}`}>
                            Units
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </AsyncState>

      {dialog?.kind === "category" && (
        <CategoryForm
          category={dialog.category}
          onClose={() => setDialog(null)}
          onSaved={(name) => saved(`Category ${name} saved.`)}
          onNotFound={notFound}
        />
      )}
      {dialog?.kind === "itemType" && (
        <ItemTypeForm
          categories={categories}
          categoryId={dialog.categoryId}
          itemType={dialog.itemType}
          onClose={() => setDialog(null)}
          onSaved={(name) => saved(`Item type ${name} saved.`)}
          onNotFound={notFound}
        />
      )}
    </main>
  );
}
