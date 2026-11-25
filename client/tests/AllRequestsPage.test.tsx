// TEST-88 (AC-88): the All requests view on /requests for a Custodian, and My requests unchanged
// for a Borrower (contract F-06 4.2, F06-D8). The requests module is mocked with a vi.mock factory,
// so this file does not import functions before they exist (F-06 8.1).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import * as authApi from "../src/api/auth";
import { ApiError } from "../src/api/client";
import type { BorrowRequest } from "../src/api/requests";
import { borrower, custodian, deferred } from "./render";

const { fetchRequests, fetchMyRequests } = vi.hoisted(() => ({ fetchRequests: vi.fn(), fetchMyRequests: vi.fn() }));
vi.mock("../src/api/requests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/requests")>()),
  fetchRequests,
  fetchMyRequests,
}));

const decision = { loanDays: null, decidedAt: null, decidedBy: null, rejectionReason: null };

const r1 = {
  id: 1,
  status: "PENDING",
  createdAt: "2026-11-06T06:10:00.000Z",
  dueAt: null,
  ...decision,
  borrower: { id: 3, username: "borrower1", displayName: "Borrower One" },
  lines: [{ id: 5, itemType: { id: 3, name: "Arduino Uno R3" }, quantity: 2, loans: [] }],
} as unknown as BorrowRequest;
const r2 = {
  ...r1,
  id: 2,
  status: "APPROVED",
  createdAt: "2026-11-06T07:00:00.000Z",
  decidedAt: "2026-11-07T02:00:00.000Z",
  decidedBy: { id: 1, username: "custodian1", displayName: "Custodian One" },
  borrower: { id: 4, username: "borrower2", displayName: "Borrower Two" },
  lines: [{ id: 6, itemType: { id: 4, name: "ESP32 DevKitC" }, quantity: 1, loans: [] }],
} as unknown as BorrowRequest;

function renderAt(user: authApi.User, path: string) {
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(user);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchRequests.mockReset();
  fetchMyRequests.mockReset();
  fetchMyRequests.mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe("TEST-88 (AC-88): All requests page", () => {
  it("TEST-88 (a): shows Loading… while the list loads", async () => {
    fetchRequests.mockReturnValue(deferred<BorrowRequest[]>().promise);
    renderAt(custodian, "/requests");

    expect(await screen.findByRole("heading", { name: "All requests" })).toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("TEST-88 (b): an empty list says No requests.", async () => {
    fetchRequests.mockResolvedValue([]);
    renderAt(custodian, "/requests");

    expect(await screen.findByText("No requests.")).toBeInTheDocument();
  });

  it("TEST-88 (c): an error shows the message and Try again, which calls again", async () => {
    fetchRequests
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Something went wrong."))
      .mockResolvedValueOnce([r1]);
    renderAt(custodian, "/requests");

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "#1" })).toBeInTheDocument();
    expect(fetchRequests).toHaveBeenCalledTimes(2);
  });

  it("TEST-88 (d): rows show request, Borrower, items, state and time; the navigation links All requests", async () => {
    fetchRequests.mockResolvedValue([r1, r2]);
    renderAt(custodian, "/requests");

    const first = (await screen.findByRole("link", { name: "#1" })).closest("tr")!;
    expect(first).toHaveTextContent("Borrower One (borrower1)");
    expect(first).toHaveTextContent("Arduino Uno R3 × 2");
    expect(first).toHaveTextContent("Pending");
    expect(first).toHaveTextContent("6 Nov 2026, 13:10");
    expect(screen.getByRole("link", { name: "#1" })).toHaveAttribute("href", "/requests/1");
    const second = screen.getByRole("link", { name: "#2" }).closest("tr")!;
    expect(within(second).getByText("Approved")).toBeInTheDocument();
    expect(second).toHaveTextContent("Borrower Two (borrower2)");
    expect(fetchRequests).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole("link", { name: "All requests" })).toHaveAttribute("href", "/requests");
  });

  it("TEST-88 (e): choosing APPROVED in the filter calls the API with that state", async () => {
    fetchRequests.mockResolvedValue([r1, r2]);
    renderAt(custodian, "/requests");
    await screen.findByRole("link", { name: "#1" });

    const second = deferred<BorrowRequest[]>();
    fetchRequests.mockReturnValue(second.promise);
    fireEvent.change(screen.getByLabelText("State"), { target: { value: "APPROVED" } });

    await waitFor(() => expect(fetchRequests).toHaveBeenLastCalledWith("APPROVED"));
    // Review of PR #91: while the new filter loads, the previous filter's rows are not shown.
    expect(screen.queryByRole("link", { name: "#1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "#2" })).not.toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    await act(async () => second.resolve([r2]));
    expect(await screen.findByRole("link", { name: "#2" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "#1" })).not.toBeInTheDocument();
  });

  it("TEST-88 (f): a Borrower on /requests still sees My requests, without a state filter", async () => {
    fetchMyRequests.mockResolvedValue([r1]);
    renderAt(borrower, "/requests");

    expect(await screen.findByRole("heading", { name: "My requests" })).toBeInTheDocument();
    expect(await screen.findByText("Request #1")).toBeInTheDocument();
    expect(screen.queryByLabelText("State")).not.toBeInTheDocument();
    expect(fetchRequests).not.toHaveBeenCalled();
  });
});
