// Unit parts of TEST-10, TEST-11 and TEST-38: the request creation rule (contract F-02 8.1).
import { describe, expect, it } from "vitest";
import { requestRuleViolation } from "../../src/domain/request-rules.js";

describe("requestRuleViolation (BR-01, BR-04, F02-D1)", () => {
  it("TEST-10 (unit): 0 available gives ITEM_TYPE_UNAVAILABLE, 1 available gives none", () => {
    expect(requestRuleViolation({ hasOpenRequest: false, availableCount: 0, quantity: 1 })).toBe("ITEM_TYPE_UNAVAILABLE");
    expect(requestRuleViolation({ hasOpenRequest: false, availableCount: 1, quantity: 1 })).toBeNull();
  });

  it("TEST-11 (unit): an open request gives DUPLICATE_OPEN_REQUEST; none gives no violation", () => {
    expect(requestRuleViolation({ hasOpenRequest: true, availableCount: 3, quantity: 1 })).toBe("DUPLICATE_OPEN_REQUEST");
    expect(requestRuleViolation({ hasOpenRequest: false, availableCount: 3, quantity: 1 })).toBeNull();
  });

  it("TEST-38 (unit): when both rules fail, DUPLICATE_OPEN_REQUEST wins (F02-D1)", () => {
    expect(requestRuleViolation({ hasOpenRequest: true, availableCount: 0, quantity: 1 })).toBe("DUPLICATE_OPEN_REQUEST");
  });

  it("fewer available units than the quantity is ITEM_TYPE_UNAVAILABLE", () => {
    expect(requestRuleViolation({ hasOpenRequest: false, availableCount: 1, quantity: 2 })).toBe("ITEM_TYPE_UNAVAILABLE");
  });
});
