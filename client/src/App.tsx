// Routes for Sprint 1 (SDS 5.1). Catalog, My requests and Pending requests are placeholders
// until F-02 and F-03 build them.
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, landingPath, useAuth } from "./auth/AuthProvider";
import { LoadingScreen, RequireAuth, RequireRole } from "./auth/guards";
import { NavBar } from "./components/NavBar";
import { LoginPage } from "./pages/LoginPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

function SignedInLayout() {
  return (
    <RequireAuth>
      <NavBar />
      <Outlet />
    </RequireAuth>
  );
}

function Home() {
  const { user } = useAuth();
  return user ? <Navigate to={landingPath(user.role)} replace /> : <LoadingScreen />;
}

function AppRoutes() {
  const { user } = useAuth();
  // Shown while GET /api/auth/me runs, so the sign-in page does not flash.
  if (user === undefined) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<SignedInLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/catalog" element={<PlaceholderPage title="Catalog" />} />
        <Route
          path="/requests"
          element={
            <RequireRole role="BORROWER">
              <PlaceholderPage title="My requests" />
            </RequireRole>
          }
        />
        <Route
          path="/pending"
          element={
            <RequireRole role="CUSTODIAN">
              <PlaceholderPage title="Pending requests" />
            </RequireRole>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
