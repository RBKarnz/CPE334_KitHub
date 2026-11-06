// Smoke check that the hand-written SQL in the first migration exists (SDS 4.3).
// The behaviour itself (BR-03 concurrent checkout, BR-16 append-only history) is tested
// by TEST-22 and TEST-24 in the F-03 contract.
import { describe, expect, it } from "vitest";
import { prisma } from "../helpers/app.js";

describe("database constraints from the migration (SDS 4.3)", () => {
  it("has the partial unique index for one ACTIVE loan per unit", async () => {
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'loans' AND indexname = 'loans_one_active_per_unit'`;

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/UNIQUE INDEX .* \("unitId"\) WHERE \(status = 'ACTIVE'::"LoanStatus"\)/);
  });

  it("has the append-only trigger on history_entries for UPDATE and DELETE", async () => {
    const rows = await prisma.$queryRaw<{ event: string; timing: string }[]>`
      SELECT event_manipulation AS event, action_timing AS timing
      FROM information_schema.triggers
      WHERE event_object_table = 'history_entries'
      ORDER BY event_manipulation`;

    expect(rows).toEqual([
      { event: "DELETE", timing: "BEFORE" },
      { event: "UPDATE", timing: "BEFORE" },
    ]);
  });

  it("has the Sprint 1 CHECK constraints", async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT con.conname AS name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE con.contype = 'c' AND ns.nspname = 'public'
      ORDER BY con.conname`;

    expect(rows.map((r) => r.name)).toEqual([
      "categories_defaultMaxLoanDays_check",
      "categories_defaultMaxQuantity_check",
      "history_entries_actor_check",
      "history_entries_subject_check",
      "item_types_maxLoanDays_check",
      "item_types_maxQuantityPerRequest_check",
      "request_lines_quantity_check",
    ]);
  });

  it("creates every enum with all of its values, including later sprints", async () => {
    const rows = await prisma.$queryRaw<{ type: string; value: string }[]>`
      SELECT t.typname AS type, e.enumlabel AS value
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      ORDER BY t.typname, e.enumsortorder`;
    const byType: Record<string, string[]> = {};
    for (const { type, value } of rows) (byType[type] ??= []).push(value);

    expect(byType).toEqual({
      ActorType: ["USER", "SYSTEM"],
      HistoryEntity: ["REQUEST", "UNIT", "LOAN"],
      LoanStatus: ["ACTIVE", "RETURNED"],
      RequestStatus: ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "CHECKED_OUT", "RETURNED", "EXPIRED"],
      ReturnCondition: ["GOOD", "DAMAGED"],
      Role: ["BORROWER", "CUSTODIAN"],
      UnitStatus: ["AVAILABLE", "ON_LOAN", "MAINTENANCE", "RETIRED"],
    });
  });
});
