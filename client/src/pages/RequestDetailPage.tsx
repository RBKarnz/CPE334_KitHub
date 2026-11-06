// One request with its lines; after checkout, each line's unit and the due date (contract F-02 5).
import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRequest } from "../api/requests";
import { useLoad } from "../api/useLoad";
import { useAuth } from "../auth/AuthProvider";
import { AsyncState } from "../components/AsyncState";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../format";
import { NotFoundPage } from "./NotFoundPage";

export function RequestDetailPage() {
  const { id } = useParams();
  const requestId = Number(id);
  const valid = Number.isInteger(requestId) && requestId > 0;
  // An ID that is not a positive integer never reaches the API.
  const load = useCallback(
    () => (valid ? fetchRequest(requestId) : Promise.resolve(undefined)),
    [valid, requestId],
  );
  const detail = useLoad(load);
  const { user } = useAuth();
  // /requests is Borrower-only, so a Custodian goes back to Pending requests instead.
  const back =
    user?.role === "CUSTODIAN"
      ? { to: "/pending", label: "Back to Pending requests" }
      : { to: "/requests", label: "Back to My requests" };

  if (!valid) return <NotFoundPage />;
  if (detail.error?.status === 404)
    return (
      <main className="container">
        <h1 className="h3">Request not found.</h1>
        <Link to={back.to}>{back.label}</Link>
      </main>
    );

  const r = detail.data;
  return (
    <main className="container">
      <AsyncState
        loading={detail.loading && !r}
        error={detail.error}
        onRetry={detail.reload}
        isEmpty={false}
        empty={null}
      >
        {r && (
          <>
            <h1 className="h3 d-flex align-items-center gap-2">
              Request #{r.id} <StatusBadge status={r.status} />
            </h1>
            <p className="text-body-secondary">Created {formatDateTime(r.createdAt)}</p>
            {r.dueAt && <p>Due {formatDateTime(r.dueAt)}</p>}
            <ul className="list-group">
              {r.lines.map((line) => (
                <li key={line.id} className="list-group-item">
                  {line.itemType.name} × {line.quantity}
                  {/* After checkout: the unit's asset tag and the checkout time (contract F-03 4.4). */}
                  {line.loans.map((loan) => (
                    <div key={loan.id} className="small text-body-secondary">
                      Unit <span className="font-monospace">{loan.unit.assetTag}</span> ·{" "}
                      <span>Checked out {formatDateTime(loan.checkedOutAt)}</span>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </>
        )}
      </AsyncState>
    </main>
  );
}
