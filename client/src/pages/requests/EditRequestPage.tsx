// Edit request (/requests/:id/edit, Borrower; contract F-05 4.3): RequestForm (F04-D8) filled with
// the request; Save changes once something changed; back to the detail with "Request #n updated.".
import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchCategories } from "../../api/catalog";
import { ApiError } from "../../api/client";
import { fetchRequest, updateRequest } from "../../api/requests";
import { useLoad } from "../../api/useLoad";
import { AsyncState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { RequestForm } from "./RequestForm";

export function EditRequestPage() {
  const { id: rawId } = useParams();
  const id = /^[1-9]\d*$/.test(rawId ?? "") ? Number(rawId) : null;
  const navigate = useNavigate();
  const loadRequest = useCallback(
    () => (id === null ? Promise.reject(new ApiError(404, "NOT_FOUND", "Request not found.")) : fetchRequest(id)),
    [id],
  );
  const request = useLoad(loadRequest);
  const catalog = useLoad(fetchCategories);

  if (request.error?.status === 404)
    return (
      <main className="container kh-main">
        <div className="kh-panel kh-message">
          <i className="bi bi-search" aria-hidden="true" />
          <h1 className="h3 mt-2">Request not found.</h1>
          <Link to="/requests">Back to My requests</Link>
        </div>
      </main>
    );

  const r = request.data;
  const categories = catalog.data ?? [];
  // A Sprint 1 request without a loan length starts at the smallest maximum of its lines (3.1).
  const startDays = (() => {
    if (!r) return null;
    if (r.loanDays != null) return r.loanDays;
    const maxima = r.lines
      .map((l) => categories.flatMap((c) => c.itemTypes).find((t) => t.id === l.itemType.id)?.maxLoanDays)
      .filter((d): d is number => d !== undefined);
    return maxima.length > 0 ? Math.min(...maxima) : null;
  })();

  return (
    <main className="container kh-main">
      <AsyncState
        loading={(request.loading && !r) || (catalog.loading && !catalog.data)}
        error={r && catalog.data ? null : (request.error ?? catalog.error)}
        onRetry={() => {
          request.reload();
          catalog.reload();
        }}
        isEmpty={false}
        empty={null}
      >
        {r && (
          <>
            <PageHeader>Edit Request #{r.id}</PageHeader>
            {r.status !== "PENDING" ? (
              <div className="kh-panel">
                <p>
                  Request #{r.id} can no longer be edited because it is {r.status}.
                </p>
                <Link to={`/requests/${r.id}`}>Back to Request #{r.id}</Link>
              </div>
            ) : (
              <>
                <RequestForm
                  categories={categories}
                  initialLines={r.lines.map((l) => ({ itemTypeId: l.itemType.id, quantity: l.quantity }))}
                  initialLoanDays={startDays}
                  submitLabel="Save changes"
                  requireChange
                  onConflict={catalog.reload}
                  onSubmit={async (body) => {
                    await updateRequest(r.id, body);
                    navigate(`/requests/${r.id}`, { state: { notice: `Request #${r.id} updated.` } });
                  }}
                />
                <p className="mt-3">
                  <Link to={`/requests/${r.id}`}>Back to Request #{r.id}</Link>
                </p>
              </>
            )}
          </>
        )}
      </AsyncState>
    </main>
  );
}
