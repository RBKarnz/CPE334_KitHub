// One request with its lines; after checkout, each line's unit and the due date (contract F-02 5).
// F-06 adds the loan length, the decision, Approve and Reject for Custodians, and the history (4.3).
import { useCallback, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { approveRequest, fetchRequest, rejectRequest, type BorrowRequest, type HistoryItem } from "../api/requests";
import { useLoad } from "../api/useLoad";
import { useAuth } from "../auth/AuthProvider";
import { AsyncState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../format";
import { NotFoundPage } from "./NotFoundPage";
import { DecisionDialog } from "./requests/DecisionDialog";

/** "Approved by Custodian One, 21 Nov 2026, 09:00"; without the name for a Borrower (F06-D4). */
function decisionText(r: BorrowRequest): string | null {
  if (!r.decidedAt) return null;
  // A request keeps decidedAt after it moves on (for example APPROVED → CHECKED_OUT).
  const verb = r.status === "REJECTED" ? "Rejected" : "Approved";
  const when = formatDateTime(r.decidedAt);
  return r.decidedBy ? `${verb} by ${r.decidedBy.displayName}, ${when}` : `${verb} ${when}`;
}

/** "Request PENDING → APPROVED", "Created", "Unit AVAILABLE → ON_LOAN" (contract F-06 4.3). */
function historyWhat(h: HistoryItem): string {
  if (h.action === "CREATED") return h.entityType === "REQUEST" ? "Created" : `${entityLabel(h)} created`;
  if (h.fromStatus && h.toStatus) return `${entityLabel(h)} ${h.fromStatus} → ${h.toStatus}`;
  return `${entityLabel(h)} ${h.action.toLowerCase().replace("_", " ")}`;
}

const entityLabel = (h: HistoryItem) => ({ REQUEST: "Request", UNIT: "Unit", LOAN: "Loan" })[h.entityType];

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
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Blocks a second call even before React re-renders the disabled button.
  const inFlight = useRef(false);

  const decide = async (kind: "approve" | "reject", reason?: string) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setAlert(null);
    setNotice(null);
    setDialogError(null);
    // Closed and reloaded after a success, 409 or 404 (the request changed); kept open on 400.
    let close = true;
    try {
      if (kind === "approve") await approveRequest(requestId);
      else await rejectRequest(requestId, reason!);
      setNotice(`Request #${requestId} ${kind === "approve" ? "approved" : "rejected"}.`);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, "INTERNAL_ERROR", "Something went wrong.");
      // A 401 is handled by AuthProvider (session ended, SDS 5.3).
      if (apiError.code === "UNAUTHENTICATED") close = false;
      else if (apiError.status === 400) {
        // Keep the typed reason and show the message in the dialog (contract F-06 4.4, review of PR #91).
        close = false;
        setDialogError(apiError.message);
      } else setAlert(apiError.message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
      if (close) {
        setDialog(null);
        detail.reload();
      }
    }
  };
  // /requests is My requests for a Borrower and All requests for a Custodian (F06-D8).
  const back =
    user?.role === "CUSTODIAN"
      ? { to: "/requests", label: "Back to All requests" }
      : { to: "/requests", label: "Back to My requests" };

  if (!valid) return <NotFoundPage />;
  if (detail.error?.status === 404)
    return (
      <main className="container kh-main">
        <div className="kh-panel kh-message">
          <i className="bi bi-search" aria-hidden="true" />
          <h1 className="h3 mt-2">Request not found.</h1>
          <Link to={back.to}>{back.label}</Link>
        </div>
      </main>
    );

  const r = detail.data;
  return (
    <main className="container kh-main">
      <AsyncState
        loading={detail.loading && !r}
        error={detail.error}
        onRetry={detail.reload}
        isEmpty={false}
        empty={null}
      >
        {r && (
          <>
            <PageHeader>
              Request #{r.id} <StatusBadge status={r.status} />
            </PageHeader>
            {notice && (
              <div className="alert alert-success" role="status">
                {notice}
              </div>
            )}
            {alert && (
              <div className="alert alert-warning" role="alert">
                {alert}
              </div>
            )}
            <p className="kh-meta">Created {formatDateTime(r.createdAt)}</p>
            {r.loanDays != null && <p className="kh-meta">Loan length: {r.loanDays} days</p>}
            {decisionText(r) && <p className="kh-meta">{decisionText(r)}</p>}
            {r.rejectionReason && <p>Reason: {r.rejectionReason}</p>}
            {r.dueAt && <p className="kh-due">Due {formatDateTime(r.dueAt)}</p>}
            {user?.role === "CUSTODIAN" && r.status === "PENDING" && (
              <div className="d-flex gap-2 mb-3">
                <button type="button" className="btn btn-primary" onClick={() => setDialog("approve")}>
                  Approve
                </button>
                <button type="button" className="btn btn-outline-danger" onClick={() => setDialog("reject")}>
                  Reject
                </button>
              </div>
            )}
            <ul className="kh-panel kh-rows">
              {r.lines.map((line) => (
                <li key={line.id} className="kh-row d-block">
                  <span className="fw-semibold">
                    {line.itemType.name} × {line.quantity}
                  </span>
                  {/* After checkout: the unit's asset tag and the checkout time (contract F-03 4.4). */}
                  {line.loans.map((loan) => (
                    <div key={loan.id} className="small text-body-secondary mt-1">
                      Unit <span className="kh-tag text-body">{loan.unit.assetTag}</span> ·{" "}
                      <span>Checked out {formatDateTime(loan.checkedOutAt)}</span>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
            {r.history && (
              <section className="mt-4">
                <h2 className="h5">History</h2>
                <div className="kh-panel">
                  <div className="table-responsive">
                    <table className="table align-middle kh-table" role="table">
                      <thead role="rowgroup">
                        <tr role="row">
                          <th scope="col" role="columnheader">Time</th>
                          <th scope="col" role="columnheader">By</th>
                          <th scope="col" role="columnheader">What</th>
                        </tr>
                      </thead>
                      <tbody role="rowgroup">
                        {r.history.map((h) => (
                          <tr key={h.id} role="row">
                            <td role="cell">{formatDateTime(h.occurredAt)}</td>
                            <td role="cell">{h.actor ? h.actor.displayName : "System"}</td>
                            <td role="cell">
                              {historyWhat(h)}
                              {h.details?.reason && <div className="small">Reason: {h.details.reason}</div>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}
            {dialog && (
              <DecisionDialog
                kind={dialog}
                request={r}
                submitting={submitting}
                error={dialogError}
                onCancel={() => {
                  setDialog(null);
                  setDialogError(null);
                }}
                onConfirm={(reason) => decide(dialog, reason)}
              />
            )}
          </>
        )}
      </AsyncState>
    </main>
  );
}
