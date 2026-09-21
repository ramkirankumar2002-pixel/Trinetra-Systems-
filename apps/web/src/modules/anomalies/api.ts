import { apiRequest } from "../../shared/api/client.ts";

export type PublicWeightAnomaly = {
  id: string;
  weighbridge: { id: string; code: string; name: string };
  site: { id: string; code: string; name: string };
  deviceId: string | null;
  transactionId: string | null;
  transactionReference: string | null;
  type: string;
  status: string;
  severity: string;
  ruleId: string;
  ruleVersion: string;
  title: string;
  description: string;
  explanation: string;
  observedWeightKg: string | null;
  previousWeightKg: string | null;
  expectedMinKg: string | null;
  expectedMaxKg: string | null;
  platformState: string;
  detectionSource: string;
  firstDetectedAt: string;
  lastDetectedAt: string;
  occurrenceCount: number;
  durationMs: number | null;
  minObservedKg: string | null;
  maxObservedKg: string | null;
  averageObservedKg: string | null;
  recoveredAt: string | null;
  recoveredDurationMs: number | null;
  suppressedDueToMaintenance: boolean;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  reviewReason: string | null;
};

export type PublicAnomalyObservation = {
  id: string;
  recordedAt: string;
  kind: string;
  weightKg: string | null;
  quality: string | null;
  platformState: string | null;
  note: string | null;
};

export type PublicAnomalyConfig = {
  weighbridgeId: string;
  emptyPlatformThresholdKg: string;
  maxChangePerSecondKg: string;
  weightJumpThresholdKg: string;
  maxInstabilityDurationMs: number;
  minAnomalyDurationMs: number;
  consecutiveAnomalyCount: number;
  cooldownMs: number;
  suddenChangeWindowMs: number;
  suppressAlertsInMaintenance: boolean;
  defaultsLabel: string;
  updatedAt: string;
};

export type PublicWeightHealth = {
  weighbridgeId: string;
  weighbridgeCode: string;
  currentWeightKg: string | null;
  quality: string | null;
  platformState: string;
  healthStatus: "NORMAL" | "ANOMALY" | "MAINTENANCE";
  lastValidWeightKg: string | null;
  lastNormalWeightKg: string | null;
  lastAnomaly: PublicWeightAnomaly | null;
  openAnomalyCount: number;
  deviceStatus: string | null;
  lastReadingAt: string | null;
};

export type AnomalyList = {
  items: PublicWeightAnomaly[];
  page: number;
  pageSize: number;
  total: number;
};

export function listAnomalies(search: URLSearchParams): Promise<AnomalyList> {
  return apiRequest<AnomalyList>(`/api/v1/anomalies?${search.toString()}`);
}

export function getAnomaly(id: string): Promise<{ event: PublicWeightAnomaly; timeline: PublicAnomalyObservation[] }> {
  return apiRequest<{ event: PublicWeightAnomaly; timeline: PublicAnomalyObservation[] }>(`/api/v1/anomalies/${id}`);
}

export function acknowledgeAnomaly(id: string, reason?: string): Promise<{ event: PublicWeightAnomaly }> {
  return apiRequest<{ event: PublicWeightAnomaly }>(`/api/v1/anomalies/${id}/acknowledge`, {
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export function resolveAnomaly(id: string, reason?: string): Promise<{ event: PublicWeightAnomaly }> {
  return apiRequest<{ event: PublicWeightAnomaly }>(`/api/v1/anomalies/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export function markFalsePositive(id: string, reason: string): Promise<{ event: PublicWeightAnomaly }> {
  return apiRequest<{ event: PublicWeightAnomaly }>(`/api/v1/anomalies/${id}/false-positive`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function getWeightHealth(weighbridgeId: string): Promise<{ health: PublicWeightHealth }> {
  return apiRequest<{ health: PublicWeightHealth }>(`/api/v1/weighbridges/${weighbridgeId}/weight-health`);
}

export function getAnomalyConfig(weighbridgeId: string): Promise<{ config: PublicAnomalyConfig }> {
  return apiRequest<{ config: PublicAnomalyConfig }>(`/api/v1/weighbridges/${weighbridgeId}/anomaly/config`);
}

export function updateAnomalyConfig(
  weighbridgeId: string,
  body: Record<string, string | number | boolean>,
): Promise<{ config: PublicAnomalyConfig }> {
  return apiRequest<{ config: PublicAnomalyConfig }>(`/api/v1/weighbridges/${weighbridgeId}/anomaly/config`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function runAnomalyScenario(weighbridgeId: string, scenario: string): Promise<{ scenario: string }> {
  return apiRequest<{ scenario: string }>(`/api/v1/weighbridges/${weighbridgeId}/anomaly/scenario`, {
    method: "POST",
    body: JSON.stringify({ scenario }),
  });
}

export function startMaintenance(weighbridgeId: string, reason: string): Promise<unknown> {
  return apiRequest(`/api/v1/weighbridges/${weighbridgeId}/maintenance/start`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function endMaintenance(weighbridgeId: string, notes?: string): Promise<unknown> {
  return apiRequest(`/api/v1/weighbridges/${weighbridgeId}/maintenance/end`, {
    method: "POST",
    body: JSON.stringify(notes ? { reason: notes } : {}),
  });
}

export function anomalyTypeLabel(type: string): string {
  return type.replaceAll("_", " ");
}
