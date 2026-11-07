// TEST-50 (AC-19): the due-date rule D-16, dueAt = checkedOutAt + maxLoanDays × 24 h (contract F-03 3.4).
import { describe, expect, it } from "vitest";
import { computeDueAt } from "../../src/domain/due-date.js";

// 6 Nov 2026, 14:30 Asia/Bangkok
const CHECKED_OUT_AT = "2026-11-06T07:30:00.000Z";

describe("TEST-50 (AC-19): computeDueAt", () => {
  it.each([
    ["(a)", 14, "2026-11-20T07:30:00.000Z"],
    ["(b)", 3, "2026-11-09T07:30:00.000Z"],
    ["(c)", 1, "2026-11-07T07:30:00.000Z"],
  ])("TEST-50 %s: %i days from 2026-11-06T07:30Z is %s", (_case, days, expected) => {
    expect(computeDueAt(new Date(CHECKED_OUT_AT), days).toISOString()).toBe(expected);
  });

  it("TEST-50 (d): 14 days from 25 Nov crosses the month end to 9 Dec", () => {
    expect(computeDueAt(new Date("2026-11-25T07:30:00.000Z"), 14).toISOString()).toBe("2026-12-09T07:30:00.000Z");
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
