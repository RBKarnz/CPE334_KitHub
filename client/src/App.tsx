// Routes for Sprint 1 (SDS 5.1).
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, landingPath, useAuth } from "./auth/AuthProvider";
import { LoadingScreen, RequireAuth, RequireRole } from "./auth/guards";
import { NavBar } from "./components/NavBar";
import { CatalogPage } from "./pages/CatalogPage";
import { LoansPage } from "./pages/loans/LoansPage";
import { LoginPage } from "./pages/LoginPage";
import { ManageCatalogPage } from "./pages/manage/ManageCatalogPage";
import { ManageUnitsPage } from "./pages/manage/ManageUnitsPage";
import { MyRequestsPage } from "./pages/MyRequestsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PendingRequestsPage } from "./pages/pending/PendingRequestsPage";
import { AllRequestsPage } from "./pages/requests/AllRequestsPage";
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

/** /requests is one route scoped by role (contract F-06 F06-D8): My requests or All requests. */
function RequestsPage() {
  const { user } = useAuth();
  return user?.role === "CUSTODIAN" ? <AllRequestsPage /> : <MyRequestsPage />;
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
        <Route path="/requests" element={<RequestsPage />} />
        {/* My loans or Loans, scoped by role (F07-D7). */}
        <Route path="/loans" element={<LoansPage />} />
        {/* Borrower (own) and Custodian; the API scopes it (DD-06). */}
        <Route path="/requests/:id" element={<RequestDetailPage />} />
        <Route
          path="/pending"
          element={
            <RequireRole role="CUSTODIAN">
              <PendingRequestsPage />
            </RequireRole>
          }
        />
        {/* Catalog management, Custodian only (contract F-09 4.2, 4.4). */}
        <Route
          path="/manage"
          element={
            <RequireRole role="CUSTODIAN">
              <ManageCatalogPage />
            </RequireRole>
          }
        />
        <Route
          path="/manage/item-types/:id"
          element={
            <RequireRole role="CUSTODIAN">
              <ManageUnitsPage />
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
