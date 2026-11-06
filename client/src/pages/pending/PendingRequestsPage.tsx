// Pending requests, the Custodian landing page (contract F-03 4.2). Rows in the API order:
// oldest first (F03-D2). "Check out" opens the checkout dialog for that request.
import { useState } from "react";
import { Link } from "react-router-dom";
import { fetchPendingRequests, type BorrowRequest } from "../../api/requests";
import { useLoad } from "../../api/useLoad";
import { AsyncState } from "../../components/AsyncState";
import { formatDateTime } from "../../format";
import { CheckoutDialog, checkoutConfirmation } from "./CheckoutDialog";

export function PendingRequestsPage() {
  const pending = useLoad(fetchPendingRequests);
  const [active, setActive] = useState<BorrowRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleCheckedOut = (result: BorrowRequest) => {
    setActive(null);
    setNotice(checkoutConfirmation(result));
    pending.reload();
  };

  const items = pending.data ?? [];
  return (
    <main className="container">
      <h1 className="h3 mb-3">Pending requests</h1>
      {notice && (
        <div className="alert alert-success" role="status">
          {notice}
        </div>
      )}
      <AsyncState
        loading={pending.loading && !pending.data}
        error={pending.error}
        onRetry={pending.reload}
        isEmpty={items.length === 0}
        empty="No pending requests."
      >
        <div className="table-responsive">
          <table className="table align-middle">
            <thead>
              <tr>
                <th scope="col">Request</th>
                <th scope="col">Borrower</th>
                <th scope="col">Item type</th>
                <th scope="col">Quantity</th>
                <th scope="col">Created</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((request) => {
                // Every Sprint 1 request has exactly one line (BR-01).
                const line = request.lines[0];
                return (
                  <tr key={request.id}>
                    <td>
                      <Link to={`/requests/${request.id}`}>#{request.id}</Link>
                    </td>
                    <td>
                      {request.borrower.displayName} ({request.borrower.username})
                    </td>
                    <td>{line?.itemType.name}</td>
                    <td>{line?.quantity}</td>
                    <td>{formatDateTime(request.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setNotice(null);
                          setActive(request);
                        }}
                      >
                        Check out<span className="visually-hidden"> Request #{request.id}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </AsyncState>
      {active && (
        <CheckoutDialog
          request={active}
          onClose={() => setActive(null)}
          onCheckedOut={handleCheckedOut}
          onStale={pending.reload}
        />
      )}
    </main>
  );
}
