import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: path.resolve(process.cwd(), ".env") });
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

function readNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid number environment value: ${value}`);
  }
  return parsed;
}

export const edgeEnv = {
  gatewayId: process.env.EDGE_GATEWAY_ID?.trim() ?? "",
  gatewayCode: process.env.EDGE_GATEWAY_CODE?.trim() || "TRINETRA-EDGE-01",
  organizationId: process.env.EDGE_ORGANIZATION_ID?.trim() ?? "",
  siteId: process.env.EDGE_SITE_ID?.trim() ?? "",
  backendUrl: (process.env.EDGE_BACKEND_URL ?? "http://localhost:4000").replace(/\/$/, ""),
  gatewayToken: process.env.EDGE_GATEWAY_TOKEN?.trim() ?? "",
  dataDir: path.resolve(process.env.EDGE_DATA_DIR?.trim() || path.join(process.cwd(), "data")),
  logLevel: (process.env.EDGE_LOG_LEVEL ?? "info").toLowerCase(),
  heartbeatIntervalMs: readNumber(process.env.EDGE_HEARTBEAT_INTERVAL_MS, 10_000),
  syncIntervalMs: readNumber(process.env.EDGE_SYNC_INTERVAL_MS, 3_000),
  simulator: process.env.EDGE_SIMULATOR !== "false",
  controlPort: readNumber(process.env.EDGE_CONTROL_PORT, 4100),
  softwareVersion: process.env.EDGE_SOFTWARE_VERSION ?? "1.0.0",
  buildEnvironment: process.env.EDGE_BUILD_ENV ?? process.env.NODE_ENV ?? "development",
  maxRetries: readNumber(process.env.EDGE_MAX_RETRIES, 8),
  syncBatchSize: readNumber(process.env.EDGE_SYNC_BATCH_SIZE, 20),
  retryBaseMs: readNumber(process.env.EDGE_RETRY_BASE_MS, 1000),
  retryMaxMs: readNumber(process.env.EDGE_RETRY_MAX_MS, 60_000),
  failThreshold: readNumber(process.env.EDGE_CONNECTIVITY_FAIL_THRESHOLD, 3),
  recoverThreshold: readNumber(process.env.EDGE_CONNECTIVITY_RECOVER_THRESHOLD, 2),
  storageLimitBytes: readNumber(process.env.EDGE_STORAGE_LIMIT_BYTES, 524_288_000),
};

export function edgeCredentialIssue(token: string, buildEnvironment: string): string | null {
  if (token === "") {
    return "EDGE_GATEWAY_TOKEN is required";
  }
  if (!token.startsWith("tgw_")) {
    return "EDGE_GATEWAY_TOKEN must be a gateway credential, not a user password";
  }
  if (buildEnvironment === "production" && token.includes("devonly")) {
    return "Development Edge Gateway credential cannot be used in production";
  }
  return null;
}

export function assertEdgeConfig(): void {
  const issue = edgeCredentialIssue(edgeEnv.gatewayToken, edgeEnv.buildEnvironment);
  if (issue) {
    throw new Error(issue);
  }
}
