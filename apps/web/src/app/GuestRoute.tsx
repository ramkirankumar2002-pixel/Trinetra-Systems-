import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../shared/auth/AuthContext.tsx";

export function GuestRoute() {
  const { status } = useAuth();

  if (status === "loading") {
    return <p className="session-status">Checking session…</p>;
  }

  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
