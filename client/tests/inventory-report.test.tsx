// TEST-163 (AC-163): the Custodian Reports page /reports/inventory (contract F-14 4.2). The app is
// rendered with fetch stubbed, so this file imports no page or API module that F-14 adds and its
// RED run fails on assertions.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { errorBody, stubFetch, type FetchStub, type Reply } from "./fetch-stub";

const borrower = { id: 3, username: "borrower1", displayName: "Borrower One", role: "BORROWER" };
const custodian = { id: 1, username: "custodian1", displayName: "Custodian One", role: "CUSTODIAN" };
const KEY = "GET /api/reports/inventory";

const row = (id: number, name: string, category: string, n: number[]) => ({
  itemType: { id, name },
  category: { id: id + 100, name: category },
  available: n[0], onLoan: n[1], maintenance: n[2], retired: n[3], totalUnits: n[4], activeLoans: n[5], overdueRequests: n[6],
});
const report = {
  generatedAt: "2026-11-27T07:05:00.000Z", // 27 Nov 2026, 14:05 ICT
  items: [
    row(1, "Arduino Uno R3", "Boards", [2, 1, 1, 1, 5, 1, 1]),
    row(2, "HC-SR04 ultrasonic sensor", "Sensors", [1, 0, 0, 0, 1, 0, 0]),
  ],
  totals: { available: 3, onLoan: 1, maintenance: 1, retired: 1, totalUnits: 6, activeLoans: 1, overdueRequests: 1 },
};

let stub: FetchStub;
beforeEach(() => {
  stub = stubFetch();
});
afterEach(() => vi.unstubAllGlobals());

function open(user: typeof custodian, ...replies: Reply[]) {
  stub.routes["GET /api/auth/me"] = [{ status: 200, body: { user } }];
  stub.routes[KEY] = replies;
  render(
    <MemoryRouter initialEntries={["/reports/inventory"]}>
      <App />
    </MemoryRouter>,
  );
}
const reportCalls = () => stub.calls.filter((c) => c === KEY).length;
const cells = (tr: HTMLElement) => within(tr).getAllByRole("cell").map((c) => c.textContent);

describe("TEST-163 (AC-163): Reports page", () => {
  it("TEST-163 (a): rows, a bold totals row and Generated time; a Reports link", async () => {
    open(custodian, { status: 200, body: report });

    expect(await screen.findByRole("heading", { name: "Inventory report" })).toBeInTheDocument();
    expect(screen.getByText("Generated 27 Nov 2026, 14:05")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Available (unit state)" })).toBeInTheDocument();
    const arduino = screen.getByText("Arduino Uno R3").closest("tr")!;
    expect(cells(arduino)).toEqual(["Boards", "Arduino Uno R3", "2", "1", "1", "1", "5", "1", "1"]);
    const totals = screen.getByText("Total").closest("tr")!;
    expect(cells(totals)).toEqual(["Total", "", "3", "1", "1", "1", "6", "1", "1"]);
    expect(totals).toHaveClass("fw-bold");
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/reports/inventory");
  });

  it("TEST-163 (b): Refresh calls the API again", async () => {
    open(custodian, { status: 200, body: report });
    await screen.findByText("Arduino Uno R3");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await screen.findByText("Arduino Uno R3");
    expect(reportCalls()).toBe(2);
  });

  it("TEST-163 (c): an error shows the API message, and Try again calls the API again", async () => {
    open(custodian, { status: 500, body: errorBody("INTERNAL_ERROR", "Something went wrong.") }, { status: 200, body: report });

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Arduino Uno R3")).toBeInTheDocument();
    expect(reportCalls()).toBe(2);
  });

  it("TEST-163 (d): no item type shows the empty message", async () => {
    open(custodian, { status: 200, body: { ...report, items: [], totals: { ...report.totals, available: 0 } } });

    expect(await screen.findByText("The catalog is empty.")).toBeInTheDocument();
  });

  it("TEST-163 (e): a Borrower sees the Forbidden page and no Reports link", async () => {
    open(borrower, { status: 200, body: report });

    expect(await screen.findByText("You do not have permission to do this.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
    expect(reportCalls()).toBe(0);
  });
});
