import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { RequestStatus, type PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createPrismaClient } from "../../src/core/prisma.js";
import { TEST_APP_CONFIG } from "../helpers/app.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower } from "../helpers/factories.js";

function start(prisma: PrismaClient): Promise<Server> {
  const app = createApp({ config: TEST_APP_CONFIG, prisma });
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

const stop = (server: Server) => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
const baseUrl = (server: Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

describe("TEST-27 (NFR-06): data survives a server restart", () => {
  let secondClient: PrismaClient | undefined;

  beforeAll(async () => {
    const client = createPrismaClient();
    await resetDb(client);
    await client.$disconnect();
  });

  afterAll(async () => {
    await secondClient?.$disconnect();
  });

  it("TEST-27: a borrow request created before a restart is still present after it", async () => {
    // First server instance with its own Prisma Client.
    const firstClient = createPrismaClient();
    const firstServer = await start(firstClient);
    expect((await request(baseUrl(firstServer)).get("/api/ready")).status).toBe(200);

    // F-02 has no API yet, so the record is created directly through Prisma.
    const borrower = await createBorrower(firstClient, { username: "persist.borrower" });
    const created = await firstClient.borrowRequest.create({
      data: { borrowerId: borrower.id },
    });
    expect(created.status).toBe(RequestStatus.PENDING);

    // "Restart": close the server and its Prisma Client; nothing is kept in memory.
    await stop(firstServer);
    await firstClient.$disconnect();

    // Second server instance with a new Prisma Client against the same database.
    secondClient = createPrismaClient();
    const secondServer = await start(secondClient);
    try {
      expect((await request(baseUrl(secondServer)).get("/api/ready")).status).toBe(200);

      const found = await secondClient.borrowRequest.findUnique({
        where: { id: created.id },
        include: { borrower: { select: { username: true } } },
      });
      expect(found).not.toBeNull();
      expect(found?.status).toBe(RequestStatus.PENDING);
      expect(found?.borrowerId).toBe(borrower.id);
      expect(found?.borrower.username).toBe("persist.borrower");
      expect(found?.createdAt.toISOString()).toBe(created.createdAt.toISOString());
    } finally {
      await stop(secondServer);
    }
  });
});
