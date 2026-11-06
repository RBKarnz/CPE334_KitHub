// Pending requests, the Custodian landing page (contract F-03 4.2). Rows in the API order:
// oldest first (F03-D2). "Check out" opens the checkout dialog for that request.
import { useState } from "react";
import { Link } from "react-router-dom";
import { fetchPendingRequests, type BorrowRequest } from "../../api/requests";
import { useLoad } from "../../api/useLoad";
import { AsyncState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
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
    <main className="container kh-main">
      <PageHeader>Pending requests</PageHeader>
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
        {/* Below 576 px each row shows as a card (theme.css); data-label names the column there.
            The explicit roles keep the table semantics that some browsers drop with display: block. */}
        <div className="kh-panel">
          <table className="table align-middle kh-table kh-table-cards" role="table">
            <thead role="rowgroup">
              <tr role="row">
                <th scope="col" role="columnheader">Request</th>
                <th scope="col" role="columnheader">Borrower</th>
                <th scope="col" role="columnheader">Item type</th>
                <th scope="col" role="columnheader">Quantity</th>
                <th scope="col" role="columnheader">Created</th>
                <th scope="col" role="columnheader">Action</th>
              </tr>
            </thead>
            <tbody role="rowgroup">
              {items.map((request) => {
                // Every Sprint 1 request has exactly one line (BR-01).
                const line = request.lines[0];
                return (
                  <tr key={request.id} role="row">
                    <td role="cell">
                      <Link className="fw-bold" to={`/requests/${request.id}`}>
                        #{request.id}
                      </Link>
                    </td>
                    <td role="cell" data-label="Borrower">
                      {request.borrower.displayName} <span className="text-body-secondary">({request.borrower.username})</span>
                    </td>
                    <td role="cell" data-label="Item type" className="fw-semibold">
                      {line?.itemType.name}
                    </td>
                    <td role="cell" data-label="Quantity">{line?.quantity}</td>
                    <td role="cell" data-label="Created">{formatDateTime(request.createdAt)}</td>
                    <td role="cell">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-3"
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
