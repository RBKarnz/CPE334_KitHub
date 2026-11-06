import { apiFetch } from "./client";

export type Role = "BORROWER" | "CUSTODIAN";

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
}

export const login = (username: string, password: string) =>
  apiFetch<{ user: User }>("/auth/login", { method: "POST", body: { username, password } }).then((r) => r.user);

export const logout = () => apiFetch<void>("/auth/logout", { method: "POST" });

export const fetchCurrentUser = () => apiFetch<{ user: User }>("/auth/me").then((r) => r.user);
