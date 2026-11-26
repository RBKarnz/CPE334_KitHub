// /loans, scoped by role (contract F-07 4, F07-D7): My loans for a Borrower (own active loans),
// Loans for a Custodian (every Borrower's loans, Active or Returned). Earliest due first (F07-D5).
import { useCallback, useId, useState } from "react";
import { Link } from "react-router-dom";
import { fetchLoans, type LoanListStatus } from "../../api/loans";
import { useLoad } from "../../api/useLoad";
import { useAuth } from "../../auth/AuthProvider";
import { AsyncState } from "../../components/AsyncState";
import { PageHeader } from "../../components/PageHeader";
import { formatDateTime } from "../../format";

export function LoansPage() {
  const { user } = useAuth();
  const custodian = user?.role === "CUSTODIAN";
  const [status, setStatus] = useState<LoanListStatus>("ACTIVE");
  // Without a status the API lists ACTIVE loans, so the default call sends none.
  const load = useCallback(() => fetchLoans(status === "ACTIVE" ? undefined : status), [status]);
  const loans = useLoad(load);
  const filterId = useId();
  const items = loans.data ?? [];
  const empty = custodian
    ? status === "RETURNED"
      ? "No returned loans."
      : "No active loans."
    : "You have no active loans.";

  return (
    <main className="container kh-main">
      <PageHeader>{custodian ? "Loans" : "My loans"}</PageHeader>
      {custodian && (
        <div className="d-flex align-items-center gap-2 mb-3">
          <label htmlFor={filterId} className="form-label mb-0">
            Show
          </label>
          <select
            id={filterId}
            className="form-select form-select-sm w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value as LoanListStatus)}
          >
            <option value="ACTIVE">Active</option>
            <option value="RETURNED">Returned</option>
          </select>
        </div>
      )}
      <AsyncState loading={loans.loading} error={loans.error} onRetry={loans.reload} isEmpty={items.length === 0} empty={empty}>
        <div className="kh-panel">
          <div className="table-responsive">
            <table className="table align-middle kh-table kh-table-cards" role="table">
              <thead role="rowgroup">
                <tr role="row">
                  <th scope="col" role="columnheader">Item type</th>
                  <th scope="col" role="columnheader">Unit</th>
                  {custodian && <th scope="col" role="columnheader">Borrower</th>}
                  <th scope="col" role="columnheader">Request</th>
                  <th scope="col" role="columnheader">Checked out</th>
                  <th scope="col" role="columnheader">{status === "RETURNED" ? "Returned" : "Due"}</th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {items.map((loan) => (
                  <tr key={loan.id} role="row">
                    <td role="cell" data-label="Item type">{loan.itemType.name}</td>
                    <td role="cell" data-label="Unit">
                      <span className="kh-tag">{loan.unit.assetTag}</span>
                    </td>
                    {custodian && (
                      <td role="cell" data-label="Borrower">
                        {loan.borrower?.displayName}{" "}
                        <span className="text-body-secondary">({loan.borrower?.username})</span>
                      </td>
                    )}
                    <td role="cell" data-label="Request">
                      <Link to={`/requests/${loan.request.id}`}>#{loan.request.id}</Link>
                    </td>
                    <td role="cell" data-label="Checked out">{formatDateTime(loan.checkedOutAt)}</td>
                    <td role="cell" data-label={status === "RETURNED" ? "Returned" : "Due"}>
                      {formatDateTime(status === "RETURNED" && loan.returnedAt ? loan.returnedAt : loan.dueAt)}
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
