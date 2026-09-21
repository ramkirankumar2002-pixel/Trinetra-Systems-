import { BrowserRouter, Route, Routes } from "react-router-dom";
import { GuestRoute } from "./app/GuestRoute.tsx";
import { ProtectedRoute } from "./app/ProtectedRoute.tsx";
import { HomePage } from "./modules/auth/HomePage.tsx";
import { LoginPage } from "./modules/auth/LoginPage.tsx";
import { MaterialFormPage } from "./modules/materials/MaterialFormPage.tsx";
import { MaterialListPage } from "./modules/materials/MaterialListPage.tsx";
import { TransactionDetailPage } from "./modules/transactions/TransactionDetailPage.tsx";
import { TransactionListPage } from "./modules/transactions/TransactionListPage.tsx";
import { VehicleFormPage } from "./modules/vehicles/VehicleFormPage.tsx";
import { VehicleListPage } from "./modules/vehicles/VehicleListPage.tsx";
import { WorkflowFormPage } from "./modules/workflows/WorkflowFormPage.tsx";
import { WorkflowListPage } from "./modules/workflows/WorkflowListPage.tsx";
import { ApprovalDetailPage } from "./modules/approvals/ApprovalDetailPage.tsx";
import { ApprovalListPage } from "./modules/approvals/ApprovalListPage.tsx";
import { DashboardPage } from "./modules/dashboard/DashboardPage.tsx";
import { ReportsPage } from "./modules/dashboard/ReportsPage.tsx";
import { NotificationsPage } from "./modules/notifications/NotificationsPage.tsx";
import { UnloadingPointsPage } from "./modules/unloading/UnloadingPointsPage.tsx";
import { CameraManagementPage } from "./modules/cameras/CameraManagementPage.tsx";
import { ArrivalPage } from "./modules/weighbridge/ArrivalPage.tsx";
import { GatewayManagementPage } from "./modules/gateways/GatewayManagementPage.tsx";
import { SyncDashboardPage } from "./modules/sync/SyncDashboardPage.tsx";
import { HardwarePilotPage } from "./modules/pilot/HardwarePilotPage.tsx";
import { AnomalyDetailPage } from "./modules/anomalies/AnomalyDetailPage.tsx";
import { AnomalyHistoryPage } from "./modules/anomalies/AnomalyHistoryPage.tsx";
import { DeviceManagementPage } from "./modules/weighbridge/DeviceManagementPage.tsx";
import { WeighbridgeDashboardPage } from "./modules/weighbridge/WeighbridgeDashboardPage.tsx";
import { DriverModePage } from "./modules/driver/DriverModePage.tsx";
import { ReliabilityPage } from "./modules/reliability/ReliabilityPage.tsx";
import { MonitoringPage } from "./modules/monitoring/MonitoringPage.tsx";
import { AuthProvider } from "./shared/auth/AuthContext.tsx";
import { AppShell } from "./shared/ui/AppShell.tsx";
import { PermissionRoute } from "./shared/ui/PermissionRoute.tsx";
import { OrganizationPage } from "./modules/tenancy/OrganizationPage.tsx";
import { OnboardingDashboardPage } from "./modules/onboarding/OnboardingDashboardPage.tsx";
import { OnboardingWizardPage } from "./modules/onboarding/OnboardingWizardPage.tsx";
import { SupportDashboardPage } from "./modules/support/SupportDashboardPage.tsx";
import { TicketListPage } from "./modules/support/TicketListPage.tsx";
import { TicketCreatePage } from "./modules/support/TicketCreatePage.tsx";
import { TicketDetailPage } from "./modules/support/TicketDetailPage.tsx";
import { MaintenanceListPage } from "./modules/support/MaintenanceListPage.tsx";
import { MaintenanceCreatePage } from "./modules/support/MaintenanceCreatePage.tsx";
import { MaintenanceDetailPage } from "./modules/support/MaintenanceDetailPage.tsx";
import { DeviceHistoryPage } from "./modules/support/DeviceHistoryPage.tsx";
import { IntegrationsLayout } from "./modules/integrations/IntegrationsLayout.tsx";
import { IntegrationOverviewPage } from "./modules/integrations/IntegrationOverviewPage.tsx";
import { IntegrationApplicationsPage } from "./modules/integrations/IntegrationApplicationsPage.tsx";
import { IntegrationApplicationDetailPage } from "./modules/integrations/IntegrationApplicationDetailPage.tsx";
import { IntegrationDeliveriesPage } from "./modules/integrations/IntegrationDeliveriesPage.tsx";
import { IntegrationUsagePage } from "./modules/integrations/IntegrationUsagePage.tsx";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<LoginPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<PermissionRoute permissions={["driver.mode"]} />}>
              <Route path="/weighbridge/driver" element={<DriverModePage />} />
            </Route>
            <Route element={<AppShell />}>
              <Route path="/" element={<HomePage />} />
              <Route element={<PermissionRoute permissions={["dashboard.read"]} />}>
                <Route path="/dashboard" element={<DashboardPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["report.read"]} />}>
                <Route path="/reports" element={<ReportsPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["reliability.read"]} />}>
                <Route path="/reliability" element={<ReliabilityPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["monitoring.read"]} />}>
                <Route path="/monitoring" element={<MonitoringPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["weighbridge.read", "transaction.create"]} />}>
                <Route path="/weighbridge" element={<WeighbridgeDashboardPage />} />
                <Route path="/weighbridge/arrival" element={<ArrivalPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["weighbridge.read", "weighbridge.manage"]} />}>
                <Route path="/weighbridge/devices" element={<DeviceManagementPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["anomaly.read", "security.read", "weighbridge.read"]} />}>
                <Route path="/weighbridge/anomalies" element={<AnomalyHistoryPage />} />
                <Route path="/weighbridge/anomalies/:id" element={<AnomalyDetailPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["camera.read", "weighbridge.read"]} />}>
                <Route path="/weighbridge/cameras" element={<CameraManagementPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["gateway.read", "weighbridge.manage"]} />}>
                <Route path="/weighbridge/gateways" element={<GatewayManagementPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["sync.read", "gateway.read"]} />}>
                <Route path="/weighbridge/sync" element={<SyncDashboardPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["hardware.pilot", "weighbridge.manage", "gateway.manage"]} />}>
                <Route path="/weighbridge/pilot" element={<HardwarePilotPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["vehicle.read"]} />}>
                <Route path="/vehicles" element={<VehicleListPage />} />
                <Route path="/vehicles/new" element={<VehicleFormPage />} />
                <Route path="/vehicles/:id" element={<VehicleFormPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["material.read"]} />}>
                <Route path="/materials" element={<MaterialListPage />} />
                <Route path="/materials/new" element={<MaterialFormPage />} />
                <Route path="/materials/:id" element={<MaterialFormPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["workflow.read", "workflow.manage"]} />}>
                <Route path="/workflows" element={<WorkflowListPage />} />
                <Route path="/workflows/new" element={<WorkflowFormPage />} />
                <Route path="/workflows/:id" element={<WorkflowFormPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["user.read"]} />}>
                <Route path="/organization" element={<OrganizationPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["onboarding.view"]} />}>
                <Route path="/onboarding" element={<OnboardingDashboardPage />} />
                <Route path="/onboarding/:id" element={<OnboardingWizardPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["support.ticket.read"]} />}>
                <Route path="/support" element={<SupportDashboardPage />} />
                <Route path="/support/tickets" element={<TicketListPage />} />
                <Route path="/support/tickets/new" element={<TicketCreatePage />} />
                <Route path="/support/tickets/:id" element={<TicketDetailPage />} />
                <Route path="/support/devices/:id" element={<DeviceHistoryPage kind="device" />} />
                <Route path="/support/weighbridges/:id" element={<DeviceHistoryPage kind="weighbridge" />} />
              </Route>
              <Route element={<PermissionRoute permissions={["support.maintenance.read"]} />}>
                <Route path="/maintenance" element={<MaintenanceListPage />} />
                <Route path="/maintenance/new" element={<MaintenanceCreatePage />} />
                <Route path="/maintenance/:id" element={<MaintenanceDetailPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["integration.read", "integration.manage"]} />}>
                <Route path="/integrations" element={<IntegrationsLayout />}>
                  <Route index element={<IntegrationOverviewPage />} />
                  <Route path="applications" element={<IntegrationApplicationsPage />} />
                  <Route path="applications/:id" element={<IntegrationApplicationDetailPage />} />
                  <Route path="deliveries" element={<IntegrationDeliveriesPage />} />
                  <Route path="usage" element={<IntegrationUsagePage />} />
                </Route>
              </Route>
              <Route element={<PermissionRoute permissions={["transaction.read"]} />}>
                <Route path="/transactions" element={<TransactionListPage />} />
                <Route path="/transactions/:id" element={<TransactionDetailPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["unloading.assign", "unloading.manage", "transaction.read"]} />}>
                <Route path="/unloading-points" element={<UnloadingPointsPage />} />
              </Route>
              <Route element={<PermissionRoute permissions={["approval.decide"]} />}>
                <Route path="/approvals" element={<ApprovalListPage />} />
                <Route path="/approvals/:id" element={<ApprovalDetailPage />} />
              </Route>
              <Route path="/notifications" element={<NotificationsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
