import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp } from "../helpers/app.js";

// No stack trace and no server file paths may reach the client (NFR-08).
function expectNoInternals(body: unknown) {
  const text = JSON.stringify(body);
  expect(text).not.toMatch(/stack/i);
  expect(text).not.toMatch(/\bat\s+\S+\s+\(/); // stack frame "at fn (file:line)"
  expect(text).not.toMatch(/[A-Za-z]:\\|\/(src|dist|node_modules)\//); // file paths
  expect(text).not.toMatch(/\.(ts|js):\d+/);
}

function expectErrorShape(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.headers["content-type"]).toMatch(/^application\/json/);
  expect(Object.keys(res.body)).toEqual(["error"]);
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe("string");
  expect(res.body.error.message.length).toBeGreaterThan(0);
  expect(res.body.error.requestId).toBe(res.headers["x-request-id"]);
  expectNoInternals(res.body);
}

describe("TEST-29 (NFR-08): JSON error shape", () => {
  it("TEST-29: unknown API route returns 404 NOT_FOUND in the JSON error shape", async () => {
    const res = await request(createTestApp()).get("/api/does-not-exist");

    expectErrorShape(res, 404, "NOT_FOUND");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("TEST-29: malformed JSON returns 400 VALIDATION_FAILED with details and no stack trace", async () => {
    const res = await request(createTestApp())
      .post("/api/does-not-exist")
      .set("Content-Type", "application/json")
      .send('{"lines": [ {"itemTypeId": 3,, } ]');

    expectErrorShape(res, 400, "VALIDATION_FAILED");
    expect(res.body.error.details).toEqual([{ field: "body", issue: "Malformed JSON" }]);
  });
});

describe("Content type (SDS 6.2)", () => {
  it("POST without Content-Type: application/json returns 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    const res = await request(createTestApp())
      .post("/api/does-not-exist")
      .set("Content-Type", "application/x-www-form-urlencoded")
      .send("username=a&password=b");

    expectErrorShape(res, 415, "UNSUPPORTED_MEDIA_TYPE");
  });

  it("PATCH with a text/plain body returns 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    const res = await request(createTestApp()).patch("/api/does-not-exist").set("Content-Type", "text/plain").send("x");

    expectErrorShape(res, 415, "UNSUPPORTED_MEDIA_TYPE");
  });

  it("a JSON POST with an empty body is not rejected as 415", async () => {
    const res = await request(createTestApp()).post("/api/does-not-exist").set("Content-Type", "application/json");

    expectErrorShape(res, 404, "NOT_FOUND");
  });

  it("a body over 100 KB is rejected with 400 VALIDATION_FAILED", async () => {
    const res = await request(createTestApp())
      .post("/api/does-not-exist")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ text: "x".repeat(101 * 1024) }));

    expectErrorShape(res, 400, "VALIDATION_FAILED");
  });
});
