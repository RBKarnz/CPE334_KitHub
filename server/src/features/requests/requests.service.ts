// Borrow requests: create, list and detail (contract F-02 3 and 4).
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
import type { CreateRequestBody, ListRequestsQuery } from "./requests.schemas.js";
import { requestSelect, toRequestView } from "./requests.view.js";

/** Open requests block a second request for the same item type (BR-04, SRS glossary). */
const OPEN_STATUSES = [RequestStatus.PENDING, RequestStatus.APPROVED];

const ITEM_TYPE_FIELD = "lines[0].itemTypeId";

/** A Borrower sees only their own requests; a Custodian sees all (BR-05, DD-06). */
const scopeFor = (user: AuthUser): Prisma.BorrowRequestWhereInput =>
  user.role === Role.BORROWER ? { borrowerId: user.id } : {};

export function requestsService(prisma: PrismaClient) {
  return {
    /**
     * Creates a PENDING request owned by the signed-in Borrower. Check order after the schema:
     * item type exists (404), BR-04 (409), BR-01 (409) (contract F-02 3.3).
     */
    async create(user: AuthUser, body: CreateRequestBody) {
      const [{ itemTypeId, quantity }] = body.lines;
      const id = await prisma.$transaction(async (tx) => {
        // One timestamp for createdAt and the history entry (F02-D5).
        const now = new Date();
        // Lock the Borrower's row, so one Borrower's creates run one after another and the
        // second one sees the first request (BR-04 under concurrency, DD-05, SDS 4.7).
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;

        const itemType = await tx.itemType.findUnique({ where: { id: itemTypeId }, select: { id: true, name: true } });
        if (!itemType)
          throw new NotFoundError(`Item type ${itemTypeId} does not exist.`, [
            { field: ITEM_TYPE_FIELD, issue: "Item type does not exist" },
          ]);

        const openRequest = await tx.borrowRequest.findFirst({
          where: { borrowerId: user.id, status: { in: OPEN_STATUSES }, lines: { some: { itemTypeId } } },
          orderBy: { id: "asc" },
          select: { id: true },
        });
        const availableCount = await tx.unit.count({ where: { itemTypeId, status: UnitStatus.AVAILABLE } });

        const violation = requestRuleViolation({ hasOpenRequest: openRequest !== null, availableCount, quantity });
        if (violation === "DUPLICATE_OPEN_REQUEST")
          throw new ConflictError(
            violation,
            `You already have an open request for ${itemType.name} (Request #${openRequest!.id}).`,
            [{ field: ITEM_TYPE_FIELD, issue: `Open request #${openRequest!.id} has this item type` }],
          );
        if (violation === "ITEM_TYPE_UNAVAILABLE")
          throw new ConflictError(violation, `${itemType.name} has no available units.`, [
            { field: ITEM_TYPE_FIELD, issue: `${availableCount} available` },
          ]);

        // The owner is always the session user (BR-05).
        const created = await tx.borrowRequest.create({
          data: {
            borrowerId: user.id,
            status: RequestStatus.PENDING,
            createdAt: now,
            lines: { create: { itemTypeId, quantity } },
          },
          select: { id: true },
        });
        // History in the same transaction (BR-16, contract F-02 3.4).
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

    /** Another Borrower's request gets the same 404 as one that does not exist (DD-06). */
    async get(user: AuthUser, id: number) {
      const row = await prisma.borrowRequest.findFirst({ where: { id, ...scopeFor(user) }, select: requestSelect });
      if (!row) throw new NotFoundError(`Request ${id} does not exist.`);
      return toRequestView(row, user.role);
    },
  };
}
