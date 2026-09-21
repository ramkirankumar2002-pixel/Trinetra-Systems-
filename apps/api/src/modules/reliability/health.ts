import { env, simulationFlags } from "../../config/env.js";
import { APP_NAME, APP_VERSION } from "../../config/version.js";
import { prisma } from "../../db/client.js";
import { writeLog } from "../../lib/logger.js";
import {
  applySimulationOverride,
  classifyDependencyHealth,
  overallReadiness,
} from "../../domain/reliability/health.js";
import type { DependencyHealthStatus } from "../../domain/reliability/types.js";
import { deriveGatewayRuntimeStatus } from "../../domain/edgeGatewayStatus.js";
import { metrics } from "../../lib/metrics.js";
import { apiErrorRateExceeded } from "../../domain/observability/thresholds.js";

export type PublicDependencyHealth = {
  name: string;
  status: DependencyHealthStatus;
  detail: string;
  latencyMs?: number;
  simulated?: boolean;
};

export async function probePostgres(): Promise<{ status: DependencyHealthStatus; latencyMs: number | null }> {
  const flags = simulationFlags();
  if (flags.databaseUnavailable) {
    return { status: "UNAVAILABLE", latencyMs: null };
  }
  const started = process.hrtime.bigint();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Number(process.hrtime.bigint() - started) / 1e6;
    if (latencyMs >= env.monitoringDbLatencyWarnMs) {
      writeLog("warn", "database_probe_slow", {
        durationMs: Math.round(latencyMs),
        errorCategory: "DATABASE_ERROR",
      });
    }
    return { status: "AVAILABLE", latencyMs };
  } catch {
    return { status: "UNAVAILABLE", latencyMs: null };
  }
}

export async function collectDependencyHealth(): Promise<PublicDependencyHealth[]> {
  const flags = simulationFlags();
  const postgres = await probePostgres();

  let gatewayStatus: DependencyHealthStatus = "DISABLED";
  let syncStatus: DependencyHealthStatus = "DISABLED";
  if (postgres.status === "AVAILABLE") {
    const gateway = await prisma.edgeGateway.findFirst({
      where: { enabled: true, revokedAt: null },
      orderBy: { lastHeartbeatAt: "desc" },
    });
    if (!gateway) {
      gatewayStatus = "DISABLED";
      syncStatus = "DISABLED";
    } else {
      const runtime = deriveGatewayRuntimeStatus({
        enabled: gateway.enabled,
        revokedAt: gateway.revokedAt,
        lastHeartbeatAt: gateway.lastHeartbeatAt,
        nowMs: Date.now(),
        offlineTimeoutMs: env.gatewayOfflineTimeoutMs,
      });
      const reachable = runtime === "ONLINE" || runtime === "PENDING";
      gatewayStatus = classifyDependencyHealth({
        name: "edgeGateway",
        configured: true,
        reachable,
        degraded: runtime === "OFFLINE",
      });
      const snapshot = await prisma.edgeSyncSnapshot.findUnique({
        where: { gatewayId: gateway.id },
      });
      syncStatus = classifyDependencyHealth({
        name: "offlineSync",
        configured: true,
        reachable: snapshot?.connectivityState !== "OFFLINE",
        degraded: snapshot?.syncStatus === "ERROR" || (snapshot?.deadLetter ?? 0) > 0,
      });
    }
  }

  const anprHealth = classifyDependencyHealth({
    name: "anpr",
    configured: true,
    reachable: !flags.providerUnavailable,
    simulation: true,
  });
  const ocrHealth = classifyDependencyHealth({
    name: "ocr",
    configured: true,
    reachable: !flags.providerUnavailable,
    simulation: true,
  });

  const weighbridge = classifyDependencyHealth({
    name: "weighbridge",
    configured: true,
    reachable: !flags.providerUnavailable,
    simulation: true,
  });

  const voice = classifyDependencyHealth({
    name: "voice",
    configured: env.driverVoiceEnabled,
    reachable: env.driverVoiceEnabled,
    simulation: env.driverVoiceEnabled,
    disabled: !env.driverVoiceEnabled,
  });

  const apiWindow = metrics.windowErrorRate();
  const apiDegraded = apiErrorRateExceeded({
    requests: apiWindow.requests,
    errors: apiWindow.errors,
    minSampleSize: env.monitoringMinSampleSize,
    threshold: env.monitoringApiErrorRate,
  });
  const apiStatus = classifyDependencyHealth({
    name: "api",
    configured: true,
    reachable: true,
    degraded: apiDegraded,
  });

  const postgresDetail =
    postgres.status === "AVAILABLE"
      ? postgres.latencyMs === null
        ? "Query succeeded"
        : `Query succeeded (${Math.round(postgres.latencyMs)}ms)`
      : "Database is not reachable";

  return [
    {
      name: "postgresql",
      status: postgres.status,
      detail: postgresDetail,
      ...(postgres.latencyMs === null ? {} : { latencyMs: Math.round(postgres.latencyMs) }),
    },
    { name: "backend", status: "AVAILABLE", detail: "API process is running" },
    {
      name: "api",
      status: apiStatus,
      detail: apiDegraded
        ? `Recent error rate ${Math.round(apiWindow.rate * 100)}% exceeds the configured threshold`
        : "Request error rate is within the configured threshold",
    },
    {
      name: "edgeGateway",
      status: applySimulationOverride(gatewayStatus, flags.edgeOffline),
      detail: flags.edgeOffline ? "Simulation flag is active" : "Derived from latest heartbeat",
    },
    {
      name: "offlineSync",
      status: applySimulationOverride(syncStatus, flags.syncFailure),
      detail: flags.syncFailure ? "Simulation flag is active" : "Derived from the latest sync snapshot",
    },
    {
      name: "weighbridge",
      status: weighbridge,
      detail: "Simulator adapters are the default development path",
      simulated: true,
    },
    {
      name: "anpr",
      status: anprHealth,
      detail: "Uses the configured ANPR provider abstraction",
      simulated: true,
    },
    {
      name: "ocr",
      status: ocrHealth,
      detail: "Uses the configured OCR provider abstraction",
      simulated: true,
    },
    {
      name: "voice",
      status: voice,
      detail: env.driverVoiceEnabled ? "Local simulated speech providers" : "Voice prompts are disabled",
      simulated: env.driverVoiceEnabled,
    },
    { name: "notifications", status: postgres.status === "AVAILABLE" ? "AVAILABLE" : "UNAVAILABLE", detail: "In-process emit against PostgreSQL" },
  ];
}

export async function readinessPayload(): Promise<{
  status: "ready" | "degraded" | "unavailable";
  checks: Record<string, DependencyHealthStatus>;
}> {
  const dependencies = await collectDependencyHealth();
  const checks = Object.fromEntries(dependencies.map((item) => [item.name, item.status]));
  const required = { postgresql: checks.postgresql ?? "UNAVAILABLE" };
  return {
    status: overallReadiness(required),
    checks: required,
  };
}

export function livenessPayload(): { status: "ok"; service: string; product: string; version: string } {
  return { status: "ok", service: "trinetra-api", product: APP_NAME, version: APP_VERSION };
}
