// computeDueAt (contract F-03 3.4, v1.3 #71): rule D-21. The start day is the ICT checkout date if
// it is a business day and the time is before 16:00, else the next business day; the due day is
// the start day + maxLoanDays calendar days, moved to Monday if it is a Saturday or Sunday; the
// due time is 17:00 ICT (T10:00:00.000Z). TEST-50 was revised by #71; TEST-54 to TEST-57 are new.
import { describe, expect, it } from "vitest";
import { computeDueAt } from "../../src/domain/due-date.js";

const due = (checkedOutAt: string, days: number) => computeDueAt(new Date(checkedOutAt), days).toISOString();

// Fri 6 Nov 2026, 14:30 ICT
const CHECKED_OUT_AT = "2026-11-06T07:30:00.000Z";

describe("TEST-50 (AC-19): computeDueAt, worked examples revised by #71", () => {
  it.each([
    ["(a)", 14, "2026-11-20T10:00:00.000Z"],
    ["(b)", 3, "2026-11-09T10:00:00.000Z"],
    ["(c) due day Sat 7 Nov moves to Monday", 1, "2026-11-09T10:00:00.000Z"],
  ])("TEST-50 %s: %i days from Fri 6 Nov 14:30 ICT is %s", (_case, days, expected) => {
    expect(due(CHECKED_OUT_AT, days)).toBe(expected);
  });

  it("TEST-50 (d): 14 days from Wed 25 Nov crosses the month end to Wed 9 Dec 17:00", () => {
    expect(due("2026-11-25T07:30:00.000Z", 14)).toBe("2026-12-09T10:00:00.000Z");
  });

  it.each([0, -1, 1.5])("TEST-50 (e): %s days throws RangeError", (days) => {
    expect(() => computeDueAt(new Date(CHECKED_OUT_AT), days)).toThrow(RangeError);
  });

  it("TEST-50: the input Date is not modified", () => {
    const input = new Date(CHECKED_OUT_AT);
    const result = computeDueAt(input, 14);
    expect(input.toISOString()).toBe(CHECKED_OUT_AT);
    expect(result).not.toBe(input);
  });
});

describe("TEST-54 (AC-54): business day before 16:00, due day is a business day", () => {
  it("TEST-54 (a): Wed 25 Nov 10:00 ICT + 14 days is Wed 9 Dec 17:00 ICT", () => {
    expect(due("2026-11-25T03:00:00.000Z", 14)).toBe("2026-12-09T10:00:00.000Z");
  });
});

describe("TEST-55 (AC-55): the 16:00 ICT cutoff", () => {
  it.each([
    ["(a) 15:59:59 counts from the checkout date", "2026-11-25T08:59:59.000Z", "2026-12-09T10:00:00.000Z"],
    ["(b) 16:00:00 counts from the next business day", "2026-11-25T09:00:00.000Z", "2026-12-10T10:00:00.000Z"],
    ["(c) 15:59:59.999 still counts from the checkout date", "2026-11-25T08:59:59.999Z", "2026-12-09T10:00:00.000Z"],
  ])("TEST-55 %s", (_case, checkedOutAt, expected) => {
    expect(due(checkedOutAt, 14)).toBe(expected);
  });
});

describe("TEST-56 (AC-56): a due day on Saturday or Sunday moves to Monday", () => {
  it.each([
    ["(a) Wed 25 Nov + 3 is Sat 28 Nov", "2026-11-25T03:00:00.000Z"],
    ["(b) Thu 26 Nov + 3 is Sun 29 Nov", "2026-11-26T03:00:00.000Z"],
    ["(c) Fri 27 Nov + 3 is already Mon 30 Nov", "2026-11-27T03:00:00.000Z"],
  ])("TEST-56 %s: due Mon 30 Nov 17:00 ICT", (_case, checkedOutAt) => {
    expect(due(checkedOutAt, 3)).toBe("2026-11-30T10:00:00.000Z");
  });
});

describe("TEST-57 (AC-57): a checkout on Saturday or Sunday, or after the cutoff on Friday", () => {
  it.each([
    ["(a) Sat 28 Nov 10:00 starts Mon 30 Nov", "2026-11-28T03:00:00.000Z", "2026-12-03T10:00:00.000Z"],
    ["(b) Sun 29 Nov 22:00 starts Mon 30 Nov", "2026-11-29T15:00:00.000Z", "2026-12-03T10:00:00.000Z"],
    ["(c) Fri 4 Dec 16:00:00 starts Mon 7 Dec", "2026-12-04T09:00:00.000Z", "2026-12-10T10:00:00.000Z"],
  ])("TEST-57 %s", (_case, checkedOutAt, expected) => {
    expect(due(checkedOutAt, 3)).toBe(expected);
  });
});
