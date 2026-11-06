import { Link } from "react-router-dom";

export function ForbiddenPage() {
  return (
    <main className="container py-4">
      <h1 className="h3">Forbidden</h1>
      <p>You do not have permission to do this.</p>
      <Link to="/">Go to the home page</Link>
    </main>
  );
}
