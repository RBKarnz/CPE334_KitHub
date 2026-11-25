// TEST-51 (AC-19, AC-20, AC-43): the SRS section 8 transitions F-03 performs, as data (contract F-03 3.2).
import { describe, expect, it } from "vitest";
import { toAppError } from "../../src/core/middleware/error-handler.js";
import { assertTransition, type TransitionEntity } from "../../src/domain/transitions.js";

type Row = [TransitionEntity, string | null, string];

describe("TEST-51: assertTransition", () => {
  it.each<Row>([
    // F-07 (F07-D1): checkout needs an APPROVED request; the Sprint 1 PENDING row is removed.
    ["REQUEST", "APPROVED", "CHECKED_OUT"],
    ["UNIT", "AVAILABLE", "ON_LOAN"],
    ["LOAN", null, "ACTIVE"],
    // F-06 (contract F-06 3.2): a Custodian approves or rejects a PENDING request.
    ["REQUEST", "PENDING", "APPROVED"],
    ["REQUEST", "PENDING", "REJECTED"],
  ])("TEST-51 (a): %s %s → %s is allowed", (entity, from, to) => {
    expect(() => assertTransition(entity, from, to)).not.toThrow();
  });

  it.each<Row>([
    ["REQUEST", "CHECKED_OUT", "CHECKED_OUT"],
    ["REQUEST", "CHECKED_OUT", "PENDING"],
    ["UNIT", "ON_LOAN", "ON_LOAN"],
    ["UNIT", "MAINTENANCE", "ON_LOAN"],
    ["UNIT", "RETIRED", "ON_LOAN"],
    ["LOAN", "ACTIVE", "ACTIVE"],
    // F-06: only PENDING can be decided.
    ["REQUEST", "APPROVED", "APPROVED"],
    ["REQUEST", "REJECTED", "APPROVED"],
    ["REQUEST", "CHECKED_OUT", "REJECTED"],
    // F-07: the Sprint 1 checkout of a PENDING request is gone (FR-16 replaced by FR-17).
    ["REQUEST", "PENDING", "CHECKED_OUT"],
  ])("TEST-51 (b): %s %s → %s is rejected as 409 INVALID_STATE", (entity, from, to) => {
    let thrown: unknown;
    try {
      assertTransition(entity, from, to);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    // The error handler maps it to 409 INVALID_STATE (SDS 6.5).
    const mapped = toAppError(thrown);
    expect(mapped?.status).toBe(409);
    expect(mapped?.code).toBe("INVALID_STATE");
  });
});
