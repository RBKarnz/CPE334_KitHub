// Shared sign-in and sign-out for API tests (contract F-01 section 8). Every POST sends
// Content-Type: application/json, including logout, which has no body; without it the
// API returns 415 and the session stays (contract F-01 4.2).
import { createHash } from "node:crypto";
import request from "supertest";
import type { Express } from "express";
import { TEST_PASSWORD } from "./factories.js";

export const SESSION_COOKIE = "kithub_session";

/** The kithub_session=<token> pair from a response's Set-Cookie header, or undefined. */
export function sessionCookieFrom(res: request.Response): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  return line?.split(";")[0];
}

/** The full Set-Cookie line for the session cookie, for checking its attributes. */
export function sessionSetCookieLine(res: request.Response): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
}

/** The session ID stored in the database for a token: SHA-256 hex (SDS 8.3). */
export const sessionIdFor = (token: string) => createHash("sha256").update(token).digest("hex");

export function login(app: Express, username: string, password: string = TEST_PASSWORD) {
  return request(app).post("/api/auth/login").set("Content-Type", "application/json").send({ username, password });
}

/** Signs in and returns the cookie to send on later calls. Fails the test if sign-in fails. */
export async function signIn(app: Express, username: string, password: string = TEST_PASSWORD): Promise<string> {
  const res = await login(app, username, password);
  const cookie = sessionCookieFrom(res);
  if (res.status !== 200 || !cookie) throw new Error(`sign-in as ${username} failed with ${res.status}`);
  return cookie;
}

/** Signs out with Content-Type: application/json. Pass no cookie to sign out with none. */
export function signOut(app: Express, cookie?: string) {
  const req = request(app).post("/api/auth/logout").set("Content-Type", "application/json");
  return cookie ? req.set("Cookie", cookie) : req;
}
