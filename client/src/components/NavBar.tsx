import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import type { Role } from "../api/auth";
import { landingPath, useAuth } from "../auth/AuthProvider";
import { Logo } from "./Logo";

// Links per role (SDS 5.2); Sprint 2 adds All requests for Custodians (F-06).
const LINKS: Record<Role, { to: string; label: string }[]> = {
  BORROWER: [
    { to: "/catalog", label: "Catalog" },
    // F-04 (contract F-04 4.4): the new request form.
    { to: "/requests/new", label: "New request" },
    { to: "/requests", label: "My requests" },
    { to: "/loans", label: "My loans" },
  ],
  CUSTODIAN: [
    // Renamed by F-07 (F07-D6): the APPROVED requests waiting for checkout.
    { to: "/pending", label: "Ready for checkout" },
    // Same route as a Borrower's My requests, scoped by role (contract F-06 F06-D8).
    { to: "/requests", label: "All requests" },
    { to: "/loans", label: "Loans" },
    { to: "/catalog", label: "Catalog" },
    // F-09 (contract F-09 4.1): categories, item types and units.
    { to: "/manage", label: "Manage catalog" },
    // F-14 (contract F-14 4.2): the inventory report.
    { to: "/reports/inventory", label: "Reports" },
  ],
};

const ROLE_LABEL: Record<Role, string> = { BORROWER: "Borrower", CUSTODIAN: "Custodian" };

export function NavBar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
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
                <NavLink
                  className="kh-nav-link"
                  to={link.to}
                  // "/requests" would also match "/requests/new", which has its own link (#103).
                  end={link.to === "/requests" && pathname === "/requests/new"}
                >
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
