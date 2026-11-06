import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="container py-4">
      <h1 className="h3">Page not found</h1>
      <p>This page does not exist.</p>
      <Link to="/">Go to the home page</Link>
    </main>
  );
}
