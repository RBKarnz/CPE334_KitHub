// The current user (SDS 3.6, 8.4). Restored from GET /api/auth/me on load; never stored in
// localStorage. A 401 from any later call ends the session in the UI (SDS 5.3).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as authApi from "../api/auth";
import type { Role, User } from "../api/auth";
import { ApiError, setUnauthenticatedListener } from "../api/client";

export const SESSION_ENDED_MESSAGE = "Your session has ended. Please sign in again.";

interface AuthState {
  /** undefined while GET /api/auth/me runs on load */
  user: User | null | undefined;
  /** Shown once on the sign-in page, for example after the session ended */
  notice: string | null;
  signIn: (username: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  clearNotice: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export const landingPath = (role: Role) => (role === "CUSTODIAN" ? "/pending" : "/catalog");

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    let active = true;
    authApi
      .fetchCurrentUser()
      .then((u) => active && setUser(u))
      // A first visit with no session opens the sign-in page with no message.
      .catch(() => active && setUser(null));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setUnauthenticatedListener(() => {
      // The message only if there was a signed-in user before this call (SDS 5.3).
      if (userRef.current) {
        setNotice(SESSION_ENDED_MESSAGE);
        setUser(null);
      }
    });
    return () => setUnauthenticatedListener(null);
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const u = await authApi.login(username, password);
    setNotice(null);
    setUser(u);
    return u;
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (err) {
      // The UI signs out locally even if the call fails; the server rejects the old cookie anyway.
      if (!(err instanceof ApiError)) throw err;
    }
    setNotice(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, notice, signIn, signOut, clearNotice: () => setNotice(null) }),
    [user, notice, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
