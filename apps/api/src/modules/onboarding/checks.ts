import { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { deriveGatewayRuntimeStatus } from "../../domain/edgeGatewayStatus.js";
import { GATEWAY_NOT_CONNECTED_MESSAGE } from "../../domain/onboarding/catalog.js";
import { PROTOCOL_INFORMATION_REQUIRED_MESSAGE } from "../../domain/protocolReadiness.js";
import {
  buildPilotReadiness,
  buildValidationFindings,
  hasBlockingErrors,
  type OnboardingFinding,
  type ReadinessItem,
} from "../../domain/onboarding/validation.js";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { canAccessSite } from "../../middleware/authorize.js";
import { testCameraConnection } from "../cameras/service.js";
import { testDeviceCommunication } from "../edge/service.js";
import { testHardwareConnection } from "../hardware/service.js";
import type { ActorContext } from "../shared/actor.js";
import { loadValidationSnapshot, parseSessionSettings, readHardwareCheck } from "./snapshot.js";

export type ValidationResult = {
  findings: OnboardingFinding[];
  errorCount: number;
  warningCount: number;
  canComplete: boolean;
};

export type HardwareCheckResult = {
  weight: { ok: boolean; tested: boolean; message: string; reading: string | null; stability: string | null };
  anpr: { ok: boolean; tested: boolean; message: string };
  scanner: { ok: boolean; tested: boolean; message: string };
  gateway: { ok: boolean; message: string; status: string | null };
  protocolInformationRequired: boolean;
  weightTested: boolean;
  weightOk: boolean;
  anprTested: boolean;
  anprOk: boolean;
  scannerTested: boolean;
  scannerOk: boolean;
};

export async function runValidation(
  actor: ActorContext,
  session: {
    organizationId: string;
    siteId: string | null;
    settings: unknown;
    lastHardwareCheck: unknown;
  },
): Promise<ValidationResult> {
  const snapshot = await loadValidationSnapshot(actor, {
    organizationId: session.organizationId,
    siteId: session.siteId,
    settings: parseSessionSettings(session.settings),
    hardwareCheck: session.lastHardwareCheck,
  });
  const findings = buildValidationFindings(snapshot);
  return {
    findings,
    errorCount: findings.filter((finding) => finding.severity === "ERROR").length,
    warningCount: findings.filter((finding) => finding.severity === "WARNING").length,
    canComplete: !hasBlockingErrors(findings),
  };
}

export async function runReadiness(
  actor: ActorContext,
  session: {
    organizationId: string;
    siteId: string | null;
    settings: unknown;
    lastHardwareCheck: unknown;
  },
): Promise<{ items: ReadinessItem[] }> {
  const snapshot = await loadValidationSnapshot(actor, {
    organizationId: session.organizationId,
    siteId: session.siteId,
    settings: parseSessionSettings(session.settings),
    hardwareCheck: session.lastHardwareCheck,
  });
  return { items: buildPilotReadiness(snapshot) };
}

export async function runHardwareChecks(
  actor: ActorContext,
  siteId: string | null,
): Promise<HardwareCheckResult> {
  if (!siteId) {
    throw new HttpError(400, "A site is required before hardware checks");
  }
  if (!canAccessSite(actor.user, siteId)) {
    throw new HttpError(403, "You do not have access to this site");
  }

  const [weighbridge, gateway, devices, cameras] = await Promise.all([
    prisma.weighbridge.findFirst({
      where: { organizationId: actor.user.organizationId, siteId },
      orderBy: { code: "asc" },
    }),
    prisma.edgeGateway.findFirst({
      where: { organizationId: actor.user.organizationId, siteId },
      orderBy: { code: "asc" },
    }),
    prisma.edgeDevice.findMany({
      where: { organizationId: actor.user.organizationId, siteId },
    }),
    prisma.camera.findMany({
      where: { organizationId: actor.user.organizationId, siteId },
    }),
  ]);

  const gatewayStatus = gateway
    ? deriveGatewayRuntimeStatus({
        enabled: gateway.enabled,
        revokedAt: gateway.revokedAt,
        lastHeartbeatAt: gateway.lastHeartbeatAt,
        nowMs: Date.now(),
        offlineTimeoutMs: env.gatewayOfflineTimeoutMs,
      })
    : null;

  let weight: HardwareCheckResult["weight"] = {
    ok: false,
    tested: false,
    message: "Weight indicator has not been tested.",
    reading: null,
    stability: null,
  };
  if (weighbridge) {
    const result = await testHardwareConnection(actor, weighbridge.id);
    weight = {
      ok: result.ok,
      tested: true,
      message: result.message,
      reading: result.reading?.weightKg ?? null,
      stability: result.reading?.quality ?? null,
    };
  }

  let anpr: HardwareCheckResult["anpr"] = {
    ok: false,
    tested: false,
    message: "ANPR has not been tested.",
  };
  const camera = cameras[0];
  if (camera) {
    const result = await testCameraConnection(actor, camera.id);
    anpr = { ok: result.ok, tested: true, message: result.message };
  }

  let scanner: HardwareCheckResult["scanner"] = {
    ok: false,
    tested: false,
    message: "Scanner has not been tested.",
  };
  const scannerDevice = devices.find(
    (device) => device.deviceType === "SCANNER" || device.deviceType === "BARCODE_SCANNER",
  );
  if (gateway && scannerDevice) {
    const result = await testDeviceCommunication(actor, gateway.id, scannerDevice.id);
    scanner = { ok: result.ok, tested: true, message: result.message };
  }

  return {
    weight,
    anpr,
    scanner,
    gateway: {
      ok: gatewayStatus === "ONLINE",
      message: gatewayStatus === "ONLINE" ? "Gateway is connected." : GATEWAY_NOT_CONNECTED_MESSAGE,
      status: gatewayStatus,
    },
    protocolInformationRequired: devices.some((device) => device.protocolReadiness === "PROTOCOL_DETAILS_REQUIRED"),
    weightTested: weight.tested,
    weightOk: weight.ok,
    anprTested: anpr.tested,
    anprOk: anpr.ok,
    scannerTested: scanner.tested,
    scannerOk: scanner.ok,
  };
}

export function hardwareCheckMessage(check: HardwareCheckResult): string {
  if (check.protocolInformationRequired) {
    return PROTOCOL_INFORMATION_REQUIRED_MESSAGE;
  }
  if (!check.gateway.ok) {
    return GATEWAY_NOT_CONNECTED_MESSAGE;
  }
  return "Hardware checks recorded. No production transaction was created.";
}

export function previousHardwareFromCheck(check: HardwareCheckResult): Prisma.InputJsonValue {
  return {
    weightTested: check.weightTested,
    weightOk: check.weightOk,
    anprTested: check.anprTested,
    anprOk: check.anprOk,
    scannerTested: check.scannerTested,
    scannerOk: check.scannerOk,
    gatewayStatus: check.gateway.status,
    weight: check.weight,
    anpr: check.anpr,
    scanner: check.scanner,
  };
}

export { readHardwareCheck };
