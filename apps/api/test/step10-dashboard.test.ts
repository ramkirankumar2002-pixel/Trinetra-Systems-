import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TransactionStatus } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import {
  classifyDashboardException,
  LIVE_TRANSACTION_STATUSES,
  resolveDashboardCapabilities,
} from "../src/domain/dashboardScope.js";
import { addCalendarDays, calendarDateInTimeZone, zonedDayBounds } from "../src/domain/siteDay.js";
import { HttpError } from "../src/lib/httpError.js";
import { requirePermission } from "../src/middleware/authorize.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import { parseDashboardFilters, parseDashboardPagination } from "../src/modules/dashboard/validators.js";

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user_1",
    fullName: "Office",
    email: "office@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo" },
    defaultDepartment: { id: "dep_office", code: "OFFICE", name: "Office" },
    defaultSite: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
    roles: [{ id: "role_office", code: "OFFICE_MANAGER", name: "Office Manager", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
    permissions: ["dashboard.read", "report.read", "audit.read", "transaction.read"],
    organizationId: "org",
    sessionId: "session_1",
    ...overrides,
  };
}

describe("dashboard date handling", () => {
  it("treats YYYY-MM-DD as a full Asia/Kolkata day instead of UTC midnight", () => {
    const bounds = zonedDayBounds("Asia/Kolkata", "2026-09-20");
    assert.equal(bounds.start.toISOString(), "2026-09-19T18:30:00.000Z");
    assert.equal(bounds.end.toISOString(), "2026-09-20T18:30:00.000Z");
    assert.equal(calendarDateInTimeZone(new Date("2026-09-20T02:00:00.000Z"), "Asia/Kolkata"), "2026-09-20");
    assert.equal(addCalendarDays("2026-09-20", 1), "2026-09-21");
  });

  it("parses report date filters in the site timezone", () => {
    const filters = parseDashboardFilters({ from: "2026-09-20", to: "2026-09-20", status: "COMPLETED" }, "Asia/Kolkata");
    assert.equal(filters.from?.toISOString(), "2026-09-19T18:30:00.000Z");
    assert.equal(filters.to?.toISOString(), "2026-09-20T18:29:59.999Z");
    assert.equal(filters.status, TransactionStatus.COMPLETED);
  });

  it("rejects an inverted date range", () => {
    assert.throws(
      () => parseDashboardFilters({ from: "2026-09-21", to: "2026-09-20" }, "Asia/Kolkata"),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
  });
});

describe("dashboard pagination and filters", () => {
  it("caps page size and requires positive integers", () => {
    const parsed = parseDashboardPagination({ page: "2", pageSize: "20" });
    assert.equal(parsed.page, 2);
    assert.equal(parsed.pageSize, 20);
    assert.equal(parsed.skip, 20);
    assert.throws(
      () => parseDashboardPagination({ pageSize: "200" }),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
  });

  it("rejects an unknown status", () => {
    assert.throws(
      () => parseDashboardFilters({ status: "FRAUD" }, "Asia/Kolkata"),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
  });
});

describe("dashboard authorization", () => {
  it("gives office managers reports and audit, and keeps weighbridge operational", () => {
    const office = resolveDashboardCapabilities(user());
    assert.equal(office.view, "management");
    assert.equal(office.reports, true);
    assert.equal(office.charts, true);
    assert.equal(office.pendingApprovals, true);

    const weighbridge = resolveDashboardCapabilities(
      user({
        roles: [{ id: "role_wb", code: "WEIGHBRIDGE_OPERATOR", name: "Weighbridge", site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" } }],
        permissions: ["dashboard.read", "transaction.read", "weighment.record"],
      }),
    );
    assert.equal(weighbridge.view, "weighbridge");
    assert.equal(weighbridge.reports, false);
    assert.equal(weighbridge.live, true);
    assert.equal(weighbridge.audit, false);
  });

  it("blocks report APIs when the user only has dashboard.read", () => {
    const middleware = requirePermission("report.read");
    const request = {
      auth: user({ permissions: ["dashboard.read", "transaction.read"] }),
    } as Request;
    let status: number | undefined;
    middleware(request, {} as Response, ((error: unknown) => {
      if (error instanceof HttpError) {
        status = error.status;
      }
    }) as NextFunction);
    assert.equal(status, 403);
  });
});

describe("dashboard exception classification", () => {
  it("keeps tare-over-gross as an operational weight exception", () => {
    const classified = classifyDashboardException({
      status: TransactionStatus.EXCEPTION,
      exceptionReason: "Tare weight is greater than gross weight",
      holdReason: null,
      hasRejectedDocument: false,
      rejectedDocumentType: null,
      missingRequiredDocument: false,
      approvedWithoutUnloadingPoint: false,
      tareExceedsGross: true,
    });
    assert.equal(classified.type, "TARE_EXCEEDS_GROSS");
    assert.match(classified.message, /Tare weight/);
  });

  it("classifies rejected approvals separately from document issues", () => {
    const rejected = classifyDashboardException({
      status: TransactionStatus.REJECTED,
      exceptionReason: "Invoice does not match",
      holdReason: null,
      hasRejectedDocument: false,
      rejectedDocumentType: null,
      missingRequiredDocument: false,
      approvedWithoutUnloadingPoint: false,
      tareExceedsGross: false,
    });
    assert.equal(rejected.type, "APPROVAL_REJECTED");
  });
});

describe("live transaction set", () => {
  it("excludes completed, cancelled, rejected, and exception jobs from live monitoring", () => {
    assert.equal(LIVE_TRANSACTION_STATUSES.includes(TransactionStatus.APPROVED), true);
    assert.equal(LIVE_TRANSACTION_STATUSES.includes(TransactionStatus.UNLOADING), true);
    assert.equal(LIVE_TRANSACTION_STATUSES.includes(TransactionStatus.COMPLETED), false);
    assert.equal(LIVE_TRANSACTION_STATUSES.includes(TransactionStatus.EXCEPTION), false);
    assert.equal(LIVE_TRANSACTION_STATUSES.includes(TransactionStatus.REJECTED), false);
  });
});
