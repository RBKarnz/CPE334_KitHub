// Catalog with available counts (contract F-02 section 5). F-04 (4.4, F04-D5): each item type name
// links to its detail, and a Borrower's Request opens the new request form with that item type.
import { Link, useNavigate } from "react-router-dom";
import { fetchCategories } from "../api/catalog";
import { useLoad } from "../api/useLoad";
import { useAuth } from "../auth/AuthProvider";
import { AsyncState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";

export function CatalogPage() {
  const { user } = useAuth();
  const isBorrower = user?.role === "BORROWER";
  const catalog = useLoad(fetchCategories);
  const navigate = useNavigate();

  const categories = catalog.data ?? [];
  return (
    <main className="container kh-main">
      <PageHeader>Catalog</PageHeader>
      <AsyncState
        loading={catalog.loading && !catalog.data}
        error={catalog.error}
        onRetry={catalog.reload}
        isEmpty={categories.length === 0}
        empty="The catalog is empty."
      >
        {categories.map((category) => (
          <section key={category.id} className="kh-category" aria-labelledby={`category-${category.id}`}>
            <h2 id={`category-${category.id}`} className="kh-section-title">
              {category.name}
            </h2>
            {category.itemTypes.length === 0 ? (
              <p className="kh-panel kh-empty text-body-secondary mb-0">No item types in this category yet.</p>
            ) : (
              <ul className="kh-panel kh-rows">
                {category.itemTypes.map((itemType) => {
                  const none = itemType.availableCount === 0;
                  return (
                    <li key={itemType.id} className="kh-row kh-catalog-row">
                      <span className="kh-item-name">
                        <Link to={`/catalog/item-types/${itemType.id}`}>{itemType.name}</Link>
                        {itemType.isKit && <span className="badge kh-kit ms-2">Kit</span>}
                      </span>
                      <span className={`kh-available${none ? " text-body-secondary" : ""}`}>
                        {none ? "None available" : `${itemType.availableCount} available`}
                      </span>
                      {isBorrower && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm px-3"
                          aria-label={`Request ${itemType.name}`}
                          disabled={none}
                          onClick={() => navigate(`/requests/new?itemTypeId=${itemType.id}`)}
                        >
                          Request
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </AsyncState>
    </main>
  );
}
