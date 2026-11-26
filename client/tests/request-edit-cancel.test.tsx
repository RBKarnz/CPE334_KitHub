// TEST-79 (AC-79): Edit and Cancel on the Borrower's request (contract F-05 4.2 to 4.4). The app is
// rendered with fetch stubbed, as the F-04 and F-09 UI tests, so this file imports no module that
// F-05 adds and RED fails on assertions (F-05 8.1 planned a vi.mock of the requests module).
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
const catalog = [
  { id: 1, name: "Microcontroller boards", description: null, defaultMaxLoanDays: 14, defaultMaxQuantity: 2, itemTypes: [itemType(3, "Arduino Uno R3", 14, 2, 3)] },
  { id: 6, name: "Instruments", description: null, defaultMaxLoanDays: 3, defaultMaxQuantity: 1, itemTypes: [itemType(9, "Digital multimeter", 3, 1, 3)] },
];

const request12 = (over: object = {}) => ({
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
  ...over,
});

let stub: FetchStub;

beforeEach(() => {
  stub = stubFetch();
});
// Unmount first, then remove the stub: a page still mounted must never call a removed stub.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path: string, user = borrower) {
  stub.routes["GET /api/auth/me"] = [{ status: 200, body: { user } }];
  stub.routes["GET /api/categories"] = [{ status: 200, body: { items: catalog } }];
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

const detailCalls = () => stub.calls.filter((c) => c === "GET /api/requests/12").length;
const posts = (key: string) => stub.bodies.filter((b) => b.key === key).map((b) => b.body);
const heading = (name: string) => screen.findByRole("heading", { level: 1, name });

describe("TEST-79 (AC-79): Edit and Cancel on the Borrower's request", () => {
  it.each([
    ["PENDING", ["Edit request"], ["Cancel request"]],
    ["APPROVED", [], ["Cancel request"]],
    ["CHECKED_OUT", [], []],
  ])("TEST-79 (a): the Borrower's %s request shows the right controls", async (status, links, buttons) => {
    stub.routes["GET /api/requests/12"] = [{ status: 200, body: request12({ status, ...(status !== "PENDING" ? { decidedAt: "2026-11-30T04:00:00.000Z" } : {}) }) }];
    renderAt("/requests/12");

    expect(await screen.findByText(/^Created /)).toBeInTheDocument();
    expect(screen.queryAllByRole("link", { name: "Edit request" }).map((l) => l.textContent)).toEqual(links);
    if (links.length > 0) expect(screen.getByRole("link", { name: "Edit request" })).toHaveAttribute("href", "/requests/12/edit");
    expect(screen.queryAllByRole("button", { name: "Cancel request" }).map((b) => b.textContent)).toEqual(buttons);
  });

  it("TEST-79 (b): a Custodian sees neither control on a PENDING request", async () => {
    stub.routes["GET /api/requests/12"] = [{ status: 200, body: { ...request12(), decidedBy: null, history: [] } }];
    renderAt("/requests/12", custodian);

    expect(await screen.findByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
  });

  it("TEST-79 (c): the edit page starts with the request; Save is enabled after a change and sends one PATCH; back with \"updated\"", async () => {
    stub.routes["GET /api/requests/12"] = [{ status: 200, body: request12() }, { status: 200, body: request12({ loanDays: 2 }) }];
    const slow = deferred<{ status: number; body?: unknown }>();
    stub.routes["PATCH /api/requests/12"] = [slow.promise];
    renderAt("/requests/12/edit");

    expect(await heading("Edit Request #12")).toBeInTheDocument();
    const loan = await screen.findByRole("spinbutton", { name: "Loan length (days)" });
    expect(loan).toHaveValue(3);
    expect(screen.getByRole("combobox", { name: "Item type for line 1" })).toHaveValue("3");
    expect(screen.getByRole("combobox", { name: "Item type for line 2" })).toHaveValue("9");
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();

    fireEvent.change(loan, { target: { value: "2" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    fireEvent.click(save);
    await act(async () => slow.resolve({ status: 200, body: request12({ loanDays: 2 }) }));

    expect(await screen.findByText("Request #12 updated.")).toBeInTheDocument();
    expect(posts("PATCH /api/requests/12")).toEqual([
      {
        lines: [
          { itemTypeId: 3, quantity: 1 },
          { itemTypeId: 9, quantity: 1 },
        ],
        loanDays: 2,
      },
    ]);
  });

  it("TEST-79 (d): the edit page of an APPROVED request says it can no longer be edited; no form", async () => {
    stub.routes["GET /api/requests/12"] = [{ status: 200, body: request12({ status: "APPROVED", decidedAt: "2026-11-30T04:00:00.000Z" }) }];
    renderAt("/requests/12/edit");

    expect(await screen.findByText("Request #12 can no longer be edited because it is APPROVED.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Request #12" })).toHaveAttribute("href", "/requests/12");
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("TEST-79 (e), (f): Keep request sends nothing; Cancel request sends one call and shows \"cancelled\"", async () => {
    stub.routes["GET /api/requests/12"] = [{ status: 200, body: request12() }, { status: 200, body: request12({ status: "CANCELLED" }) }];
    renderAt("/requests/12");

    fireEvent.click(await screen.findByRole("button", { name: "Cancel request" }));
    let dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Cancel Request #12? You cannot undo this.");
    expect(dialog).toHaveTextContent("Arduino Uno R3 × 1");
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep request" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(stub.calls.filter((c) => c.startsWith("POST"))).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
    dialog = screen.getByRole("dialog");
    const slow = deferred<{ status: number; body?: unknown }>();
    stub.routes["POST /api/requests/12/cancel"] = [slow.promise];
    const confirm = within(dialog).getByRole("button", { name: "Cancel request" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await act(async () => slow.resolve({ status: 200, body: request12({ status: "CANCELLED" }) }));

    expect(await screen.findByText("Request #12 cancelled.")).toBeInTheDocument();
    expect(stub.calls.filter((c) => c.startsWith("POST"))).toEqual(["POST /api/requests/12/cancel"]);
    expect(posts("POST /api/requests/12/cancel")).toEqual([{}]);
    await waitFor(() => expect(detailCalls()).toBe(2));
  });

  it("TEST-79 (g): a 409 on cancel is an alert with the API message", async () => {
    stub.routes["GET /api/requests/12"] = [{ status: 200, body: request12({ status: "APPROVED", decidedAt: "2026-11-30T04:00:00.000Z" }) }];
    stub.routes["POST /api/requests/12/cancel"] = [
      { status: 409, body: errorBody("INVALID_STATE", "Request #12 cannot be cancelled because it is CHECKED_OUT.") },
    ];
    renderAt("/requests/12");

    fireEvent.click(await screen.findByRole("button", { name: "Cancel request" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Request #12 cannot be cancelled because it is CHECKED_OUT.");
  });

  it("TEST-79 (h), (i): the edit page shows Loading…, and a 404 shows \"Request not found.\" with a link to My requests", async () => {
    const slow = deferred<{ status: number; body?: unknown }>();
    stub.routes["GET /api/requests/12"] = [slow.promise];
    renderAt("/requests/12/edit");

    await screen.findByRole("link", { name: "My requests" });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await act(async () => slow.resolve({ status: 404, body: errorBody("NOT_FOUND", "Request 12 does not exist.") }));

    expect(await screen.findByText("Request not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to My requests" })).toHaveAttribute("href", "/requests");
  });

  it("TEST-79 (j): an approved request that was cancelled shows Cancelled, its decision line and no controls", async () => {
    stub.routes["GET /api/requests/12"] = [{ status: 200, body: request12({ status: "CANCELLED", decidedAt: "2026-11-30T04:00:00.000Z" }) }];
    renderAt("/requests/12");

    expect(await screen.findByText(/^Approved /)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cancelled");
    expect(screen.queryByRole("link", { name: "Edit request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
  });

  it("TEST-79: a Custodian at /requests/12/edit sees the Forbidden page", async () => {
    renderAt("/requests/12/edit", custodian);
    expect(await screen.findByText("You do not have permission to do this.")).toBeInTheDocument();
  });
});
