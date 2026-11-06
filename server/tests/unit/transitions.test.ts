// TEST-51 (AC-19, AC-20, AC-43): the SRS section 8 transitions F-03 performs, as data (contract F-03 3.2).
import { describe, expect, it } from "vitest";
import { toAppError } from "../../src/core/middleware/error-handler.js";
import { assertTransition, type TransitionEntity } from "../../src/domain/transitions.js";

type Row = [TransitionEntity, string | null, string];

describe("TEST-51: assertTransition", () => {
  it.each<Row>([
    ["REQUEST", "PENDING", "CHECKED_OUT"],
    ["UNIT", "AVAILABLE", "ON_LOAN"],
    ["LOAN", null, "ACTIVE"],
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
