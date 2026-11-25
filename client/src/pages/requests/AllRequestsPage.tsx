// All requests, the Custodian's view of /requests (contract F-06 4.2, F06-D8, FR-30). Every
// Borrower's requests in every state, oldest first (F06-D7), with a state filter.
import { useCallback, useId, useState } from "react";
import { Link } from "react-router-dom";
import { fetchRequests, type RequestStatus } from "../../api/requests";
import { useLoad } from "../../api/useLoad";
import { AsyncState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDateTime } from "../../format";

const STATES: RequestStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "CHECKED_OUT", "RETURNED", "EXPIRED"];

export function AllRequestsPage() {
  const [status, setStatus] = useState<RequestStatus | "">("");
  const load = useCallback(() => fetchRequests(status || undefined), [status]);
  const requests = useLoad(load);
  const filterId = useId();
  const items = requests.data ?? [];

  return (
    <main className="container kh-main">
      <PageHeader>All requests</PageHeader>
      <div className="d-flex align-items-center gap-2 mb-3">
        <label htmlFor={filterId} className="form-label mb-0">
          State
        </label>
        <select
          id={filterId}
          className="form-select form-select-sm w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value as RequestStatus | "")}
        >
          <option value="">All states</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <AsyncState
        // Also while a new filter loads, so the previous filter's rows are never shown under it.
        loading={requests.loading}
        error={requests.error}
        onRetry={requests.reload}
        isEmpty={items.length === 0}
        empty={status ? `No requests in state ${status}.` : "No requests."}
      >
        {/* Same card layout below 768 px as Pending requests (theme.css, issue #38). */}
        <div className="kh-panel">
          <div className="table-responsive">
            <table className="table align-middle kh-table kh-table-cards" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">Request</th>
                  <th scope="col" role="columnheader">Borrower</th>
                  <th scope="col" role="columnheader">Items</th>
                  <th scope="col" role="columnheader">State</th>
                  <th scope="col" role="columnheader">Created</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {items.map((r) => (
                  <tr key={r.id} role="row">
                    <td data-label="Request" role="cell">
                      <Link to={`/requests/${r.id}`}>#{r.id}</Link>
                    </td>
                    <td data-label="Borrower" role="cell">
                      {r.borrower.displayName} <span className="text-body-secondary">({r.borrower.username})</span>
                    </td>
                    <td data-label="Items" role="cell">
                      {r.lines.map((line) => (
                        <div key={line.id}>
                          {line.itemType.name} × {line.quantity}
                        </div>
                      ))}
                    </td>
                    <td data-label="State" role="cell">
                      <StatusBadge status={r.status} />
                    </td>
                    <td data-label="Created" role="cell">
                      {formatDateTime(r.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AsyncState>
    </main>
  );
}
