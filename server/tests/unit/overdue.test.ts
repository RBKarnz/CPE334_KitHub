// TEST-132 (AC-132), unit part, and TEST-136 (AC-136), unit part (contract F-11 3.4, F11-D1, F11-D2).
// The functions are read through a loose view of the module, so this file typechecks before F-11
// exists and its RED run fails on assertions, not in `npm run typecheck`.
import { describe, expect, it } from "vitest";
import * as rules from "../../src/domain/request-rules.js";

type Loan = { status: string; dueAt: Date };
type Req = { status: string; lines: { loans: Loan[] }[] };
const view = rules as unknown as {
  isOverdue?: (request: Req, now: Date) => boolean;
  borrowLimitViolation?: (held: number, asked: number) => { held: number; asked: number } | null;
  BORROW_LIMIT_UNITS?: number;
};

const DUE = "2026-12-04T10:00:00.000Z"; // Fri 4 Dec 2026, 17:00 ICT
const at = (ms: number) => new Date(new Date(DUE).getTime() + ms);
const req = (status: string, loans: Loan[]): Req => ({ status, lines: [{ loans }] });
const active = { status: "ACTIVE", dueAt: new Date(DUE) };

describe("TEST-132 (AC-132): isOverdue", () => {
  it("TEST-132: isOverdue exists", () => {
    expect(typeof view.isOverdue).toBe("function");
  });

  it.each([
    ["(a) 1 ms before dueAt", -1, false],
    ["(b) at dueAt exactly (F11-D2)", 0, false],
    ["(c) 1 ms after dueAt", 1, true],
  ])("TEST-132 %s", (_case, ms, expected) => {
    expect(view.isOverdue?.(req("CHECKED_OUT", [active]), at(ms))).toBe(expected);
  });

  it("TEST-132 (d): a returned loan is never overdue", () => {
    expect(view.isOverdue?.(req("CHECKED_OUT", [{ status: "RETURNED", dueAt: new Date(DUE) }, active]), at(1))).toBe(true);
    expect(view.isOverdue?.(req("CHECKED_OUT", [{ status: "RETURNED", dueAt: new Date(DUE) }]), at(1))).toBe(false);
  });

  it.each(["RETURNED", "PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"])(
    "TEST-132 (e): a %s request is not overdue",
    (status) => {
      expect(view.isOverdue?.(req(status, [active]), at(1))).toBe(false);
    },
  );
});

describe("TEST-136 (AC-136): borrowLimitViolation (BR-14, limit 5)", () => {
  it("TEST-136: the limit is 5 units", () => {
    expect(view.BORROW_LIMIT_UNITS).toBe(5);
  });

  it.each([
    ["(a) held 0, asked 5", 0, 5, null],
    ["(b) held 3, asked 2", 3, 2, null],
    ["(c) held 3, asked 3", 3, 3, { held: 3, asked: 3 }],
    ["(d) held 5, asked 1", 5, 1, { held: 5, asked: 1 }],
  ])("TEST-136 %s", (_case, held, asked, expected) => {
    expect(typeof view.borrowLimitViolation).toBe("function");
    expect(view.borrowLimitViolation?.(held, asked)).toEqual(expected);
  });
});
