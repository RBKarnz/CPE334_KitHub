// Item type detail (/catalog/item-types/:id, both roles; contract F-04 4.2, FR-05): description,
// limits and the available count; a Borrower's Request opens the new request form (F04-D5).
import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { getItemType } from "../api/catalog";
import { ApiError } from "../api/client";
import { useLoad } from "../api/useLoad";
import { useAuth } from "../auth/AuthProvider";
import { AsyncState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export function ItemTypePage() {
  const { id: rawId } = useParams();
  const id = /^[1-9]\d*$/.test(rawId ?? "") ? Number(rawId) : null;
  const { user } = useAuth();
  const load = useCallback(
    () => (id === null ? Promise.reject(new ApiError(404, "NOT_FOUND", "Item type not found.")) : getItemType(id)),
    [id],
  );
  const detail = useLoad(load);

  if (detail.error?.status === 404)
    return (
      <main className="container kh-main">
        <div className="kh-panel kh-message">
          <i className="bi bi-search" aria-hidden="true" />
          <h1 className="h3 mt-2">Item type not found.</h1>
          <Link to="/catalog">Back to Catalog</Link>
        </div>
      </main>
    );

  const t = detail.data;
  const none = t?.availableCount === 0;
  return (
    <main className="container kh-main">
      <AsyncState loading={detail.loading && !t} error={detail.error} onRetry={detail.reload} isEmpty={false} empty={null}>
        {t && (
          <>
            <PageHeader>
              {t.name}
              {t.isKit && <span className="badge kh-kit ms-2">Kit</span>}
            </PageHeader>
            <p className="kh-meta">{t.category.name}</p>
            <div className="kh-panel kh-panel-body">
              <p className={t.description ? undefined : "text-body-secondary"}>{t.description || "No description."}</p>
              {/* The texts are contract F-04 4.2 (TEST-63); one fact per line, the limits set apart from the description. */}
              <ul className="kh-facts">
                <li>Maximum loan length: {days(t.maxLoanDays)}</li>
                <li>Maximum per request: {t.maxQuantityPerRequest}</li>
                <li className={none ? "text-body-secondary" : "fw-semibold"}>{none ? "None available" : `${t.availableCount} available`}</li>
              </ul>
              {user?.role === "BORROWER" &&
                (none ? (
                  <button type="button" className="btn btn-primary" disabled>
                    Request
                  </button>
                ) : (
                  <Link className="btn btn-primary" to={`/requests/new?itemTypeId=${t.id}`}>
                    Request
                  </Link>
                ))}
            </div>
          </>
        )}
      </AsyncState>
    </main>
  );
}
