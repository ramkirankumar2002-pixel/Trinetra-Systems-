import { corsProductionIssue, jwtExpiresIssue, jwtSecretIssue, parseCorsOrigins } from "./security.js";

export type CheckSeverity = "OK" | "WARNING" | "ERROR";

export type ConfigCheck = {
  code: string;
  severity: CheckSeverity;
  message: string;
};

export type ReleaseConfigInput = {
  nodeEnv: string;
  databaseUrl: string | undefined;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigin: string;
  integrationEncryptionKey: string;
  documentStorageDir: string;
  backupEnabled: boolean;
  trustProxy: boolean;
  simulateDatabaseUnavailable: boolean;
  simulateEdgeOffline: boolean;
  simulateSyncFailure: boolean;
  simulateProviderUnavailable: boolean;
};

export function isProductionNodeEnv(nodeEnv: string): boolean {
  return nodeEnv.trim().toLowerCase() === "production";
}

export function validateReleaseConfig(input: ReleaseConfigInput): ConfigCheck[] {
  const production = isProductionNodeEnv(input.nodeEnv);
  const checks: ConfigCheck[] = [];

  checks.push(
    check(
      "NODE_ENV",
      production ? "OK" : "WARNING",
      production
        ? "NODE_ENV is production"
        : `NODE_ENV is '${input.nodeEnv || "development"}' (not production)`,
    ),
  );

  const jwtIssue = jwtSecretIssue(input.jwtSecret, production);
  checks.push(
    jwtIssue
      ? check("JWT_SECRET", "ERROR", jwtIssue)
      : check("JWT_SECRET", "OK", production ? "JWT_SECRET is set and meets production length rules" : "JWT_SECRET is set"),
  );

  const expiresIssue = jwtExpiresIssue(input.jwtExpiresIn, production);
  checks.push(
    expiresIssue
      ? check("JWT_EXPIRES_IN", "ERROR", expiresIssue)
      : check("JWT_EXPIRES_IN", "OK", "JWT_EXPIRES_IN is a valid duration"),
  );

  const origins = parseCorsOrigins(input.corsOrigin);
  const corsIssue = corsProductionIssue(origins, production);
  if (corsIssue) {
    checks.push(check("CORS_ORIGIN", "ERROR", corsIssue));
  } else {
    checks.push(check("CORS_ORIGIN", "OK", `CORS_ORIGIN has ${origins.length} allowed origin(s)`));
    if (production && origins.some((origin) => origin.startsWith("http://"))) {
      checks.push(
        check("CORS_ORIGIN_HTTPS", "WARNING", "CORS_ORIGIN includes an http:// origin; production browsers should use HTTPS"),
      );
    }
  }

  if (production && (!input.databaseUrl || input.databaseUrl.trim() === "")) {
    checks.push(check("DATABASE_URL", "ERROR", "DATABASE_URL is required in production"));
  } else if (!input.databaseUrl || input.databaseUrl.trim() === "") {
    checks.push(
      check("DATABASE_URL", "WARNING", "DATABASE_URL is empty; the API can start but login and migrations will fail"),
    );
  } else {
    checks.push(check("DATABASE_URL", "OK", "DATABASE_URL is set"));
  }

  if (input.integrationEncryptionKey.trim() === "") {
    checks.push(
      check(
        "INTEGRATION_ENCRYPTION_KEY",
        production ? "WARNING" : "OK",
        production
          ? "INTEGRATION_ENCRYPTION_KEY is empty; webhook secret encryption falls back to JWT_SECRET"
          : "INTEGRATION_ENCRYPTION_KEY is empty (JWT_SECRET fallback is acceptable in development)",
      ),
    );
  } else {
    checks.push(check("INTEGRATION_ENCRYPTION_KEY", "OK", "INTEGRATION_ENCRYPTION_KEY is set"));
  }

  checks.push(
    check(
      "DOCUMENT_STORAGE_DIR",
      input.documentStorageDir.trim() === "" ? "ERROR" : "OK",
      input.documentStorageDir.trim() === ""
        ? "DOCUMENT_STORAGE_DIR is empty"
        : "Document storage directory is configured (path omitted)",
    ),
  );

  if (production && !input.backupEnabled) {
    checks.push(
      check(
        "BACKUP_ENABLED",
        "WARNING",
        "Application pg_dump backup is disabled; operator-managed PostgreSQL backups are still required",
      ),
    );
  } else {
    checks.push(
      check(
        "BACKUP_ENABLED",
        "OK",
        input.backupEnabled ? "Application backup scheduler is enabled" : "Application backup scheduler is disabled",
      ),
    );
  }

  if (production && !input.trustProxy) {
    checks.push(
      check(
        "TRUST_PROXY",
        "WARNING",
        "TRUST_PROXY is false; set true only when a trusted reverse proxy terminates TLS and forwards client IPs",
      ),
    );
  } else {
    checks.push(check("TRUST_PROXY", "OK", input.trustProxy ? "TRUST_PROXY is enabled" : "TRUST_PROXY is disabled"));
  }

  const simulationOn =
    input.simulateDatabaseUnavailable ||
    input.simulateEdgeOffline ||
    input.simulateSyncFailure ||
    input.simulateProviderUnavailable;
  if (production && simulationOn) {
    checks.push(
      check(
        "SIMULATION_FLAGS",
        "OK",
        "SIMULATE_* flags are set but are ignored when NODE_ENV=production",
      ),
    );
  } else if (simulationOn) {
    checks.push(check("SIMULATION_FLAGS", "WARNING", "One or more SIMULATE_* flags are enabled (development only)"));
  } else {
    checks.push(check("SIMULATION_FLAGS", "OK", "SIMULATE_* flags are off"));
  }

  return checks;
}

export function validateReleaseConfigFromEnv(): ConfigCheck[] {
  return validateReleaseConfig({
    nodeEnv: process.env.NODE_ENV ?? "development",
    databaseUrl: process.env.DATABASE_URL,
    jwtSecret: process.env.JWT_SECRET ?? "",
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    integrationEncryptionKey: process.env.INTEGRATION_ENCRYPTION_KEY ?? "",
    documentStorageDir: process.env.DOCUMENT_STORAGE_DIR ?? "storage/documents",
    backupEnabled: readBoolean(process.env.BACKUP_ENABLED, false),
    trustProxy: readBoolean(process.env.TRUST_PROXY, false),
    simulateDatabaseUnavailable: readBoolean(process.env.SIMULATE_DATABASE_UNAVAILABLE, false),
    simulateEdgeOffline: readBoolean(process.env.SIMULATE_EDGE_OFFLINE, false),
    simulateSyncFailure: readBoolean(process.env.SIMULATE_SYNC_FAILURE, false),
    simulateProviderUnavailable: readBoolean(process.env.SIMULATE_PROVIDER_UNAVAILABLE, false),
  });
}

export function configCheckSummary(checks: ConfigCheck[]): {
  ok: number;
  warning: number;
  error: number;
} {
  return {
    ok: checks.filter((item) => item.severity === "OK").length,
    warning: checks.filter((item) => item.severity === "WARNING").length,
    error: checks.filter((item) => item.severity === "ERROR").length,
  };
}

export function formatConfigChecks(checks: ConfigCheck[]): string {
  return checks.map((item) => `${item.severity} ${item.code}: ${item.message}`).join("\n");
}

function check(code: string, severity: CheckSeverity, message: string): ConfigCheck {
  return { code, severity, message };
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}
