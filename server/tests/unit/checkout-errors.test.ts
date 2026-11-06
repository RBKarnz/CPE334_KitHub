// TEST-52 (AC-22): a unique violation on the loan insert becomes 409 UNIT_NOT_AVAILABLE, not the
// generic 409 CONFLICT of the SR-01 handler (contract F-03 3.9).
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ConflictError } from "../../src/core/errors.js";
import { toLoanInsertConflict } from "../../src/features/loans/checkout-errors.js";

const unit = { id: 7, assetTag: "KH-ARD-0007" };
const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("database error", { code, clientVersion: Prisma.prismaVersion.client, meta });

describe("TEST-52 (AC-22): toLoanInsertConflict", () => {
  it("TEST-52 (a): P2002 becomes 409 UNIT_NOT_AVAILABLE naming the unit", () => {
    const result = toLoanInsertConflict(known("P2002", { target: ["unitId"] }), unit);
    expect(result).toBeInstanceOf(ConflictError);
    expect(result).toMatchObject({
      status: 409,
      code: "UNIT_NOT_AVAILABLE",
      message: "Unit KH-ARD-0007 is not available for checkout.",
      details: [{ field: "units[0].unitId", issue: "Unit already has an active loan" }],
    });
  });

  it("TEST-52 (b): another Prisma error (P2003) is returned unchanged", () => {
    const err = known("P2003");
    expect(toLoanInsertConflict(err, unit)).toBe(err);
  });

  it("TEST-52 (c): a plain Error is returned unchanged", () => {
    const err = new Error("boom");
    expect(toLoanInsertConflict(err, unit)).toBe(err);
  });
});
