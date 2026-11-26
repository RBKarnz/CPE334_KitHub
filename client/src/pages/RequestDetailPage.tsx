// One request with its lines; after checkout, each line's unit and the due date (contract F-02 5).
// F-06 adds the loan length, the decision, Approve and Reject for Custodians, and the history (4.3).
import { useCallback, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { returnLoan, returnRequest, type ReturnConditionValue } from "../api/loans";
import { approveRequest, cancelRequest, fetchRequest, rejectRequest, type BorrowRequest, type HistoryItem } from "../api/requests";
import { useLoad } from "../api/useLoad";
import { useAuth } from "../auth/AuthProvider";
import { AsyncState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime } from "../format";
import { NotFoundPage } from "./NotFoundPage";
import { CancelRequestDialog } from "./requests/CancelRequestDialog";
import { DecisionDialog } from "./requests/DecisionDialog";
import { ReturnDialog, type ReturnItem } from "./requests/ReturnDialog";

/** "Request #12 returned: 1 good, 1 damaged (KH-ARD-0002 sent to maintenance)." (contract F-08 4). */
function returnSummary(requestId: number, items: ReturnItem[], conditions: { loanId: number; condition: ReturnConditionValue }[]) {
  const damaged = conditions.filter((c) => c.condition === "DAMAGED");
  const good = conditions.length - damaged.length;
  if (damaged.length === 0) return `Request #${requestId} returned: ${good} good.`;
  const tags = damaged.map((d) => items.find((i) => i.loanId === d.loanId)!.assetTag).join(", ");
  return `Request #${requestId} returned: ${good} good, ${damaged.length} damaged (${tags} sent to maintenance).`;
}

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
  // "Request #12 submitted." after the new request form opens the request (contract F-04 4.3).
  const location = useLocation();
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null);
  const [alert, setAlert] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Blocks a second call even before React re-renders the disabled button.
  const inFlight = useRef(false);
  // F-05: the cancel confirmation (4.4).
  const [cancelling, setCancelling] = useState(false);

  /** Cancel (contract F-05 4.4): success, 409 and 404 close the dialog and load the request again. */
  const doCancel = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setAlert(null);
    setNotice(null);
    try {
      await cancelRequest(requestId);
      setNotice(`Request #${requestId} cancelled.`);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, "INTERNAL_ERROR", "Something went wrong.");
      // A 401 is handled by AuthProvider (session ended, SDS 5.3).
      if (apiError.code !== "UNAUTHENTICATED") setAlert(apiError.message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
      setCancelling(false);
      detail.reload();
    }
  };
  // F-08: "all" for Return all, or the one loan of Return this unit.
  const [returning, setReturning] = useState<"all" | ReturnItem | null>(null);

  const doReturn = async (items: ReturnItem[], conditions: { loanId: number; condition: ReturnConditionValue }[]) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setAlert(null);
    setNotice(null);
    setDialogError(null);
    let close = true;
    try {
      if (returning === "all") {
        await returnRequest(requestId, conditions);
        setNotice(returnSummary(requestId, items, conditions));
      } else {
        const result = await returnLoan(conditions[0].loanId, conditions[0].condition);
        const last = result.status === "RETURNED" ? ` Request #${requestId} returned.` : "";
        setNotice(`${items[0].assetTag} returned.${last}`);
      }
    } catch (err) {
      const apiError = err instanceof ApiError ? err : new ApiError(0, "INTERNAL_ERROR", "Something went wrong.");
      if (apiError.code === "UNAUTHENTICATED") close = false;
      else if (apiError.status === 400) {
        close = false;
        setDialogError(apiError.message);
      } else setAlert(apiError.message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
      if (close) {
        setReturning(null);
        detail.reload();
      }
    }
  };

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
  // The ACTIVE loans that Return all lists (contract F-08 4).
  const activeItems: ReturnItem[] = (r?.lines ?? []).flatMap((l) =>
    l.loans
      .filter((loan) => loan.status === "ACTIVE")
      .map((loan) => ({ loanId: loan.id, assetTag: loan.unit.assetTag, itemTypeName: l.itemType.name })),
  );
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
            {r.loanDays != null && <p className="kh-meta">Loan length: {r.loanDays} day{r.loanDays === 1 ? "" : "s"}</p>}
            {decisionText(r) && <p className="kh-meta">{decisionText(r)}</p>}
            {r.rejectionReason && <p>Reason: {r.rejectionReason}</p>}
            {r.dueAt && <p className="kh-due">Due {formatDateTime(r.dueAt)}</p>}
            {user?.role === "CUSTODIAN" && r.status === "CHECKED_OUT" && (
              <div className="d-flex gap-2 mb-3">
                <button type="button" className="btn btn-primary" onClick={() => setReturning("all")}>
                  Return all
                </button>
              </div>
            )}
            {/* F-05 (4.2): the owning Borrower edits a PENDING request and cancels a PENDING or APPROVED one. */}
            {user?.role === "BORROWER" && (r.status === "PENDING" || r.status === "APPROVED") && (
              <div className="d-flex gap-2 mb-3">
                {r.status === "PENDING" && (
                  <Link className="btn btn-primary" to={`/requests/${r.id}/edit`}>
                    Edit request
                  </Link>
                )}
                <button type="button" className="btn btn-outline-danger" onClick={() => setCancelling(true)}>
                  Cancel request
                </button>
              </div>
            )}
            {cancelling && (
              <CancelRequestDialog
                request={r}
                submitting={submitting}
                onKeep={() => setCancelling(false)}
                onConfirm={() => void doCancel()}
              />
            )}
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
                      {loan.returnedAt && (
                        <span>
                          {" "}
                          · Returned {formatDateTime(loan.returnedAt)} · {loan.returnCondition === "DAMAGED" ? "Damaged" : "Good"}
                        </span>
                      )}
                      {user?.role === "CUSTODIAN" && r.status === "CHECKED_OUT" && loan.status === "ACTIVE" && (
                        <button
                          type="button"
                          className="btn btn-link btn-sm py-0"
                          onClick={() =>
                            setReturning({ loanId: loan.id, assetTag: loan.unit.assetTag, itemTypeName: line.itemType.name })
                          }
                        >
                          Return this unit<span className="visually-hidden"> {loan.unit.assetTag}</span>
                        </button>
                      )}
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
            {returning && (
              <ReturnDialog
                title={returning === "all" ? `Return Request #${r.id}` : `Return ${returning.assetTag}`}
                confirmLabel={
                  returning === "all"
                    ? `Return ${activeItems.length} unit${activeItems.length === 1 ? "" : "s"}`
                    : `Return ${returning.assetTag}`
                }
                items={
                  returning === "all"
                    ? activeItems
                    : [returning]
                }
                submitting={submitting}
                error={dialogError}
                onCancel={() => {
                  setReturning(null);
                  setDialogError(null);
                }}
                onConfirm={(conditions) =>
                  doReturn(
                    returning === "all"
                      ? activeItems
                      : [returning],
                    conditions,
                  )
                }
              />
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
