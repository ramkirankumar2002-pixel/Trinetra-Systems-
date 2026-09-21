import { PROTOCOL_INFORMATION_REQUIRED_MESSAGE } from "../protocolReadiness.js";
import { GATEWAY_NOT_CONNECTED_MESSAGE, type OnboardingFindingSeverity } from "./catalog.js";
import { canPublishWorkflow, type PublishableWorkflow } from "./workflowPublish.js";

export type OnboardingFinding = {
  key: string;
  area: string;
  severity: OnboardingFindingSeverity;
  message: string;
};

export type ReadinessItem = {
  key: string;
  label: string;
  status: "PASS" | "WARNING" | "FAIL" | "NOT_TESTED";
  message: string;
  tested: boolean;
};

export type OnboardingValidationSnapshot = {
  organization: { exists: boolean; active: boolean; name: string };
  site: { exists: boolean; active: boolean; name: string };
  users: { administratorExists: boolean; total: number };
  rbac: { missingPermissions: string[] };
  weighbridge: { configured: boolean; name: string | null };
  gateway: { registered: boolean; connected: boolean; status: string | null };
  devices: {
    indicatorConfigured: boolean;
    anprConfigured: boolean;
    scannerConfigured: boolean;
    protocolInformationRequired: boolean;
  };
  materials: Array<{ name: string; code: string; hasPublishedWorkflow: boolean }>;
  workflows: PublishableWorkflow[];
  documents: { configured: boolean };
  unloading: { configured: boolean };
  notifications: { recipientsConfigured: boolean };
  language: { defaultConfigured: boolean };
  hardwareTests: {
    weightTested: boolean;
    weightOk: boolean;
    anprTested: boolean;
    anprOk: boolean;
    scannerTested: boolean;
    scannerOk: boolean;
  };
  loginWorks: boolean;
  siteIsolationConfigured: boolean;
  offlinePolicyAvailable: boolean;
  monitoringAvailable: boolean;
  backupConfigured: boolean;
  operationMode: string;
};

export function buildValidationFindings(snapshot: OnboardingValidationSnapshot): OnboardingFinding[] {
  const findings: OnboardingFinding[] = [];

  if (snapshot.organization.exists && snapshot.organization.active) {
    findings.push(pass("organization.active", "ORGANIZATION", `${snapshot.organization.name} is active.`));
  } else if (!snapshot.organization.exists) {
    findings.push(error("organization.missing", "ORGANIZATION", "Organization does not exist."));
  } else {
    findings.push(error("organization.inactive", "ORGANIZATION", "Organization is not active."));
  }

  if (snapshot.site.exists && snapshot.site.active) {
    findings.push(pass("site.active", "SITE", `${snapshot.site.name} is active.`));
  } else if (!snapshot.site.exists) {
    findings.push(error("site.missing", "SITE", "Site has not been created."));
  } else {
    findings.push(error("site.inactive", "SITE", "Site is not active."));
  }

  if (snapshot.users.administratorExists) {
    findings.push(pass("users.admin", "USERS", "Required administrator exists."));
  } else {
    findings.push(error("users.admin.missing", "USERS", "No active administrator exists."));
  }

  if (snapshot.rbac.missingPermissions.length === 0) {
    findings.push(pass("rbac.ready", "RBAC", "Required permissions exist."));
  } else {
    findings.push(
      error(
        "rbac.missing",
        "RBAC",
        `Required permissions are missing: ${snapshot.rbac.missingPermissions.join(", ")}.`,
      ),
    );
  }

  if (snapshot.weighbridge.configured) {
    findings.push(
      pass(
        "weighbridge.configured",
        "WEIGHBRIDGE",
        snapshot.weighbridge.name
          ? `Primary weighbridge configured (${snapshot.weighbridge.name}).`
          : "Primary weighbridge configured.",
      ),
    );
  } else {
    findings.push(error("weighbridge.missing", "WEIGHBRIDGE", "No weighbridge is configured."));
  }

  if (!snapshot.gateway.registered) {
    findings.push(error("gateway.missing", "GATEWAY", "Gateway is not registered."));
  } else if (snapshot.gateway.connected) {
    findings.push(pass("gateway.connected", "GATEWAY", "Gateway is registered and connected."));
  } else {
    findings.push({
      key: "gateway.offline",
      area: "GATEWAY",
      severity: snapshot.operationMode === "PRODUCTION" ? "ERROR" : "WARNING",
      message: GATEWAY_NOT_CONNECTED_MESSAGE,
    });
  }

  if (snapshot.devices.indicatorConfigured) {
    findings.push(pass("devices.indicator", "DEVICES", "Weight indicator is configured."));
  } else {
    findings.push(error("devices.indicator.missing", "DEVICES", "Required weight indicator is not configured."));
  }

  if (snapshot.devices.protocolInformationRequired) {
    findings.push(warn("devices.protocol", "DEVICES", PROTOCOL_INFORMATION_REQUIRED_MESSAGE));
  }

  if (snapshot.devices.anprConfigured) {
    findings.push(pass("devices.anpr", "DEVICES", "ANPR camera is configured."));
  } else {
    findings.push(warn("devices.anpr.missing", "DEVICES", "ANPR camera is not configured."));
  }

  if (snapshot.devices.scannerConfigured) {
    findings.push(pass("devices.scanner", "DEVICES", "Scanner is configured."));
  } else {
    findings.push(warn("devices.scanner.missing", "DEVICES", "Scanner is not configured."));
  }

  if (snapshot.materials.length === 0) {
    findings.push(error("materials.missing", "MATERIALS", "Required materials are not configured."));
  } else {
    findings.push(pass("materials.configured", "MATERIALS", `${snapshot.materials.length} required material(s) configured.`));
    for (const material of snapshot.materials) {
      if (!material.hasPublishedWorkflow) {
        findings.push(
          error(
            `materials.workflow.${material.code}`,
            "MATERIALS",
            `No published workflow exists for material ${material.name}.`,
          ),
        );
      }
    }
  }

  const published = snapshot.workflows.filter((workflow) => workflow.isActive);
  if (published.length === 0) {
    findings.push(error("workflows.unpublished", "WORKFLOWS", "No published workflow exists."));
  } else {
    findings.push(pass("workflows.published", "WORKFLOWS", `${published.length} published workflow(s).`));
  }
  for (const workflow of snapshot.workflows) {
    if (workflow.isActive && !canPublishWorkflow(workflow)) {
      findings.push(
        error(`workflows.invalid.${workflow.code}`, "WORKFLOWS", `Published workflow ${workflow.name} is not valid.`),
      );
    }
  }

  if (snapshot.documents.configured) {
    findings.push(pass("documents.configured", "DOCUMENTS", "Required documents are configured."));
  } else {
    findings.push(error("documents.missing", "DOCUMENTS", "Required document types are not configured."));
  }

  if (snapshot.unloading.configured) {
    findings.push(pass("unloading.configured", "UNLOADING", "Required unloading points are configured."));
  } else {
    findings.push(error("unloading.missing", "UNLOADING", "Required unloading points are not configured."));
  }

  if (snapshot.notifications.recipientsConfigured) {
    findings.push(pass("notifications.configured", "NOTIFICATIONS", "Required notification recipients are configured."));
  } else {
    findings.push(error("notifications.missing", "NOTIFICATIONS", "Required notification recipients are not configured."));
  }

  if (snapshot.language.defaultConfigured) {
    findings.push(pass("language.configured", "LANGUAGE", "Default driver language is configured."));
  } else {
    findings.push(error("language.missing", "LANGUAGE", "Default driver language is not configured."));
  }

  return findings;
}

export function buildPilotReadiness(snapshot: OnboardingValidationSnapshot): ReadinessItem[] {
  return [
    checked("login", "Login works", snapshot.loginWorks, "An implementation user can authenticate."),
    checked(
      "rbac",
      "RBAC works",
      snapshot.rbac.missingPermissions.length === 0 && snapshot.users.administratorExists,
      snapshot.rbac.missingPermissions.length === 0
        ? "Required roles and permissions are present."
        : `Missing permissions: ${snapshot.rbac.missingPermissions.join(", ")}.`,
    ),
    checked(
      "site-isolation",
      "Site isolation works",
      snapshot.siteIsolationConfigured,
      snapshot.siteIsolationConfigured
        ? "Site access is scoped to the organization."
        : "Site isolation cannot be confirmed.",
    ),
    {
      key: "gateway",
      label: "Gateway connected",
      status: snapshot.gateway.connected ? "PASS" : snapshot.gateway.registered ? "FAIL" : "NOT_TESTED",
      message: snapshot.gateway.connected
        ? "Gateway heartbeat is current."
        : snapshot.gateway.registered
          ? GATEWAY_NOT_CONNECTED_MESSAGE
          : "Gateway has not been registered.",
      tested: snapshot.gateway.registered,
    },
    checked(
      "devices",
      "Required devices available",
      snapshot.devices.indicatorConfigured,
      snapshot.devices.indicatorConfigured ? "Required devices are configured." : "Required devices are missing.",
    ),
    testedHardware(
      "weight",
      "Weight reading available",
      snapshot.hardwareTests.weightTested,
      snapshot.hardwareTests.weightOk,
      "Weight communication and stability were tested.",
      "Weight hardware test did not pass.",
      "Weight reading has not been tested.",
    ),
    testedHardware(
      "anpr",
      "ANPR available",
      snapshot.hardwareTests.anprTested,
      snapshot.hardwareTests.anprOk,
      "ANPR communication was tested.",
      "ANPR camera is configured but currently offline.",
      snapshot.devices.anprConfigured
        ? "ANPR camera is configured but has not been tested."
        : "ANPR has not been configured or tested.",
    ),
    testedHardware(
      "scanner",
      "Scanner available",
      snapshot.hardwareTests.scannerTested,
      snapshot.hardwareTests.scannerOk,
      "Scanner communication was tested.",
      "Scanner test did not pass.",
      snapshot.devices.scannerConfigured
        ? "Scanner is configured but has not been tested."
        : "Scanner has not been configured or tested.",
    ),
    checked(
      "workflow",
      "Required workflow published",
      snapshot.workflows.some((workflow) => workflow.isActive && canPublishWorkflow(workflow)),
      snapshot.workflows.some((workflow) => workflow.isActive)
        ? "A published workflow is available."
        : "No published workflow exists.",
    ),
    checked(
      "language",
      "Driver language configured",
      snapshot.language.defaultConfigured,
      snapshot.language.defaultConfigured ? "Default driver language is set." : "Default driver language is missing.",
    ),
    checked(
      "notifications",
      "Notifications configured",
      snapshot.notifications.recipientsConfigured,
      snapshot.notifications.recipientsConfigured
        ? "In-app notification recipients are configured."
        : "Notification recipients are missing.",
    ),
    checked(
      "offline",
      "Offline configuration available",
      snapshot.offlinePolicyAvailable,
      snapshot.offlinePolicyAvailable
        ? "Offline policy exists for the site."
        : "Offline policy has not been published for this site.",
    ),
    checked(
      "monitoring",
      "Monitoring available",
      snapshot.monitoringAvailable,
      snapshot.monitoringAvailable ? "Monitoring endpoints are available." : "Monitoring is not available.",
    ),
    {
      key: "backup",
      label: "Backup configuration available",
      status: snapshot.backupConfigured ? "PASS" : "WARNING",
      message: snapshot.backupConfigured
        ? "Backup configuration is present."
        : "Backup is not enabled; configuration still exists for administrators.",
      tested: true,
    },
  ];
}

export function hasBlockingErrors(findings: readonly OnboardingFinding[]): boolean {
  return findings.some((finding) => finding.severity === "ERROR");
}

export function unacceptedWarnings(
  findings: readonly OnboardingFinding[],
  acceptedWarningKeys: readonly string[],
): OnboardingFinding[] {
  return findings.filter(
    (finding) => finding.severity === "WARNING" && !acceptedWarningKeys.includes(finding.key),
  );
}

function pass(key: string, area: string, message: string): OnboardingFinding {
  return { key, area, severity: "PASS", message };
}

function warn(key: string, area: string, message: string): OnboardingFinding {
  return { key, area, severity: "WARNING", message };
}

function error(key: string, area: string, message: string): OnboardingFinding {
  return { key, area, severity: "ERROR", message };
}

function checked(key: string, label: string, ok: boolean, message: string): ReadinessItem {
  return { key, label, status: ok ? "PASS" : "FAIL", message, tested: true };
}

function testedHardware(
  key: string,
  label: string,
  tested: boolean,
  ok: boolean,
  passMessage: string,
  failMessage: string,
  notTestedMessage: string,
): ReadinessItem {
  if (!tested) {
    return { key, label, status: "NOT_TESTED", message: notTestedMessage, tested: false };
  }
  if (ok) {
    return { key, label, status: "PASS", message: passMessage, tested: true };
  }
  return {
    key,
    label,
    status: failMessage.includes("offline") ? "WARNING" : "FAIL",
    message: failMessage,
    tested: true,
  };
}
