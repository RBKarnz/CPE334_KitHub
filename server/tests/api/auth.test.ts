// F-01 sign-in, sign-out, current user and roles: TEST-01 to TEST-06 of contract F-01
// (docs/sprints/sprint-1/F-01-auth.md section 8).
import { randomBytes } from "node:crypto";
import request from "supertest";
import { Role } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";
import { authenticate, requireRole } from "../../src/core/middleware/authenticate.js";
import { createTestApp, prisma } from "../helpers/app.js";
import { login, sessionCookieFrom, sessionIdFor, sessionSetCookieLine, signIn, signOut } from "../helpers/auth.js";
import { resetDb } from "../helpers/db.js";
import { createBorrower, createCustodian } from "../helpers/factories.js";

const HOUR_MS = 3_600_000;

let borrower: Awaited<ReturnType<typeof createBorrower>>;

beforeEach(async () => {
  await resetDb(prisma);
  borrower = await createBorrower(prisma, { username: "borrower1", displayName: "Borrower One" });
  await createCustodian(prisma, { username: "custodian1", displayName: "Custodian One" });
});

function expectOnlyError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(Object.keys(res.body)).toEqual(["error"]);
  expect(res.body.error.code).toBe(code);
}

describe("TEST-01 (AC-01): valid sign-in starts a session and /me returns the user", () => {
  it.each([
    ["borrower1", "borrower1", "Borrower One", "BORROWER"],
    ["custodian1", "custodian1", "Custodian One", "CUSTODIAN"],
    ["Borrower1", "borrower1", "Borrower One", "BORROWER"],
  ])("TEST-01: %s signs in", async (typed, username, displayName, role) => {
    const app = createTestApp();
    const res = await login(app, typed);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: expect.any(Number), username, displayName, role } });
    const line = sessionSetCookieLine(res);
    expect(line).toBeDefined();
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=Lax/i);
    expect(line).toMatch(/Path=\//);
    expect(await prisma.session.count()).toBe(1);

    const me = await request(app).get("/api/auth/me").set("Cookie", sessionCookieFrom(res)!);
    expect(me.status).toBe(200);
    expect(me.body).toEqual(res.body);
    expect(JSON.stringify([res.body, me.body])).not.toMatch(/passwordHash/);
  });
});

describe("TEST-02 (AC-02): wrong sign-in is rejected with one generic message", () => {
  it("TEST-02: unknown username and wrong password give the same 401 and no session", async () => {
    const app = createTestApp();
    const unknown = await login(app, "nobody");
    const wrong = await login(app, "borrower1", "not-the-password");

    for (const res of [unknown, wrong]) {
      expectOnlyError(res, 401, "INVALID_CREDENTIALS");
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
    expect(unknown.body.error.message).toBe("Username or password is incorrect.");
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(await prisma.session.count()).toBe(0);
  });

  it.each([
    ["empty password", { username: "borrower1", password: "" }, "password"],
    ["unknown field", { username: "borrower1", password: "x", role: "CUSTODIAN" }, "role"],
  ])("TEST-02: %s gives 400 VALIDATION_FAILED naming the field", async (_case, body, field) => {
    const res = await request(createTestApp())
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send(body);

    expectOnlyError(res, 400, "VALIDATION_FAILED");
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(await prisma.session.count()).toBe(0);
  });
});

describe("TEST-03 (AC-03): sign-out ends the session", () => {
  it("TEST-03 (a): logout without Content-Type is 415 and the session stays", async () => {
    const app = createTestApp();
    const cookie = await signIn(app, "borrower1");

    const res = await request(app).post("/api/auth/logout").set("Cookie", cookie);

    expectOnlyError(res, 415, "UNSUPPORTED_MEDIA_TYPE");
    expect(await prisma.session.count()).toBe(1);
  });

  it("TEST-03 (b, c): logout deletes the session, the old cookie is rejected, and a second logout is 204", async () => {
    const app = createTestApp();
    const cookie = await signIn(app, "borrower1");

    const out = await signOut(app, cookie);
    expect(out.status).toBe(204);
    expect(out.text).toBe("");
    expect(sessionSetCookieLine(out)).toMatch(/^kithub_session=;.*Max-Age=0/);
    expect(await prisma.session.count()).toBe(0);

    const me = await request(app).get("/api/auth/me").set("Cookie", cookie);
    expectOnlyError(me, 401, "UNAUTHENTICATED");

    const again = await signOut(app);
    expect(again.status).toBe(204);
  });
});

describe("TEST-04 (AC-04): sessions expire", () => {
  it("TEST-04 (a): a new session expires 8 hours after sign-in", async () => {
    const before = Date.now();
    const res = await login(createTestApp(), "borrower1");
    const after = Date.now();

    const session = await prisma.session.findFirstOrThrow({ where: { userId: borrower.id } });
    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 8 * HOUR_MS - 60_000);
    expect(session.expiresAt.getTime()).toBeLessThanOrEqual(after + 8 * HOUR_MS + 60_000);
    expect(sessionSetCookieLine(res)).toMatch(/Max-Age=28800\b/);
  });

  it("TEST-04 (b): a session whose expiry has passed is rejected with no user data", async () => {
    const token = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: { id: sessionIdFor(token), userId: borrower.id, expiresAt: new Date(Date.now() - 60_000) },
    });

    const res = await request(createTestApp()).get("/api/auth/me").set("Cookie", `kithub_session=${token}`);

    expectOnlyError(res, 401, "UNAUTHENTICATED");
    expect(JSON.stringify(res.body)).not.toContain("borrower1");
  });
});

describe("TEST-05 (AC-05): protected calls need a valid session", () => {
  it.each([
    ["no cookie", undefined],
    ["an unknown token", `kithub_session=${randomBytes(32).toString("base64url")}`],
  ])("TEST-05: /api/auth/me with %s is 401 with no private data", async (_case, cookie) => {
    const req = request(createTestApp()).get("/api/auth/me");
    const res = await (cookie ? req.set("Cookie", cookie) : req);

    expectOnlyError(res, 401, "UNAUTHENTICATED");
    expect(res.body.error.message).toBe("You are not signed in.");
    expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  });

  it("TEST-05: health and sign-in stay reachable without a cookie", async () => {
    const app = createTestApp();
    expect((await request(app).get("/api/health")).status).toBe(200);
    expect((await login(app, "borrower1")).status).toBe(200);
  });
});

describe("TEST-06 (AC-06): requireRole rejects the wrong role before the handler runs", () => {
  // A route that exists only in the test app; its handler writes a row (contract F-01 8.1).
  const app = createTestApp(prisma, {
    mountTestRoutes: (api) => {
      api.post("/test/custodian-only", authenticate(prisma), requireRole(Role.CUSTODIAN), async (_req, res) => {
        await createBorrower(prisma);
        res.status(201).json({ ok: true });
      });
    },
  });

  it("TEST-06: a Borrower gets 403 and nothing is written; a Custodian passes", async () => {
    const usersBefore = await prisma.user.count();
    const asBorrower = await request(app)
      .post("/api/test/custodian-only")
      .set("Content-Type", "application/json")
      .set("Cookie", await signIn(app, "borrower1"));

    expectOnlyError(asBorrower, 403, "FORBIDDEN");
    expect(await prisma.user.count()).toBe(usersBefore);

    const asCustodian = await request(app)
      .post("/api/test/custodian-only")
      .set("Content-Type", "application/json")
      .set("Cookie", await signIn(app, "custodian1"));

    expect(asCustodian.status).toBe(201);
    expect(await prisma.user.count()).toBe(usersBefore + 1);
  });
});
