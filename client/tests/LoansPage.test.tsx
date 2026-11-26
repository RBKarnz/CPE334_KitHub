// TEST-101 (AC-101) (d): My loans (Borrower) and Loans (Custodian) on /loans (contract F-07 4,
// F07-D5, F07-D7). The app is rendered at /loans with fetch stubbed, so this file imports no page
// or API module that F-07 adds.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { deferred } from "./render";

type Reply = { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;

const borrower = { id: 3, username: "borrower1", displayName: "Borrower One", role: "BORROWER" };
const custodian = { id: 1, username: "custodian1", displayName: "Custodian One", role: "CUSTODIAN" };

const loan = {
  id: 31,
  status: "ACTIVE",
  checkedOutAt: "2026-11-30T03:00:00.000Z",
  dueAt: "2026-12-07T10:00:00.000Z",
  returnedAt: null,
  unit: { id: 1, assetTag: "KH-ARD-0001" },
  itemType: { id: 3, name: "Arduino Uno R3" },
  request: { id: 12 },
};

let routes: Record<string, Reply[]>;
let calls: string[];

beforeEach(() => {
  routes = {};
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? "GET"} ${url}`;
      calls.push(key);
      const queue = routes[key];
      if (!queue || queue.length === 0) throw new Error(`unexpected call ${key}`);
      const r = await (queue.length > 1 ? queue.shift()! : queue[0]);
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
        status: r.status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderLoans(user: typeof borrower, ...replies: Reply[]) {
  routes["GET /api/auth/me"] = [{ status: 200, body: { user } }];
  routes["GET /api/loans"] = replies;
  return render(
    <MemoryRouter initialEntries={["/loans"]}>
      <App />
    </MemoryRouter>,
  );
}

describe("TEST-101 (AC-101) (d): loans pages", () => {
  it("TEST-101 (d): My loans shows Loading… first, then the rows with item type, asset tag, request and dates", async () => {
    const slow = deferred<{ status: number; body?: unknown }>();
    renderLoans(borrower, slow.promise);

    expect(await screen.findByRole("heading", { name: "My loans" })).toBeInTheDocument();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    await act(async () => slow.resolve({ status: 200, body: { items: [loan] } }));

    const row = (await screen.findByText("KH-ARD-0001")).closest("tr")!;
    expect(row).toHaveTextContent("Arduino Uno R3");
    expect(within(row).getByRole("link", { name: "#12" })).toHaveAttribute("href", "/requests/12");
    expect(row).toHaveTextContent("30 Nov 2026, 10:00");
    expect(row).toHaveTextContent("7 Dec 2026, 17:00");
    expect(screen.getByRole("link", { name: "My loans" })).toHaveAttribute("href", "/loans");
  });

  it("TEST-101 (d): an empty list says You have no active loans.", async () => {
    renderLoans(borrower, { status: 200, body: { items: [] } });

    expect(await screen.findByText("You have no active loans.")).toBeInTheDocument();
  });

  it("TEST-101 (d): an error shows the message and Try again, which calls again", async () => {
    renderLoans(
      borrower,
      { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "Something went wrong.", requestId: "r" } } },
      { status: 200, body: { items: [loan] } },
    );

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("KH-ARD-0001")).toBeInTheDocument();
    expect(calls.filter((c) => c === "GET /api/loans")).toHaveLength(2);
  });

  it("TEST-101 (d): a Custodian's Loans page shows the Borrower and filters Active / Returned", async () => {
    routes["GET /api/loans?status=RETURNED"] = [{ status: 200, body: { items: [] } }];
    renderLoans(custodian, {
      status: 200,
      body: { items: [{ ...loan, borrower: { id: 3, username: "borrower1", displayName: "Borrower One" } }] },
    });

    expect(await screen.findByRole("heading", { name: "Loans" })).toBeInTheDocument();
    const row = (await screen.findByText("KH-ARD-0001")).closest("tr")!;
    expect(row).toHaveTextContent("Borrower One (borrower1)");
    expect(screen.getByRole("link", { name: "Loans" })).toHaveAttribute("href", "/loans");

    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "RETURNED" } });
    await waitFor(() => expect(calls).toContain("GET /api/loans?status=RETURNED"));
    expect(await screen.findByText("No returned loans.")).toBeInTheDocument();
  });
});
