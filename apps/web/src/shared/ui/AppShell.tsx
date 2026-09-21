import { NavLink, Outlet } from "react-router-dom";
import { NotificationMenu } from "../../modules/notifications/NotificationMenu.tsx";
import { useAuth } from "../auth/AuthContext.tsx";
import { hasPermission } from "../auth/permissions.ts";
import { SiteSwitcher } from "../../modules/tenancy/SiteSwitcher.tsx";
import { APP_NAME, APP_RELEASE_LABEL } from "../version.ts";

export function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-nav">
        <NavLink to="/" className="app-brand">
          Trinetra
        </NavLink>
        <nav>
          {hasPermission(user, "dashboard.read") ? <NavLink to="/dashboard">Dashboard</NavLink> : null}
          {hasPermission(user, "report.read") ? <NavLink to="/reports">Reports</NavLink> : null}
          {hasPermission(user, "reliability.read") ? <NavLink to="/reliability">Recovery</NavLink> : null}
          {hasPermission(user, "monitoring.read") ? <NavLink to="/monitoring">Monitoring</NavLink> : null}
          {hasPermission(user, "weighbridge.read", "transaction.create") ? (
            <NavLink to="/weighbridge">Weighbridge</NavLink>
          ) : null}
          {hasPermission(user, "weighbridge.read", "weighbridge.manage") ? (
            <NavLink to="/weighbridge/devices">Devices</NavLink>
          ) : null}
          {hasPermission(user, "anomaly.read", "security.read", "weighbridge.read") ? (
            <NavLink to="/weighbridge/anomalies">Anomalies</NavLink>
          ) : null}
          {hasPermission(user, "camera.read", "weighbridge.read") ? (
            <NavLink to="/weighbridge/cameras">Cameras</NavLink>
          ) : null}
          {hasPermission(user, "gateway.read", "weighbridge.manage") ? (
            <NavLink to="/weighbridge/gateways">Gateways</NavLink>
          ) : null}
          {hasPermission(user, "sync.read", "gateway.read") ? (
            <NavLink to="/weighbridge/sync">Sync</NavLink>
          ) : null}
          {hasPermission(user, "hardware.pilot", "weighbridge.manage", "gateway.manage") ? (
            <NavLink to="/weighbridge/pilot">Pilot</NavLink>
          ) : null}
          {hasPermission(user, "vehicle.read") ? <NavLink to="/vehicles">Vehicles</NavLink> : null}
          {hasPermission(user, "material.read") ? <NavLink to="/materials">Materials</NavLink> : null}
          {hasPermission(user, "workflow.read", "workflow.manage") ? <NavLink to="/workflows">Workflows</NavLink> : null}
          {hasPermission(user, "user.read") ? <NavLink to="/organization">Organization</NavLink> : null}
          {hasPermission(user, "onboarding.view") ? <NavLink to="/onboarding">Onboarding</NavLink> : null}
          {hasPermission(user, "support.ticket.read") ? <NavLink to="/support">Support</NavLink> : null}
          {hasPermission(user, "support.ticket.read") ? <NavLink to="/support/tickets">Tickets</NavLink> : null}
          {hasPermission(user, "support.maintenance.read") ? <NavLink to="/maintenance">Maintenance</NavLink> : null}
          {hasPermission(user, "integration.read", "integration.manage") ? <NavLink to="/integrations">Integrations</NavLink> : null}
          {hasPermission(user, "transaction.read") ? <NavLink to="/transactions">Transactions</NavLink> : null}
          {hasPermission(user, "unloading.assign", "unloading.manage") ? (
            <NavLink to="/unloading-points">Unloading</NavLink>
          ) : null}
          {hasPermission(user, "approval.decide") ? <NavLink to="/approvals">Approvals</NavLink> : null}
          <NavLink to="/notifications">Notifications</NavLink>
        </nav>
        <div className="app-nav-user">
          <SiteSwitcher />
          <NotificationMenu />
          <span className="app-version" title={`${APP_NAME} ${APP_RELEASE_LABEL}`}>
            {APP_RELEASE_LABEL}
          </span>
          <span>{user?.fullName}</span>
          <button type="button" className="ghost-button" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
