// Catalog page: TEST-17 (catalog states) and TEST-40 (Request action), contract F-02 8.2; TEST-40
// revised and TEST-63 (g) added by F-04 (contract F-04 8.2, 8.4).
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as authApi from "../src/api/auth";
import * as catalogApi from "../src/api/catalog";
import type { CatalogCategory } from "../src/api/catalog";
import { ApiError } from "../src/api/client";
import * as requestsApi from "../src/api/requests";
import type { BorrowRequest } from "../src/api/requests";
import { AuthProvider } from "../src/auth/AuthProvider";
import { CatalogPage } from "../src/pages/CatalogPage";
import { borrower, custodian, deferred, renderAs } from "./render";

const catalog: CatalogCategory[] = [
  {
    id: 1,
    name: "Instruments",
    description: null,
    // F-09 (F09-D9): GET /api/categories also returns the category default limits.
    defaultMaxLoanDays: 3,
    defaultMaxQuantity: 1,
    itemTypes: [
      { id: 10, name: "Oscilloscope", description: "", isKit: false, maxLoanDays: 3, maxQuantityPerRequest: 1, availableCount: 0 },
    ],
  },
  {
    id: 2,
    name: "Microcontroller boards",
    description: null,
    defaultMaxLoanDays: 14,
    defaultMaxQuantity: 2,
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

// TEST-40 revised by F-04 (F04-D5, contract F-04 8.4): Request opens the new request form with the
// item type instead of sending the request. The one-call double press, the submitted message and the
// 409 alert move to TEST-71 (d), (e) and (g) (client/tests/NewRequestPage.test.tsx).
function renderCatalogWithForm(user: typeof borrower) {
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(user);
  function FormProbe() {
    const location = useLocation();
    return <div>new request form at {location.pathname + location.search}</div>;
  }
  return render(
    <MemoryRouter initialEntries={["/catalog"]}>
      <AuthProvider>
        <Routes>
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/requests/new" element={<FormProbe />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

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

  it("TEST-40: Request opens the new request form with the item type and sends no request", async () => {
    vi.spyOn(catalogApi, "fetchCategories").mockResolvedValue(catalog);
    const create = vi.spyOn(requestsApi, "createRequest");
    renderCatalogWithForm(borrower);

    fireEvent.click(await screen.findByRole("button", { name: "Request Arduino Uno R3" }));

    expect(await screen.findByText("new request form at /requests/new?itemTypeId=3")).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("TEST-40: a Custodian sees the catalog without Request buttons", async () => {
    vi.spyOn(catalogApi, "fetchCategories").mockResolvedValue(catalog);
    renderAs(custodian, <CatalogPage />);

    expect(await screen.findByText("Arduino Uno R3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Request / })).not.toBeInTheDocument();
  });
});

describe("TEST-63 (g) (AC-63): the catalog links each item type to its detail", () => {
  it("TEST-63 (g): the item type name links to /catalog/item-types/:id", async () => {
    vi.spyOn(catalogApi, "fetchCategories").mockResolvedValue(catalog);
    renderAs(borrower, <CatalogPage />);

    expect(await screen.findByRole("link", { name: "Arduino Uno R3" })).toHaveAttribute("href", "/catalog/item-types/3");
  });
});
