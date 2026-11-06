// Routes for Sprint 1 (SDS 5.1). Pending requests is a placeholder until F-03 builds it.
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, landingPath, useAuth } from "./auth/AuthProvider";
import { LoadingScreen, RequireAuth, RequireRole } from "./auth/guards";
import { NavBar } from "./components/NavBar";
import { CatalogPage } from "./pages/CatalogPage";
import { LoginPage } from "./pages/LoginPage";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { RequestDetailPage } from "./pages/RequestDetailPage";

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
        <Route path="/catalog" element={<CatalogPage />} />
        <Route
          path="/requests"
          element={
            <RequireRole role="BORROWER">
              <MyRequestsPage />
            </RequireRole>
          }
        />
        {/* Borrower (own) and Custodian; the API scopes it (DD-06). */}
        <Route path="/requests/:id" element={<RequestDetailPage />} />
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
