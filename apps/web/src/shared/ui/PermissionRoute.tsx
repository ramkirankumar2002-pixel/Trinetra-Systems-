import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.tsx";
import { hasPermission } from "../auth/permissions.ts";

export function PermissionRoute({ permissions }: { permissions: string[] }) {
  const { user } = useAuth();

  if (!hasPermission(user, ...permissions)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
