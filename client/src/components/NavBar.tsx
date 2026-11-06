import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { Role } from "../api/auth";
import { landingPath, useAuth } from "../auth/AuthProvider";
import { Logo } from "./Logo";

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
    <>
      <nav className="kh-nav" aria-label="Main">
        {/* One set of elements for every width; the layout changes in CSS only (theme.css). */}
        <div className="container kh-nav-inner">
          <NavLink className="kh-brand" to={landingPath(user.role)}>
            <Logo />
            KitHub
          </NavLink>
          <ul className="kh-nav-links">
            {LINKS[user.role].map((link) => (
              <li key={link.to}>
                <NavLink className="kh-nav-link" to={link.to}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <span className="kh-nav-user">
            <span>{user.displayName}</span> <span className="badge kh-role">{ROLE_LABEL[user.role]}</span>
          </span>
          <button
            type="button"
            className="btn btn-sm kh-signout"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            Sign out
          </button>
        </div>
      </nav>
      <div className="kh-foam kh-foam-strip mb-2" aria-hidden="true" />
    </>
  );
}
