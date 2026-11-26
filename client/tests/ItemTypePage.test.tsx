// TEST-63 (AC-63) (a) to (f): the item type detail page (contract F-04 4.2). The app is rendered at
// /catalog/item-types/9 with fetch stubbed (F-07 LoansPage pattern, as F-09's UI tests), so this file
// imports no page or API function that F-04 adds and its RED run fails on assertions. This replaces
// the vi.mock of the catalog module planned in F-04 8.2, which cannot mock getItemType before it exists.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { errorBody, stubFetch, type FetchStub, type Reply } from "./fetch-stub";
import { borrower, custodian, deferred } from "./render";

const multimeter = {
  id: 9,
  name: "Digital multimeter",
  description: "Handheld digital multimeter.",
  isKit: false,
  maxLoanDays: 3,
  maxQuantityPerRequest: 1,
  availableCount: 3,
  category: { id: 6, name: "Instruments" },
};

let stub: FetchStub;

beforeEach(() => {
  stub = stubFetch();
});
// Unmount first, then remove the stub: a page still mounted must never call a removed stub.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDetail(user: typeof borrower, ...replies: Reply[]) {
  stub.routes["GET /api/auth/me"] = [{ status: 200, body: { user } }];
  stub.routes["GET /api/item-types/9"] = replies;
  return render(
    <MemoryRouter initialEntries={["/catalog/item-types/9"]}>
      <App />
    </MemoryRouter>,
  );
}

const detailCalls = () => stub.calls.filter((c) => c === "GET /api/item-types/9").length;

describe("TEST-63 (AC-63): item type detail", () => {
  it("TEST-63 (a), (b): Loading…, then the name, category, description, limits, count and the Request link", async () => {
    const slow = deferred<{ status: number; body?: unknown }>();
    renderDetail(borrower, slow.promise);

    // The sign-in check shows its own "Loading…" first; the page's comes after the navigation bar.
    await screen.findByRole("link", { name: "My requests" });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await act(async () => slow.resolve({ status: 200, body: multimeter }));

    expect(await screen.findByRole("heading", { level: 1, name: "Digital multimeter" })).toBeInTheDocument();
    expect(screen.getByText("Instruments")).toBeInTheDocument();
    expect(screen.getByText("Handheld digital multimeter.")).toBeInTheDocument();
    expect(screen.getByText("Maximum loan length: 3 days")).toBeInTheDocument();
    expect(screen.getByText("Maximum per request: 1")).toBeInTheDocument();
    expect(screen.getByText("3 available")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request" })).toHaveAttribute("href", "/requests/new?itemTypeId=9");
  });

  it("TEST-63 (c): a Custodian sees no Request", async () => {
    renderDetail(custodian, { status: 200, body: multimeter });

    expect(await screen.findByRole("heading", { level: 1, name: "Digital multimeter" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request" })).not.toBeInTheDocument();
  });

  it("TEST-63 (d): none available: Request disabled and \"None available\"", async () => {
    renderDetail(borrower, { status: 200, body: { ...multimeter, availableCount: 0 } });

    expect(await screen.findByText("None available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Request" })).not.toBeInTheDocument();
  });

  it("TEST-63 (e): a 404 shows \"Item type not found.\" with a link to the catalog", async () => {
    renderDetail(borrower, { status: 404, body: errorBody("NOT_FOUND", "Item type 9 does not exist.") });

    expect(await screen.findByText("Item type not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Catalog" })).toHaveAttribute("href", "/catalog");
  });

  it("TEST-63 (f): another error shows the message and Try again, which calls again", async () => {
    renderDetail(borrower, { status: 500, body: errorBody("INTERNAL_ERROR", "Something went wrong.") }, { status: 200, body: multimeter });

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Digital multimeter" })).toBeInTheDocument();
    expect(detailCalls()).toBe(2);
  });
});
