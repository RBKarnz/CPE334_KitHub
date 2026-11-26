// Borrow requests: create, list and detail (contract F-02 3 and 4; multi-line create, contract F-04 3;
// edit and cancel, contract F-05 3); approve and reject, and the
// Custodian detail with history (contract F-06 3 and 5).
import {
  ActorType,
  HistoryEntity,
  RequestStatus,
  Role,
  UnitStatus,
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import type { AuthUser } from "../../core/middleware/authenticate.js";
import { ConflictError, NotFoundError } from "../../core/errors.js";
import { requestRuleViolation } from "../../domain/request-rules.js";
import { assertTransition } from "../../domain/transitions.js";
import type { CreateRequestBody, ListRequestsQuery } from "./requests.schemas.js";
import { historySelect, requestSelect, toHistoryView, toRequestView, type RequestRow } from "./requests.view.js";

/** Open requests block a second request for the same item type (BR-04, SRS glossary). */
const OPEN_STATUSES = [RequestStatus.PENDING, RequestStatus.APPROVED];

/** A Borrower may cancel a PENDING or APPROVED request (FR-12, BR-10). */
const CANCELLABLE: RequestStatus[] = [RequestStatus.PENDING, RequestStatus.APPROVED];

const lineField = (i: number, field: "itemTypeId" | "quantity") => `lines[${i}].${field}`;
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const units = (n: number) => `${n} available unit${n === 1 ? "" : "s"}`;

/**
 * Reads the facts for every line inside the caller's transaction and throws the first broken rule
 * (contract F-04 3.5): 404 for the first item type that does not exist, in body order, then the
 * rules in the order of requestRuleViolation. Each 409 names the first failing line in its message
 * and lists every failing line in `details`. `exceptRequestId` leaves out the request being edited
 * from BR-04 (F-05).
 */
export async function assertRequestRules(
  tx: Prisma.TransactionClient,
  borrowerId: number,
  body: CreateRequestBody,
  exceptRequestId?: number,
) {
  const ids = body.lines.map((l) => l.itemTypeId);
  const itemTypes = await tx.itemType.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, maxLoanDays: true, maxQuantityPerRequest: true },
  });
  const byId = new Map(itemTypes.map((t) => [t.id, t]));
  const missing = body.lines.findIndex((l) => !byId.has(l.itemTypeId));
  if (missing >= 0) {
    const itemTypeId = body.lines[missing].itemTypeId;
    throw new NotFoundError(`Item type ${itemTypeId} does not exist.`, [
      { field: lineField(missing, "itemTypeId"), issue: "Item type does not exist" },
    ]);
  }

  const [openLines, available] = await Promise.all([
    tx.requestLine.findMany({
      where: {
        itemTypeId: { in: ids },
        request: {
          borrowerId,
          status: { in: OPEN_STATUSES },
          ...(exceptRequestId !== undefined ? { id: { not: exceptRequestId } } : {}),
        },
      },
      orderBy: { requestId: "asc" },
      select: { itemTypeId: true, requestId: true },
    }),
    // One grouped count on units (itemTypeId, status), never stored (DD-08).
    tx.unit.groupBy({ by: ["itemTypeId"], where: { itemTypeId: { in: ids }, status: UnitStatus.AVAILABLE }, _count: { _all: true } }),
  ]);
  const openById = new Map<number, number>();
  for (const l of openLines) if (!openById.has(l.itemTypeId)) openById.set(l.itemTypeId, l.requestId);
  const availableById = new Map(available.map((a) => [a.itemTypeId, a._count._all]));

  const facts = body.lines.map((l) => {
    const t = byId.get(l.itemTypeId)!;
    return {
      name: t.name,
      quantity: l.quantity,
      maxQuantityPerRequest: t.maxQuantityPerRequest,
      maxLoanDays: t.maxLoanDays,
      availableCount: availableById.get(l.itemTypeId) ?? 0,
      openRequestId: openById.get(l.itemTypeId) ?? null,
    };
  });
  const violation = requestRuleViolation({ lines: facts, loanDays: body.loanDays });
  if (!violation) return;

  const first = facts[violation.lines[0]];
  switch (violation.rule) {
    case "DUPLICATE_OPEN_REQUEST":
      throw new ConflictError(
        violation.rule,
        `You already have an open request for ${first.name} (Request #${first.openRequestId}).`,
        violation.lines.map((i) => ({
          field: lineField(i, "itemTypeId"),
          issue: `Open request #${facts[i].openRequestId} has this item type`,
        })),
      );
    case "QUANTITY_LIMIT":
      throw new ConflictError(
        violation.rule,
        `You can request at most ${first.maxQuantityPerRequest} ${first.name} at a time.`,
        violation.lines.map((i) => ({ field: lineField(i, "quantity"), issue: `Maximum ${facts[i].maxQuantityPerRequest}` })),
      );
    case "LOAN_LENGTH_LIMIT":
      throw new ConflictError(
        violation.rule,
        `The loan length can be at most ${days(first.maxLoanDays)} because of ${first.name}.`,
        [{ field: "loanDays", issue: `Maximum ${first.maxLoanDays} (${first.name})` }],
      );
    case "ITEM_TYPE_UNAVAILABLE":
      throw new ConflictError(
        violation.rule,
        first.availableCount === 0
          ? `${first.name} has no available units.`
          : `${first.name} has only ${units(first.availableCount)}; you asked for ${first.quantity}.`,
        violation.lines.map((i) => ({ field: lineField(i, "itemTypeId"), issue: `${facts[i].availableCount} available` })),
      );
  }
}


/** A Borrower sees only their own requests; a Custodian sees all (BR-05, DD-06). */
const scopeFor = (user: AuthUser): Prisma.BorrowRequestWhereInput =>
  user.role === Role.BORROWER ? { borrowerId: user.id } : {};

/** A decision and the words of its messages (contract F-06 F06-D6). */
const DECISIONS = {
  approve: { to: RequestStatus.APPROVED, verb: "approved" },
  reject: { to: RequestStatus.REJECTED, verb: "rejected" },
} as const;

export type Decision = keyof typeof DECISIONS;

export function requestsService(prisma: PrismaClient) {
  return {
    /**
     * Creates a PENDING request owned by the signed-in Borrower with every line and one loan length
     * (contract F-04 3.1). Check order after the schema (3.5): lock the Borrower row, item types
     * exist in body order (404), then the rules BR-04 → BR-07 → BR-08 → BR-01 (409).
     */
    async create(user: AuthUser, body: CreateRequestBody) {
      const id = await prisma.$transaction(async (tx) => {
        // One timestamp for createdAt and the history entry (F02-D5).
        const now = new Date();
        // Lock the Borrower's row, so one Borrower's creates run one after another and the
        // second one sees the first request (BR-04 under concurrency, DD-05, SDS 4.7).
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
        await assertRequestRules(tx, user.id, body);

        // The owner is always the session user (BR-05). Lines in body order (F04-D7).
        const created = await tx.borrowRequest.create({
          data: {
            borrowerId: user.id,
            status: RequestStatus.PENDING,
            createdAt: now,
            loanDays: body.loanDays,
            lines: { create: body.lines.map(({ itemTypeId, quantity }) => ({ itemTypeId, quantity })) },
          },
          select: { id: true },
        });
        // History in the same transaction (BR-16, contract F-02 3.4, F-04 3.6).
        await tx.historyEntry.create({
          data: {
            occurredAt: now,
            actorType: ActorType.USER,
            actorUserId: user.id,
            entityType: HistoryEntity.REQUEST,
            requestId: created.id,
            action: "CREATED",
            fromStatus: null,
            toStatus: RequestStatus.PENDING,
          },
        });
        return created.id;
      });

      const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id }, select: requestSelect });
      return toRequestView(row, user.role);
    },

    /**
     * PATCH /requests/:id (contract F-05 3.1, 5.1): the Borrower's own PENDING request gets the whole
     * new content, checked as a new request (BR-10). Check order (3.5): lock the Borrower row, then
     * the request row within the Borrower's scope (404), PENDING (409 INVALID_STATE), then the F-04
     * checks where BR-04 ignores this request (F05-D3). A kept item type keeps its line (F05-D4); a
     * no-change edit writes nothing (F05-D5).
     */
    async edit(user: AuthUser, id: number, body: CreateRequestBody) {
      await prisma.$transaction(async (tx) => {
        const now = new Date();
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
        const [row] = await tx.$queryRaw<{ status: string; loanDays: number | null }[]>`
          SELECT status::text AS status, "loanDays" FROM borrow_requests
          WHERE id = ${id} AND "borrowerId" = ${user.id} FOR UPDATE`;
        if (!row) throw new NotFoundError(`Request ${id} does not exist.`);
        if (row.status !== RequestStatus.PENDING)
          throw new ConflictError("INVALID_STATE", `Request #${id} cannot be edited because it is ${row.status}, not PENDING.`);

        await assertRequestRules(tx, user.id, body, id);

        const stored = await tx.requestLine.findMany({
          where: { requestId: id },
          orderBy: { id: "asc" },
          select: { id: true, itemTypeId: true, quantity: true },
        });
        // SDS 4.6: the entry keeps the lines ordered by itemTypeId.
        const content = (loanDays: number | null, lines: { itemTypeId: number; quantity: number }[]) => ({
          loanDays,
          lines: [...lines].sort((a, b) => a.itemTypeId - b.itemTypeId).map(({ itemTypeId, quantity }) => ({ itemTypeId, quantity })),
        });
        const before = content(row.loanDays, stored);
        const after = content(body.loanDays, body.lines);
        if (JSON.stringify(before) === JSON.stringify(after)) return;

        const wanted = new Map(body.lines.map((l) => [l.itemTypeId, l.quantity]));
        const kept = new Set<number>();
        for (const line of stored) {
          const quantity = wanted.get(line.itemTypeId);
          if (quantity === undefined) await tx.requestLine.delete({ where: { id: line.id } });
          else {
            kept.add(line.itemTypeId);
            if (quantity !== line.quantity) await tx.requestLine.update({ where: { id: line.id }, data: { quantity } });
          }
        }
        // New item types get new lines after the kept ones, in body order (F05-D4).
        for (const line of body.lines.filter((l) => !kept.has(l.itemTypeId)))
          await tx.requestLine.create({ data: { requestId: id, itemTypeId: line.itemTypeId, quantity: line.quantity } });

        await tx.borrowRequest.update({ where: { id }, data: { loanDays: body.loanDays } });
        await tx.historyEntry.create({
          data: {
            occurredAt: now,
            actorType: ActorType.USER,
            actorUserId: user.id,
            entityType: HistoryEntity.REQUEST,
            requestId: id,
            action: "EDITED",
            fromStatus: null,
            toStatus: null,
            details: { before, after },
          },
        });
      });
      const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id }, select: requestSelect });
      return toRequestView(row, user.role);
    },

    /**
     * POST /requests/:id/cancel (contract F-05 3.1, 5.2): the Borrower's own PENDING or APPROVED
     * request becomes CANCELLED with one history entry. The row is locked first, so the state read is
     * the one the conditional update sees (3.7); no unit changes (D-15).
     */
    async cancel(user: AuthUser, id: number) {
      await prisma.$transaction(async (tx) => {
        const now = new Date();
        // The Borrower row first, as create and edit do (SDS 4.7). The history insert below takes a
        // key-share lock on that row (actorUserId); locking the request row first deadlocked with a
        // concurrent edit, which holds the Borrower row and waits for the request row (TEST-78 (b)).
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
        const [row] = await tx.$queryRaw<{ status: RequestStatus }[]>`
          SELECT status::text AS status FROM borrow_requests WHERE id = ${id} AND "borrowerId" = ${user.id} FOR UPDATE`;
        if (!row) throw new NotFoundError(`Request ${id} does not exist.`);
        if (!CANCELLABLE.includes(row.status))
          throw new ConflictError("INVALID_STATE", `Request #${id} cannot be cancelled because it is ${row.status}.`);
        assertTransition("REQUEST", row.status, RequestStatus.CANCELLED);

        const moved = await tx.borrowRequest.updateMany({
          where: { id, status: { in: CANCELLABLE } },
          data: { status: RequestStatus.CANCELLED },
        });
        if (moved.count === 0) {
          // Not reached while the row lock is held; kept as the SDS 4.7 guard.
          const current = await tx.borrowRequest.findUniqueOrThrow({ where: { id }, select: { status: true } });
          throw new ConflictError("INVALID_STATE", `Request #${id} cannot be cancelled because it is ${current.status}.`);
        }
        await tx.historyEntry.create({
          data: {
            occurredAt: now,
            actorType: ActorType.USER,
            actorUserId: user.id,
            entityType: HistoryEntity.REQUEST,
            requestId: id,
            action: "STATUS_CHANGED",
            fromStatus: row.status,
            toStatus: RequestStatus.CANCELLED,
          },
        });
      });
      const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id }, select: requestSelect });
      return toRequestView(row, user.role);
    },

    /** Borrower: own requests, newest first. Custodian: all requests, oldest first (F02-D4). */
    async list(user: AuthUser, query: ListRequestsQuery) {
      const direction = user.role === Role.BORROWER ? "desc" : "asc";
      const rows = await prisma.borrowRequest.findMany({
        where: { ...scopeFor(user), ...(query.status ? { status: query.status } : {}) },
        orderBy: [{ createdAt: direction }, { id: direction }],
        select: requestSelect,
      });
      return rows.map((row) => toRequestView(row, user.role));
    },

    /**
     * Another Borrower's request gets the same 404 as one that does not exist (DD-06). A Custodian
     * also gets the request's history, oldest first (FR-30, F06-D5).
     */
    async get(user: AuthUser, id: number) {
      const row = await prisma.borrowRequest.findFirst({ where: { id, ...scopeFor(user) }, select: requestSelect });
      if (!row) throw new NotFoundError(`Request ${id} does not exist.`);
      return this.detail(user, row);
    },

    /** The detail shape: the request view, plus `history` for a Custodian (F06-D4, F06-D5). */
    async detail(user: AuthUser, row: RequestRow) {
      const view = toRequestView(row, user.role);
      if (user.role !== Role.CUSTODIAN) return view;
      const history = await prisma.historyEntry.findMany({
        where: { requestId: row.id },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: historySelect,
      });
      return { ...view, history: history.map(toHistoryView) };
    },

    /**
     * Approves or rejects a PENDING request as a whole (FR-13, FR-14, BR-09). In one transaction:
     * a conditional update WHERE status = 'PENDING', then one history entry with the same time
     * (contract F-06 3.1, 3.6). 0 rows updated → re-read: 404 if missing, else 409 INVALID_STATE
     * with the state another call set (3.5, 3.7).
     */
    async decide(user: AuthUser, id: number, decision: Decision, reason?: string) {
      const { to, verb } = DECISIONS[decision];
      assertTransition("REQUEST", RequestStatus.PENDING, to);
      await prisma.$transaction(async (tx) => {
        // One timestamp for decidedAt and occurredAt (contract F-06 3.6).
        const now = new Date();
        const moved = await tx.borrowRequest.updateMany({
          where: { id, status: RequestStatus.PENDING },
          data: {
            status: to,
            decidedById: user.id,
            decidedAt: now,
            ...(decision === "reject" ? { rejectionReason: reason } : {}),
          },
        });
        if (moved.count === 0) {
          const current = await tx.borrowRequest.findUnique({ where: { id }, select: { status: true } });
          if (!current) throw new NotFoundError(`Request ${id} does not exist.`);
          throw new ConflictError(
            "INVALID_STATE",
            `Request #${id} cannot be ${verb} because it is ${current.status}, not PENDING.`,
          );
        }
        // History in the same transaction (BR-16, contract F-06 3.6).
        await tx.historyEntry.create({
          data: {
            occurredAt: now,
            actorType: ActorType.USER,
            actorUserId: user.id,
            entityType: HistoryEntity.REQUEST,
            requestId: id,
            action: "STATUS_CHANGED",
            fromStatus: RequestStatus.PENDING,
            toStatus: to,
            ...(decision === "reject" ? { details: { reason: reason! } } : {}),
          },
        });
      });
      const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id }, select: requestSelect });
      return this.detail(user, row);
    },
  };
}
