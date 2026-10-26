import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROUTES } from "../routes";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <p>Loading...</p>;
  }

  if (!user) {
    const from = `${location.pathname}${location.search}${location.hash}`;

    return <Navigate to={ROUTES.login} replace state={{ from }} />;
  }

  return <Outlet />;
}
