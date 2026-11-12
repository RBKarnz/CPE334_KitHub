import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../src/core/prisma.js";
import { createTestApp } from "../helpers/app.js";

// A client whose database cannot be reached: nothing listens on port 1.
const unreachable = createPrismaClient("postgresql://nobody:nothing@127.0.0.1:1/unreachable_test?connect_timeout=2");

afterAll(async () => {
  await unreachable.$disconnect();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("GET /api/health (SDS 6.7)", () => {
  it("returns 200 { status: ok } without touching the database", async () => {
    const res = await request(createTestApp(unreachable)).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("sends Cache-Control: no-store and a UUID X-Request-Id on every /api response", async () => {
    const app = createTestApp(unreachable);
    const first = await request(app).get("/api/health");
    const second = await request(app).get("/api/health");

    expect(first.headers["cache-control"]).toBe("no-store");
    expect(first.headers["x-request-id"]).toMatch(UUID);
    expect(second.headers["x-request-id"]).toMatch(UUID);
    expect(second.headers["x-request-id"]).not.toBe(first.headers["x-request-id"]);
  });
});

describe("GET /api/ready (SDS 6.7)", () => {
  it("returns 200 { status: ready, db: connected } with the test database", async () => {
    const res = await request(createTestApp()).get("/api/ready");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", db: "connected" });
  });

  it("returns 503 NOT_READY when the database cannot be reached", async () => {
    const res = await request(createTestApp(unreachable)).get("/api/ready");

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("NOT_READY");
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
    expect(JSON.stringify(res.body)).not.toContain("127.0.0.1");
  });
});
