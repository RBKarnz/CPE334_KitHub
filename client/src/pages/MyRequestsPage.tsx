// A Borrower's own requests, newest first (contract F-02 section 5, FR-08).
import { Link } from "react-router-dom";
import { fetchMyRequests } from "../api/requests";
import { useLoad } from "../api/useLoad";
import { AsyncState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../format";

export function MyRequestsPage() {
  const requests = useLoad(fetchMyRequests);
  const items = requests.data ?? [];

  return (
    <main className="container kh-main">
      <PageHeader>My requests</PageHeader>
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
        <div className="kh-panel">
          {items.map((r) => (
            <Link key={r.id} to={`/requests/${r.id}`} className="kh-row kh-request-row">
              <strong className="kh-request-id">Request #{r.id}</strong>
              <div className="kh-request-lines">
                {r.lines.map((line) => (
                  <div key={line.id}>
                    {line.itemType.name} × {line.quantity}
                  </div>
                ))}
                <small className="text-body-secondary">{formatDateTime(r.createdAt)}</small>
              </div>
              <StatusBadge status={r.status} />
            </Link>
          ))}
        </div>
      </AsyncState>
    </main>
  );
}
