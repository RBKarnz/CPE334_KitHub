// TEST-49 (AC-49): the checkout dialog (contract F-03 4.3). The units, checkout and requests API
// modules are mocked.
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as checkoutApi from "../src/api/checkout";
import { ApiError } from "../src/api/client";
import * as requestsApi from "../src/api/requests";
import type { BorrowRequest } from "../src/api/requests";
import * as unitsApi from "../src/api/units";
import type { UnitSummary } from "../src/api/units";
import { CheckoutDialog } from "../src/pages/pending/CheckoutDialog";
import { PendingRequestsPage } from "../src/pages/pending/PendingRequestsPage";
import { checkedOut12, pending12 } from "./fixtures";
import { custodian, deferred, renderAs } from "./render";

const units: UnitSummary[] = [
  { id: 6, assetTag: "KH-ARD-0006", status: "AVAILABLE" },
  { id: 7, assetTag: "KH-ARD-0007", status: "AVAILABLE" },
];

afterEach(() => vi.restoreAllMocks());

function renderDialog() {
  const handlers = { onClose: vi.fn(), onCheckedOut: vi.fn(), onStale: vi.fn() };
  renderAs(custodian, <CheckoutDialog request={pending12} {...handlers} />);
  return handlers;
}

const confirmButton = () => screen.getByRole("button", { name: /^Check out/ });

describe("TEST-49 (AC-49): checkout dialog", () => {
  it("TEST-49 (a): lists the AVAILABLE units of the line's item type; confirm is disabled until one is chosen", async () => {
    const fetchUnits = vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    renderDialog();

    const dialog = await screen.findByRole("dialog", { name: "Check out Request #12" });
    expect(dialog).toHaveTextContent("Borrower One (borrower1) · Arduino Uno R3");
    expect(await screen.findByRole("radio", { name: "KH-ARD-0006" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "KH-ARD-0007" })).toBeInTheDocument();
    expect(fetchUnits).toHaveBeenCalledWith(3, "AVAILABLE");
    expect(confirmButton()).toBeDisabled();
  });

  it("TEST-49 (b): the confirm button names the unit and request; a double click sends one call", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    const slow = deferred<BorrowRequest>();
    const checkout = vi.spyOn(checkoutApi, "checkoutRequest").mockReturnValue(slow.promise);
    renderDialog();

    fireEvent.click(await screen.findByRole("radio", { name: "KH-ARD-0007" }));
    const button = screen.getByRole("button", { name: "Check out KH-ARD-0007 for Request #12" });
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

    expect(
      await screen.findByText("No unit of Arduino Uno R3 is available. The request stays pending."),
    ).toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole("radio", { name: "KH-ARD-0007" }));
    fireEvent.click(screen.getByRole("button", { name: "Check out KH-ARD-0007 for Request #12" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unit KH-ARD-0007 is not available for checkout.");
    await waitFor(() => expect(fetchUnits).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(handlers.onCheckedOut).not.toHaveBeenCalled();
    await screen.findByRole("radio", { name: "KH-ARD-0007" });
    expect(screen.getByRole("radio", { name: "KH-ARD-0007" })).not.toBeChecked();
    expect(confirmButton()).toBeDisabled();
  });

  it("TEST-49 (e): on success the dialog closes, shows asset tag and due date, and the pending list is fetched again", async () => {
    const fetchPending = vi
      .spyOn(requestsApi, "fetchPendingRequests")
      .mockResolvedValueOnce([pending12])
      .mockResolvedValueOnce([]);
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    vi.spyOn(checkoutApi, "checkoutRequest").mockResolvedValue(checkedOut12);
    renderAs(custodian, <PendingRequestsPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Check out Request #12" }));
    fireEvent.click(await screen.findByRole("radio", { name: "KH-ARD-0007" }));
    fireEvent.click(screen.getByRole("button", { name: "Check out KH-ARD-0007 for Request #12" }));

    expect(await screen.findByText("Request #12 checked out: KH-ARD-0007, due 20 Nov 2026, 14:30")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchPending).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No pending requests.")).toBeInTheDocument();
  });

  it("TEST-49 (e): the dialog passes the checked-out request to onCheckedOut", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    vi.spyOn(checkoutApi, "checkoutRequest").mockResolvedValue(checkedOut12);
    const handlers = renderDialog();

    fireEvent.click(await screen.findByRole("radio", { name: "KH-ARD-0007" }));
    fireEvent.click(screen.getByRole("button", { name: "Check out KH-ARD-0007 for Request #12" }));

    await waitFor(() => expect(handlers.onCheckedOut).toHaveBeenCalledWith(checkedOut12));
  });
});

describe("Checkout dialog: other responses and keyboard (contract F-03 4.3)", () => {
  it("409 INVALID_STATE shows the message and asks the page to reload the pending list", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    vi.spyOn(checkoutApi, "checkoutRequest").mockRejectedValue(
      new ApiError(409, "INVALID_STATE", "Request #12 cannot be checked out because it is CHECKED_OUT, not PENDING."),
    );
    const handlers = renderDialog();

    fireEvent.click(await screen.findByRole("radio", { name: "KH-ARD-0006" }));
    fireEvent.click(screen.getByRole("button", { name: "Check out KH-ARD-0006 for Request #12" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("because it is CHECKED_OUT, not PENDING.");
    expect(handlers.onStale).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Cancel and Escape close the dialog without a checkout call", async () => {
    vi.spyOn(unitsApi, "fetchUnits").mockResolvedValue(units);
    const checkout = vi.spyOn(checkoutApi, "checkoutRequest");
    const handlers = renderDialog();

    await screen.findByRole("radio", { name: "KH-ARD-0006" });
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
    expect(await screen.findByRole("radio", { name: "KH-ARD-0006" })).toBeInTheDocument();
    expect(fetchUnits).toHaveBeenCalledTimes(2);
  });
});
