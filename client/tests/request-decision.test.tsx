// TEST-89 (AC-89) and TEST-83 (c) (AC-83): approve and reject on the request detail, and the
// decision shown to each role (contract F-06 4.3, 4.4). The requests module is mocked with a
// vi.mock factory, so this file does not import functions before they exist (F-06 8.1).
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import type { BorrowRequest } from "../src/api/requests";
import { RequestDetailPage } from "../src/pages/RequestDetailPage";
import { borrower, custodian, deferred, renderAs } from "./render";

const { fetchRequest, approveRequest, rejectRequest } = vi.hoisted(() => ({
  fetchRequest: vi.fn(),
  approveRequest: vi.fn(),
  rejectRequest: vi.fn(),
}));
vi.mock("../src/api/requests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/requests")>()),
  fetchRequest,
  approveRequest,
  rejectRequest,
}));

const base = {
  id: 12,
  createdAt: "2026-11-20T03:00:00.000Z",
  dueAt: null,
  loanDays: 7,
  borrower: { id: 3, username: "borrower1", displayName: "Borrower One" },
  lines: [{ id: 5, itemType: { id: 3, name: "Arduino Uno R3" }, quantity: 2, loans: [] }],
};
const pending = {
  ...base,
  status: "PENDING",
  decidedAt: null,
  decidedBy: null,
  rejectionReason: null,
  history: [
    {
      id: 40,
      occurredAt: "2026-11-20T03:00:00.000Z",
      actor: { id: 3, username: "borrower1", displayName: "Borrower One" },
      entityType: "REQUEST",
      action: "CREATED",
      fromStatus: null,
      toStatus: "PENDING",
      details: null,
    },
  ],
} as unknown as BorrowRequest;
const approved = {
  ...pending,
  status: "APPROVED",
  decidedAt: "2026-11-21T02:00:00.000Z",
  decidedBy: { id: 1, username: "custodian1", displayName: "Custodian One" },
} as unknown as BorrowRequest;
// Borrower view of a rejected request: no decidedBy and no history (F06-D4).
const rejectedForBorrower = {
  ...base,
  status: "REJECTED",
  decidedAt: "2026-11-21T03:00:00.000Z",
  rejectionReason: "Only one unit left.",
} as unknown as BorrowRequest;

const renderDetail = (user = custodian) =>
  renderAs(user, <RequestDetailPage />, { path: "/requests/:id", at: "/requests/12" });

beforeEach(() => {
  for (const fn of [fetchRequest, approveRequest, rejectRequest]) fn.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("TEST-89 (AC-89): approve and reject on the request detail", () => {
  it("TEST-89 (a): a PENDING request shows Approve and Reject to a Custodian, with the loan length and history", async () => {
    fetchRequest.mockResolvedValue(pending);
    renderDetail();

    expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByText("Loan length: 7 days")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
  });

  it("TEST-89 (b): Approve asks for confirmation, sends one call, shows the result and loads the detail again", async () => {
    fetchRequest.mockResolvedValueOnce(pending).mockResolvedValue(approved);
    const slow = deferred<BorrowRequest>();
    approveRequest.mockReturnValue(slow.promise);
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Approve Request #12 for Borrower One?");
    const confirm = screen.getByRole("button", { name: "Approve Request #12" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(approveRequest).toHaveBeenCalledTimes(1);
    expect(approveRequest).toHaveBeenCalledWith(12);
    await act(async () => slow.resolve(approved));

    expect(await screen.findByText("Request #12 approved.")).toBeInTheDocument();
    await waitFor(() => expect(fetchRequest).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Approved by Custodian One, 21 Nov 2026, 09:00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("TEST-89 (c): Reject needs a reason that is not blank, and a double click sends one call", async () => {
    fetchRequest.mockResolvedValue(pending);
    const slow = deferred<BorrowRequest>();
    rejectRequest.mockReturnValue(slow.promise);
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Reject Request #12 for Borrower One");
    const confirm = screen.getByRole("button", { name: "Reject Request #12" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "   " } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Broken cable." } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(rejectRequest).toHaveBeenCalledTimes(1);
    expect(rejectRequest).toHaveBeenCalledWith(12, "Broken cable.");
    await act(async () => slow.resolve(approved));
  });

  it("TEST-89 (d): a 409 from reject is shown as an alert and the detail is loaded again", async () => {
    fetchRequest.mockResolvedValue(pending);
    rejectRequest.mockRejectedValue(
      new ApiError(409, "INVALID_STATE", "Request #12 cannot be rejected because it is APPROVED, not PENDING."),
    );
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Broken cable." } });
    fireEvent.click(screen.getByRole("button", { name: "Reject Request #12" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("because it is APPROVED, not PENDING.");
    await waitFor(() => expect(fetchRequest).toHaveBeenCalledTimes(2));
  });
});

describe("TEST-83 (c) (AC-83): a Borrower's view of a rejected request", () => {
  it("TEST-83 (c): shows the time and the reason, no Custodian name, and no Approve or Reject", async () => {
    fetchRequest.mockResolvedValue(rejectedForBorrower);
    renderDetail(borrower);

    expect(await screen.findByText("Rejected 21 Nov 2026, 10:00")).toBeInTheDocument();
    expect(screen.getByText("Reason: Only one unit left.")).toBeInTheDocument();
    expect(screen.queryByText(/Custodian One/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });
});
