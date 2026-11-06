// Session tokens and the session cookie (SDS 8.3).
import { createHash, randomBytes } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";

export const SESSION_COOKIE = "kithub_session";

/** 32 random bytes, base64url. Only the client holds the token. */
export const newSessionToken = () => randomBytes(32).toString("base64url");

/** The sessions.id of a token: its SHA-256 hex digest. The token itself is never stored. */
export const sessionIdFor = (token: string) => createHash("sha256").update(token).digest("hex");

/** The session token from the Cookie header, or undefined. */
export function readSessionToken(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return value === "" ? undefined : value;
  }
  return undefined;
}

export interface SessionCookieSettings {
  sessionTtlHours: number;
  cookieSecure: boolean;
}

const baseOptions = (secure: boolean): CookieOptions => ({ httpOnly: true, sameSite: "lax", path: "/", secure });

export function setSessionCookie(res: Response, token: string, settings: SessionCookieSettings): void {
  res.cookie(SESSION_COOKIE, token, {
    ...baseOptions(settings.cookieSecure),
    maxAge: settings.sessionTtlHours * 3_600_000,
  });
}

/** Max-Age=0 tells the browser to drop the cookie at once (SDS 8.5). */
export function clearSessionCookie(res: Response, settings: SessionCookieSettings): void {
  res.cookie(SESSION_COOKIE, "", { ...baseOptions(settings.cookieSecure), maxAge: 0 });
}
