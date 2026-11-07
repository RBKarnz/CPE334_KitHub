// Catalog with available counts and the Borrower's Request action (contract F-02 section 5).
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCategories } from "../api/catalog";
import { ApiError } from "../api/client";
import { createRequest } from "../api/requests";
import { useLoad } from "../api/useLoad";
import { useAuth } from "../auth/AuthProvider";
import { AsyncState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";

type Outcome = { kind: "success"; requestId: number } | { kind: "error"; message: string };

export function CatalogPage() {
  const { user } = useAuth();
  const isBorrower = user?.role === "BORROWER";
  const catalog = useLoad(fetchCategories);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Blocks a second call even before React re-renders the disabled button.
  const inFlight = useRef(false);

  const handleRequest = async (itemTypeId: number) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmittingId(itemTypeId);
    setOutcome(null);
    try {
      const created = await createRequest(itemTypeId);
      setOutcome({ kind: "success", requestId: created.id });
      catalog.reload();
    } catch (err) {
      // A 401 is handled by AuthProvider (session ended).
      if (err instanceof ApiError && err.code !== "UNAUTHENTICATED") {
        setOutcome({ kind: "error", message: err.message });
        // The count may have changed since the catalog was loaded.
        catalog.reload();
      }
    } finally {
      inFlight.current = false;
      setSubmittingId(null);
    }
  };

  const categories = catalog.data ?? [];
  return (
    <main className="container kh-main">
      <PageHeader>Catalog</PageHeader>
      {outcome?.kind === "success" && (
        <div className="alert alert-success" role="status">
          Request #{outcome.requestId} submitted. <Link to="/requests">See My requests</Link>
        </div>
      )}
      {outcome?.kind === "error" && (
        <div className="alert alert-warning" role="alert">
          {outcome.message}
        </div>
      )}
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
                        {itemType.name}
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
                          disabled={none || submittingId !== null}
                          onClick={() => handleRequest(itemType.id)}
                        >
                          {submittingId === itemType.id && (
                            <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" />
                          )}
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
