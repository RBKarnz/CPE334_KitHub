// TEST-71 (AC-71): the new request form (contract F-04 4.3). The app is rendered with fetch stubbed,
// as ItemTypePage.test.tsx, so this file imports no module that F-04 adds and RED fails on
// assertions. Catalog: Arduino Uno R3 (14 days, max 2, 3 available), HC-SR04 (14, 4, 5),
// Digital multimeter (3, 1, 3), plus seven more item types for the ten-line case.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { errorBody, stubFetch, type FetchStub } from "./fetch-stub";
import { borrower, custodian, deferred } from "./render";

const itemType = (id: number, name: string, maxLoanDays: number, maxQuantityPerRequest: number, availableCount: number) => ({
  id,
  name,
  description: "",
  isKit: false,
  maxLoanDays,
  maxQuantityPerRequest,
  availableCount,
});
const boards = {
  id: 1,
  name: "Microcontroller boards",
  description: null,
  defaultMaxLoanDays: 14,
  defaultMaxQuantity: 2,
  itemTypes: [itemType(3, "Arduino Uno R3", 14, 2, 3)],
};
const sensors = {
  id: 2,
  name: "Sensors",
  description: null,
  defaultMaxLoanDays: 14,
  defaultMaxQuantity: 4,
  itemTypes: [itemType(7, "HC-SR04 ultrasonic sensor", 14, 4, 5)],
};
const instruments = {
  id: 6,
  name: "Instruments",
  description: null,
  defaultMaxLoanDays: 3,
  defaultMaxQuantity: 1,
  itemTypes: [itemType(9, "Digital multimeter", 3, 1, 3)],
};
const extra = {
  id: 7,
  name: "Extras",
  description: null,
  defaultMaxLoanDays: 14,
  defaultMaxQuantity: 2,
  itemTypes: [20, 21, 22, 23, 24, 25, 26].map((id) => itemType(id, `Extra kit ${id}`, 14, 2, 2)),
};
const catalog = [boards, sensors, instruments];

const created12 = {
  id: 12,
  status: "PENDING",
  createdAt: "2026-11-30T03:00:00.000Z",
  loanDays: 3,
  decidedAt: null,
  rejectionReason: null,
  dueAt: null,
  borrower: { id: 3, username: "borrower1", displayName: "Borrower One" },
  lines: [
    { id: 20, itemType: { id: 3, name: "Arduino Uno R3" }, quantity: 1, loans: [] },
    { id: 21, itemType: { id: 9, name: "Digital multimeter" }, quantity: 1, loans: [] },
  ],
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

function renderAt(path: string, categories: unknown[] = catalog, user = borrower) {
  stub.routes["GET /api/auth/me"] = [{ status: 200, body: { user } }];
  stub.routes["GET /api/categories"] = [{ status: 200, body: { items: categories } }];
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

const itemTypeSelect = (n: number) => screen.getByRole("combobox", { name: `Item type for line ${n}` });
const quantitySelect = (n: number) => screen.getByRole("combobox", { name: `Quantity for line ${n}` });
const loanLength = () => screen.getByRole("spinbutton", { name: "Loan length (days)" });
const submit = () => screen.getByRole("button", { name: "Submit request" });
const optionValues = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => (o as HTMLOptionElement).value);
/** The heading shows while the item types load; the form is ready when line 1 is there. */
const formReady = async () => {
  expect(await screen.findByRole("heading", { level: 1, name: "New request" })).toBeInTheDocument();
  await screen.findByRole("combobox", { name: "Item type for line 1" });
};
const posts = () => stub.bodies.filter((b) => b.key === "POST /api/requests").map((b) => b.body);

describe("TEST-71 (AC-71): new request form", () => {
  it("TEST-71 (a): ?itemTypeId=3 starts with Arduino × 1, loan length 14, quantities 1 to 2", async () => {
    renderAt("/requests/new?itemTypeId=3");

    await formReady();
    expect(itemTypeSelect(1)).toHaveValue("3");
    expect(quantitySelect(1)).toHaveValue("1");
    expect(optionValues(quantitySelect(1))).toEqual(["1", "2"]);
    expect(loanLength()).toHaveValue(14);
    expect(screen.getByText("Loan length: up to 14 days (limited by Arduino Uno R3)")).toBeInTheDocument();
  });

  it("TEST-71 (b), (c), (d): a shorter maximum keeps the value with a field error; 3 days submits once and opens the request", async () => {
    renderAt("/requests/new?itemTypeId=3");
    await formReady();

    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    fireEvent.change(itemTypeSelect(2), { target: { value: "9" } });

    expect(loanLength()).toHaveValue(14);
    expect(screen.getByText("At most 3 days")).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    expect(screen.getByText("Loan length: up to 3 days (limited by Digital multimeter)")).toBeInTheDocument();
    expect(screen.getByText("Need Arduino Uno R3 for longer? Submit it as a separate request.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add line" }));
    expect(optionValues(itemTypeSelect(3))).not.toContain("9");
    expect(optionValues(itemTypeSelect(3))).not.toContain("3");
    fireEvent.click(screen.getByRole("button", { name: "Remove line 3" }));

    fireEvent.change(loanLength(), { target: { value: "7" } });
    expect(screen.getByText("At most 3 days")).toBeInTheDocument();
    expect(submit()).toBeDisabled();

    fireEvent.change(loanLength(), { target: { value: "3" } });
    expect(screen.queryByText("At most 3 days")).not.toBeInTheDocument();
    const slow = deferred<{ status: number; body?: unknown }>();
    stub.routes["POST /api/requests"] = [slow.promise];
    stub.routes["GET /api/requests/12"] = [{ status: 200, body: created12 }];
    fireEvent.click(submit());
    fireEvent.click(submit());
    await act(async () => slow.resolve({ status: 201, body: created12 }));

    expect(await screen.findByText("Request #12 submitted.")).toBeInTheDocument();
    expect(posts()).toEqual([
      {
        lines: [
          { itemTypeId: 3, quantity: 1 },
          { itemTypeId: 9, quantity: 1 },
        ],
        loanDays: 3,
      },
    ]);
  });

  it("TEST-71 (e): a 409 is an alert with the API message; the lines stay and the item types load again", async () => {
    renderAt("/requests/new?itemTypeId=3");
    await formReady();
    stub.routes["POST /api/requests"] = [
      { status: 409, body: errorBody("ITEM_TYPE_UNAVAILABLE", "Arduino Uno R3 has only 1 available unit; you asked for 2.") },
    ];
    fireEvent.change(quantitySelect(1), { target: { value: "2" } });
    fireEvent.click(submit());

    expect(await screen.findByRole("alert")).toHaveTextContent("Arduino Uno R3 has only 1 available unit; you asked for 2.");
    expect(itemTypeSelect(1)).toHaveValue("3");
    expect(quantitySelect(1)).toHaveValue("2");
    await waitFor(() => expect(stub.calls.filter((c) => c === "GET /api/categories").length).toBe(2));
  });

  it("TEST-71 (f): Add line is hidden at 10 lines; Remove is hidden with one line", async () => {
    renderAt("/requests/new", [...catalog, extra]);
    await formReady();
    expect(screen.queryByRole("button", { name: "Remove line 1" })).not.toBeInTheDocument();

    for (let n = 2; n <= 10; n++) fireEvent.click(screen.getByRole("button", { name: "Add line" }));

    expect(screen.getAllByRole("combobox", { name: /^Item type for line / })).toHaveLength(10);
    expect(screen.queryByRole("button", { name: "Add line" })).not.toBeInTheDocument();
    expect(submit()).toBeDisabled();
  });

  it("TEST-71 (g): from the catalog, Request on Arduino and Submit request: 2 clicks, one create", async () => {
    renderAt("/catalog");
    stub.routes["POST /api/requests"] = [{ status: 201, body: { ...created12, loanDays: 14, lines: [created12.lines[0]] } }];
    stub.routes["GET /api/requests/12"] = [{ status: 200, body: { ...created12, loanDays: 14, lines: [created12.lines[0]] } }];

    fireEvent.click(await screen.findByRole("button", { name: "Request Arduino Uno R3" }));
    fireEvent.click(await screen.findByRole("button", { name: "Submit request" }));

    expect(await screen.findByText("Request #12 submitted.")).toBeInTheDocument();
    expect(posts()).toEqual([{ lines: [{ itemTypeId: 3, quantity: 1 }], loanDays: 14 }]);
  });

  it("TEST-71: the Borrower navigation has New request; a Custodian at /requests/new sees the Forbidden page", async () => {
    renderAt("/catalog");
    expect(await screen.findByRole("link", { name: "New request" })).toHaveAttribute("href", "/requests/new");
    cleanup();

    stub = stubFetch();
    renderAt("/requests/new", catalog, custodian);
    expect(await screen.findByText("You do not have permission to do this.")).toBeInTheDocument();
  });
});
