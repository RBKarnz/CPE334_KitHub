// My requests and request detail: TEST-17 (list states), contract F-02 8.2.
import { act, fireEvent, screen } from "@testing-library/react";
import { Link } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import * as requestsApi from "../src/api/requests";
import type { BorrowRequest } from "../src/api/requests";
import { MyRequestsPage } from "../src/pages/MyRequestsPage";
import { RequestDetailPage } from "../src/pages/RequestDetailPage";
import { borrower, custodian, deferred, renderAs } from "./render";

const request12: BorrowRequest = {
  id: 12,
  status: "PENDING",
  createdAt: "2026-11-06T06:10:00.000Z",
  dueAt: null,
  borrower: { id: 3, username: "borrower1", displayName: "Borrower One" },
  lines: [{ id: 5, itemType: { id: 3, name: "Arduino Uno R3" }, quantity: 1, loans: [] }],
};

afterEach(() => vi.restoreAllMocks());

describe("TEST-17 (AC-17): My requests loading, empty and error states", () => {
  it("TEST-17: shows Loading…, then each request with its line, state and Bangkok time", async () => {
    const slow = deferred<BorrowRequest[]>();
    vi.spyOn(requestsApi, "fetchMyRequests").mockReturnValue(slow.promise);
    renderAs(borrower, <MyRequestsPage />);

    expect(await screen.findByText("Loading…")).toBeInTheDocument();
    await act(async () => slow.resolve([request12]));

    const link = await screen.findByRole("link", { name: /Request #12/ });
    expect(link).toHaveAttribute("href", "/requests/12");
    expect(link).toHaveTextContent("Arduino Uno R3 × 1");
    expect(link).toHaveTextContent("Pending");
    expect(link).toHaveTextContent("6 Nov 2026, 13:10");
  });

  it("TEST-17: no requests shows the empty message with a link to the catalog", async () => {
    vi.spyOn(requestsApi, "fetchMyRequests").mockResolvedValue([]);
    renderAs(borrower, <MyRequestsPage />);

    expect(await screen.findByText(/You have no requests yet\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse the catalog" })).toHaveAttribute("href", "/catalog");
  });

  it("TEST-17: an error shows the API message, and Try again calls the API again", async () => {
    const fetch = vi
      .spyOn(requestsApi, "fetchMyRequests")
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Cannot reach KitHub. Check your connection and try again."))
      .mockResolvedValueOnce([request12]);
    renderAs(borrower, <MyRequestsPage />);

    expect(await screen.findByText("Cannot reach KitHub. Check your connection and try again.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: /Request #12/ })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("Request detail (contract F-02 section 5)", () => {
  it("shows the title, state, creation time and lines", async () => {
    vi.spyOn(requestsApi, "fetchRequest").mockResolvedValue(request12);
    renderAs(borrower, <RequestDetailPage />, { path: "/requests/:id", at: "/requests/12" });

    expect(await screen.findByRole("heading", { name: /Request #12/ })).toHaveTextContent("Pending");
    expect(screen.getByText("Arduino Uno R3 × 1")).toBeInTheDocument();
    expect(screen.getByText("Created 6 Nov 2026, 13:10")).toBeInTheDocument();
  });

  it("a 404 shows 'Request not found.' with a link to My requests", async () => {
    vi.spyOn(requestsApi, "fetchRequest").mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Request 99 does not exist."),
    );
    renderAs(borrower, <RequestDetailPage />, { path: "/requests/:id", at: "/requests/99" });

    expect(await screen.findByRole("heading", { name: "Request not found." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to My requests" })).toHaveAttribute("href", "/requests");
  });

  it("a Custodian's 404 links back to Pending requests, not the Borrower-only list", async () => {
    vi.spyOn(requestsApi, "fetchRequest").mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Request 99 does not exist."),
    );
    renderAs(custodian, <RequestDetailPage />, { path: "/requests/:id", at: "/requests/99" });

    expect(await screen.findByRole("heading", { name: "Request not found." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Pending requests" })).toHaveAttribute("href", "/pending");
  });

  it("an ID that is not a positive integer shows Not found without calling the API", async () => {
    const fetch = vi.spyOn(requestsApi, "fetchRequest");
    renderAs(borrower, <RequestDetailPage />, { path: "/requests/:id", at: "/requests/abc" });

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("moving to another request ID loads that request", async () => {
    const fetch = vi
      .spyOn(requestsApi, "fetchRequest")
      .mockImplementation(async (id) => ({ ...request12, id }));
    const { getByRole } = renderAs(
      borrower,
      <>
        <RequestDetailPage />
        <Link to="/requests/13">next</Link>
      </>,
      { path: "/requests/:id", at: "/requests/12" },
    );

    expect(await screen.findByRole("heading", { name: /Request #12/ })).toBeInTheDocument();
    fireEvent.click(getByRole("link", { name: "next" }));
    expect(await screen.findByRole("heading", { name: /Request #13/ })).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith(13);
  });
});
