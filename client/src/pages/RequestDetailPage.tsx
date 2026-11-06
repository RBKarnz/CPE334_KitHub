// One request with its lines; after checkout, each line's unit and the due date (contract F-02 5).
import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRequest } from "../api/requests";
import { useLoad } from "../api/useLoad";
import { AsyncState } from "../components/AsyncState";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../format";
import { NotFoundPage } from "./NotFoundPage";

export function RequestDetailPage() {
  const { id } = useParams();
  const requestId = Number(id);
  const valid = Number.isInteger(requestId) && requestId > 0;
  const load = useCallback(() => fetchRequest(requestId), [requestId]);
  const detail = useLoad(load);

  if (!valid) return <NotFoundPage />;
  if (detail.error?.status === 404)
    return (
      <main className="container">
        <h1 className="h3">Request not found.</h1>
        <Link to="/requests">Back to My requests</Link>
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
                  {line.loans.map((loan) => (
                    <div key={loan.id} className="small text-body-secondary">
                      Unit {loan.unit.assetTag}, due {formatDateTime(loan.dueAt)}
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
