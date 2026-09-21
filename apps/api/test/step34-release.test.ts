import "dotenv/config";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { TransactionStatus } from "@prisma/client";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import {
  configCheckSummary,
  formatConfigChecks,
  validateReleaseConfig,
  type ReleaseConfigInput,
} from "../src/config/productionValidator.js";
import { demoSeedBlockedReason } from "../src/config/seedGuard.js";
import { APP_RELEASE_LABEL, APP_VERSION, publicVersionPayload } from "../src/config/version.js";
import { calculateNetWeight } from "../src/domain/netWeight.js";
import { assertTransactionMutable } from "../src/domain/transactionMutability.js";
import { canTransition } from "../src/domain/transactionState.js";

const productionBase: ReleaseConfigInput = {
  nodeEnv: "production",
  databaseUrl: "postgresql://USER:PASSWORD@localhost:5432/trinetra",
  jwtSecret: "a".repeat(32),
  jwtExpiresIn: "8h",
  corsOrigin: "https://app.example.com",
  integrationEncryptionKey: "b".repeat(32),
  documentStorageDir: "storage/documents",
  backupEnabled: true,
  trustProxy: true,
  simulateDatabaseUnavailable: false,
  simulateEdgeOffline: false,
  simulateSyncFailure: false,
  simulateProviderUnavailable: false,
};

async function withApp(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createServer(createApp());
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

describe("step 34 version", () => {
  it("exposes product version without secrets", async () => {
    const payload = publicVersionPayload();
    assert.equal(payload.product, "Trinetra Systems");
    assert.equal(payload.version, APP_VERSION);
    assert.equal(payload.release, APP_RELEASE_LABEL);
    assert.equal(payload.api, "v1");

    await withApp(async (baseUrl) => {
      const health = await fetch(`${baseUrl}/health`);
      const healthBody = (await health.json()) as Record<string, unknown>;
      assert.equal(health.status, 200);
      assert.equal(healthBody.version, "1.0.0");
      assert.equal(healthBody.release, "V1.0");
      const healthText = JSON.stringify(healthBody);
      assert.equal(healthText.includes("PASSWORD"), false);
      assert.equal(healthText.toLowerCase().includes("postgresql://"), false);

      const system = await fetch(`${baseUrl}/api/v1/system`);
      const systemBody = (await system.json()) as { version?: string; api?: string };
      assert.equal(system.status, 200);
      assert.equal(systemBody.version, "1.0.0");
      assert.equal(systemBody.api, "v1");
    });
  });
});

describe("step 34 production configuration validator", () => {
  it("returns OK for a complete production configuration", () => {
    const checks = validateReleaseConfig(productionBase);
    const summary = configCheckSummary(checks);
    assert.equal(summary.error, 0);
    assert.equal(checks.some((item) => item.severity === "ERROR"), false);
    assert.equal(formatConfigChecks(checks).includes(productionBase.jwtSecret), false);
    assert.equal(formatConfigChecks(checks).includes("PASSWORD"), false);
  });

  it("reports ERROR for missing production database, JWT, and wildcard CORS", () => {
    const checks = validateReleaseConfig({
      ...productionBase,
      databaseUrl: "",
      jwtSecret: "replace-with-a-long-random-string",
      corsOrigin: "*",
    });
    const codes = checks.filter((item) => item.severity === "ERROR").map((item) => item.code);
    assert.equal(codes.includes("DATABASE_URL"), true);
    assert.equal(codes.includes("JWT_SECRET"), true);
    assert.equal(codes.includes("CORS_ORIGIN"), true);
  });

  it("warns when production encryption key and backups are unset", () => {
    const checks = validateReleaseConfig({
      ...productionBase,
      integrationEncryptionKey: "",
      backupEnabled: false,
      trustProxy: false,
    });
    const warnings = checks.filter((item) => item.severity === "WARNING").map((item) => item.code);
    assert.equal(warnings.includes("INTEGRATION_ENCRYPTION_KEY"), true);
    assert.equal(warnings.includes("BACKUP_ENABLED"), true);
    assert.equal(warnings.includes("TRUST_PROXY"), true);
  });
});

describe("step 34 demo seed guard", () => {
  it("blocks demo seed in production unless explicitly allowed", () => {
    assert.ok(demoSeedBlockedReason({ nodeEnv: "production", allowDemoSeed: undefined }));
    assert.equal(demoSeedBlockedReason({ nodeEnv: "production", allowDemoSeed: "true" }), null);
    assert.equal(demoSeedBlockedReason({ nodeEnv: "development", allowDemoSeed: undefined }), null);
  });
});

describe("step 34 core integrity", () => {
  it("calculates net weight server-side and flags tare above gross", () => {
    const ok = calculateNetWeight("35000.000", "12500.000");
    assert.equal(ok.netAsDecimal, "22500.000");
    assert.equal(ok.tareExceedsGross, false);
    const invalid = calculateNetWeight("10000.000", "12000.000");
    assert.equal(invalid.tareExceedsGross, true);
  });

  it("blocks silent edits of completed transactions", () => {
    assert.equal(assertTransactionMutable(TransactionStatus.COMPLETED)?.includes("cannot be changed"), true);
    assert.equal(canTransition(TransactionStatus.COMPLETED, TransactionStatus.FIRST_WEIGHMENT), false);
  });
});

describe("step 34 local performance sanity", () => {
  it("serves /health quickly on localhost", async () => {
    await withApp(async (baseUrl) => {
      const samples: number[] = [];
      for (let index = 0; index < 20; index += 1) {
        const started = process.hrtime.bigint();
        const response = await fetch(`${baseUrl}/health`);
        assert.equal(response.status, 200);
        await response.arrayBuffer();
        samples.push(Number(process.hrtime.bigint() - started) / 1e6);
      }
      samples.sort((left, right) => left - right);
      const p95 = samples[Math.floor(samples.length * 0.95)] ?? samples[samples.length - 1];
      assert.ok(p95 !== undefined && p95 < 500, `localhost /health p95 was ${p95}ms`);
    });
  });
});
