// TEST-16 (AC-16): request creation writes one history entry (contract F-02 3.4).
import { beforeEach, describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createItemTypeWithUnits } from "../helpers/factories.js";
import { oneLine, postRequest } from "../helpers/requests.js";

beforeEach(async () => {
  await resetDb(prisma);
});

describe("TEST-16 (AC-16): history entry for request creation", () => {
  it("TEST-16: exactly one CREATED entry with the Borrower as actor at the request's createdAt", async () => {
    const b1 = await createBorrower(prisma, { username: "borrower1" });
    const arduino = await createItemTypeWithUnits(prisma, { name: "Arduino Uno R3" }, { AVAILABLE: 1 });
    const app = createTestApp();

    const res = await postRequest(app, await signIn(app, "borrower1"), oneLine(arduino.id));
    expect(res.status).toBe(201);

    const entries = await prisma.historyEntry.findMany({ where: { requestId: res.body.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      entityType: "REQUEST",
      action: "CREATED",
      fromStatus: null,
      toStatus: "PENDING",
      actorType: "USER",
      actorUserId: b1.id,
      unitId: null,
      loanId: null,
    });
    const created = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(entries[0].occurredAt.getTime()).toBe(created.createdAt.getTime());
    expect(new Date(res.body.createdAt).getTime()).toBe(created.createdAt.getTime());
  });
});
