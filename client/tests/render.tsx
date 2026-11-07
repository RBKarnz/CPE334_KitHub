// Renders a page as a signed-in user, with the API modules mocked by the test file.
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import * as authApi from "../src/api/auth";
import type { User } from "../src/api/auth";
import { AuthProvider } from "../src/auth/AuthProvider";

export const borrower: User = { id: 3, username: "borrower1", displayName: "Borrower One", role: "BORROWER" };
export const custodian: User = { id: 1, username: "custodian1", displayName: "Custodian One", role: "CUSTODIAN" };

/** `path` is the route pattern, `at` the URL to open, for example "/requests/:id" and "/requests/12". */
export function renderAs(user: User, page: ReactNode, { path = "/", at = "/" }: { path?: string; at?: string } = {}) {
  vi.spyOn(authApi, "fetchCurrentUser").mockResolvedValue(user);
  return render(
    <MemoryRouter initialEntries={[at]}>
      <AuthProvider>
        <Routes>
          <Route path={path} element={page} />
          <Route path="*" element={<div>other page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** A promise that the test resolves or rejects when it chooses, for "slow" responses. */
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
