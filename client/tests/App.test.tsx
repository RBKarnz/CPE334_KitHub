// Component tests for the F-01 UI (contract F-01 section 5). The API is replaced by a fetch stub.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, vi } from "vitest";
import App from "../src/App";

type Reply = { status: number; body?: unknown };

const borrower = { id: 3, username: "borrower1", displayName: "Borrower One", role: "BORROWER" };
const custodian = { id: 1, username: "custodian1", displayName: "Custodian One", role: "CUSTODIAN" };
const unauthenticated: Reply = {
  status: 401,
  body: { error: { code: "UNAUTHENTICATED", message: "You are not signed in.", requestId: "r" } },
};

let routes: Record<string, Reply[]>;
let calls: { url: string; init: RequestInit }[];

function reply(key: string, ...replies: Reply[]) {
  routes[key] = replies;
}

beforeEach(() => {
  // Pages from F-02 load these; the F-01 tests do not look at their content.
  routes = {
    "GET /api/categories": [{ status: 200, body: { items: [] } }],
    "GET /api/requests": [{ status: 200, body: { items: [] } }],
  };
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const key = `${init.method ?? "GET"} ${url}`;
      const queue = routes[key];
      if (!queue || queue.length === 0) throw new Error(`unexpected call ${key}`);
      const r = queue.length > 1 ? queue.shift()! : queue[0];
      return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
        status: r.status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

function submitLogin(username: string, password: string) {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("F-01 UI", () => {
  it("a first visit with no session opens the sign-in page with no message", async () => {
    reply("GET /api/auth/me", unauthenticated);
    renderAt("/catalog");

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Sign in to KitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveValue("");
  });

  it("empty fields show messages and do not call the API", async () => {
    reply("GET /api/auth/me", unauthenticated);
    renderAt("/login");
    await screen.findByRole("heading", { name: "Sign in to KitHub" });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Enter your username.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith("/auth/login"))).toHaveLength(0);
  });

  it("a wrong sign-in keeps the username, clears the password and shows the API message", async () => {
    reply("GET /api/auth/me", unauthenticated);
    reply("POST /api/auth/login", {
      status: 401,
      body: { error: { code: "INVALID_CREDENTIALS", message: "Username or password is incorrect.", requestId: "r" } },
    });
    renderAt("/login");
    await screen.findByRole("heading", { name: "Sign in to KitHub" });

    submitLogin("borrower1", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("Username or password is incorrect.");
    expect(screen.getByLabelText("Username")).toHaveValue("borrower1");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    const login = calls.find((c) => c.url.endsWith("/auth/login"))!;
    expect((login.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("a Custodian lands on Pending requests and sees their name and role badge", async () => {
    reply("GET /api/auth/me", unauthenticated);
    reply("POST /api/auth/login", { status: 200, body: { user: custodian } });
    renderAt("/login");
    await screen.findByRole("heading", { name: "Sign in to KitHub" });

    submitLogin("custodian1", "right");

    expect(await screen.findByRole("heading", { name: "Pending requests" })).toBeInTheDocument();
    expect(screen.getByText("Custodian One")).toBeInTheDocument();
    expect(screen.getByText("Custodian")).toBeInTheDocument();
  });

  it("sign-in returns to the page that sent the user to /login", async () => {
    reply("GET /api/auth/me", unauthenticated);
    reply("POST /api/auth/login", { status: 200, body: { user: borrower } });
    renderAt("/requests");
    await screen.findByRole("heading", { name: "Sign in to KitHub" });

    submitLogin("borrower1", "right");

    expect(await screen.findByRole("heading", { name: "My requests" })).toBeInTheDocument();
  });

  it("a Borrower sent to /login from a Custodian route lands on the Catalog, not the Forbidden page", async () => {
    reply("GET /api/auth/me", unauthenticated);
    reply("POST /api/auth/login", { status: 200, body: { user: borrower } });
    renderAt("/pending");
    await screen.findByRole("heading", { name: "Sign in to KitHub" });

    submitLogin("borrower1", "right");

    expect(await screen.findByRole("heading", { name: "Catalog" })).toBeInTheDocument();
    expect(screen.queryByText("You do not have permission to do this.")).not.toBeInTheDocument();
  });

  it("a Borrower opening a Custodian route sees the Forbidden page", async () => {
    reply("GET /api/auth/me", { status: 200, body: { user: borrower } });
    renderAt("/pending");

    expect(await screen.findByText("You do not have permission to do this.")).toBeInTheDocument();
  });

  it("sign out sends Content-Type: application/json and opens the sign-in page with no message", async () => {
    reply("GET /api/auth/me", { status: 200, body: { user: borrower } });
    reply("POST /api/auth/logout", { status: 204 });
    renderAt("/catalog");
    await screen.findByRole("heading", { name: "Catalog" });

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { name: "Sign in to KitHub" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const logout = calls.find((c) => c.url.endsWith("/auth/logout"))!;
    expect((logout.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("a 401 after sign-in opens the sign-in page with the session-ended message", async () => {
    reply("GET /api/auth/me", { status: 200, body: { user: borrower } }, unauthenticated);
    reply("POST /api/auth/logout", { status: 204 });
    renderAt("/catalog");
    await screen.findByRole("heading", { name: "Catalog" });

    // Any later call that returns 401; here a second /me through the API client.
    const { fetchCurrentUser } = await import("../src/api/auth");
    await act(() => fetchCurrentUser().catch(() => undefined));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Your session has ended. Please sign in again."),
    );
    expect(screen.getByRole("heading", { name: "Sign in to KitHub" })).toBeInTheDocument();
  });
});
