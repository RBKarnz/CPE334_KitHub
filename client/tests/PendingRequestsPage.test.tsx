// TEST-25 (AC-25): the Custodian's pending list shows loading, empty and error states and its rows
// (contract F-03 4.2). The requests API module is mocked.
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import * as requestsApi from "../src/api/requests";
import type { BorrowRequest } from "../src/api/requests";
import { PendingRequestsPage } from "../src/pages/pending/PendingRequestsPage";
import { pending12 } from "./fixtures";
import { custodian, deferred, renderAs } from "./render";

afterEach(() => vi.restoreAllMocks());

describe("TEST-25 (AC-25): Pending requests states", () => {
  it("TEST-25 (a): shows Loading… until the first response", async () => {
    const slow = deferred<BorrowRequest[]>();
    vi.spyOn(requestsApi, "fetchPendingRequests").mockReturnValue(slow.promise);
    renderAs(custodian, <PendingRequestsPage />);

    expect(await screen.findByText("Loading…")).toBeInTheDocument();
    await act(async () => slow.resolve([]));
  });

  it("TEST-25 (b): no pending requests shows the empty message", async () => {
    vi.spyOn(requestsApi, "fetchPendingRequests").mockResolvedValue([]);
    renderAs(custodian, <PendingRequestsPage />);

    expect(await screen.findByText("No pending requests.")).toBeInTheDocument();
  });

  it("TEST-25 (c): an error shows the API message, and Try again calls the API again", async () => {
    const fetch = vi
      .spyOn(requestsApi, "fetchPendingRequests")
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Something went wrong."))
      .mockResolvedValueOnce([pending12]);
    renderAs(custodian, <PendingRequestsPage />);

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("#12")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("TEST-25 (d): a row shows request, borrower, item type, quantity, Bangkok time and a Check out button", async () => {
    vi.spyOn(requestsApi, "fetchPendingRequests").mockResolvedValue([pending12]);
    renderAs(custodian, <PendingRequestsPage />);

    expect(await screen.findByRole("heading", { name: "Pending requests" })).toBeInTheDocument();
    const row = (await screen.findByText("#12")).closest("tr")!;
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells.slice(0, 5)).toEqual(["#12", "Borrower One (borrower1)", "Arduino Uno R3", "1", "6 Nov 2026, 13:10"]);
    const button = within(row).getByRole("button", { name: /Check out/ });
    expect(button).toHaveTextContent("Check out");
    expect(button).toBeEnabled();
  });

  it("TEST-25: rows keep the API order (oldest first, F03-D2)", async () => {
    const pending13: BorrowRequest = {
      ...pending12,
      id: 13,
      createdAt: "2026-11-06T06:45:00.000Z",
      borrower: { id: 4, username: "borrower2", displayName: "Borrower Two" },
    };
    vi.spyOn(requestsApi, "fetchPendingRequests").mockResolvedValue([pending12, pending13]);
    renderAs(custodian, <PendingRequestsPage />);

    await screen.findByText("#13");
    const firstCells = screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);
    expect(firstCells).toEqual(["#12", "#13"]);
  });
});
