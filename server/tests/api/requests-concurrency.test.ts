// TEST-37 (AC-37): BR-04 holds when one Borrower submits twice at the same time (DD-05).
import { describe, expect, it } from "vitest";
import { createTestApp, prisma } from "../helpers/app.js";
import { signIn } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createItemTypeWithUnits } from "../helpers/factories.js";
import { oneLine, postRequest } from "../helpers/requests.js";

const RUNS = 20;

describe("TEST-37 (AC-37): concurrent duplicate creates", () => {
  it(`TEST-37: two parallel creates store one request, ${RUNS} runs`, async () => {
    const app = createTestApp();
    for (let run = 0; run < RUNS; run++) {
      // Each run starts clean, so the counts below are per run.
      await resetDb(prisma);
      const b1 = await createBorrower(prisma, { username: "borrower1" });
      const arduino = await createItemTypeWithUnits(prisma, { name: "Arduino Uno R3" }, { AVAILABLE: 2 });
      const cookie = await signIn(app, "borrower1");

      const results = await Promise.all([
        postRequest(app, cookie, oneLine(arduino.id)),
        postRequest(app, cookie, oneLine(arduino.id)),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe("DUPLICATE_OPEN_REQUEST");
      expect(await prisma.borrowRequest.count({ where: { borrowerId: b1.id } })).toBe(1);
      expect(await prisma.historyEntry.count()).toBe(1);
    }
  }, 60_000);
});
