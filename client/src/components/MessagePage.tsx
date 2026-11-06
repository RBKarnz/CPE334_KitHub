// A plain message with a link home, for the Forbidden and Not found pages (SDS 5.1).
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export function MessagePage({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <main className="container kh-main">
      <div className="kh-panel kh-message">
        <i className={`bi bi-${icon}`} aria-hidden="true" />
        <h1 className="h3 mt-2">{title}</h1>
        <p>{children}</p>
        <Link to="/">Go to the home page</Link>
      </div>
    </main>
  );
}
