import { Link } from "react-router-dom";
import { useAuth } from "../../shared/auth/AuthContext.tsx";
import { hasPermission } from "../../shared/auth/permissions.ts";
import { APP_NAME, APP_RELEASE_LABEL, APP_VERSION } from "../../shared/version.ts";

export function HomePage() {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const roleLabel = user.roles.map((role) => role.name).join(", ");

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="login-kicker">Authenticated session</p>
          <h1>{APP_NAME}</h1>
          <p className="login-version">
            {APP_NAME} {APP_RELEASE_LABEL} ({APP_VERSION})
          </p>
        </div>
      </header>

      <div className="beam" aria-hidden="true">
        <span className="beam-cell" />
      </div>

      <section className="identity-card">
        <p>
          <span>Name</span>
          {user.fullName}
        </p>
        <p>
          <span>Role</span>
          {roleLabel || "None assigned"}
        </p>
        <p>
          <span>Department</span>
          {user.defaultDepartment?.name ?? "Not assigned"}
        </p>
        <p>
          <span>Organization</span>
          {user.organization.name}
          {user.organization.status && user.organization.status !== "ACTIVE" ? ` (${user.organization.status})` : ""}
        </p>
        <p>
          <span>Site</span>
          {user.defaultSite?.name ?? "Not assigned"}
        </p>
      </section>

      <section className="card-grid">
        {hasPermission(user, "dashboard.read") ? (
          <Link to="/dashboard" className="identity-card module-card">
            <span>Operations</span>
            <strong>Dashboard</strong>
            <p>Live transactions, pending work, exceptions, and site activity.</p>
          </Link>
        ) : null}
        {hasPermission(user, "report.read") ? (
          <Link to="/reports" className="identity-card module-card">
            <span>Office</span>
            <strong>Reports</strong>
            <p>Transaction, material, vehicle, and exception reports from live data.</p>
          </Link>
        ) : null}
        {hasPermission(user, "reliability.read") ? (
          <Link to="/reliability" className="identity-card module-card">
            <span>Reliability</span>
            <strong>Recovery</strong>
            <p>Backup status, health, stale work, and consistency warnings for administrators.</p>
          </Link>
        ) : null}
        {hasPermission(user, "monitoring.read") ? (
          <Link to="/monitoring" className="identity-card module-card">
            <span>Operations</span>
            <strong>Monitoring</strong>
            <p>System status, gateways, sync queues, and operational incidents.</p>
          </Link>
        ) : null}
        {hasPermission(user, "weighbridge.read", "transaction.create") ? (
          <Link to="/weighbridge" className="identity-card module-card">
            <span>Department</span>
            <strong>Weighbridge</strong>
            <p>Vehicle arrival, identification, and first weighment.</p>
          </Link>
        ) : null}
        {hasPermission(user, "driver.mode") ? (
          <Link to="/weighbridge/driver" className="identity-card module-card">
            <span>Operations</span>
            <strong>Driver mode</strong>
            <p>Simple guided weighbridge steps with large buttons and voice prompts.</p>
          </Link>
        ) : null}
        {hasPermission(user, "weighbridge.read", "weighbridge.manage") ? (
          <Link to="/weighbridge/devices" className="identity-card module-card">
            <span>Hardware</span>
            <strong>Devices</strong>
            <p>Weighbridge device status, health, and configuration.</p>
          </Link>
        ) : null}
        {hasPermission(user, "hardware.pilot", "weighbridge.manage", "gateway.manage") ? (
          <Link to="/weighbridge/pilot" className="identity-card module-card">
            <span>Hardware</span>
            <strong>Hardware pilot</strong>
            <p>Inventory, diagnostics, and commissioning for a site pilot.</p>
          </Link>
        ) : null}
        {hasPermission(user, "camera.read", "weighbridge.read") ? (
          <Link to="/weighbridge/cameras" className="identity-card module-card">
            <span>Cameras</span>
            <strong>ANPR cameras</strong>
            <p>Entry camera status and simulated vehicle identification.</p>
          </Link>
        ) : null}
        {hasPermission(user, "vehicle.read") ? (
          <Link to="/vehicles" className="identity-card module-card">
            <span>Master data</span>
            <strong>Vehicles</strong>
            <p>Search and register site vehicles.</p>
          </Link>
        ) : null}
        {hasPermission(user, "material.read") ? (
          <Link to="/materials" className="identity-card module-card">
            <span>Master data</span>
            <strong>Materials</strong>
            <p>Search materials and view assigned workflows.</p>
          </Link>
        ) : null}
        {hasPermission(user, "workflow.read", "workflow.manage") ? (
          <Link to="/workflows" className="identity-card module-card">
            <span>Configuration</span>
            <strong>Workflows</strong>
            <p>Configure Type 1, Type 2, and Type 3 process rules.</p>
          </Link>
        ) : null}
        {hasPermission(user, "user.read") ? (
          <Link to="/organization" className="identity-card module-card">
            <span>Administration</span>
            <strong>Organization</strong>
            <p>Sites, weighbridges, departments, users, and devices in your organization.</p>
          </Link>
        ) : null}
        {hasPermission(user, "onboarding.view") ? (
          <Link to="/onboarding" className="identity-card module-card">
            <span>Installation</span>
            <strong>Customer onboarding</strong>
            <p>Guided site configuration, validation, and pilot readiness.</p>
          </Link>
        ) : null}
        {hasPermission(user, "support.ticket.read") ? (
          <Link to="/support" className="identity-card module-card">
            <span>Support</span>
            <strong>Customer support</strong>
            <p>Open tickets, assignments, and issue tracking for your organization.</p>
          </Link>
        ) : null}
        {hasPermission(user, "support.maintenance.read") ? (
          <Link to="/maintenance" className="identity-card module-card">
            <span>Support</span>
            <strong>Maintenance</strong>
            <p>Service records, inspections, and device work history.</p>
          </Link>
        ) : null}
        {hasPermission(user, "integration.read", "integration.manage") ? (
          <Link to="/integrations" className="identity-card module-card">
            <span>Integrations</span>
            <strong>API platform</strong>
            <p>Applications, credentials, webhooks, and delivery logs for this organization.</p>
          </Link>
        ) : null}
        {hasPermission(user, "transaction.read") ? (
          <Link to="/transactions" className="identity-card module-card">
            <span>History</span>
            <strong>Transactions</strong>
            <p>Review weighbridge jobs and status.</p>
          </Link>
        ) : null}
        {hasPermission(user, "unloading.assign", "unloading.manage") ? (
          <Link to="/unloading-points" className="identity-card module-card">
            <span>Yard</span>
            <strong>Unloading points</strong>
            <p>Configure bays and assignment rules, then send vehicles to unload.</p>
          </Link>
        ) : null}
        {hasPermission(user, "approval.decide") ? (
          <Link to="/approvals" className="identity-card module-card">
            <span>Approvals</span>
            <strong>Store / Supervisor</strong>
            <p>Review pending workflow approvals for your department.</p>
          </Link>
        ) : null}
        <Link to="/notifications" className="identity-card module-card">
          <span>Inbox</span>
          <strong>Notifications</strong>
          <p>Open your in-app notifications and jump to the related transaction.</p>
        </Link>
      </section>

      <section className="identity-card" aria-labelledby="about-heading">
        <h2 id="about-heading">About this release</h2>
        <p>
          <span>Product</span>
          {APP_NAME} {APP_RELEASE_LABEL}
        </p>
        <p>
          <span>Software version</span>
          {APP_VERSION}
        </p>
        <p>
          Simulated weighbridge, ANPR, and OCR results are labeled simulated. This build is for a controlled site
          pilot after operator configuration, not a claim of commercial production proof.
        </p>
      </section>
    </main>
  );
}
