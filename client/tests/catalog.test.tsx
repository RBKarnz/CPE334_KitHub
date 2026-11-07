// Catalog page: TEST-17 (catalog states) and TEST-40 (Request action), contract F-02 8.2.
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as catalogApi from "../src/api/catalog";
import type { CatalogCategory } from "../src/api/catalog";
import { ApiError } from "../src/api/client";
import * as requestsApi from "../src/api/requests";
import type { BorrowRequest } from "../src/api/requests";
import { CatalogPage } from "../src/pages/CatalogPage";
import { borrower, custodian, deferred, renderAs } from "./render";

const catalog: CatalogCategory[] = [
  {
    id: 1,
    name: "Instruments",
    description: null,
    itemTypes: [
      { id: 10, name: "Oscilloscope", description: "", isKit: false, maxLoanDays: 3, maxQuantityPerRequest: 1, availableCount: 0 },
    ],
  },
  {
    id: 2,
    name: "Microcontroller boards",
    description: null,
    itemTypes: [
      { id: 3, name: "Arduino Uno R3", description: "", isKit: false, maxLoanDays: 14, maxQuantityPerRequest: 2, availableCount: 2 },
    ],
  },
];

const created = { id: 12, status: "PENDING" } as BorrowRequest;

afterEach(() => vi.restoreAllMocks());

describe("TEST-17 (AC-17): catalog loading, empty and error states", () => {
  it("TEST-17: shows Loading… until the slow response arrives", async () => {
    const slow = deferred<CatalogCategory[]>();
    vi.spyOn(catalogApi, "fetchCategories").mockReturnValue(slow.promise);
    renderAs(borrower, <CatalogPage />);

    expect(await screen.findByText("Loading…")).toBeInTheDocument();
    await act(async () => slow.resolve(catalog));
    expect(await screen.findByText("Arduino Uno R3")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("TEST-17: an empty catalog shows its message", async () => {
    vi.spyOn(catalogApi, "fetchCategories").mockResolvedValue([]);
    renderAs(borrower, <CatalogPage />);

    expect(await screen.findByText("The catalog is empty.")).toBeInTheDocument();
  });

  it("TEST-17: an error shows the API message, and Try again calls the API again", async () => {
    const fetch = vi
      .spyOn(catalogApi, "fetchCategories")
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "Something went wrong."))
      .mockResolvedValueOnce(catalog);
    renderAs(borrower, <CatalogPage />);

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Arduino Uno R3")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("TEST-40 (AC-40): the Request action", () => {
  it("TEST-40: a 0-available item type has a disabled button and 'None available'", async () => {
    vi.spyOn(catalogApi, "fetchCategories").mockResolvedValue(catalog);
    renderAs(borrower, <CatalogPage />);

    const row = (await screen.findByText("Oscilloscope")).closest("li")!;
    expect(within(row).getByText("None available")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Request Oscilloscope" })).toBeDisabled();
    const arduino = screen.getByText("Arduino Uno R3").closest("li")!;
    expect(within(arduino).getByText("2 available")).toBeInTheDocument();
  });

  it("TEST-40: a double press sends one request, shows the confirmation and refetches the catalog", async () => {
    const fetch = vi.spyOn(catalogApi, "fetchCategories").mockResolvedValue(catalog);
    const pending = deferred<BorrowRequest>();
    const create = vi.spyOn(requestsApi, "createRequest").mockReturnValue(pending.promise);
    renderAs(borrower, <CatalogPage />);

    const button = await screen.findByRole("button", { name: "Request Arduino Uno R3" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    await act(async () => pending.resolve(created));

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(3);
    expect(await screen.findByText(/Request #12 submitted/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See My requests" })).toHaveAttribute("href", "/requests");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("TEST-40: a 409 shows the API message as an alert and refetches the catalog", async () => {
    const fetch = vi.spyOn(catalogApi, "fetchCategories").mockResolvedValue(catalog);
    vi.spyOn(requestsApi, "createRequest").mockRejectedValue(
      new ApiError(409, "DUPLICATE_OPEN_REQUEST", "You already have an open request for Arduino Uno R3 (Request #9)."),
    );
    renderAs(borrower, <CatalogPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Request Arduino Uno R3" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You already have an open request for Arduino Uno R3 (Request #9).",
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("TEST-40: a Custodian sees the catalog without Request buttons", async () => {
    vi.spyOn(catalogApi, "fetchCategories").mockResolvedValue(catalog);
    renderAs(custodian, <CatalogPage />);

    expect(await screen.findByText("Arduino Uno R3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Request / })).not.toBeInTheDocument();
  });
});
