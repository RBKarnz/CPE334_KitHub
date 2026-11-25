// TEST-109 (AC-109), UI part: Return all and Return this unit on the request detail (contract F-08
// 4). The return calls live in `src/api/loans.ts` (recorded path; the contract planned
// `src/api/returns.ts`) and are mocked with a vi.mock factory, so this file imports nothing before
// it exists.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BorrowRequest } from "../src/api/requests";
import { RequestDetailPage } from "../src/pages/RequestDetailPage";
import { checkedOutMulti12 } from "./fixtures";
import { borrower, custodian, renderAs } from "./render";

const { fetchRequest, returnRequest, returnLoan } = vi.hoisted(() => ({
  fetchRequest: vi.fn(),
  returnRequest: vi.fn(),
  returnLoan: vi.fn(),
}));
vi.mock("../src/api/requests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/requests")>()),
  fetchRequest,
}));
vi.mock("../src/api/loans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/api/loans")>()),
  returnRequest,
  returnLoan,
}));

// Request #12 with two ACTIVE Arduino loans (31, 32), for the Custodian detail.
const twoLoans = {
  ...checkedOutMulti12,
  lines: [checkedOutMulti12.lines[0]],
  history: [],
} as unknown as BorrowRequest;
const returned = { ...twoLoans, status: "RETURNED" } as unknown as BorrowRequest;

const renderDetail = (user = custodian) =>
  renderAs(user, <RequestDetailPage />, { path: "/requests/:id", at: "/requests/12" });

beforeEach(() => {
  for (const fn of [fetchRequest, returnRequest, returnLoan]) fn.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("TEST-109 (AC-109): return controls on the request detail", () => {
  it("TEST-109: a Borrower sees no return control", async () => {
    const { checkedOutBy: _a, ...l1 } = twoLoans.lines[0].loans[0];
    const { checkedOutBy: _b, ...l2 } = twoLoans.lines[0].loans[1];
    fetchRequest.mockResolvedValue({ ...twoLoans, history: undefined, lines: [{ ...twoLoans.lines[0], loans: [l1, l2] }] });
    renderDetail(borrower);

    expect(await screen.findByText("KH-ARD-0001")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Return all" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Return this unit/ })).not.toBeInTheDocument();
  });

  it("TEST-109: Return all defaults every condition to Good and sends both loans once", async () => {
    fetchRequest.mockResolvedValueOnce(twoLoans).mockResolvedValue(returned);
    returnRequest.mockResolvedValue(returned);
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Return all" }));
    const dialog = screen.getByRole("dialog", { name: "Return Request #12" });
    const goods = within(dialog).getAllByRole("radio", { name: "Good" });
    expect(goods).toHaveLength(2);
    for (const good of goods) expect(good).toBeChecked();
    const confirm = within(dialog).getByRole("button", { name: "Return 2 units" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(returnRequest).toHaveBeenCalledTimes(1);
    expect(returnRequest).toHaveBeenCalledWith(12, [
      { loanId: 31, condition: "GOOD" },
      { loanId: 32, condition: "GOOD" },
    ]);
    expect(await screen.findByText("Request #12 returned: 2 good.")).toBeInTheDocument();
    await waitFor(() => expect(fetchRequest).toHaveBeenCalledTimes(2));
  });

  it("TEST-109: a Damaged unit is named in the result", async () => {
    fetchRequest.mockResolvedValueOnce(twoLoans).mockResolvedValue(returned);
    returnRequest.mockResolvedValue(returned);
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Return all" }));
    const dialog = screen.getByRole("dialog", { name: "Return Request #12" });
    fireEvent.click(within(dialog).getAllByRole("radio", { name: "Damaged" })[1]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Return 2 units" }));

    expect(returnRequest).toHaveBeenCalledWith(12, [
      { loanId: 31, condition: "GOOD" },
      { loanId: 32, condition: "DAMAGED" },
    ]);
    expect(
      await screen.findByText("Request #12 returned: 1 good, 1 damaged (KH-ARD-0002 sent to maintenance)."),
    ).toBeInTheDocument();
  });

  it("TEST-109: Return this unit returns one loan with Good by default", async () => {
    fetchRequest.mockResolvedValue(twoLoans);
    returnLoan.mockResolvedValue(twoLoans);
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "Return this unit KH-ARD-0001" }));
    const dialog = screen.getByRole("dialog", { name: "Return KH-ARD-0001" });
    expect(within(dialog).getByRole("radio", { name: "Good" })).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Return KH-ARD-0001" }));

    expect(returnLoan).toHaveBeenCalledTimes(1);
    expect(returnLoan).toHaveBeenCalledWith(31, "GOOD");
    expect(await screen.findByText("KH-ARD-0001 returned.")).toBeInTheDocument();
  });
});
