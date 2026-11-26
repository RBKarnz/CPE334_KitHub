// TEST-121 (AC-121), units part: the units page of an item type, add unit, Mark repaired and Retire
// (contract F-09 4.4). The app is rendered at /manage/item-types/9 with fetch stubbed, as
// ManageCatalogPage.test.tsx, so this file imports no module that F-09 adds.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { errorBody, stubFetch, type FetchStub, type Reply } from "./fetch-stub";
import { custodian, deferred } from "./render";

const multimeter = { id: 9, name: "Digital multimeter", description: "", isKit: false, maxLoanDays: 3, maxQuantityPerRequest: 1, availableCount: 1 };
const instruments = { id: 2, name: "Instruments", description: null, defaultMaxLoanDays: 3, defaultMaxQuantity: 1, itemTypes: [multimeter] };

const unit = (id: number, assetTag: string, status: string) => ({ id, assetTag, status });
const units = [
  unit(1, "KH-DMM-0001", "AVAILABLE"),
  unit(2, "KH-DMM-0002", "MAINTENANCE"),
  unit(3, "KH-DMM-0003", "ON_LOAN"),
  unit(5, "KH-DMM-0005", "RETIRED"),
];
const managed = (u: { id: number; assetTag: string; status: string }) => ({ ...u, itemType: { id: 9, name: "Digital multimeter" } });

let stub: FetchStub;

beforeEach(() => {
  stub = stubFetch();
});
// Unmount first, then remove the stub: a page still mounted must never call a removed stub.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ok = (items: unknown[]) => ({ status: 200, body: { items } });

function renderUnits(unitReplies: Reply[], categories: Reply[] = [ok([instruments])], at = "/manage/item-types/9") {
  stub.routes["GET /api/auth/me"] = [{ status: 200, body: { user: custodian } }];
  stub.routes["GET /api/categories"] = categories;
  stub.routes["GET /api/item-types/9/units"] = unitReplies;
  return render(
    <MemoryRouter initialEntries={[at]}>
      <App />
    </MemoryRouter>,
  );
}

const rowOf = (assetTag: string) => screen.getByRole("row", { name: new RegExp(assetTag) });
const unitCalls = () => stub.calls.filter((c) => c === "GET /api/item-types/9/units").length;

describe("TEST-121 (AC-121): units of an item type", () => {
  it("TEST-121 (e): Loading…, then the header and every unit with its state; actions only where allowed", async () => {
    const slow = deferred<{ status: number; body?: unknown }>();
    renderUnits([slow.promise]);

    // The sign-in check shows its own "Loading…" first; the page's comes after the navigation bar.
    await screen.findByRole("link", { name: "Manage catalog" });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await act(async () => slow.resolve(ok(units)));

    expect(await screen.findByRole("heading", { name: "Digital multimeter" })).toBeInTheDocument();
    expect(screen.getByText("Instruments · 3 days · 1 per request · 1 available")).toBeInTheDocument();

    const expected: [string, string, string[]][] = [
      ["KH-DMM-0001", "Available", ["Retire KH-DMM-0001"]],
      ["KH-DMM-0002", "Maintenance", ["Mark KH-DMM-0002 repaired", "Retire KH-DMM-0002"]],
      ["KH-DMM-0003", "On loan", []],
      ["KH-DMM-0005", "Retired", []],
    ];
    for (const [tag, state, buttons] of expected) {
      const row = rowOf(tag);
      expect(row).toHaveTextContent(state);
      expect(within(row).queryAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(buttons);
    }
  });

  it("TEST-121 (e): no units yet; an unknown item type shows not found with a link back", async () => {
    renderUnits([ok([])]);
    expect(await screen.findByText("No units yet.")).toBeInTheDocument();
    cleanup();

    stub = stubFetch();
    renderUnits([{ status: 404, body: errorBody("NOT_FOUND", "Item type 9 does not exist.") }], [ok([])]);
    expect(await screen.findByText("Item type not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Manage catalog" })).toHaveAttribute("href", "/manage");
  });

  it("TEST-121 (f): Add unit sends the text as typed once, shows the stored tag, clears the field and reloads", async () => {
    renderUnits([ok(units)]);
    stub.routes["POST /api/item-types/9/units"] = [{ status: 201, body: managed(unit(44, "KH-DMM-0004", "AVAILABLE")) }];

    const field = await screen.findByLabelText("Asset tag");
    expect(field).toHaveAttribute("placeholder", "KH-ARD-0006");
    fireEvent.change(field, { target: { value: "kh-dmm-0004" } });
    const add = screen.getByRole("button", { name: "Add unit" });
    fireEvent.click(add);
    fireEvent.click(add);

    expect(await screen.findByText("KH-DMM-0004 added.")).toBeInTheDocument();
    expect(stub.bodies).toEqual([{ key: "POST /api/item-types/9/units", body: { assetTag: "kh-dmm-0004" } }]);
    expect(field).toHaveValue("");
    await waitFor(() => expect(unitCalls()).toBe(2));
  });

  it("TEST-121 (f): a 409 ASSET_TAG_TAKEN is shown under the field", async () => {
    renderUnits([ok(units)]);
    stub.routes["POST /api/item-types/9/units"] = [
      { status: 409, body: errorBody("ASSET_TAG_TAKEN", "Asset tag KH-DMM-0001 is already used.") },
    ];

    fireEvent.change(await screen.findByLabelText("Asset tag"), { target: { value: "KH-DMM-0001" } });
    fireEvent.click(screen.getByRole("button", { name: "Add unit" }));

    expect(await screen.findByText("Asset tag KH-DMM-0001 is already used.")).toBeInTheDocument();
    expect(screen.getByLabelText("Asset tag")).toHaveAttribute("aria-invalid", "true");
  });

  it("TEST-121 (g): Retire asks first; Keep unit sends nothing; Retire unit sends one call", async () => {
    renderUnits([ok(units)]);
    stub.routes["POST /api/units/1/retire"] = [{ status: 200, body: managed(unit(1, "KH-DMM-0001", "RETIRED")) }];

    fireEvent.click(await screen.findByRole("button", { name: "Retire KH-DMM-0001" }));
    let dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Retire KH-DMM-0001? A retired unit can never be lent again.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep unit" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(stub.calls.filter((c) => c.startsWith("POST"))).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Retire KH-DMM-0001" }));
    dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Retire unit" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(await screen.findByText("KH-DMM-0001 retired.")).toBeInTheDocument();
    expect(stub.calls.filter((c) => c.startsWith("POST"))).toEqual(["POST /api/units/1/retire"]);
    expect(stub.bodies).toEqual([{ key: "POST /api/units/1/retire", body: {} }]);
    await waitFor(() => expect(unitCalls()).toBe(2));
  });

  it("TEST-121 (h): Mark repaired sends one call and says the unit is available again", async () => {
    renderUnits([ok(units)]);
    stub.routes["POST /api/units/2/repair"] = [{ status: 200, body: managed(unit(2, "KH-DMM-0002", "AVAILABLE")) }];

    fireEvent.click(await screen.findByRole("button", { name: "Mark KH-DMM-0002 repaired" }));

    expect(await screen.findByText("KH-DMM-0002 is available again.")).toBeInTheDocument();
    expect(stub.calls.filter((c) => c.startsWith("POST"))).toEqual(["POST /api/units/2/repair"]);
    await waitFor(() => expect(unitCalls()).toBe(2));
  });

  it("TEST-121 (h): a 409 on repair shows the API message and loads the units again", async () => {
    renderUnits([ok(units)]);
    stub.routes["POST /api/units/2/repair"] = [
      {
        status: 409,
        body: errorBody("INVALID_STATE", "Unit KH-DMM-0002 cannot be marked repaired because it is RETIRED, not MAINTENANCE."),
      },
    ];

    fireEvent.click(await screen.findByRole("button", { name: "Mark KH-DMM-0002 repaired" }));

    expect(
      await screen.findByText("Unit KH-DMM-0002 cannot be marked repaired because it is RETIRED, not MAINTENANCE."),
    ).toBeInTheDocument();
    await waitFor(() => expect(unitCalls()).toBe(2));
  });
});
