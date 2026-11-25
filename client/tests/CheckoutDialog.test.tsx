// TEST-49 (AC-49), TEST-58 (AC-58) (f), (g) and TEST-101 (AC-101) (a) to (c): the checkout dialog
// (contract F-03 4.3, F-07 4). The units, checkout and requests API modules are mocked; functions
// that F-07 adds are mocked with vi.mock factories, so this file imports nothing before it exists.
// F-07 (F07-D8): the dialog now checks out an APPROVED request and picks units with checkboxes, one
// unit per quantity on each line; the confirm label counts the units ("Check out 1 unit for
// Request #12", was "Check out KH-ARD-0007 for Request #12"). The rules each case checks are unchanged.
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as checkoutApi from "../src/api/checkout";
import { ApiError } from "../src/api/client";
import type { BorrowRequest } from "../src/api/requests";
import * as unitsApi from "../src/api/units";
import type { UnitSummary } from "../src/api/units";
import { CheckoutDialog, checkoutConfirmation } from "../src/pages/pending/CheckoutDialog";
import { PendingRequestsPage } from "../src/pages/pending/PendingRequestsPage";
import { approved12, approvedMulti12, checkedOut12, checkedOutMulti12 } from "./fixtures";
import { custodian, deferred, renderAs } from "./render";

const units: UnitSummary[] = [
  { id: 6, assetTag: "KH-ARD-0006", status: "AVAILABLE" },
  { id: 7, assetTag: "KH-ARD-0007", status: "AVAILABLE" },
];

const { fetchDueDatePreview, fetchApprovedRequests } = vi.hoisted(() => ({
  fetchDueDatePreview: vi.fn(),
  fetchApprovedRequests: vi.fn(),
}));
vi.mock("../src/api/units", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/units")>()),
  fetchDueDatePreview,
}));
vi.mock("../src/api/requests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/requests")>()),
  fetchApprovedRequests,
}));

/** The 5.5 example: item type 3 at Fri 6 Nov 2026, 14:30 ICT. */
const preview = { itemTypeId: 3, maxLoanDays: 14, at: "2026-11-06T07:30:00.000Z", dueAt: "2026-11-20T10:00:00.000Z" };

beforeEach(() => {
  fetchDueDatePreview.mockReset();
  fetchDueDatePreview.mockResolvedValue(preview);
  fetchApprovedRequests.mockReset();
});

afterEach(() => vi.restoreAllMocks());

function renderDialog(request: BorrowRequest = approved12) {
  const handlers = { onClose: vi.fn(), onCheckedOut: vi.fn(), onStale: vi.fn() };
  renderAs(custodian, <CheckoutDialog request={request} {...handlers} />);
  return handlers;
}

const confirmButton = () => screen.getByRole("button", { name: /^Check out/ });
const ONE = "Check out 1 unit for Request #12";

describe("TEST-49 (AC-49): checkout dialog", () => {
  it("TEST-49 (a): lists the AVAILABLE units of the line's item type; confirm is disabled until one is chosen", async () => {
    const fetchUnits = vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    renderDialog();

    const dialog = await screen.findByRole("dialog", { name: "Check out Request #12" });
    expect(dialog).toHaveTextContent("Borrower One (borrower1)");
    expect(await screen.findByText("Arduino Uno R3 — choose 1 of 2 available")).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "KH-ARD-0006" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "KH-ARD-0007" })).toBeInTheDocument();
    expect(fetchUnits).toHaveBeenCalledWith(3, "AVAILABLE");
    expect(confirmButton()).toBeDisabled();
  });

  it("TEST-49 (b): the confirm button counts the units for the request; a double click sends one call", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    const slow = deferred<BorrowRequest>();
    const checkout = vi.spyOn(checkoutApi, "checkoutRequest").mockReturnValue(slow.promise);
    renderDialog();

    fireEvent.click(await screen.findByRole("checkbox", { name: "KH-ARD-0007" }));
    const button = screen.getByRole("button", { name: ONE });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    fireEvent.click(button);

    expect(checkout).toHaveBeenCalledTimes(1);
    expect(checkout).toHaveBeenCalledWith(12, { units: [{ lineId: 5, unitId: 7 }] });
    expect(button).toBeDisabled();
    await act(async () => slow.resolve(checkedOut12));
  });

  it("TEST-49 (c): with no AVAILABLE unit the dialog says so and sends no checkout (D-17)", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue([]);
    const checkout = vi.spyOn(checkoutApi, "checkoutRequest");
    renderDialog();

    expect(await screen.findByText("Only 0 of 1 available. The request cannot be checked out yet.")).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(confirmButton());
    expect(checkout).not.toHaveBeenCalled();
  });

  it("TEST-49 (d): a 409 is shown as an alert, the selection is cleared and the units are fetched again", async () => {
    const fetchUnits = vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    vi.spyOn(checkoutApi, "checkoutRequest").mockRejectedValue(
      new ApiError(409, "UNIT_NOT_AVAILABLE", "Unit KH-ARD-0007 is not available for checkout.", [
        { field: "units[0].unitId", issue: "Unit is ON_LOAN" },
      ]),
    );
    const handlers = renderDialog();

    fireEvent.click(await screen.findByRole("checkbox", { name: "KH-ARD-0007" }));
    fireEvent.click(screen.getByRole("button", { name: ONE }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unit KH-ARD-0007 is not available for checkout.");
    await waitFor(() => expect(fetchUnits).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(handlers.onCheckedOut).not.toHaveBeenCalled();
    await screen.findByRole("checkbox", { name: "KH-ARD-0007" });
    expect(screen.getByRole("checkbox", { name: "KH-ARD-0007" })).not.toBeChecked();
    expect(confirmButton()).toBeDisabled();
  });

  it("TEST-49 (e): on success the dialog closes, shows asset tag and due date, and the list is fetched again", async () => {
    fetchApprovedRequests.mockResolvedValueOnce([approved12]).mockResolvedValueOnce([]);
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    vi.spyOn(checkoutApi, "checkoutRequest").mockResolvedValue(checkedOut12);
    renderAs(custodian, <PendingRequestsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Check out Request #12" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "KH-ARD-0007" }));
    fireEvent.click(screen.getByRole("button", { name: ONE }));

    expect(await screen.findByText("Request #12 checked out: KH-ARD-0007, due 20 Nov 2026, 17:00")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchApprovedRequests).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No approved requests.")).toBeInTheDocument();
  });

  it("TEST-49 (e): the dialog passes the checked-out request to onCheckedOut", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    vi.spyOn(checkoutApi, "checkoutRequest").mockResolvedValue(checkedOut12);
    const handlers = renderDialog();

    fireEvent.click(await screen.findByRole("checkbox", { name: "KH-ARD-0007" }));
    fireEvent.click(screen.getByRole("button", { name: ONE }));

    await waitFor(() => expect(handlers.onCheckedOut).toHaveBeenCalledWith(checkedOut12));
  });
});

describe("TEST-58 (AC-58): due-date preview in the checkout dialog (#71)", () => {
  it("TEST-58 (f): shows the due date a checkout now would get, with weekday, in ICT", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    renderDialog();

    expect(await screen.findByText("Due if checked out now: Fri 20 Nov 2026, 17:00")).toBeInTheDocument();
    expect(fetchDueDatePreview).toHaveBeenCalledWith(3);
  });

  it("TEST-58 (g): a preview error shows 'Due date not available.' and checkout still works", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    fetchDueDatePreview.mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "Cannot reach KitHub. Check your connection and try again."));
    const checkout = vi.spyOn(checkoutApi, "checkoutRequest").mockResolvedValue(checkedOut12);
    const handlers = renderDialog();

    expect(await screen.findByText("Due date not available.")).toBeInTheDocument();
    expect(fetchDueDatePreview).toHaveBeenCalledWith(3);
    fireEvent.click(await screen.findByRole("checkbox", { name: "KH-ARD-0007" }));
    const button = screen.getByRole("button", { name: ONE });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(checkout).toHaveBeenCalledWith(12, { units: [{ lineId: 5, unitId: 7 }] });
    await waitFor(() => expect(handlers.onCheckedOut).toHaveBeenCalledWith(checkedOut12));
  });
});

describe("TEST-101 (AC-101) (a) to (c): several lines and quantities", () => {
  const arduinos: UnitSummary[] = [1, 2, 3, 4].map((n) => ({ id: n, assetTag: `KH-ARD-000${n}`, status: "AVAILABLE" }));
  const sensors: UnitSummary[] = [{ id: 23, assetTag: "KH-SR04-0003", status: "AVAILABLE" }];
  const unitsOf = (sensorUnits: UnitSummary[]) => (itemTypeId: number) =>
    Promise.resolve(itemTypeId === 3 ? arduinos : sensorUnits);

  it("TEST-101 (a): confirm is enabled only when every line has its quantity; the preview uses the loan length", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockImplementation(unitsOf(sensors));
    renderDialog(approvedMulti12);

    expect(await screen.findByText("Arduino Uno R3 — choose 2 of 4 available")).toBeInTheDocument();
    expect(await screen.findByText("HC-SR04 ultrasonic sensor — choose 1 of 1 available")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("checkbox", { name: "KH-ARD-0001" }));
    expect(confirmButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "KH-ARD-0002" }));
    expect(confirmButton()).toBeDisabled();
    // The line is full, so a third Arduino cannot be added.
    expect(screen.getByRole("checkbox", { name: "KH-ARD-0003" })).toBeDisabled();
    fireEvent.click(await screen.findByRole("checkbox", { name: "KH-SR04-0003" }));
    expect(screen.getByRole("button", { name: "Check out 3 units for Request #12" })).toBeEnabled();
    expect(fetchDueDatePreview).toHaveBeenCalledWith(3, 7);
  });

  it("TEST-101 (b): a line with fewer available units than its quantity blocks the checkout", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockImplementation(unitsOf([]));
    renderDialog(approvedMulti12);

    expect(await screen.findByText("Only 0 of 1 available. The request cannot be checked out yet.")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("checkbox", { name: "KH-ARD-0001" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "KH-ARD-0002" }));
    expect(confirmButton()).toBeDisabled();
  });

  it("TEST-101 (c): confirm sends the three entries once; the success text lists every asset tag and the due date", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockImplementation(unitsOf(sensors));
    const checkout = vi.spyOn(checkoutApi, "checkoutRequest").mockResolvedValue(checkedOutMulti12);
    const handlers = renderDialog(approvedMulti12);

    fireEvent.click(await screen.findByRole("checkbox", { name: "KH-ARD-0001" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "KH-ARD-0002" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "KH-SR04-0003" }));
    fireEvent.click(screen.getByRole("button", { name: "Check out 3 units for Request #12" }));

    expect(checkout).toHaveBeenCalledTimes(1);
    expect(checkout).toHaveBeenCalledWith(12, {
      units: [
        { lineId: 5, unitId: 1 },
        { lineId: 5, unitId: 2 },
        { lineId: 6, unitId: 23 },
      ],
    });
    await waitFor(() => expect(handlers.onCheckedOut).toHaveBeenCalledWith(checkedOutMulti12));
    expect(checkoutConfirmation(checkedOutMulti12)).toBe(
      "Request #12 checked out: KH-ARD-0001, KH-ARD-0002, KH-SR04-0003, due 7 Dec 2026, 17:00",
    );
  });
});

describe("Checkout dialog: other responses and keyboard (contract F-03 4.3)", () => {
  it("409 INVALID_STATE shows the message and asks the page to reload the list", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    vi.spyOn(checkoutApi, "checkoutRequest").mockRejectedValue(
      new ApiError(409, "INVALID_STATE", "Request #12 cannot be checked out because it is CHECKED_OUT, not APPROVED."),
    );
    const handlers = renderDialog();

    fireEvent.click(await screen.findByRole("checkbox", { name: "KH-ARD-0006" }));
    fireEvent.click(screen.getByRole("button", { name: ONE }));

    expect(await screen.findByRole("alert")).toHaveTextContent("because it is CHECKED_OUT, not APPROVED.");
    expect(handlers.onStale).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Cancel and Escape close the dialog without a checkout call", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    const checkout = vi.spyOn(checkoutApi, "checkoutRequest");
    const handlers = renderDialog();

    await screen.findByRole("checkbox", { name: "KH-ARD-0006" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(handlers.onClose).toHaveBeenCalledTimes(2);
    expect(checkout).not.toHaveBeenCalled();
  });

  it("an error loading the units shows the message and Try again", async () => {
    const fetchUnits = vi
      .spyOn(unitsApi, "fetchUnits")
      .mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "Cannot reach KitHub. Check your connection and try again."))
      .mockResolvedValueOnce(units);
    renderDialog();

    expect(await screen.findByText("Cannot reach KitHub. Check your connection and try again.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("checkbox", { name: "KH-ARD-0006" })).toBeInTheDocument();
    expect(fetchUnits).toHaveBeenCalledTimes(2);
  });
});
