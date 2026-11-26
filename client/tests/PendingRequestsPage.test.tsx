// TEST-25 (AC-25): the Custodian's checkout list shows loading, empty and error states and its rows
// (contract F-03 4.2). F-07 (F07-D6, F07-D8): the page is now "Ready for checkout" and lists APPROVED
// requests (GET /api/requests?status=APPROVED) with items, loan length and approval time; the empty
// text is "No approved requests." The states it checks are unchanged. The requests module is mocked
// with a vi.mock factory, so this file imports nothing before it exists.
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/api/client";
import type { BorrowRequest } from "../src/api/requests";
import { PendingRequestsPage } from "../src/pages/pending/PendingRequestsPage";
import { approved12, approvedMulti12 } from "./fixtures";
import { custodian, deferred, renderAs } from "./render";

const { fetchApprovedRequests } = vi.hoisted(() => ({ fetchApprovedRequests: vi.fn() }));
vi.mock("../src/api/requests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/requests")>()),
  fetchApprovedRequests,
}));

beforeEach(() => fetchApprovedRequests.mockReset());
afterEach(() => vi.restoreAllMocks());

describe("TEST-25 (AC-25): Ready for checkout states", () => {
  it("TEST-25 (a): shows Loading… until the first response", async () => {
    const slow = deferred<BorrowRequest[]>();
    fetchApprovedRequests.mockReturnValue(slow.promise);
    renderAs(custodian, <PendingRequestsPage />);

    expect(await screen.findByText("Loading…")).toBeInTheDocument();
    await act(async () => slow.resolve([]));
  });

  it("TEST-25 (b): no approved requests shows the empty message", async () => {
    fetchApprovedRequests.mockResolvedValue([]);
    renderAs(custodian, <PendingRequestsPage />);

    expect(await screen.findByText("No approved requests.")).toBeInTheDocument();
  });

  it("TEST-25 (c): an error shows the API message, and Try again calls the API again", async () => {
    fetchApprovedRequests
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Something went wrong."))
      .mockResolvedValueOnce([approved12]);
    renderAs(custodian, <PendingRequestsPage />);

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("#12")).toBeInTheDocument();
    expect(fetchApprovedRequests).toHaveBeenCalledTimes(2);
  });

  it("TEST-25 (d): a row shows request, borrower, items, loan length, approval time and a Check out button", async () => {
    fetchApprovedRequests.mockResolvedValue([approvedMulti12]);
    renderAs(custodian, <PendingRequestsPage />);

    expect(await screen.findByRole("heading", { name: "Ready for checkout" })).toBeInTheDocument();
    const row = (await screen.findByText("#12")).closest("tr")!;
    const cells = within(row).getAllByRole("cell").map((c) => c.textContent);
    expect(cells.slice(0, 5)).toEqual([
      "#12",
      "Borrower One (borrower1)",
      "Arduino Uno R3 × 2, HC-SR04 ultrasonic sensor × 1",
      "7 days",
      "6 Nov 2026, 14:00",
    ]);
    const button = within(row).getByRole("button", { name: /Check out/ });
    expect(button).toHaveTextContent("Check out");
    expect(button).toBeEnabled();
  });

  it("TEST-25: rows keep the API order (oldest first, F03-D2)", async () => {
    const approved13: BorrowRequest = {
      ...approved12,
      id: 13,
      createdAt: "2026-11-06T06:45:00.000Z",
      borrower: { id: 4, username: "borrower2", displayName: "Borrower Two" },
    };
    fetchApprovedRequests.mockResolvedValue([approved12, approved13]);
    renderAs(custodian, <PendingRequestsPage />);

    await screen.findByText("#13");
    const firstCells = screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);
    expect(firstCells).toEqual(["#12", "#13"]);
  });
});
