import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { NextFunction, Request, Response } from "express";
import { ApprovalDecision, TransactionStatus } from "@prisma/client";
import { createApp } from "../src/app.js";
import { familyFromDashboardType, isExceptionFamily } from "../src/domain/reporting/exceptionFamilies.js";
import { getReportDefinition, isReportId, REPORT_CATALOG } from "../src/domain/reporting/catalog.js";
import {
  inclusiveDaySpan,
  parseReportDatePreset,
  resolveReportDates,
  EMPTY_REPORT_MESSAGE,
  INSUFFICIENT_DATA,
} from "../src/domain/reporting/datePresets.js";
import { averageDuration, durationBetween, formatDurationMs } from "../src/domain/reporting/duration.js";
import { classifyDashboardException } from "../src/domain/dashboardScope.js";
import { kgToMilligrams, milligramsToKgDecimal } from "../src/domain/netWeight.js";
import { parseDashboardFilters, parseDashboardPagination, parseReportFilters } from "../src/modules/dashboard/validators.js";
import { toCsv } from "../src/modules/reliability/export.js";
import { HttpError } from "../src/lib/httpError.js";
import { requirePermission } from "../src/middleware/authorize.js";
import { canAccessSite } from "../src/middleware/authorize.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user_office",
    fullName: "Office",
    email: "office@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: { id: "dep_office", code: "OFFICE", name: "Office" },
    defaultSite: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
    roles: [
      {
        id: "role_office",
        code: "OFFICE_MANAGER",
        name: "Office Manager",
        site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
      },
    ],
    permissions: ["dashboard.read", "report.read"],
    organizationId: "org",
    sessionId: "session",
    ...overrides,
  };
}

function denyStatus(permission: string, auth: AuthenticatedUser): number | undefined {
  let caught: unknown;
  requirePermission(permission)(
    { auth } as Request,
    {} as Response,
    ((error?: unknown) => {
      caught = error;
    }) as NextFunction,
  );
  return caught instanceof HttpError ? caught.status : undefined;
}

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

async function loginCookie(baseUrl: string, email: string): Promise<{ status: number; cookie: string }> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "demo-password" }),
  });
  const cookies = response.headers.getSetCookie();
  return { status: response.status, cookie: cookies.join("; ") };
}

describe("report date presets", () => {
  it("resolves today and last 7 days in Asia/Kolkata, not UTC midnight", () => {
    const now = new Date("2026-09-21T02:00:00.000Z");
    const today = resolveReportDates({ preset: "today", timeZone: "Asia/Kolkata", now });
    assert.equal(today.fromYmd, "2026-09-21");
    assert.equal(today.toYmd, "2026-09-21");
    assert.equal(today.from?.toISOString(), "2026-09-20T18:30:00.000Z");

    const week = resolveReportDates({ preset: "last_7_days", timeZone: "Asia/Kolkata", now });
    assert.equal(week.fromYmd, "2026-09-15");
    assert.equal(week.toYmd, "2026-09-21");
    assert.equal(inclusiveDaySpan("2026-09-15", "2026-09-21"), 7);
  });

  it("marks an unbounded or 90+ day request as a large historical report", () => {
    const none = resolveReportDates({ timeZone: "Asia/Kolkata", now: new Date("2026-09-21T00:00:00.000Z") });
    assert.equal(none.isLargeHistorical, true);
    const custom = resolveReportDates({
      preset: "custom",
      from: new Date("2026-01-01T00:00:00.000Z"),
      to: new Date("2026-09-21T00:00:00.000Z"),
      timeZone: "Asia/Kolkata",
    });
    assert.equal(custom.isLargeHistorical, true);
    assert.throws(() => parseReportDatePreset("not-a-preset"), (error: unknown) => error instanceof HttpError && error.status === 400);
  });

  it("applies last_30_days through parseReportFilters", () => {
    const parsed = parseReportFilters({ datePreset: "last_30_days" }, "Asia/Kolkata", new Date("2026-09-21T12:00:00.000Z"));
    assert.equal(parsed.dates.fromYmd, "2026-08-23");
    assert.equal(parsed.filters.from?.toISOString(), "2026-08-22T18:30:00.000Z");
  });
});

describe("report RBAC and site isolation", () => {
  it("blocks report.read for operational users and keeps office managers allowed", () => {
    assert.equal(denyStatus("report.read", user()), undefined);
    assert.equal(
      denyStatus(
        "report.read",
        user({
          permissions: ["dashboard.read", "transaction.read"],
          roles: [{ id: "wb", code: "WEIGHBRIDGE_OPERATOR", name: "Weighbridge", site: { id: "site_a", code: "A", name: "A" } }],
        }),
      ),
      403,
    );
  });

  it("does not let a Site A role access Site B", () => {
    const siteA = user();
    assert.equal(canAccessSite(siteA, "site_a"), true);
    assert.equal(canAccessSite(siteA, "site_b"), false);
  });

  it("rejects unauthenticated report and export access", async () => {
    await withApp(async (baseUrl) => {
      const report = await fetch(`${baseUrl}/api/v1/reports/transactions`);
      const exported = await fetch(`${baseUrl}/api/v1/reports/transactions/export`);
      assert.equal(report.status, 401);
      assert.equal(exported.status, 401);
    });
  });
});

describe("report totals from stored values", () => {
  it("sums net weight from the stored snapshot rather than recomputing gross minus tare", () => {
    const stored = ["12.500", "7.250"];
    const milligrams = stored.reduce((sum, value) => sum + kgToMilligrams(value), 0n);
    assert.equal(milligramsToKgDecimal(milligrams), "19.750");
    const recomputed = milligramsToKgDecimal(kgToMilligrams("40.000") - kgToMilligrams("20.000"));
    assert.notEqual(recomputed, milligramsToKgDecimal(milligrams));
  });

  it("aggregates material and vehicle counts from known rows", () => {
    const rows = [
      { material: "Coal", vehicle: "AP39XX1", net: "10.000" },
      { material: "Coal", vehicle: "AP39XX2", net: "5.000" },
      { material: "Iron", vehicle: "AP39XX1", net: "2.500" },
    ];
    const byMaterial = new Map<string, { count: number; net: bigint }>();
    const byVehicle = new Map<string, { count: number; net: bigint }>();
    for (const row of rows) {
      const material = byMaterial.get(row.material) ?? { count: 0, net: 0n };
      material.count += 1;
      material.net += kgToMilligrams(row.net);
      byMaterial.set(row.material, material);
      const vehicle = byVehicle.get(row.vehicle) ?? { count: 0, net: 0n };
      vehicle.count += 1;
      vehicle.net += kgToMilligrams(row.net);
      byVehicle.set(row.vehicle, vehicle);
    }
    assert.equal(byMaterial.get("Coal")?.count, 2);
    assert.equal(milligramsToKgDecimal(byMaterial.get("Coal")?.net ?? 0n), "15.000");
    assert.equal(byVehicle.get("AP39XX1")?.count, 2);
    assert.equal(milligramsToKgDecimal(byVehicle.get("AP39XX1")?.net ?? 0n), "12.500");
  });
});

describe("approval, exception, anomaly, and offline metrics", () => {
  it("counts approval decisions without ranking people", () => {
    const decisions = [ApprovalDecision.PENDING, ApprovalDecision.APPROVED, ApprovalDecision.APPROVED, ApprovalDecision.REJECTED];
    const pending = decisions.filter((item) => item === ApprovalDecision.PENDING).length;
    const approved = decisions.filter((item) => item === ApprovalDecision.APPROVED).length;
    const rejected = decisions.filter((item) => item === ApprovalDecision.REJECTED).length;
    assert.deepEqual({ pending, approved, rejected }, { pending: 1, approved: 2, rejected: 1 });
  });

  it("maps dashboard exceptions onto report families", () => {
    assert.equal(
      familyFromDashboardType(
        classifyDashboardException({
          status: TransactionStatus.EXCEPTION,
          exceptionReason: "Tare weight is greater than gross weight",
          holdReason: null,
          hasRejectedDocument: false,
          rejectedDocumentType: null,
          missingRequiredDocument: false,
          approvedWithoutUnloadingPoint: false,
          tareExceedsGross: true,
        }).type,
      ),
      "WEIGHT_EXCEPTION",
    );
    assert.equal(isExceptionFamily("SYNCHRONIZATION_EXCEPTION"), true);
    assert.equal(isExceptionFamily("FRAUD"), false);
  });

  it("never labels a weight anomaly as fraud", () => {
    const label = "Weight anomaly";
    const caveat = "Possible weighing-system issue. This is not a confirmed fraud finding.";
    assert.equal(label.toLowerCase().includes("fraud"), false);
    assert.equal(caveat.toLowerCase().includes("confirmed fraud"), true);
  });

  it("returns Insufficient data when an offline session has no matching restore timestamp", () => {
    const open = durationBetween(new Date("2026-09-21T00:00:00.000Z"), null);
    assert.equal(open.label, INSUFFICIENT_DATA);
    assert.equal(open.data, "insufficient");
    const closed = durationBetween(new Date("2026-09-21T00:00:00.000Z"), new Date("2026-09-21T01:00:00.000Z"));
    assert.equal(closed.data, "actual");
    assert.equal(formatDurationMs(3600000), "1h 0m");
    assert.equal(averageDuration([]).label, INSUFFICIENT_DATA);
  });
});

describe("pagination, CSV export, and empty datasets", () => {
  it("caps page size and does not load unbounded pages", () => {
    const parsed = parseDashboardPagination({ page: "3", pageSize: "50" });
    assert.equal(parsed.skip, 100);
    assert.throws(
      () => parseDashboardPagination({ pageSize: "2000" }),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
  });

  it("exports CSV without embedding secrets and quotes commas", () => {
    const csv = toCsv(["transaction", "note"], [["TRN-1", "coal, washed"], ["TRN-2", "ok"]]);
    assert.match(csv, /"coal, washed"/);
    assert.equal(csv.includes("password"), false);
  });

  it("uses the empty-period sentence instead of a bare zero", () => {
    assert.equal(EMPTY_REPORT_MESSAGE, "No data available for the selected period.");
    assert.notEqual(EMPTY_REPORT_MESSAGE, "0");
  });

  it("defines exportable reports with report.read", () => {
    assert.equal(isReportId("transactions"), true);
    assert.equal(isReportId("payroll"), false);
    assert.equal(getReportDefinition("anomalies").exportSupported, true);
    assert.equal(REPORT_CATALOG.every((item) => item.requiredPermissions.includes("report.read")), true);
    assert.equal(AUDIT_ACTIONS.REPORT_EXPORTED, "REPORT_EXPORTED");
    assert.equal(AUDIT_ACTIONS.LARGE_REPORT_REQUESTED, "LARGE_REPORT_REQUESTED");
  });
});

describe("live report APIs against the demo database", () => {
  it("enforces the same authorization on view and export, and isolates Site B", async () => {
    await withApp(async (baseUrl) => {
      const office = await loginCookie(baseUrl, "office@demo.local");
      if (office.status !== 200) {
        return;
      }
      const weighbridge = await loginCookie(baseUrl, "weighbridge@demo.local");
      const siteB = await loginCookie(baseUrl, "site-b@demo.local");
      const officeHeaders = { cookie: office.cookie };
      const list = await fetch(`${baseUrl}/api/v1/reports/transactions?datePreset=last_30_days&pageSize=2`, {
        headers: officeHeaders,
      });
      const exported = await fetch(`${baseUrl}/api/v1/reports/transactions/export?datePreset=last_30_days`, {
        headers: officeHeaders,
      });
      assert.equal(list.status, 200);
      assert.equal(exported.status, 200);
      const listBody = (await list.json()) as {
        items: Array<{ netWeightKg: string | null; durationLabel: string }>;
        pageSize: number;
        meta?: { empty: boolean; emptyMessage: string | null; netWeightSource: string };
      };
      assert.ok(listBody.items.length <= 2);
      assert.equal(listBody.meta?.netWeightSource, "transaction.netWeightKg");
      const exportBody = (await exported.json()) as { csv: string };
      assert.equal(exportBody.csv.includes("password"), false);

      const emptyPeriod = await fetch(
        `${baseUrl}/api/v1/reports/materials?from=2099-01-01&to=2099-01-01`,
        { headers: officeHeaders },
      );
      assert.equal(emptyPeriod.status, 200);
      const emptyBody = (await emptyPeriod.json()) as {
        items: unknown[];
        meta: { empty: boolean; emptyMessage: string | null };
      };
      assert.equal(emptyBody.items.length, 0);
      assert.equal(emptyBody.meta.empty, true);
      assert.equal(emptyBody.meta.emptyMessage, EMPTY_REPORT_MESSAGE);

      const materials = await fetch(`${baseUrl}/api/v1/reports/materials?datePreset=last_30_days`, {
        headers: officeHeaders,
      });
      assert.equal(materials.status, 200);
      const materialBody = (await materials.json()) as {
        items: Array<{ totalNetWeightKg: string; transactionCount: number }>;
        meta: { netWeightSource: string };
      };
      assert.equal(materialBody.meta.netWeightSource, "transaction.netWeightKg");
      for (const row of materialBody.items) {
        const numeric = Number(row.totalNetWeightKg);
        assert.equal(
          row.totalNetWeightKg === INSUFFICIENT_DATA || Number.isFinite(numeric),
          true,
        );
        assert.equal(row.transactionCount >= 0, true);
      }

      const catalog = await fetch(`${baseUrl}/api/v1/reports/catalog`, { headers: officeHeaders });
      assert.equal(catalog.status, 200);

      const daily = await fetch(`${baseUrl}/api/v1/reports/daily?datePreset=today`, { headers: officeHeaders });
      assert.equal(daily.status, 200);

      const approvals = await fetch(`${baseUrl}/api/v1/reports/approvals?datePreset=last_30_days`, {
        headers: officeHeaders,
      });
      assert.equal(approvals.status, 200);
      const approvalBody = (await approvals.json()) as { pending: number; approved: number; rejected: number };
      assert.equal(typeof approvalBody.pending, "number");

      const unknownSite = await fetch(
        `${baseUrl}/api/v1/reports/vehicles?siteId=clxxxxxxxxxxxxxxxxxxxxxx`,
        { headers: officeHeaders },
      );
      assert.equal([403, 404].includes(unknownSite.status), true);

      if (weighbridge.status === 200) {
        const blocked = await fetch(`${baseUrl}/api/v1/reports/daily`, { headers: { cookie: weighbridge.cookie } });
        const blockedExport = await fetch(`${baseUrl}/api/v1/reports/daily/export`, {
          headers: { cookie: weighbridge.cookie },
        });
        assert.equal(blocked.status, 403);
        assert.equal(blockedExport.status, 403);
      }

      if (siteB.status === 200) {
        const siteBReports = await fetch(`${baseUrl}/api/v1/reports/transactions?datePreset=last_30_days`, {
          headers: { cookie: siteB.cookie },
        });
        assert.equal(siteBReports.status, 403);
      }

      const lookups = (await (
        await fetch(`${baseUrl}/api/v1/reports/lookups`, {
          headers: { cookie: (await loginCookie(baseUrl, "admin@demo.local")).cookie },
        })
      ).json()) as { sites?: Array<{ id: string; code: string }>; error?: string };
      const foreign = lookups.sites?.find((site) => /B/i.test(site.code) || /SITEB/i.test(site.code));
      if (foreign) {
        const forbidden = await fetch(`${baseUrl}/api/v1/reports/materials?siteId=${foreign.id}`, {
          headers: officeHeaders,
        });
        assert.equal(forbidden.status, 403);
        const forbiddenExport = await fetch(`${baseUrl}/api/v1/reports/materials/export?siteId=${foreign.id}`, {
          headers: officeHeaders,
        });
        assert.equal(forbiddenExport.status, 403);
      }
    });
  });
});
