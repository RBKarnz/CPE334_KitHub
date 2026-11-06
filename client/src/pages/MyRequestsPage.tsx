// A Borrower's own requests, newest first (contract F-02 section 5, FR-08).
import { Link } from "react-router-dom";
import { fetchMyRequests } from "../api/requests";
import { useLoad } from "../api/useLoad";
import { AsyncState } from "../components/AsyncState";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../format";

export function MyRequestsPage() {
  const requests = useLoad(fetchMyRequests);
  const items = requests.data ?? [];

  return (
    <main className="container">
      <h1 className="h3 mb-3">My requests</h1>
      <AsyncState
        loading={requests.loading && !requests.data}
        error={requests.error}
        onRetry={requests.reload}
        isEmpty={items.length === 0}
        empty={
          <>
            You have no requests yet. <Link to="/catalog">Browse the catalog</Link>
          </>
        }
      >
        <div className="list-group">
          {items.map((r) => (
            <Link key={r.id} to={`/requests/${r.id}`} className="list-group-item list-group-item-action">
              <div className="d-flex justify-content-between align-items-center">
                <strong>Request #{r.id}</strong>
                <StatusBadge status={r.status} />
              </div>
              {r.lines.map((line) => (
                <div key={line.id}>
                  {line.itemType.name} × {line.quantity}
                </div>
              ))}
              <small className="text-body-secondary">{formatDateTime(r.createdAt)}</small>
            </Link>
          ))}
        </div>
      </AsyncState>
    </main>
  );
}
