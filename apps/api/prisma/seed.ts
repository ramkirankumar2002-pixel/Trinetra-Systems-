import { randomBytes } from "node:crypto";
import {
  EdgeDeviceType,
  HardwareInstallationStatus,
  HardwareProtocolReadiness,
  PrismaClient,
  WorkflowCapability,
} from "@prisma/client";
import { hashGatewayCredential } from "../src/domain/edgeCredentials.js";
import { IMPLEMENTATION_ENGINEER_PERMISSIONS, ONBOARDING_PERMISSIONS } from "../src/domain/onboarding/catalog.js";
import {
  CUSTOMER_SUPPORT_PERMISSIONS,
  STAFF_SUPPORT_PERMISSIONS,
  SUPPORT_ENGINEER_PERMISSIONS,
  SUPPORT_PERMISSIONS,
  isAdminAssignablePermission,
} from "../src/domain/support/catalog.js";
import { INTEGRATION_PERMISSIONS } from "../src/domain/integration/catalog.js";
import {
  generateIntegrationClientId,
  generateIntegrationSecret,
  hashIntegrationSecret,
  secretPrefix,
} from "../src/domain/integration/credentials.js";
import { demoSeedBlockedReason } from "../src/config/seedGuard.js";
import { hashPassword } from "../src/lib/password.js";
import { seedDashboardDemoScenarios } from "./seedDashboard.js";
import { seedDemoNotifications } from "./seedNotifications.js";
import { seedDemoSupport } from "./seedSupport.js";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "demo-password";

const PERMISSIONS = [
  { code: "user.read", name: "Read users", group: "users" },
  { code: "user.manage", name: "Manage users", group: "users" },
  { code: "role.manage", name: "Manage roles", group: "roles" },
  { code: "department.read", name: "Read departments", group: "departments" },
  { code: "vehicle.read", name: "Read vehicles", group: "vehicles" },
  { code: "vehicle.manage", name: "Manage vehicles", group: "vehicles" },
  { code: "driver.read", name: "Read drivers", group: "drivers" },
  { code: "driver.manage", name: "Manage drivers", group: "drivers" },
  { code: "supplier.read", name: "Read suppliers", group: "suppliers" },
  { code: "supplier.manage", name: "Manage suppliers", group: "suppliers" },
  { code: "material.read", name: "Read materials", group: "materials" },
  { code: "material.manage", name: "Manage materials", group: "materials" },
  { code: "workflow.read", name: "Read workflows", group: "workflows" },
  { code: "workflow.manage", name: "Manage workflows", group: "workflows" },
  { code: "weighbridge.read", name: "Read weighbridges", group: "weighbridges" },
  { code: "weighbridge.manage", name: "Manage weighbridge hardware", group: "weighbridges" },
  { code: "driver.mode", name: "Open weighbridge driver mode", group: "weighbridges" },
  { code: "camera.read", name: "Read cameras and ANPR status", group: "cameras" },
  { code: "camera.manage", name: "Manage cameras", group: "cameras" },
  { code: "gateway.read", name: "Read edge gateways", group: "edge" },
  { code: "gateway.manage", name: "Manage edge gateways", group: "edge" },
  { code: "hardware.pilot", name: "Access hardware pilot diagnostics", group: "edge" },
  { code: "sync.read", name: "Read offline synchronization status", group: "edge" },
  { code: "sync.manage", name: "Inspect dead-letter events and acknowledge sync conflicts", group: "edge" },
  { code: "transaction.create", name: "Create transactions", group: "transactions" },
  { code: "transaction.read", name: "Read transactions", group: "transactions" },
  { code: "transaction.update", name: "Update transactions", group: "transactions" },
  { code: "weighment.record", name: "Record weighments", group: "weighments" },
  { code: "document.upload", name: "Upload documents", group: "documents" },
  { code: "document.verify", name: "Verify documents", group: "documents" },
  { code: "approval.decide", name: "Decide approvals", group: "approvals" },
  { code: "unloading.assign", name: "Assign unloading points", group: "unloading" },
  { code: "unloading.manage", name: "Manage unloading", group: "unloading" },
  { code: "transaction.finalize", name: "Finalize transactions", group: "transactions" },
  { code: "transaction.correct", name: "Request transaction corrections", group: "transactions" },
  { code: "dashboard.read", name: "Read operational dashboard", group: "dashboard" },
  { code: "report.read", name: "Read management reports", group: "reports" },
  { code: "audit.read", name: "Read audit logs", group: "audit" },
  { code: "security.read", name: "Read security events", group: "security" },
  { code: "security.acknowledge", name: "Acknowledge security events", group: "security" },
  { code: "maintenance.manage", name: "Manage maintenance windows", group: "maintenance" },
  { code: "anomaly.read", name: "Read weight anomalies", group: "security" },
  { code: "anomaly.acknowledge", name: "Acknowledge weight anomalies", group: "security" },
  { code: "anomaly.resolve", name: "Resolve weight anomalies", group: "security" },
  { code: "anomaly.configure", name: "Configure weight anomaly thresholds", group: "security" },
  { code: "reliability.read", name: "Read recovery and backup status", group: "reliability" },
  { code: "reliability.manage", name: "Run backup and consistency scans", group: "reliability" },
  { code: "monitoring.read", name: "Read operational monitoring and system status", group: "monitoring" },
  ...ONBOARDING_PERMISSIONS,
  ...SUPPORT_PERMISSIONS,
  ...INTEGRATION_PERMISSIONS,
] as const;

const DEPARTMENTS = [
  { code: "WEIGHBRIDGE", name: "Weighbridge" },
  { code: "STORE", name: "Store" },
  { code: "SUPERVISOR", name: "Supervisor" },
  { code: "LAB", name: "Lab" },
  { code: "PLANT", name: "Plant" },
  { code: "SITE", name: "Site" },
  { code: "OFFICE", name: "Office" },
  { code: "OTHERS", name: "Others" },
] as const;

const ROLES = [
  {
    code: "ADMIN",
    name: "Administrator",
    permissions: PERMISSIONS.filter((permission) => isAdminAssignablePermission(permission.code)).map(
      (permission) => permission.code,
    ),
  },
  {
    code: "IMPLEMENTATION_ENGINEER",
    name: "Implementation Engineer",
    permissions: [...IMPLEMENTATION_ENGINEER_PERMISSIONS],
  },
  {
    code: "SUPPORT_ENGINEER",
    name: "Support Engineer",
    permissions: [...SUPPORT_ENGINEER_PERMISSIONS],
  },
  {
    code: "WEIGHBRIDGE_OPERATOR",
    name: "Weighbridge Operator",
    permissions: [
      "vehicle.read",
      "vehicle.manage",
      "driver.read",
      "supplier.read",
      "material.read",
      "weighbridge.read",
      "driver.mode",
      "camera.read",
      "gateway.read",
      "sync.read",
      "dashboard.read",
      "transaction.create",
      "transaction.read",
      "transaction.update",
      "weighment.record",
      "document.upload",
      "document.verify",
      "unloading.assign",
      "unloading.manage",
      "transaction.finalize",
      "anomaly.read",
      "anomaly.acknowledge",
      ...CUSTOMER_SUPPORT_PERMISSIONS,
    ],
  },
  {
    code: "STORE_OFFICER",
    name: "Store Officer",
    permissions: [
      "transaction.read",
      "dashboard.read",
      "material.read",
      "approval.decide",
      "unloading.assign",
      "unloading.manage",
      "document.verify",
      "anomaly.read",
      ...CUSTOMER_SUPPORT_PERMISSIONS,
    ],
  },
  {
    code: "SUPERVISOR",
    name: "Supervisor",
    permissions: [
      "transaction.read",
      "dashboard.read",
      "report.read",
      "transaction.update",
      "weighment.record",
      "approval.decide",
      "unloading.assign",
      "unloading.manage",
      "transaction.finalize",
      "transaction.correct",
      "audit.read",
      "security.read",
      "security.acknowledge",
      "maintenance.manage",
      "document.verify",
      "weighbridge.read",
      "driver.mode",
      "weighbridge.manage",
      "camera.read",
      "camera.manage",
      "gateway.read",
      "gateway.manage",
      "hardware.pilot",
      "sync.read",
      "sync.manage",
      "anomaly.read",
      "anomaly.acknowledge",
      "anomaly.resolve",
      "anomaly.configure",
      "reliability.read",
      "reliability.manage",
      "monitoring.read",
      "integration.read",
      "integration.manage",
      ...STAFF_SUPPORT_PERMISSIONS,
    ],
  },
  { code: "LAB_USER", name: "Lab User", permissions: ["transaction.read", "dashboard.read", "approval.decide", "document.verify", ...CUSTOMER_SUPPORT_PERMISSIONS] },
  { code: "PLANT_USER", name: "Plant User", permissions: ["transaction.read", "dashboard.read", "unloading.manage", "anomaly.read", ...CUSTOMER_SUPPORT_PERMISSIONS] },
  { code: "SITE_USER", name: "Site User", permissions: ["transaction.read", "dashboard.read", "anomaly.read", ...CUSTOMER_SUPPORT_PERMISSIONS] },
  {
    code: "OFFICE_MANAGER",
    name: "Office Manager",
    permissions: [
      "transaction.read",
      "dashboard.read",
      "report.read",
      "audit.read",
      "user.read",
      "department.read",
      "material.read",
      "material.manage",
      "workflow.read",
      "workflow.manage",
      "transaction.correct",
      "weighbridge.read",
      "weighbridge.manage",
      "camera.read",
      "camera.manage",
      "gateway.read",
      "gateway.manage",
      "hardware.pilot",
      "sync.read",
      "sync.manage",
      "anomaly.read",
      "anomaly.acknowledge",
      "anomaly.resolve",
      "anomaly.configure",
      "reliability.read",
      "reliability.manage",
      "monitoring.read",
      "integration.read",
      "integration.manage",
      ...STAFF_SUPPORT_PERMISSIONS,
    ],
  },
  {
    code: "EDGE_SERVICE",
    name: "Edge Gateway Service",
    permissions: [
      "weighment.record",
      "transaction.create",
      "transaction.read",
      "transaction.update",
      "transaction.finalize",
      "camera.read",
      "document.upload",
      "vehicle.read",
      "gateway.read",
    ],
  },
  {
    code: "SECURITY_USER",
    name: "Security User",
    permissions: [
      "security.read",
      "security.acknowledge",
      "anomaly.read",
      "anomaly.acknowledge",
      "transaction.read",
      "dashboard.read",
      ...CUSTOMER_SUPPORT_PERMISSIONS,
    ],
  },
  { code: "DRIVER", name: "Driver", permissions: ["transaction.read"] },
] as const;

async function main(): Promise<void> {
  const blocked = demoSeedBlockedReason({
    nodeEnv: process.env.NODE_ENV,
    allowDemoSeed: process.env.ALLOW_DEMO_SEED,
  });
  if (blocked) {
    throw new Error(blocked);
  }

  const organization = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {
      name: "Trinetra Development Demo",
      status: "ACTIVE",
      kind: "DEMO",
    },
    create: {
      slug: "demo",
      name: "Trinetra Development Demo",
      status: "ACTIVE",
      kind: "DEMO",
    },
  });

  const site = await prisma.site.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: "DEMO-SITE",
      },
    },
    update: {
      name: "Demo Site",
      timezone: "Asia/Kolkata",
    },
    create: {
      organizationId: organization.id,
      code: "DEMO-SITE",
      name: "Demo Site",
      timezone: "Asia/Kolkata",
    },
  });

  const departments = new Map<string, string>();
  for (const department of DEPARTMENTS) {
    const record = await prisma.department.upsert({
      where: {
        organizationId_code: {
          organizationId: organization.id,
          code: department.code,
        },
      },
      update: {
        name: department.name,
        isSystem: true,
      },
      create: {
        organizationId: organization.id,
        code: department.code,
        name: department.name,
        isSystem: true,
      },
    });
    departments.set(department.code, record.id);
  }

  const permissions = new Map<string, string>();
  for (const permission of PERMISSIONS) {
    const record = await prisma.permission.upsert({
      where: { code: permission.code },
      update: {
        name: permission.name,
        group: permission.group,
      },
      create: permission,
    });
    permissions.set(permission.code, record.id);
  }

  const roles = new Map<string, string>();
  for (const role of ROLES) {
    const record = await prisma.role.upsert({
      where: {
        organizationId_code: {
          organizationId: organization.id,
          code: role.code,
        },
      },
      update: {
        name: role.name,
        description: "Demo starter role. Organizations can rename or replace this.",
        isSystem: true,
      },
      create: {
        organizationId: organization.id,
        code: role.code,
        name: role.name,
        description: "Demo starter role. Organizations can rename or replace this.",
        isSystem: true,
      },
    });
    roles.set(role.code, record.id);

    for (const permissionCode of role.permissions) {
      const permissionId = permissions.get(permissionCode);
      if (!permissionId) {
        throw new Error(`Missing permission ${permissionCode}`);
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: record.id,
            permissionId,
          },
        },
        update: {},
        create: {
          roleId: record.id,
          permissionId,
        },
      });
    }
  }

  const siteB = await prisma.site.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: "DEMO-SITE-B",
      },
    },
    update: {
      name: "Demo Site B",
      timezone: "Asia/Kolkata",
    },
    create: {
      organizationId: organization.id,
      code: "DEMO-SITE-B",
      name: "Demo Site B",
      timezone: "Asia/Kolkata",
    },
  });

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const admin = await upsertDemoUser({
    organizationId: organization.id,
    email: "admin@demo.local",
    fullName: "Demo Administrator",
    passwordHash,
    isActive: true,
    defaultSiteId: site.id,
    defaultDepartmentId: departments.get("OFFICE"),
    roleId: requireRoleId(roles, "ADMIN"),
    roleSiteId: null,
  });

  const supportEngineer = await upsertDemoUser({
    organizationId: organization.id,
    email: "support@demo.local",
    fullName: "Demo Support Engineer",
    passwordHash,
    isActive: true,
    defaultSiteId: site.id,
    defaultDepartmentId: departments.get("OFFICE"),
    roleId: requireRoleId(roles, "SUPPORT_ENGINEER"),
    roleSiteId: null,
  });

  await upsertDemoUser({
    organizationId: organization.id,
    email: "implement@demo.local",
    fullName: "Demo Implementation Engineer",
    passwordHash,
    isActive: true,
    defaultSiteId: site.id,
    defaultDepartmentId: departments.get("OFFICE"),
    roleId: requireRoleId(roles, "IMPLEMENTATION_ENGINEER"),
    roleSiteId: null,
  });

  const weighbridgeOperator = await upsertDemoUser({
    organizationId: organization.id,
    email: "weighbridge@demo.local",
    fullName: "Demo Weighbridge Operator",
    passwordHash,
    isActive: true,
    defaultSiteId: site.id,
    defaultDepartmentId: departments.get("WEIGHBRIDGE"),
    roleId: requireRoleId(roles, "WEIGHBRIDGE_OPERATOR"),
    roleSiteId: site.id,
  });

  await upsertDemoUser({
    organizationId: organization.id,
    email: "store@demo.local",
    fullName: "Demo Store Officer",
    passwordHash,
    isActive: true,
    defaultSiteId: site.id,
    defaultDepartmentId: departments.get("STORE"),
    roleId: requireRoleId(roles, "STORE_OFFICER"),
    roleSiteId: site.id,
  });

  await upsertDemoUser({
    organizationId: organization.id,
    email: "supervisor@demo.local",
    fullName: "Demo Supervisor",
    passwordHash,
    isActive: true,
    defaultSiteId: site.id,
    defaultDepartmentId: departments.get("SUPERVISOR"),
    roleId: requireRoleId(roles, "SUPERVISOR"),
    roleSiteId: site.id,
  });

  await upsertDemoUser({
    organizationId: organization.id,
    email: "store-b@demo.local",
    fullName: "Demo Store Officer Site B",
    passwordHash,
    isActive: true,
    defaultSiteId: siteB.id,
    defaultDepartmentId: departments.get("STORE"),
    roleId: requireRoleId(roles, "STORE_OFFICER"),
    roleSiteId: siteB.id,
  });

  await upsertDemoUser({
    organizationId: organization.id,
    email: "office@demo.local",
    fullName: "Demo Office Manager",
    passwordHash,
    isActive: true,
    defaultSiteId: site.id,
    defaultDepartmentId: departments.get("OFFICE"),
    roleId: requireRoleId(roles, "OFFICE_MANAGER"),
    roleSiteId: site.id,
  });

  await upsertDemoUser({
    organizationId: organization.id,
    email: "inactive@demo.local",
    fullName: "Demo Inactive User",
    passwordHash,
    isActive: false,
    defaultSiteId: site.id,
    defaultDepartmentId: departments.get("OFFICE"),
    roleId: requireRoleId(roles, "OFFICE_MANAGER"),
    roleSiteId: site.id,
  });

  await upsertDemoUser({
    organizationId: organization.id,
    email: "site-b@demo.local",
    fullName: "Demo Site B User",
    passwordHash,
    isActive: true,
    defaultSiteId: siteB.id,
    defaultDepartmentId: departments.get("SITE"),
    roleId: requireRoleId(roles, "SITE_USER"),
    roleSiteId: siteB.id,
  });

  await prisma.weighbridge.upsert({
    where: {
      siteId_code: {
        siteId: site.id,
        code: "WB-01",
      },
    },
    update: {
      name: "Demo Weighbridge 01",
      isActive: true,
      organizationId: organization.id,
    },
    create: {
      organizationId: organization.id,
      siteId: site.id,
      code: "WB-01",
      name: "Demo Weighbridge 01",
      isActive: true,
    },
  });

  const demoWeighbridge = await prisma.weighbridge.findUniqueOrThrow({
    where: {
      siteId_code: {
        siteId: site.id,
        code: "WB-01",
      },
    },
  });

  await prisma.weighbridgeHardwareProfile.upsert({
    where: { weighbridgeId: demoWeighbridge.id },
    update: {
      deviceName: "Demo Weighbridge 01",
      deviceIdentifier: "WB-01",
      providerType: "SIMULATOR",
      enabled: true,
      unit: "KG",
      simulatorMode: "AUTO",
      simulatorBaseKg: "3.000",
      stabilityDurationMs: 1000,
      stabilityConsecutive: 3,
      pollingIntervalMs: 500,
    },
    create: {
      organizationId: organization.id,
      siteId: site.id,
      weighbridgeId: demoWeighbridge.id,
      providerType: "SIMULATOR",
      connectionType: "NONE",
      deviceName: "Demo Weighbridge 01",
      deviceIdentifier: "WB-01",
      enabled: true,
      unit: "KG",
      simulatorMode: "AUTO",
      simulatorBaseKg: "3.000",
      stabilityDurationMs: 1000,
      stabilityConsecutive: 3,
      pollingIntervalMs: 500,
    },
  });

  await prisma.weightAnomalyConfig.upsert({
    where: { weighbridgeId: demoWeighbridge.id },
    update: {},
    create: {
      organizationId: organization.id,
      weighbridgeId: demoWeighbridge.id,
      defaultsLabel: "DEVELOPMENT DEFAULT",
    },
  });

  await upsertDemoUser({
    organizationId: organization.id,
    email: "edge.service@trinetra.local",
    fullName: "Trinetra Edge Service",
    passwordHash: await hashPassword(randomBytes(32).toString("hex")),
    isActive: false,
    defaultSiteId: site.id,
    defaultDepartmentId: departments.get("WEIGHBRIDGE"),
    roleId: requireRoleId(roles, "EDGE_SERVICE"),
    roleSiteId: null,
  });

  await prisma.camera.upsert({
    where: {
      weighbridgeId_cameraIdentifier: {
        weighbridgeId: demoWeighbridge.id,
        cameraIdentifier: "ENTRY-01",
      },
    },
    update: {
      name: "ENTRY CAMERA 01",
      purpose: "ENTRY_ANPR",
      cameraProviderType: "SIMULATOR",
      connectionType: "SIMULATOR",
      anprProviderType: "SIMULATOR",
      enabled: true,
      direction: "ENTRY",
      simulatorScenario: "HIGH_KNOWN",
    },
    create: {
      organizationId: organization.id,
      siteId: site.id,
      weighbridgeId: demoWeighbridge.id,
      name: "ENTRY CAMERA 01",
      cameraIdentifier: "ENTRY-01",
      purpose: "ENTRY_ANPR",
      cameraProviderType: "SIMULATOR",
      connectionType: "SIMULATOR",
      anprProviderType: "SIMULATOR",
      enabled: true,
      direction: "ENTRY",
      simulatorScenario: "HIGH_KNOWN",
      highConfidenceMin: 0.9,
      mediumConfidenceMin: 0.7,
    },
  });

  const demoCamera = await prisma.camera.findUniqueOrThrow({
    where: {
      weighbridgeId_cameraIdentifier: {
        weighbridgeId: demoWeighbridge.id,
        cameraIdentifier: "ENTRY-01",
      },
    },
  });

  const demoGatewaySecret =
    process.env.EDGE_GATEWAY_DEV_SECRET ?? "tgw_devonly_trinetra_edge_simulator_not_for_production_0001";
  await prisma.offlinePolicy.upsert({
    where: {
      organizationId_siteId: {
        organizationId: organization.id,
        siteId: site.id,
      },
    },
    update: {
      version: 1,
      source: "CENTRAL",
      approvals: "BLOCKED",
      transactionCompletion: "CONDITIONAL",
    },
    create: {
      organizationId: organization.id,
      siteId: site.id,
      version: 1,
      source: "CENTRAL",
      approvals: "BLOCKED",
      transactionCompletion: "CONDITIONAL",
    },
  });

  const demoGateway = await prisma.edgeGateway.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: "TRINETRA-EDGE-01",
      },
    },
    update: {
      name: "Demo Site Edge Gateway",
      siteId: site.id,
      enabled: true,
      revokedAt: null,
      credentialHash: hashGatewayCredential(demoGatewaySecret),
      status: "PENDING",
    },
    create: {
      organizationId: organization.id,
      siteId: site.id,
      code: "TRINETRA-EDGE-01",
      name: "Demo Site Edge Gateway",
      status: "PENDING",
      enabled: true,
      credentialHash: hashGatewayCredential(demoGatewaySecret),
      registeredByUserId: admin.id,
    },
  });

  await prisma.edgeDevice.upsert({
    where: { gatewayId_code: { gatewayId: demoGateway.id, code: "WB-01" } },
    update: {
      name: "WB-01",
      deviceType: EdgeDeviceType.WEIGHBRIDGE_INDICATOR,
      provider: "SIMULATOR",
      protocol: "SIMULATOR",
      connectionType: "SIMULATOR",
      weighbridgeId: demoWeighbridge.id,
      enabled: true,
      adapterKey: "simulator",
      protocolReadiness: HardwareProtocolReadiness.SIMULATOR,
      installationStatus: HardwareInstallationStatus.CONFIGURED,
    },
    create: {
      organizationId: organization.id,
      siteId: site.id,
      gatewayId: demoGateway.id,
      deviceType: EdgeDeviceType.WEIGHBRIDGE_INDICATOR,
      name: "WB-01",
      code: "WB-01",
      provider: "SIMULATOR",
      protocol: "SIMULATOR",
      connectionType: "SIMULATOR",
      weighbridgeId: demoWeighbridge.id,
      enabled: true,
      adapterKey: "simulator",
      protocolReadiness: HardwareProtocolReadiness.SIMULATOR,
      installationStatus: HardwareInstallationStatus.CONFIGURED,
    },
  });

  await prisma.edgeDevice.upsert({
    where: { gatewayId_code: { gatewayId: demoGateway.id, code: "CAM-01" } },
    update: {
      name: "ENTRY ANPR CAMERA",
      deviceType: EdgeDeviceType.CAMERA,
      provider: "SIMULATOR",
      protocol: "SIMULATOR",
      connectionType: "SIMULATOR",
      cameraId: demoCamera.id,
      weighbridgeId: demoWeighbridge.id,
      enabled: true,
      adapterKey: "simulator",
      protocolReadiness: HardwareProtocolReadiness.SIMULATOR,
      installationStatus: HardwareInstallationStatus.CONFIGURED,
    },
    create: {
      organizationId: organization.id,
      siteId: site.id,
      gatewayId: demoGateway.id,
      deviceType: EdgeDeviceType.CAMERA,
      name: "ENTRY ANPR CAMERA",
      code: "CAM-01",
      provider: "SIMULATOR",
      protocol: "SIMULATOR",
      connectionType: "SIMULATOR",
      cameraId: demoCamera.id,
      weighbridgeId: demoWeighbridge.id,
      enabled: true,
      adapterKey: "simulator",
      protocolReadiness: HardwareProtocolReadiness.SIMULATOR,
      installationStatus: HardwareInstallationStatus.CONFIGURED,
    },
  });

  await prisma.edgeDevice.upsert({
    where: { gatewayId_code: { gatewayId: demoGateway.id, code: "SCAN-01" } },
    update: {
      name: "DOCUMENT SCANNER",
      deviceType: EdgeDeviceType.SCANNER,
      provider: "SIMULATOR",
      protocol: "SIMULATOR",
      connectionType: "SIMULATOR",
      enabled: true,
      adapterKey: "simulator",
      protocolReadiness: HardwareProtocolReadiness.SIMULATOR,
      installationStatus: HardwareInstallationStatus.CONFIGURED,
    },
    create: {
      organizationId: organization.id,
      siteId: site.id,
      gatewayId: demoGateway.id,
      deviceType: EdgeDeviceType.SCANNER,
      name: "DOCUMENT SCANNER",
      code: "SCAN-01",
      provider: "SIMULATOR",
      protocol: "SIMULATOR",
      connectionType: "SIMULATOR",
      enabled: true,
      adapterKey: "simulator",
      protocolReadiness: HardwareProtocolReadiness.SIMULATOR,
      installationStatus: HardwareInstallationStatus.CONFIGURED,
    },
  });

  const supplier = await prisma.supplier.upsert({
    where: {
      organizationId_code: {
        organizationId: organization.id,
        code: "DEMO-SUP",
      },
    },
    update: {
      name: "Demo Supplier",
    },
    create: {
      organizationId: organization.id,
      name: "Demo Supplier",
      code: "DEMO-SUP",
    },
  });

  await prisma.vehicle.upsert({
    where: {
      organizationId_registrationNumber: {
        organizationId: organization.id,
        registrationNumber: "DEMO0001",
      },
    },
    update: {
      displayRegistrationNumber: "DEMO-0001",
      vehicleType: "Truck",
      transporterName: "Demo Transport",
      supplierId: supplier.id,
      notes: "Development demo vehicle. Not a real registration.",
    },
    create: {
      organizationId: organization.id,
      registrationNumber: "DEMO0001",
      displayRegistrationNumber: "DEMO-0001",
      vehicleType: "Truck",
      transporterName: "Demo Transport",
      supplierId: supplier.id,
      notes: "Development demo vehicle. Not a real registration.",
    },
  });

  await prisma.vehicle.upsert({
    where: {
      organizationId_registrationNumber: {
        organizationId: organization.id,
        registrationNumber: "AP39XX1234",
      },
    },
    update: {
      displayRegistrationNumber: "AP39XX1234",
      vehicleType: "Truck",
      transporterName: "Deccan Haulage",
      supplierId: supplier.id,
      notes: "Simulated ANPR demo plate.",
    },
    create: {
      organizationId: organization.id,
      registrationNumber: "AP39XX1234",
      displayRegistrationNumber: "AP39XX1234",
      vehicleType: "Truck",
      transporterName: "Deccan Haulage",
      supplierId: supplier.id,
      notes: "Simulated ANPR demo plate.",
    },
  });

  await prisma.vehicle.upsert({
    where: {
      organizationId_registrationNumber: {
        organizationId: organization.id,
        registrationNumber: "MH12AB1234",
      },
    },
    update: {
      displayRegistrationNumber: "MH12 AB 1234",
      vehicleType: "Tipper",
      transporterName: "Western Carriers",
      notes: "Simulated ANPR demo plate.",
    },
    create: {
      organizationId: organization.id,
      registrationNumber: "MH12AB1234",
      displayRegistrationNumber: "MH12 AB 1234",
      vehicleType: "Tipper",
      transporterName: "Western Carriers",
      notes: "Simulated ANPR demo plate.",
    },
  });

  await prisma.vehicle.upsert({
    where: {
      organizationId_registrationNumber: {
        organizationId: organization.id,
        registrationNumber: "TS09EA1234",
      },
    },
    update: {
      displayRegistrationNumber: "TS09EA1234",
      vehicleType: "Truck",
      transporterName: "Godavari Logistics",
      notes: "Simulated ANPR demo plate.",
    },
    create: {
      organizationId: organization.id,
      registrationNumber: "TS09EA1234",
      displayRegistrationNumber: "TS09EA1234",
      vehicleType: "Truck",
      transporterName: "Godavari Logistics",
      notes: "Simulated ANPR demo plate.",
    },
  });

  const materials = [
    { code: "CEMENT", name: "Cement", description: "Demo material. No universal workflow type is implied." },
    { code: "AGGREGATE", name: "Aggregate", description: "Demo material. No universal workflow type is implied." },
    { code: "STEEL", name: "Steel", description: "Demo material. No universal workflow type is implied." },
    { code: "SAND", name: "Sand", description: "Demo material. No universal workflow type is implied." },
  ] as const;

  for (const material of materials) {
    await prisma.material.upsert({
      where: {
        organizationId_code: {
          organizationId: organization.id,
          code: material.code,
        },
      },
      update: {
        name: material.name,
        description: material.description,
        unitOfMeasure: "MT",
        isActive: true,
      },
      create: {
        organizationId: organization.id,
        code: material.code,
        name: material.name,
        description: material.description,
        unitOfMeasure: "MT",
        isActive: true,
      },
    });
  }

  const storeDepartmentId = departments.get("STORE");
  const supervisorDepartmentId = departments.get("SUPERVISOR");
  if (!storeDepartmentId || !supervisorDepartmentId) {
    throw new Error("Missing STORE or SUPERVISOR department");
  }

  // Demo assignments only. TYPE_1 / TYPE_2 / TYPE_3 are organization labels, not industry rules.
  const type1 = await upsertDemoWorkflow({
    organizationId: organization.id,
    code: "TYPE_1",
    name: "Demo Type 1",
    description:
      "Development demo workflow only. This is not an industry standard. Organizations can change or replace it.",
    config: { autoContinue: false, approvalThresholdKg: null },
    steps: [
      { sortOrder: 1, capability: WorkflowCapability.IDENTIFY_VEHICLE, name: "Identify vehicle" },
      { sortOrder: 2, capability: WorkflowCapability.CAPTURE_DOCUMENTS, name: "Capture documents" },
      { sortOrder: 3, capability: WorkflowCapability.VERIFY_DOCUMENTS, name: "Verify documents" },
      { sortOrder: 4, capability: WorkflowCapability.CLASSIFY_MATERIAL, name: "Classify material" },
      { sortOrder: 5, capability: WorkflowCapability.FIRST_WEIGHMENT, name: "First weighment" },
      {
        sortOrder: 6,
        capability: WorkflowCapability.APPROVAL,
        name: "Supervisor verification",
        approvalDepartmentId: supervisorDepartmentId,
      },
      { sortOrder: 7, capability: WorkflowCapability.UNLOAD, name: "Unload" },
      { sortOrder: 8, capability: WorkflowCapability.SECOND_WEIGHMENT, name: "Second weighment" },
      { sortOrder: 9, capability: WorkflowCapability.COMPLETE, name: "Complete" },
    ],
  });

  const type2 = await upsertDemoWorkflow({
    organizationId: organization.id,
    code: "TYPE_2",
    name: "Demo Type 2",
    description:
      "Development demo workflow only. Includes a Store approval step. This is not an industry standard.",
    config: { autoContinue: false, approvalThresholdKg: null },
    steps: [
      { sortOrder: 1, capability: WorkflowCapability.IDENTIFY_VEHICLE, name: "Identify vehicle" },
      { sortOrder: 2, capability: WorkflowCapability.CAPTURE_DOCUMENTS, name: "Capture documents" },
      { sortOrder: 3, capability: WorkflowCapability.VERIFY_DOCUMENTS, name: "Verify documents" },
      { sortOrder: 4, capability: WorkflowCapability.CLASSIFY_MATERIAL, name: "Classify material" },
      { sortOrder: 5, capability: WorkflowCapability.FIRST_WEIGHMENT, name: "First weighment" },
      {
        sortOrder: 6,
        capability: WorkflowCapability.APPROVAL,
        name: "Store approval",
        approvalDepartmentId: storeDepartmentId,
      },
      { sortOrder: 7, capability: WorkflowCapability.UNLOAD, name: "Unload" },
      { sortOrder: 8, capability: WorkflowCapability.SECOND_WEIGHMENT, name: "Second weighment" },
      { sortOrder: 9, capability: WorkflowCapability.COMPLETE, name: "Complete" },
    ],
  });

  const type3 = await upsertDemoWorkflow({
    organizationId: organization.id,
    code: "TYPE_3",
    name: "Demo Type 3",
    description:
      "Development demo workflow only. Auto-continues below an organization-specific threshold. Not a universal rule.",
    config: { autoContinue: true, approvalThresholdKg: 40000 },
    steps: [
      { sortOrder: 1, capability: WorkflowCapability.IDENTIFY_VEHICLE, name: "Identify vehicle" },
      { sortOrder: 2, capability: WorkflowCapability.CAPTURE_DOCUMENTS, name: "Capture documents" },
      { sortOrder: 3, capability: WorkflowCapability.VERIFY_DOCUMENTS, name: "Verify documents" },
      { sortOrder: 4, capability: WorkflowCapability.CLASSIFY_MATERIAL, name: "Classify material" },
      { sortOrder: 5, capability: WorkflowCapability.FIRST_WEIGHMENT, name: "First weighment" },
      {
        sortOrder: 6,
        capability: WorkflowCapability.APPROVAL,
        name: "Exception approval",
        approvalDepartmentId: storeDepartmentId,
      },
      { sortOrder: 7, capability: WorkflowCapability.UNLOAD, name: "Unload" },
      { sortOrder: 8, capability: WorkflowCapability.SECOND_WEIGHMENT, name: "Second weighment" },
      { sortOrder: 9, capability: WorkflowCapability.COMPLETE, name: "Complete" },
    ],
  });

  await assignDemoMaterialWorkflow(organization.id, "SAND", type1.id);
  await assignDemoMaterialWorkflow(organization.id, "CEMENT", type2.id);
  await assignDemoMaterialWorkflow(organization.id, "STEEL", type2.id);
  await assignDemoMaterialWorkflow(organization.id, "AGGREGATE", type3.id);

  await seedUnloadingPoints(organization.id, site.id, siteB.id);
  await seedInactiveDemoSite(organization.id);
  await seedDashboardDemoScenarios(prisma, {
    organizationId: organization.id,
    siteId: site.id,
    siteBId: siteB.id,
    operatorUserId: admin.id,
  });
  await seedDemoNotifications(prisma, organization.id);
  await seedDemoSupport({
    organizationId: organization.id,
    siteId: site.id,
    siteBId: siteB.id,
    weighbridgeId: demoWeighbridge.id,
    gatewayId: demoGateway.id,
    createdByUserId: admin.id,
    supportUserId: supportEngineer.id,
    operatorUserId: weighbridgeOperator.id,
    db: prisma,
  });
  await seedDemoIntegration(organization.id, admin.id);
  await seedIsolatedTenants(passwordHash);

  const internalPermission = await prisma.permission.findUnique({ where: { code: "support.internal" } });
  if (internalPermission) {
    await prisma.rolePermission.deleteMany({
      where: {
        permissionId: internalPermission.id,
        role: { code: "ADMIN" },
      },
    });
  }

  const existingSeedAudit = await prisma.auditLog.findFirst({
    where: {
      organizationId: organization.id,
      action: "seed.completed",
      entityType: "Organization",
      entityId: organization.id,
    },
  });

  if (!existingSeedAudit) {
    await prisma.auditLog.create({
      data: {
        organizationId: organization.id,
        actorUserId: admin.id,
        action: "seed.completed",
        entityType: "Organization",
        entityId: organization.id,
        metadata: {
          environment: "development",
          note: "Demo seed only. Not a real customer organization.",
        },
      },
    });
  }

  console.log("Seeded Trinetra development demo data.");
  console.log("Development-only password for all demo users: demo-password");
  console.log("Change these credentials before any production deployment.");
  console.log("admin@demo.local — ADMIN");
  console.log("implement@demo.local — IMPLEMENTATION_ENGINEER");
  console.log("support@demo.local — SUPPORT_ENGINEER");
  console.log("weighbridge@demo.local — WEIGHBRIDGE_OPERATOR");
  console.log("store@demo.local — STORE_OFFICER");
  console.log("supervisor@demo.local — SUPERVISOR");
  console.log("store-b@demo.local — STORE_OFFICER on DEMO-SITE-B");
  console.log("office@demo.local — OFFICE_MANAGER");
  console.log("inactive@demo.local — inactive account");
  console.log("site-b@demo.local — SITE_USER on DEMO-SITE-B");
  console.log("admin@acme.local — isolated customer tenant ADMIN");
  console.log("weighbridge@acme.local — isolated customer tenant operator");
  console.log("admin@frozen.local — suspended tenant (login allowed, writes blocked)");
  console.log("admin@archived.local — archived tenant (login blocked)");
  console.log("Seeded demo Edge Gateway TRINETRA-EDGE-01. Development credential is in apps/edge/.env.example.");
}

async function seedDemoIntegration(organizationId: string, createdByUserId: string): Promise<void> {
  const existing = await prisma.integrationApplication.findFirst({
    where: { organizationId, name: "Demo ERP connector" },
  });
  if (existing) {
    return;
  }
  const application = await prisma.integrationApplication.create({
    data: {
      organizationId,
      name: "Demo ERP connector",
      description: "Development TEST integration. Not a vendor-specific ERP connector.",
      environment: "TEST",
      scopes: [
        "ORGANIZATION_READ",
        "TRANSACTIONS_READ",
        "TRANSACTIONS_WRITE",
        "VEHICLES_READ",
        "VEHICLES_WRITE",
        "MATERIALS_READ",
        "WEIGHBRIDGES_READ",
        "WEIGHMENTS_READ",
        "REPORTS_READ",
        "DEVICES_READ",
        "EVENTS_READ",
        "DOCUMENTS_READ",
        "NOTIFICATIONS_READ",
      ],
      siteIds: [],
      requestsPerMinute: 60,
      requestsPerHour: 1200,
      createdByUserId,
    },
  });
  const secret = generateIntegrationSecret("TEST");
  await prisma.integrationCredential.create({
    data: {
      organizationId,
      applicationId: application.id,
      clientId: generateIntegrationClientId(),
      secretHash: hashIntegrationSecret(secret),
      secretPrefix: secretPrefix(secret),
    },
  });
  console.log("Demo TEST integration credential (shown once at seed):");
  console.log(secret);
}

function requireRoleId(roles: Map<string, string>, code: string): string {
  const roleId = roles.get(code);
  if (!roleId) {
    throw new Error(`Missing role ${code}`);
  }
  return roleId;
}

async function seedInactiveDemoSite(organizationId: string): Promise<void> {
  const site = await prisma.site.upsert({
    where: {
      organizationId_code: { organizationId, code: "DEMO-SITE-INACTIVE" },
    },
    update: { name: "Demo Inactive Site", status: "INACTIVE", timezone: "Asia/Kolkata" },
    create: {
      organizationId,
      code: "DEMO-SITE-INACTIVE",
      name: "Demo Inactive Site",
      timezone: "Asia/Kolkata",
      status: "INACTIVE",
    },
  });

  await prisma.weighbridge.upsert({
    where: { siteId_code: { siteId: site.id, code: "WB-INACT" } },
    update: { name: "Inactive Site Weighbridge", isActive: true, organizationId },
    create: {
      organizationId,
      siteId: site.id,
      code: "WB-INACT",
      name: "Inactive Site Weighbridge",
      isActive: true,
    },
  });
}

async function seedIsolatedTenants(passwordHash: string): Promise<void> {
  await seedStandaloneTenant({
    slug: "acme",
    name: "Acme Isolated Tenant",
    kind: "CUSTOMER",
    status: "ACTIVE",
    siteCode: "ACME-PLANT",
    siteName: "Acme Plant",
    weighbridgeCode: "WB-ACME",
    adminEmail: "admin@acme.local",
    operatorEmail: "weighbridge@acme.local",
    passwordHash,
    seedOperationalData: true,
  });
  await seedStandaloneTenant({
    slug: "frozen",
    name: "Frozen Isolated Tenant",
    kind: "CUSTOMER",
    status: "SUSPENDED",
    siteCode: "FROZEN-SITE",
    siteName: "Frozen Site",
    weighbridgeCode: "WB-FROZEN",
    adminEmail: "admin@frozen.local",
    passwordHash,
    seedOperationalData: true,
  });
  await seedStandaloneTenant({
    slug: "archived",
    name: "Archived Isolated Tenant",
    kind: "CUSTOMER",
    status: "ARCHIVED",
    siteCode: "ARCHIVED-SITE",
    siteName: "Archived Site",
    adminEmail: "admin@archived.local",
    passwordHash,
    seedOperationalData: false,
  });
}

async function seedStandaloneTenant(input: {
  slug: string;
  name: string;
  kind: "DEMO" | "CUSTOMER";
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  siteCode: string;
  siteName: string;
  weighbridgeCode?: string;
  adminEmail: string;
  operatorEmail?: string;
  passwordHash: string;
  seedOperationalData: boolean;
}): Promise<void> {
  const organization = await prisma.organization.upsert({
    where: { slug: input.slug },
    update: { name: input.name, kind: input.kind, status: input.status },
    create: { slug: input.slug, name: input.name, kind: input.kind, status: input.status },
  });

  const site = await prisma.site.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: input.siteCode } },
    update: { name: input.siteName, timezone: "Asia/Kolkata", status: "ACTIVE" },
    create: {
      organizationId: organization.id,
      code: input.siteCode,
      name: input.siteName,
      timezone: "Asia/Kolkata",
      status: "ACTIVE",
    },
  });

  const office = await prisma.department.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: "OFFICE" } },
    update: { name: "Office", isSystem: true },
    create: { organizationId: organization.id, code: "OFFICE", name: "Office", isSystem: true },
  });
  const weighbridgeDept = await prisma.department.upsert({
    where: { organizationId_code: { organizationId: organization.id, code: "WEIGHBRIDGE" } },
    update: { name: "Weighbridge", isSystem: true },
    create: { organizationId: organization.id, code: "WEIGHBRIDGE", name: "Weighbridge", isSystem: true },
  });

  const permissionRows = await prisma.permission.findMany({ select: { id: true, code: true } });
  const permissionByCode = new Map(permissionRows.map((row) => [row.code, row.id]));

  const adminRoleDef = ROLES.find((role) => role.code === "ADMIN");
  const operatorRoleDef = ROLES.find((role) => role.code === "WEIGHBRIDGE_OPERATOR");
  if (!adminRoleDef || !operatorRoleDef) {
    throw new Error("Starter roles are missing");
  }

  const adminRole = await upsertTenantRole(organization.id, adminRoleDef, permissionByCode);
  const operatorRole = await upsertTenantRole(organization.id, operatorRoleDef, permissionByCode);

  const admin = await upsertDemoUser({
    organizationId: organization.id,
    email: input.adminEmail,
    fullName: `${input.name} Administrator`,
    passwordHash: input.passwordHash,
    isActive: true,
    defaultSiteId: site.id,
    defaultDepartmentId: office.id,
    roleId: adminRole.id,
    roleSiteId: null,
  });

  if (input.operatorEmail) {
    await upsertDemoUser({
      organizationId: organization.id,
      email: input.operatorEmail,
      fullName: `${input.name} Operator`,
      passwordHash: input.passwordHash,
      isActive: true,
      defaultSiteId: site.id,
      defaultDepartmentId: weighbridgeDept.id,
      roleId: operatorRole.id,
      roleSiteId: site.id,
    });
  }

  if (!input.seedOperationalData) {
    return;
  }

  const weighbridgeCode = input.weighbridgeCode ?? "WB-01";
  const weighbridge = await prisma.weighbridge.upsert({
    where: { siteId_code: { siteId: site.id, code: weighbridgeCode } },
    update: { name: `${input.siteName} Weighbridge`, isActive: true, organizationId: organization.id },
    create: {
      organizationId: organization.id,
      siteId: site.id,
      code: weighbridgeCode,
      name: `${input.siteName} Weighbridge`,
      isActive: true,
    },
  });

  const plate = `${input.slug.toUpperCase()}0001`;
  const vehicle = await prisma.vehicle.upsert({
    where: { organizationId_registrationNumber: { organizationId: organization.id, registrationNumber: plate } },
    update: { displayRegistrationNumber: plate, deletedAt: null },
    create: {
      organizationId: organization.id,
      registrationNumber: plate,
      displayRegistrationNumber: plate,
    },
  });

  const existingTx = await prisma.transaction.findFirst({
    where: { organizationId: organization.id, referenceNumber: "TRN-2026-900001" },
  });
  if (!existingTx) {
    await prisma.transaction.create({
      data: {
        organizationId: organization.id,
        siteId: site.id,
        weighbridgeId: weighbridge.id,
        vehicleId: vehicle.id,
        referenceNumber: "TRN-2026-900001",
        status: "ARRIVED",
        arrivedAt: new Date(),
        operationMode: "SIMULATION",
        createdByUserId: admin.id,
      },
    });
  }
}

async function upsertTenantRole(
  organizationId: string,
  role: (typeof ROLES)[number],
  permissionByCode: Map<string, string>,
): Promise<{ id: string }> {
  const record = await prisma.role.upsert({
    where: { organizationId_code: { organizationId, code: role.code } },
    update: { name: role.name, isSystem: true },
    create: {
      organizationId,
      code: role.code,
      name: role.name,
      description: "Isolated tenant starter role.",
      isSystem: true,
    },
  });
  for (const permissionCode of role.permissions) {
    const permissionId = permissionByCode.get(permissionCode);
    if (!permissionId) {
      continue;
    }
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: record.id, permissionId } },
      update: {},
      create: { roleId: record.id, permissionId },
    });
  }
  return record;
}

async function upsertDemoUser(input: {
  organizationId: string;
  email: string;
  fullName: string;
  passwordHash: string;
  isActive: boolean;
  defaultSiteId: string;
  defaultDepartmentId: string | undefined;
  roleId: string;
  roleSiteId: string | null;
}): Promise<{ id: string }> {
  const user = await prisma.user.upsert({
    where: {
      organizationId_email: {
        organizationId: input.organizationId,
        email: input.email,
      },
    },
    update: {
      fullName: input.fullName,
      passwordHash: input.passwordHash,
      isActive: input.isActive,
      defaultSiteId: input.defaultSiteId,
      defaultDepartmentId: input.defaultDepartmentId,
      deletedAt: null,
    },
    create: {
      organizationId: input.organizationId,
      email: input.email,
      fullName: input.fullName,
      passwordHash: input.passwordHash,
      isActive: input.isActive,
      defaultSiteId: input.defaultSiteId,
      defaultDepartmentId: input.defaultDepartmentId,
    },
  });

  const existingRole = await prisma.userRole.findFirst({
    where: {
      userId: user.id,
      roleId: input.roleId,
      siteId: input.roleSiteId,
    },
  });

  if (!existingRole) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: input.roleId,
        siteId: input.roleSiteId,
      },
    });
  }

  return user;
}

async function seedUnloadingPoints(organizationId: string, siteId: string, siteBId: string): Promise<void> {
  const points = [
    { siteId, code: "UP-01", name: "Unloading Point 01", sortOrder: 1 },
    { siteId, code: "UP-02", name: "Unloading Point 02", sortOrder: 2 },
    { siteId, code: "UP-03", name: "Unloading Point 03", sortOrder: 3 },
    { siteId: siteBId, code: "UP-B1", name: "Unloading Point B1", sortOrder: 1 },
  ] as const;

  const created = new Map<string, string>();
  for (const point of points) {
    const record = await prisma.unloadingPoint.upsert({
      where: {
        siteId_code: {
          siteId: point.siteId,
          code: point.code,
        },
      },
      update: {
        name: point.name,
        isActive: true,
        status: "AVAILABLE",
        sortOrder: point.sortOrder,
        deletedAt: null,
      },
      create: {
        organizationId,
        siteId: point.siteId,
        code: point.code,
        name: point.name,
        description: "Development demo unloading bay. Assignment is configured, not hard-coded.",
        sortOrder: point.sortOrder,
      },
    });
    created.set(`${point.siteId}:${point.code}`, record.id);
  }

  const cement = await prisma.material.findUnique({
    where: { organizationId_code: { organizationId, code: "CEMENT" } },
  });
  const up03 = created.get(`${siteId}:UP-03`);
  if (cement && up03) {
    const existing = await prisma.unloadingPointAssignmentRule.findFirst({
      where: {
        organizationId,
        siteId,
        materialId: cement.id,
        unloadingPointId: up03,
      },
    });
    if (!existing) {
      await prisma.unloadingPointAssignmentRule.create({
        data: {
          organizationId,
          siteId,
          materialId: cement.id,
          unloadingPointId: up03,
          priority: 10,
          isActive: true,
        },
      });
    }
  }
}

async function assignDemoMaterialWorkflow(
  organizationId: string,
  materialCode: string,
  workflowDefinitionId: string,
): Promise<void> {
  const material = await prisma.material.findUnique({
    where: { organizationId_code: { organizationId, code: materialCode } },
  });
  if (!material) {
    throw new Error(`Missing demo material ${materialCode}`);
  }

  const current = await prisma.materialWorkflowAssignment.findFirst({
    where: { materialId: material.id, siteId: null, effectiveTo: null },
  });
  if (current?.workflowDefinitionId === workflowDefinitionId) {
    return;
  }

  const now = new Date();
  if (current) {
    await prisma.materialWorkflowAssignment.update({
      where: { id: current.id },
      data: { effectiveTo: now },
    });
  }

  await prisma.materialWorkflowAssignment.create({
    data: {
      organizationId,
      materialId: material.id,
      workflowDefinitionId,
      siteId: null,
      effectiveFrom: now,
    },
  });
}

async function upsertDemoWorkflow(input: {
  organizationId: string;
  code: string;
  name: string;
  description: string;
  config: { autoContinue: boolean; approvalThresholdKg: number | null };
  steps: Array<{
    sortOrder: number;
    capability: WorkflowCapability;
    name: string;
    approvalDepartmentId?: string;
  }>;
}): Promise<{ id: string }> {
  const workflow = await prisma.workflowDefinition.upsert({
    where: {
      organizationId_code: {
        organizationId: input.organizationId,
        code: input.code,
      },
    },
    update: {
      name: input.name,
      description: input.description,
      isActive: true,
      config: input.config,
    },
    create: {
      organizationId: input.organizationId,
      code: input.code,
      name: input.name,
      description: input.description,
      isActive: true,
      config: input.config,
    },
  });

  await prisma.workflowStep.deleteMany({
    where: { workflowDefinitionId: workflow.id },
  });

  await prisma.workflowStep.createMany({
    data: input.steps.map((step) => ({
      workflowDefinitionId: workflow.id,
      sortOrder: step.sortOrder,
      capability: step.capability,
      name: step.name,
      isRequired: true,
      approvalDepartmentId: step.approvalDepartmentId,
    })),
  });

  return workflow;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
