// TEST-121 (AC-121), catalog part: the Manage catalog page and its category and item type forms
// (contract F-09 4.2, 4.3). The app is rendered at /manage with fetch stubbed (F-07 LoansPage
// pattern), so this file imports no page or API module that F-09 adds and its RED run fails on
// assertions. This replaces the vi.mock of client/src/api/manage.ts planned in F-09 8.1: that
// mock cannot load before the module exists.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { errorBody, stubFetch, type FetchStub, type Reply } from "./fetch-stub";
import { borrower, custodian, deferred } from "./render";

const instruments = {
  id: 2,
  name: "Instruments",
  description: "Measuring tools",
  defaultMaxLoanDays: 3,
  defaultMaxQuantity: 1,
  itemTypes: [
    {
      id: 9,
      name: "Digital multimeter",
      description: "Auto-ranging",
      isKit: false,
      maxLoanDays: 3,
      maxQuantityPerRequest: 1,
      availableCount: 3,
    },
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

function renderManage(user: typeof custodian, ...categories: Reply[]) {
  stub.routes["GET /api/auth/me"] = [{ status: 200, body: { user } }];
  stub.routes["GET /api/categories"] = categories;
  return render(
    <MemoryRouter initialEntries={["/manage"]}>
      <App />
    </MemoryRouter>,
  );
}

const ok = (items: unknown[]) => ({ status: 200, body: { items } });
const categoryCalls = () => stub.calls.filter((c) => c === "GET /api/categories").length;

describe("TEST-121 (AC-121): Manage catalog page", () => {
  it("TEST-121 (a): Loading…, then the empty text", async () => {
    const slow = deferred<{ status: number; body?: unknown }>();
    renderManage(custodian, slow.promise);

    expect(await screen.findByRole("heading", { name: "Manage catalog" })).toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await act(async () => slow.resolve(ok([])));
    expect(await screen.findByText("The catalog is empty. Add a category to start.")).toBeInTheDocument();
  });

  it("TEST-121 (a): an error with Try again, which loads again", async () => {
    renderManage(custodian, { status: 500, body: errorBody("INTERNAL_ERROR", "Something went wrong.") }, ok([instruments]));

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Instruments" })).toBeInTheDocument();
    expect(categoryCalls()).toBe(2);
  });

  it("TEST-121 (b): a category with its defaults and an item type row with its limits and count", async () => {
    renderManage(custodian, ok([instruments]));

    const panel = (await screen.findByRole("heading", { name: "Instruments" })).closest("section")!;
    expect(within(panel).getByText("Defaults: 3 days, 1 per request")).toBeInTheDocument();
    const row = within(panel).getByRole("row", { name: /Digital multimeter/ });
    expect(within(row).getByText("3 days")).toBeInTheDocument();
    expect(within(row).getByText("1 per request")).toBeInTheDocument();
    expect(within(row).getByText("3 available")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Units of Digital multimeter" })).toHaveAttribute("href", "/manage/item-types/9");
  });

  it("TEST-121 (c): New item type starts at the category's defaults; saving sends them and refreshes the list", async () => {
    renderManage(custodian, ok([instruments]));
    stub.routes["POST /api/item-types"] = [
      { status: 201, body: { ...instruments.itemTypes[0], id: 10, name: "Oscilloscope", availableCount: 0, category: { id: 2, name: "Instruments" } } },
    ];

    fireEvent.click(await screen.findByRole("button", { name: "New item type in Instruments" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Category")).toHaveValue("2");
    expect(within(dialog).getByLabelText("Maximum loan length (days)")).toHaveValue(3);
    expect(within(dialog).getByLabelText("Maximum per request")).toHaveValue(1);

    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Oscilloscope" } });
    const save = within(dialog).getByRole("button", { name: "Save item type" });
    fireEvent.click(save);
    fireEvent.click(save);

    expect(await screen.findByText("Item type Oscilloscope saved.")).toBeInTheDocument();
    expect(stub.bodies.filter((b) => b.key === "POST /api/item-types")).toEqual([
      {
        key: "POST /api/item-types",
        body: { categoryId: 2, name: "Oscilloscope", description: "", isKit: false, maxLoanDays: 3, maxQuantityPerRequest: 1 },
      },
    ]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(categoryCalls()).toBe(2));
  });

  it("TEST-121 (d): a 409 NAME_TAKEN on save shows the message under the name; the dialog stays open", async () => {
    renderManage(custodian, ok([instruments]));
    stub.routes["POST /api/categories"] = [
      { status: 409, body: errorBody("NAME_TAKEN", "A category named Instruments already exists.") },
    ];

    fireEvent.click(await screen.findByRole("button", { name: "New category" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "instruments" } });
    fireEvent.change(within(dialog).getByLabelText("Default maximum loan length (days)"), { target: { value: "7" } });
    fireEvent.change(within(dialog).getByLabelText("Default maximum quantity"), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save category" }));

    expect(await within(dialog).findByText("A category named Instruments already exists.")).toBeInTheDocument();
    expect(stub.bodies).toEqual([
      { key: "POST /api/categories", body: { name: "instruments", description: null, defaultMaxLoanDays: 7, defaultMaxQuantity: 2 } },
    ]);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
  });

  it("TEST-121 (d): Edit category starts with its values; a blank name is caught on submit with no call", async () => {
    renderManage(custodian, ok([instruments]));

    fireEvent.click(await screen.findByRole("button", { name: "Edit category Instruments" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Instruments");
    expect(within(dialog).getByLabelText("Default maximum loan length (days)")).toHaveValue(3);
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save category" }));

    expect(await within(dialog).findByText("Enter a name.")).toBeInTheDocument();
    expect(stub.calls.filter((c) => c.startsWith("PATCH"))).toEqual([]);
  });

  it("TEST-121 (d): an edit sends only the changed fields, so it never puts back another Custodian's change; no change, no call", async () => {
    renderManage(custodian, ok([instruments]), ok([instruments]), ok([instruments]));
    stub.routes["PATCH /api/item-types/9"] = [
      { status: 200, body: { ...instruments.itemTypes[0], maxQuantityPerRequest: 2, category: { id: 2, name: "Instruments" } } },
    ];
    stub.routes["PATCH /api/categories/2"] = [{ status: 200, body: { ...instruments, description: null } }];

    fireEvent.click(await screen.findByRole("button", { name: "Edit Digital multimeter" }));
    let dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Maximum per request"), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save item type" }));
    expect(await screen.findByText("Item type Digital multimeter saved.")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Edit category Instruments" }));
    dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Description"), { target: { value: "  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save category" }));
    expect(await screen.findByText("Category Instruments saved.")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Edit Digital multimeter" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save item type" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    expect(stub.bodies).toEqual([
      { key: "PATCH /api/item-types/9", body: { maxQuantityPerRequest: 2 } },
      { key: "PATCH /api/categories/2", body: { description: null } },
    ]);
  });

  it("TEST-121 (i): a Borrower who opens /manage sees the Forbidden page and no Manage catalog link", async () => {
    renderManage(borrower, ok([instruments]));

    expect(await screen.findByText("You do not have permission to do this.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage catalog" })).not.toBeInTheDocument();
    expect(categoryCalls()).toBe(0);
  });

  it("TEST-121 (i): a Custodian has the Manage catalog link", async () => {
    renderManage(custodian, ok([instruments]));

    expect(await screen.findByRole("link", { name: "Manage catalog" })).toHaveAttribute("href", "/manage");
  });
});
