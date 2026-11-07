// Sign-in page (contract F-01 section 5). No pre-filled values and no user picker (SDS 8.6).
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { afterSignInPath, useAuth } from "../auth/AuthProvider";
import { Logo } from "../components/Logo";

interface FieldErrors {
  username?: string;
  password?: string;
}

export function LoginPage() {
  const { user, notice, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={afterSignInPath(user.role, from)} replace />;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors: FieldErrors = {};
    if (username === "") errors.username = "Enter your username.";
    if (password === "") errors.password = "Enter your password.";
    setFieldErrors(errors);
    setFormError(null);
    if (errors.username || errors.password) return;

    setSubmitting(true);
    try {
      const signedIn = await signIn(username, password);
      navigate(afterSignInPath(signedIn.role, from), { replace: true });
    } catch (err) {
      // Wrong sign-in keeps the username and clears the password (SDS 5.3).
      setPassword("");
      setFormError(err instanceof ApiError ? err.message : "Something went wrong.");
      setSubmitting(false);
    }
  };

  return (
    <main className="kh-signin kh-foam">
      <div className="kh-card">
        <div className="mb-3">
          <Logo size={44} />
        </div>
        <h1 className="mb-4">Sign in to KitHub</h1>
        {notice && !formError && (
          <div className="alert alert-info" role="status">
            {notice}
          </div>
        )}
        {formError && (
          <div className="alert alert-danger" role="alert">
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-3">
            <label htmlFor="username" className="form-label">
              Username
            </label>
            <input
              id="username"
              className={`form-control form-control-lg${fieldErrors.username ? " is-invalid" : ""}`}
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            {fieldErrors.username && <div className="invalid-feedback">{fieldErrors.username}</div>}
          </div>
          <div className="mb-3">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={`form-control form-control-lg${fieldErrors.password ? " is-invalid" : ""}`}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {fieldErrors.password && <div className="invalid-feedback">{fieldErrors.password}</div>}
          </div>
          <button type="submit" className="btn btn-primary btn-lg w-100" disabled={submitting}>
            {submitting && <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />}
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
