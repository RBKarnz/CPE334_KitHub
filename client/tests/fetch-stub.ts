// A fetch stub for tests that render the whole app (F-07 LoansPage pattern): replies are queued per
// "METHOD /api/path"; every call and its JSON body is recorded. A test file that uses it imports no
// page or API module a feature adds, so its RED run fails on assertions, not on a missing module.
import { vi } from "vitest";

export type Reply = { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;

export interface FetchStub {
  /** Replies per "METHOD /api/path"; the last one repeats. */
  routes: Record<string, Reply[]>;
  /** Every call in order, as "METHOD /api/path". */
  calls: string[];
  /** The parsed JSON body of every call with a body, in order. */
  bodies: { key: string; body: unknown }[];
}

/** Stubs the global fetch; undo with vi.unstubAllGlobals() in afterEach. */
export function stubFetch(): FetchStub {
  const stub: FetchStub = { routes: {}, calls: [], bodies: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const key = `${init.method ?? "GET"} ${url}`;
      stub.calls.push(key);
      if (typeof init.body === "string") stub.bodies.push({ key, body: JSON.parse(init.body) });
      const queue = stub.routes[key];
      if (!queue || queue.length === 0) throw new Error(`unexpected call ${key}`);
      const r = await (queue.length > 1 ? queue.shift()! : queue[0]);
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
        status: r.status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return stub;
}

/** The error body of SDS 6.5. */
export const errorBody = (code: string, message: string, details: { field: string; issue: string }[] = []) => ({
  error: { code, message, details, requestId: "00000000-0000-4000-8000-000000000000" },
});
