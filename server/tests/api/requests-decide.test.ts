// F-06 approve and reject; all-requests view (contract F-06 sections 3 to 5): TEST-80 to TEST-85.
// Every rejection asserts that nothing changed (snapshotRequestState, F-06 8.1).
import { ActorType, HistoryEntity, RequestStatus } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCustodian, createItemType, createRequest, createUnit } from "../helpers/factories.js";
import { detailFields, getAs, postDecision, snapshotRequestState } from "../helpers/requests.js";

const app = createTestApp();

beforeEach(async () => {
  await resetDb(prisma);
});

const HOUR = 3_600_000;
const T0 = new Date("2026-11-20T03:00:00.000Z");
const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);

/** Borrowers A and B, Custodians C (custodian1) and C2, item types T1 and T2 with units. */
async function world() {
  const c = await createCustodian(prisma, { username: "custodian1", displayName: "Custodian One" });
  const c2 = await createCustodian(prisma, { username: "custodian2", displayName: "Custodian Two" });
  const a = await createBorrower(prisma, { username: "borrower1", displayName: "Borrower One" });
  const b = await createBorrower(prisma, { username: "borrower2", displayName: "Borrower Two" });
  const t1 = await createItemType(prisma, { name: "Arduino Uno R3" });
  const t2 = await createItemType(prisma, { name: "ESP32 DevKitC" });
  await createUnit(prisma, { itemTypeId: t1.id });
  await createUnit(prisma, { itemTypeId: t2.id });
  return { c, c2, a, b, t1, t2 };
}

/** A history entry written directly, as the features would (test data only). */
const entry = (requestId: number, actorUserId: number, occurredAt: Date, action: string, from: string | null, to: string) =>
  prisma.historyEntry.create({
    data: {
      occurredAt,
      actorType: ActorType.USER,
      actorUserId,
      entityType: HistoryEntity.REQUEST,
      requestId,
      action,
      fromStatus: from,
      toStatus: to,
    },
  });

/** TEST-80 data: A has R1 PENDING, R2 APPROVED (by C), R3 REJECTED; B has R4 CHECKED_OUT, R5 CANCELLED. */
async function fiveRequests() {
  const w = await world();
  const r1 = await createRequest(prisma, { borrowerId: w.a.id, itemTypeId: w.t1.id, createdAt: at(0) });
  const r2 = await createRequest(prisma, {
    borrowerId: w.a.id,
    itemTypeId: w.t2.id,
    status: RequestStatus.APPROVED,
    createdAt: at(1),
    decidedById: w.c.id,
    decidedAt: at(5),
    loanDays: 7,
  });
  const r3 = await createRequest(prisma, {
    borrowerId: w.a.id,
    itemTypeId: w.t1.id,
    status: RequestStatus.REJECTED,
    createdAt: at(2),
    decidedById: w.c.id,
    decidedAt: at(6),
    rejectionReason: "Only one unit left.",
  });
  const r4 = await createRequest(prisma, { borrowerId: w.b.id, itemTypeId: w.t1.id, status: RequestStatus.CHECKED_OUT, createdAt: at(3) });
  const r5 = await createRequest(prisma, { borrowerId: w.b.id, itemTypeId: w.t2.id, status: RequestStatus.CANCELLED, createdAt: at(4) });
  await entry(r2.id, w.a.id, at(1), "CREATED", null, "PENDING");
  await entry(r2.id, w.c.id, at(5), "STATUS_CHANGED", "PENDING", "APPROVED");
  return { ...w, r1, r2, r3, r4, r5 };
}

const ids = (res: { body: { items: { id: number }[] } }) => res.body.items.map((i) => i.id);

describe("TEST-80 (AC-80): a Custodian lists every request; decision fields on each item", () => {
  it("TEST-80 (a) to (d): all states oldest first, the status filter, and the Borrower's own list without decidedBy", async () => {
    const s = await fiveRequests();
    const custodian = await signIn(app, "custodian1");

    const all = await getAs(app, custodian, "/api/requests");
    expect(all.status).toBe(200);
    expect(ids(all)).toEqual([s.r1.id, s.r2.id, s.r3.id, s.r4.id, s.r5.id]);
    for (const item of all.body.items) {
      for (const key of ["loanDays", "decidedAt", "decidedBy", "rejectionReason"]) expect(item).toHaveProperty(key);
    }
    const r2 = all.body.items[1];
    expect(r2.decidedBy).toEqual({ id: s.c.id, username: "custodian1", displayName: "Custodian One" });
    expect(r2.decidedAt).toBe(at(5).toISOString());
    expect(r2.loanDays).toBe(7);
    expect(all.body.items[2].rejectionReason).toBe("Only one unit left.");
    expect(all.body.items[0]).toMatchObject({ loanDays: null, decidedAt: null, decidedBy: null, rejectionReason: null });

    expect(ids(await getAs(app, custodian, "/api/requests?status=APPROVED"))).toEqual([s.r2.id]);
    expect(ids(await getAs(app, custodian, "/api/requests?status=REJECTED"))).toEqual([s.r3.id]);

    const own = await getAs(app, await signIn(app, "borrower1"), "/api/requests");
    expect(own.status).toBe(200);
    expect(ids(own)).toEqual([s.r3.id, s.r2.id, s.r1.id]);
    for (const item of own.body.items) {
      expect(item).not.toHaveProperty("decidedBy");
      expect(item).toHaveProperty("decidedAt");
      expect(item).toHaveProperty("rejectionReason");
    }
  });
});

describe("TEST-81 (AC-81): request detail with history for a Custodian", () => {
  it("TEST-81 (a): a Custodian gets the history oldest first, each item with exactly the F06-D5 fields", async () => {
    const s = await fiveRequests();

    const res = await getAs(app, await signIn(app, "custodian1"), `/api/requests/${s.r2.id}`);

    expect(res.status).toBe(200);
    expect(res.body.decidedBy).toEqual({ id: s.c.id, username: "custodian1", displayName: "Custodian One" });
    expect(res.body.history).toHaveLength(2);
    for (const h of res.body.history) {
      expect(Object.keys(h).sort()).toEqual(
        ["action", "actor", "details", "entityType", "fromStatus", "id", "occurredAt", "toStatus"].sort(),
      );
    }
    expect(res.body.history[0]).toMatchObject({
      occurredAt: at(1).toISOString(),
      actor: { id: s.a.id, username: "borrower1", displayName: "Borrower One" },
      entityType: "REQUEST",
      action: "CREATED",
      fromStatus: null,
      toStatus: "PENDING",
      details: null,
    });
    expect(res.body.history[1]).toMatchObject({
      actor: { id: s.c.id, username: "custodian1", displayName: "Custodian One" },
      action: "STATUS_CHANGED",
      fromStatus: "PENDING",
      toStatus: "APPROVED",
    });
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("TEST-81 (b), (c): the owner gets the decision time without decidedBy or history; another Borrower gets 404", async () => {
    const s = await fiveRequests();

    const own = await getAs(app, await signIn(app, "borrower1"), `/api/requests/${s.r2.id}`);
    expect(own.status).toBe(200);
    expect(own.body.decidedAt).toBe(at(5).toISOString());
    expect(own.body).toHaveProperty("rejectionReason", null);
    expect(own.body).not.toHaveProperty("decidedBy");
    expect(own.body).not.toHaveProperty("history");

    const other = await getAs(app, await signIn(app, "borrower2"), `/api/requests/${s.r2.id}`);
    expect(other.status).toBe(404);
    expect(Object.keys(other.body)).toEqual(["error"]);
  });
});

describe("TEST-82 (AC-82): approve a PENDING request", () => {
  it("TEST-82: APPROVED with decidedBy and decidedAt, one history entry with the same time, nothing else changes", async () => {
    const w = await world();
    const r = await createRequest(prisma, { borrowerId: w.a.id, itemTypeId: w.t1.id });
    // A second line, so "no line changes" covers more than one row.
    await prisma.requestLine.create({ data: { requestId: r.id, itemTypeId: w.t2.id, quantity: 1 } });
    const cookie = await signIn(app, "custodian1");
    const linesBefore = await prisma.requestLine.findMany({ orderBy: { id: "asc" } });
    const unitsBefore = await prisma.unit.findMany({ orderBy: { id: "asc" } });
    const historyBefore = await prisma.historyEntry.count();

    const t0 = Date.now();
    const res = await postDecision(app, cookie, r.id, "approve", {});
    const t1 = Date.now();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: r.id,
      status: "APPROVED",
      decidedBy: { id: w.c.id, username: "custodian1", displayName: "Custodian One" },
      rejectionReason: null,
    });
    const decidedAt = new Date(res.body.decidedAt).getTime();
    expect(decidedAt).toBeGreaterThanOrEqual(t0);
    expect(decidedAt).toBeLessThanOrEqual(t1);
    expect(res.body.history.at(-1)).toMatchObject({ fromStatus: "PENDING", toStatus: "APPROVED" });

    const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ status: "APPROVED", decidedById: w.c.id, rejectionReason: null });
    expect(row.decidedAt?.toISOString()).toBe(res.body.decidedAt);
    const history = await prisma.historyEntry.findMany({ where: { requestId: r.id } });
    expect(await prisma.historyEntry.count()).toBe(historyBefore + 1);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      actorType: "USER",
      actorUserId: w.c.id,
      entityType: "REQUEST",
      requestId: r.id,
      unitId: null,
      loanId: null,
      action: "STATUS_CHANGED",
      fromStatus: "PENDING",
      toStatus: "APPROVED",
      details: null,
    });
    expect(history[0].occurredAt.toISOString()).toBe(res.body.decidedAt);
    expect(await prisma.requestLine.findMany({ orderBy: { id: "asc" } })).toEqual(linesBefore);
    expect(await prisma.unit.findMany({ orderBy: { id: "asc" } })).toEqual(unitsBefore);
    expect(await prisma.loan.count()).toBe(0);
  });
});

describe("TEST-83 (AC-83): reject a PENDING request with a reason", () => {
  it("TEST-83 (a), (b): the trimmed reason is stored with one history entry; the owner sees state, time and reason only", async () => {
    const w = await world();
    const r = await createRequest(prisma, { borrowerId: w.a.id, itemTypeId: w.t1.id });

    const res = await postDecision(app, await signIn(app, "custodian1"), r.id, "reject", {
      reason: "  Only one unit left.  ",
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "REJECTED",
      rejectionReason: "Only one unit left.",
      decidedBy: { id: w.c.id },
    });
    const history = await prisma.historyEntry.findMany({ where: { requestId: r.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ fromStatus: "PENDING", toStatus: "REJECTED", details: { reason: "Only one unit left." } });
    expect(history[0].occurredAt.toISOString()).toBe(res.body.decidedAt);

    const own = await getAs(app, await signIn(app, "borrower1"), `/api/requests/${r.id}`);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ status: "REJECTED", rejectionReason: "Only one unit left.", decidedAt: res.body.decidedAt });
    expect(own.body).not.toHaveProperty("decidedBy");
    expect(own.body).not.toHaveProperty("history");
  });
});

describe("TEST-84 (AC-84): bodies that fail the schema", () => {
  it.each([
    ["(a) reject with {}", "reject", {}, "reason"],
    ["(b) reject with a blank reason", "reject", { reason: "   " }, "reason"],
    ["(c) reject with 501 characters", "reject", { reason: "x".repeat(501) }, "reason"],
    ["(d) reject with an unknown field", "reject", { reason: "ok", lineIds: [1] }, "lineIds"],
    ["(e) approve with an unknown field", "approve", { lineIds: [1] }, "lineIds"],
  ] as const)("TEST-84 %s is 400 VALIDATION_FAILED naming the field, and nothing changes", async (_name, decision, body, field) => {
    const w = await world();
    const r = await createRequest(prisma, { borrowerId: w.a.id, itemTypeId: w.t1.id });
    const cookie = await signIn(app, "custodian1");
    const before = await snapshotRequestState(prisma);

    const res = await postDecision(app, cookie, r.id, decision, body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(detailFields(res)).toContain(field);
    expect(await snapshotRequestState(prisma)).toEqual(before);
  });

  it("TEST-84 (f): a reason of exactly 500 characters is accepted and stored whole", async () => {
    const w = await world();
    const r2 = await createRequest(prisma, { borrowerId: w.a.id, itemTypeId: w.t1.id });

    const res = await postDecision(app, await signIn(app, "custodian1"), r2.id, "reject", { reason: "x".repeat(500) });

    expect(res.status).toBe(200);
    const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: r2.id } });
    expect(row.rejectionReason).toHaveLength(500);
  });

  it("TEST-84: a path id that is not 1 to 2 147 483 647 is 400 naming id", async () => {
    await world();
    const cookie = await signIn(app, "custodian1");
    for (const id of ["abc", "0", "2147483648"]) {
      const res = await postDecision(app, cookie, id, "approve", {});
      expect(res.status).toBe(400);
      expect(detailFields(res)).toContain("id");
    }
  });
});

describe("TEST-85 (AC-85): only PENDING can be decided; unknown request", () => {
  it.each([
    [RequestStatus.APPROVED, "approve", "approved"],
    [RequestStatus.APPROVED, "reject", "rejected"],
    [RequestStatus.REJECTED, "approve", "approved"],
    [RequestStatus.REJECTED, "reject", "rejected"],
    [RequestStatus.CHECKED_OUT, "approve", "approved"],
    [RequestStatus.CHECKED_OUT, "reject", "rejected"],
  ] as const)("TEST-85: %s request, %s is 409 INVALID_STATE naming the state", async (status, decision, verb) => {
    const w = await world();
    const r = await createRequest(prisma, {
      borrowerId: w.a.id,
      itemTypeId: w.t1.id,
      status,
      ...(status === RequestStatus.CHECKED_OUT ? {} : { decidedById: w.c2.id, decidedAt: at(1) }),
      ...(status === RequestStatus.REJECTED ? { rejectionReason: "No." } : {}),
    });
    const cookie = await signIn(app, "custodian1");
    const before = await snapshotRequestState(prisma);

    const res = await postDecision(app, cookie, r.id, decision, decision === "reject" ? { reason: "Broken." } : {});

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATE");
    expect(res.body.error.message).toBe(`Request #${r.id} cannot be ${verb} because it is ${status}, not PENDING.`);
    expect(await snapshotRequestState(prisma)).toEqual(before);
  });

  it("TEST-85: approving request 999999 is 404 NOT_FOUND", async () => {
    await world();
    const cookie = await signIn(app, "custodian1");
    const before = await snapshotRequestState(prisma);

    const res = await postDecision(app, cookie, 999999, "approve", {});

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toBe("Request 999999 does not exist.");
    expect(await snapshotRequestState(prisma)).toEqual(before);
  });
});
