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
      <PageHeader>Manage catalog</PageHeader>
      <div className="d-flex justify-content-end mb-3">
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
          <section key={category.id} className="kh-panel mb-3">
            <div className="d-flex flex-wrap align-items-start justify-content-between gap-2">
              <div>
                <h2 className="h5 mb-1">{category.name}</h2>
                {category.description && <p className="mb-1 text-body-secondary">{category.description}</p>}
                <p className="mb-2 small">
                  Defaults: {days(category.defaultMaxLoanDays)}, {category.defaultMaxQuantity} per request
                </p>
              </div>
              <div className="d-flex gap-2">
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
                  New item type
                </button>
              </div>
            </div>
            {category.itemTypes.length === 0 ? (
              <p className="mb-0 small text-body-secondary">No item types yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
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
                        <td>
                          {t.name}
                          {t.isKit && <span className="badge text-bg-secondary ms-2">Kit</span>}
                        </td>
                        <td>{days(t.maxLoanDays)}</td>
                        <td>{t.maxQuantityPerRequest} per request</td>
                        <td>{t.availableCount} available</td>
                        <td className="text-end text-nowrap">
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
