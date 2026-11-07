// Route guards (SDS 5.2). Convenience only: the API enforces access (SDS 7).
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Role } from "../api/auth";
import { ForbiddenPage } from "../pages/ForbiddenPage";
import { useAuth } from "./AuthProvider";

export function LoadingScreen() {
  return (
    <div className="container kh-state justify-content-center py-5" role="status">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      Loading…
    </div>
  );
}

/** Sends a signed-out user to /login and remembers where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <LoadingScreen />;
  if (user === null) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Shows the Forbidden page for the other role's routes. Use inside RequireAuth. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== role) return <ForbiddenPage />;
  return <>{children}</>;
}
