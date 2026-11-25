// Smoke check that the hand-written SQL in the first migration exists (SDS 4.3).
// The behaviour itself (BR-03 concurrent checkout, BR-16 append-only history) is tested
// by TEST-22 and TEST-24 in the F-03 contract.
import { describe, expect, it } from "vitest";
import { prisma } from "../helpers/app.js";
import { createActiveLoan } from "../helpers/checkout.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCustodian, createUnit } from "../helpers/factories.js";

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

  it("has the Sprint 2 columns of SDS 4.2, all nullable (#73)", async () => {
    const rows = await prisma.$queryRaw<{ table: string; column: string; nullable: string }[]>`
      SELECT table_name AS table, column_name AS column, is_nullable AS nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name = 'borrow_requests' AND column_name IN ('loanDays', 'decidedById', 'decidedAt', 'rejectionReason'))
          OR (table_name = 'loans' AND column_name IN ('returnedAt', 'returnedById', 'returnCondition')))
      ORDER BY table_name, column_name`;

    expect(rows).toEqual([
      { table: "borrow_requests", column: "decidedAt", nullable: "YES" },
      { table: "borrow_requests", column: "decidedById", nullable: "YES" },
      { table: "borrow_requests", column: "loanDays", nullable: "YES" },
      { table: "borrow_requests", column: "rejectionReason", nullable: "YES" },
      { table: "loans", column: "returnCondition", nullable: "YES" },
      { table: "loans", column: "returnedAt", nullable: "YES" },
      { table: "loans", column: "returnedById", nullable: "YES" },
    ]);
  });

  it("has the Sprint 1 and Sprint 2 CHECK constraints", async () => {
    const rows = await prisma.$queryRaw<{ name: string }[]>`
      SELECT con.conname AS name
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      WHERE con.contype = 'c' AND ns.nspname = 'public'
      ORDER BY con.conname`;

    expect(rows.map((r) => r.name)).toEqual([
      "borrow_requests_loanDays_check",
      "borrow_requests_rejectionReason_check",
      "categories_defaultMaxLoanDays_check",
      "categories_defaultMaxQuantity_check",
      "history_entries_actor_check",
      "history_entries_subject_check",
      "item_types_maxLoanDays_check",
      "item_types_maxQuantityPerRequest_check",
      "loans_returned_check",
      "request_lines_quantity_check",
    ]);
  });

  it("rejects a REJECTED request with a blank reason and a loan whose returnedAt does not match its status (SDS 4.3, #73)", async () => {
    await resetDb(prisma);
    const borrower = await createBorrower(prisma, { username: "b-schema" });

    // BR-09: a rejection needs a non-blank reason.
    await expect(
      prisma.$executeRaw`INSERT INTO borrow_requests ("borrowerId", status, "updatedAt", "rejectionReason")
                         VALUES (${borrower.id}, 'REJECTED', now(), '   ')`,
    ).rejects.toThrow(/borrow_requests_rejectionReason_check/);
    await expect(
      prisma.$executeRaw`INSERT INTO borrow_requests ("borrowerId", status, "updatedAt") VALUES (${borrower.id}, 'REJECTED', now())`,
    ).rejects.toThrow(/borrow_requests_rejectionReason_check/);
    // loanDays is at least 1 when set.
    await expect(
      prisma.$executeRaw`INSERT INTO borrow_requests ("borrowerId", status, "updatedAt", "loanDays") VALUES (${borrower.id}, 'PENDING', now(), 0)`,
    ).rejects.toThrow(/borrow_requests_loanDays_check/);
    expect(await prisma.borrowRequest.count()).toBe(0);

    // SRS 8.3: returnedAt is set exactly when the loan is RETURNED.
    const custodian = await createCustodian(prisma, { username: "c-schema" });
    const unit = await createUnit(prisma);
    const { loan } = await createActiveLoan(prisma, {
      borrowerId: borrower.id,
      custodianId: custodian.id,
      itemTypeId: unit.itemTypeId,
      unitId: unit.id,
    });
    await expect(
      prisma.$executeRaw`UPDATE loans SET status = 'RETURNED' WHERE id = ${loan.id}`,
    ).rejects.toThrow(/loans_returned_check/);
    await expect(
      prisma.$executeRaw`UPDATE loans SET "returnedAt" = now() WHERE id = ${loan.id}`,
    ).rejects.toThrow(/loans_returned_check/);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).status).toBe("ACTIVE");
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
