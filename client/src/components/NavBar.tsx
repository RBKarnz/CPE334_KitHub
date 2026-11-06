import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { Role } from "../api/auth";
import { landingPath, useAuth } from "../auth/AuthProvider";

// Sprint 1 links per role (SDS 5.2).
const LINKS: Record<Role, { to: string; label: string }[]> = {
  BORROWER: [
    { to: "/catalog", label: "Catalog" },
    { to: "/requests", label: "My requests" },
  ],
  CUSTODIAN: [
    { to: "/pending", label: "Pending requests" },
    { to: "/catalog", label: "Catalog" },
  ],
};

const ROLE_LABEL: Record<Role, string> = { BORROWER: "Borrower", CUSTODIAN: "Custodian" };

export function NavBar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <nav className="navbar navbar-expand bg-body-tertiary mb-4">
      <div className="container">
        <NavLink className="navbar-brand" to={landingPath(user.role)}>
          KitHub
        </NavLink>
        <ul className="navbar-nav me-auto">
          {LINKS[user.role].map((link) => (
            <li className="nav-item" key={link.to}>
              <NavLink className="nav-link" to={link.to}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <span className="navbar-text me-3">
          {user.displayName} <span className="badge text-bg-secondary">{ROLE_LABEL[user.role]}</span>
        </span>
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleSignOut} disabled={signingOut}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
