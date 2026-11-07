// Shared middleware checked on a small test-only app; no feature routes exist yet.
import express from "express";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError } from "../../src/core/errors.js";
import { apiNotFound, errorHandler } from "../../src/core/middleware/error-handler.js";
import { requestId } from "../../src/core/middleware/request-context.js";
import { requireJson } from "../../src/core/middleware/require-json.js";
import { validate } from "../../src/core/middleware/validate.js";

function testApp(register: (app: express.Express) => void) {
  const app = express();
  app.use(requestId, requireJson, express.json({ limit: "100kb" }));
  register(app);
  app.use(apiNotFound, errorHandler(true));
  return app;
}

afterEach(() => vi.restoreAllMocks());

describe("error handler (SDS 6.5)", () => {
  it("turns an unexpected error into 500 INTERNAL_ERROR, logs the stack, and sends none of it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = testApp((a) =>
      a.get("/boom", () => {
        throw new Error("secret internal detail at /srv/app/src/x.ts:12");
      }),
    );

    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong.", requestId: res.headers["x-request-id"] },
    });
    expect(log).toHaveBeenCalledOnce();
    const logged = JSON.parse(String(log.mock.calls[0][0]));
    expect(logged.stack).toContain("secret internal detail");
    expect(logged.requestId).toBe(res.headers["x-request-id"]);
  });

  it("keeps the status, code and details of an AppError", async () => {
    const app = testApp((a) =>
      a.get("/rule", () => {
        throw new ConflictError("UNIT_NOT_AVAILABLE", "Unit KH-ARD-0007 is not available for checkout.", [
          { field: "units[0].unitId", issue: "Unit is ON_LOAN" },
        ]);
      }),
    );

    const res = await request(app).get("/rule");

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "UNIT_NOT_AVAILABLE",
      message: "Unit KH-ARD-0007 is not available for checkout.",
      details: [{ field: "units[0].unitId", issue: "Unit is ON_LOAN" }],
    });
  });

  it("maps a Prisma unique violation to 409 without the Prisma message", async () => {
    const app = testApp((a) =>
      a.get("/dup", () => {
        throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`assetTag`)", {
          code: "P2002",
          clientVersion: Prisma.prismaVersion.client,
          meta: { target: ["assetTag"] },
        });
      }),
    );

    const res = await request(app).get("/dup");

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(JSON.stringify(res.body)).not.toContain("assetTag");
  });

  it("maps a thrown ZodError to 400 VALIDATION_FAILED", async () => {
    const app = testApp((a) =>
      a.get("/zod", () => {
        z.object({ n: z.number() }).parse({ n: "x" });
      }),
    );

    const res = await request(app).get("/zod");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details).toEqual([{ field: "n", issue: expect.any(String) }]);
  });
});

describe("validate(schema) middleware (SDS 6.4, DD-09)", () => {
  const body = z.object({
    lines: z.array(z.object({ itemTypeId: z.number().int().positive(), quantity: z.literal(1) }).strict()).length(1),
  });
  const params = z.object({ id: z.coerce.number().int().positive() });

  const app = testApp((a) =>
    a.post("/things/:id", validate({ params, body }), (req, res) => {
      res.status(201).json({ id: req.params.id, typeOfId: typeof req.params.id, body: req.body });
    }),
  );

  it("passes parsed values to the handler", async () => {
    const res = await request(app)
      .post("/things/12")
      .send({ lines: [{ itemTypeId: 3, quantity: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 12, typeOfId: "number", body: { lines: [{ itemTypeId: 3, quantity: 1 }] } });
  });

  it("rejects an unknown field such as an owner (BR-05) even though the schema was not marked strict", async () => {
    const res = await request(app)
      .post("/things/12")
      .send({ lines: [{ itemTypeId: 3, quantity: 1 }], borrowerId: 7 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details).toEqual([{ field: "borrowerId", issue: "Unknown field" }]);
  });

  it("returns one details entry per problem, with array paths", async () => {
    const res = await request(app)
      .post("/things/abc")
      .send({ lines: [{ itemTypeId: -1, quantity: 2 }] });

    expect(res.status).toBe(400);
    const fields = res.body.error.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(["lines[0].itemTypeId", "lines[0].quantity", "params.id"]);
  });
});
