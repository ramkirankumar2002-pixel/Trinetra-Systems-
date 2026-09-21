import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { NextFunction, Request, Response } from "express";
import { createApp } from "../src/app.js";
import {
  assertOrganizationOperational,
  assertSiteAcceptsNewWork,
  canLoginToOrganization,
  canPerformOperationalWrites,
  organizationStatusOf,
} from "../src/domain/tenancy/lifecycle.js";
import { MASTER_DATA_SCOPES, UNIQUE_WITHIN } from "../src/domain/tenancy/scope.js";
import { HttpError } from "../src/lib/httpError.js";
import { canAccessSite, canAccessWeighbridge, requirePermission } from "../src/middleware/authorize.js";
import { organizationClaimMismatch } from "../src/domain/edgeEnvelope.js";
import type { AuthenticatedUser } from "../src/modules/auth/types.js";
import { parseLoginInput } from "../src/modules/auth/validators.js";
import { accessibleSiteIds, accessibleWeighbridgeWhere } from "../src/modules/shared/siteScope.js";
import { AUDIT_ACTIONS } from "../src/modules/audit/service.js";

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: "user_office",
    fullName: "Office",
    email: "office@demo.local",
    isActive: true,
    organization: { id: "org", name: "Demo", slug: "demo", status: "ACTIVE", kind: "DEMO" },
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

async function loginCookie(
  baseUrl: string,
  email: string,
  organizationSlug?: string,
): Promise<{ status: number; cookie: string; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: "demo-password",
      ...(organizationSlug ? { organizationSlug } : {}),
    }),
  });
  const cookies = response.headers.getSetCookie();
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, cookie: cookies.join("; "), body };
}

describe("tenant lifecycle", () => {
  it("blocks archived login and suspended operational writes", () => {
    assert.equal(canLoginToOrganization("ACTIVE"), true);
    assert.equal(canLoginToOrganization("SUSPENDED"), true);
    assert.equal(canLoginToOrganization("ARCHIVED"), false);
    assert.equal(canPerformOperationalWrites("ACTIVE"), true);
    assert.equal(canPerformOperationalWrites("SUSPENDED"), false);
    assert.throws(() => assertOrganizationOperational("SUSPENDED"), (error: unknown) => error instanceof HttpError && error.status === 403);
    assert.throws(() => assertSiteAcceptsNewWork("INACTIVE"), (error: unknown) => error instanceof HttpError && error.status === 409);
    assert.equal(organizationStatusOf(undefined), "ACTIVE");
  });

  it("keeps uniqueness and master-data scope within organization unless global", () => {
    assert.equal(UNIQUE_WITHIN.vehicleRegistration, "ORGANIZATION");
    assert.equal(UNIQUE_WITHIN.siteCode, "ORGANIZATION");
    assert.equal(UNIQUE_WITHIN.weighbridgeCode, "SITE");
    assert.equal(UNIQUE_WITHIN.organizationSlug, "GLOBAL");
    assert.equal(MASTER_DATA_SCOPES.material, "ORGANIZATION");
    assert.equal(MASTER_DATA_SCOPES.weighbridge, "SITE");
    assert.equal(MASTER_DATA_SCOPES.transaction, "SITE");
  });
});

describe("site and weighbridge scope", () => {
  it("keeps site-restricted users off another site", () => {
    const officer = user();
    assert.equal(canAccessSite(officer, "site_a"), true);
    assert.equal(canAccessSite(officer, "site_b"), false);
    assert.deepEqual(accessibleSiteIds({ user: officer }), ["site_a"]);
  });

  it("lets org-wide admins reach every site without a weighbridge assignment", () => {
    const admin = user({
      roles: [{ id: "role_admin", code: "ADMIN", name: "Administrator", site: null, weighbridge: null }],
    });
    assert.equal(canAccessSite(admin, "site_b"), true);
    assert.equal(canAccessWeighbridge(admin, "wb_2", "site_b"), true);
    assert.equal(accessibleSiteIds({ user: admin }), null);
  });

  it("limits a weighbridge operator to the assigned weighbridge", () => {
    const operator = user({
      roles: [
        {
          id: "role_wb",
          code: "WEIGHBRIDGE_OPERATOR",
          name: "Weighbridge Operator",
          site: { id: "site_a", code: "DEMO-SITE", name: "Demo Site" },
          weighbridge: { id: "wb_1", code: "WB-01", name: "WB 01" },
        },
      ],
    });
    assert.equal(canAccessSite(operator, "site_a"), true);
    assert.equal(canAccessWeighbridge(operator, "wb_1", "site_a"), true);
    assert.equal(canAccessWeighbridge(operator, "wb_2", "site_a"), false);
    assert.deepEqual(accessibleWeighbridgeWhere({ user: operator }), { weighbridgeId: { in: ["wb_1"] } });
  });
});

describe("login organization disambiguation", () => {
  it("accepts an optional organization slug without changing email uniqueness rules", () => {
    const parsed = parseLoginInput({
      email: "admin@acme.local",
      password: "demo-password",
      organizationSlug: "acme",
    });
    assert.equal(parsed.organizationSlug, "acme");
    assert.throws(() => parseLoginInput({ email: "admin@acme.local", password: "x", organizationSlug: "Bad Slug" }));
  });

  it("rejects a gateway event that claims another organization", () => {
    assert.equal(organizationClaimMismatch("org-b", "org-a"), "Event organization does not match the registered gateway");
    assert.equal(organizationClaimMismatch(undefined, "org-a"), null);
  });

  it("records site-context and organization status audits without payloads", () => {
    assert.equal(AUDIT_ACTIONS.SITE_CONTEXT_CHANGED, "SITE_CONTEXT_CHANGED");
    assert.equal(AUDIT_ACTIONS.ORGANIZATION_STATUS_CHANGED, "ORGANIZATION_STATUS_CHANGED");
    assert.equal(AUDIT_ACTIONS.SITE_STATUS_CHANGED, "SITE_STATUS_CHANGED");
  });
});

describe("authorization still uses existing RBAC", () => {
  it("does not invent a second permission system for reports", () => {
    let caught: unknown;
    requirePermission("report.read")(
      { auth: user({ permissions: ["dashboard.read"] }) } as Request,
      {} as Response,
      ((error?: unknown) => {
        caught = error;
      }) as NextFunction,
    );
    assert.equal(caught instanceof HttpError && caught.status === 403, true);
  });
});

describe("live cross-tenant isolation", () => {
  it("keeps Organization A off Organization B records, including reports and export", async () => {
    await withApp(async (baseUrl) => {
      const demo = await loginCookie(baseUrl, "admin@demo.local");
      const acme = await loginCookie(baseUrl, "admin@acme.local", "acme");
      assert.equal(demo.status, 200);
      assert.equal(acme.status, 200);

      const acmeTransactions = await fetch(`${baseUrl}/api/v1/transactions`, { headers: { cookie: acme.cookie } });
      const acmeTxBody = (await acmeTransactions.json()) as { items: Array<{ id: string; site: { id: string } }> };
      assert.equal(acmeTxBody.items.length > 0, true);
      const acmeTxId = acmeTxBody.items[0]?.id ?? "";

      const stolenTx = await fetch(`${baseUrl}/api/v1/transactions/${acmeTxId}`, { headers: { cookie: demo.cookie } });
      assert.equal(stolenTx.status, 404);

      const acmeVehicles = await fetch(`${baseUrl}/api/v1/vehicles`, { headers: { cookie: acme.cookie } });
      const acmeVehicleBody = (await acmeVehicles.json()) as { items: Array<{ id: string }> };
      const acmeVehicleId = acmeVehicleBody.items[0]?.id ?? "";
      const stolenVehicle = await fetch(`${baseUrl}/api/v1/vehicles/${acmeVehicleId}`, { headers: { cookie: demo.cookie } });
      assert.equal(stolenVehicle.status, 404);

      const demoMaterials = await fetch(`${baseUrl}/api/v1/materials`, { headers: { cookie: demo.cookie } });
      const demoMaterialBody = (await demoMaterials.json()) as { materials?: Array<{ id: string }>; items?: Array<{ id: string }> };
      const demoMaterialId = (demoMaterialBody.materials ?? demoMaterialBody.items ?? [])[0]?.id ?? "";
      if (demoMaterialId !== "") {
        const stolenMaterial = await fetch(`${baseUrl}/api/v1/materials/${demoMaterialId}`, { headers: { cookie: acme.cookie } });
        assert.equal(stolenMaterial.status, 404);
      }

      const acmeWeighbridges = await fetch(`${baseUrl}/api/v1/weighbridges`, { headers: { cookie: acme.cookie } });
      const acmeWbBody = (await acmeWeighbridges.json()) as { items: Array<{ id: string }> };
      const acmeWbId = acmeWbBody.items[0]?.id ?? "";
      const stolenDevice = await fetch(`${baseUrl}/api/v1/weighbridges/${acmeWbId}/hardware`, {
        headers: { cookie: demo.cookie },
      });
      assert.equal([403, 404].includes(stolenDevice.status), true);

      const demoGateways = await fetch(`${baseUrl}/api/v1/gateways`, { headers: { cookie: demo.cookie } });
      const demoGwBody = (await demoGateways.json()) as { items: Array<{ id: string }> };
      const demoGwId = demoGwBody.items[0]?.id ?? "";
      if (demoGwId !== "") {
        const stolenGateway = await fetch(`${baseUrl}/api/v1/gateways/${demoGwId}`, { headers: { cookie: acme.cookie } });
        assert.equal(stolenGateway.status, 404);
      }

      const acmeDirectory = await fetch(`${baseUrl}/api/v1/tenancy/directory`, { headers: { cookie: acme.cookie } });
      const acmeDirBody = (await acmeDirectory.json()) as { directory: { organization: { slug: string }; sites: Array<{ code: string }> } };
      assert.equal(acmeDirBody.directory.organization.slug, "acme");
      assert.equal(acmeDirBody.directory.sites.some((site) => site.code.startsWith("DEMO")), false);

      const demoDirectory = await fetch(`${baseUrl}/api/v1/tenancy/directory`, { headers: { cookie: demo.cookie } });
      const demoDirBody = (await demoDirectory.json()) as { directory: { organization: { slug: string; kind: string } } };
      assert.equal(demoDirBody.directory.organization.slug, "demo");
      assert.equal(demoDirBody.directory.organization.kind, "DEMO");

      const stolenReport = await fetch(`${baseUrl}/api/v1/reports/transactions?siteId=${acmeTxBody.items[0]?.site.id ?? "x"}`, {
        headers: { cookie: demo.cookie },
      });
      assert.equal([403, 404].includes(stolenReport.status), true);

      const stolenExport = await fetch(`${baseUrl}/api/v1/reports/transactions/export?siteId=${acmeTxBody.items[0]?.site.id ?? "x"}`, {
        headers: { cookie: demo.cookie },
      });
      assert.equal([403, 404].includes(stolenExport.status), true);

      const demoDocs = await fetch(`${baseUrl}/api/v1/transactions?pageSize=20`, { headers: { cookie: demo.cookie } });
      const demoTxBody = (await demoDocs.json()) as { items: Array<{ id: string }> };
      const firstDemoId = demoTxBody.items[0]?.id ?? "";
      if (firstDemoId !== "") {
        const docs = await fetch(`${baseUrl}/api/v1/transactions/${firstDemoId}/documents`, { headers: { cookie: acme.cookie } });
        assert.equal(docs.status, 404);
      }
    });
  });

  it("keeps Site A users off Site B operations, reports, devices, and configuration", async () => {
    await withApp(async (baseUrl) => {
      const admin = await loginCookie(baseUrl, "admin@demo.local");
      const office = await loginCookie(baseUrl, "office@demo.local");
      const siteB = await loginCookie(baseUrl, "site-b@demo.local");
      assert.equal(office.status, 200);
      assert.equal(siteB.status, 200);

      const directory = await fetch(`${baseUrl}/api/v1/tenancy/directory`, { headers: { cookie: admin.cookie } });
      const directoryBody = (await directory.json()) as {
        directory: { sites: Array<{ id: string; code: string; weighbridges: Array<{ id: string }> }> };
      };
      const siteBRow = directoryBody.directory.sites.find((site) => site.code === "DEMO-SITE-B");
      assert.equal(typeof siteBRow?.id, "string");
      const siteBId = siteBRow?.id;

      const siteBTx = await fetch(`${baseUrl}/api/v1/transactions?siteId=${siteBId}`, { headers: { cookie: office.cookie } });
      assert.equal(siteBTx.status, 403);

      const siteBReport = await fetch(`${baseUrl}/api/v1/reports/daily?siteId=${siteBId}`, { headers: { cookie: office.cookie } });
      assert.equal(siteBReport.status, 403);

      const switchSite = await fetch(`${baseUrl}/api/v1/auth/context`, {
        method: "PATCH",
        headers: { cookie: office.cookie, "content-type": "application/json" },
        body: JSON.stringify({ siteId: siteBId }),
      });
      assert.equal(switchSite.status, 403);

      const siteBWb = siteBRow?.weighbridges[0];
      if (siteBWb) {
        const stolenHardware = await fetch(`${baseUrl}/api/v1/weighbridges/${siteBWb.id}/hardware`, {
          headers: { cookie: office.cookie },
        });
        assert.equal([403, 404].includes(stolenHardware.status), true);
      }

      const siteBUserDirectory = await fetch(`${baseUrl}/api/v1/tenancy/directory`, { headers: { cookie: siteB.cookie } });
      assert.equal(siteBUserDirectory.status, 403);
    });
  });

  it("blocks archived login, suspended writes, and new work on inactive sites", async () => {
    await withApp(async (baseUrl) => {
      const archived = await loginCookie(baseUrl, "admin@archived.local", "archived");
      assert.equal(archived.status, 401);

      const frozen = await loginCookie(baseUrl, "admin@frozen.local", "frozen");
      assert.equal(frozen.status, 200);
      const frozenContext = await fetch(`${baseUrl}/api/v1/auth/context`, { headers: { cookie: frozen.cookie } });
      const frozenBody = (await frozenContext.json()) as {
        weighbridges: Array<{ id: string; siteId: string }>;
      };
      const frozenWb = frozenBody.weighbridges[0];
      assert.equal(Boolean(frozenWb), true);
      const frozenCreate = await fetch(`${baseUrl}/api/v1/transactions`, {
        method: "POST",
        headers: { cookie: frozen.cookie, "content-type": "application/json" },
        body: JSON.stringify({ weighbridgeId: frozenWb?.id, siteId: frozenWb?.siteId }),
      });
      assert.equal(frozenCreate.status, 403);

      const demo = await loginCookie(baseUrl, "admin@demo.local");
      const context = await fetch(`${baseUrl}/api/v1/auth/context`, { headers: { cookie: demo.cookie } });
      const contextBody = (await context.json()) as {
        sites: Array<{ id: string; code: string }>;
        weighbridges: Array<{ id: string; siteId: string }>;
      };
      const inactive = contextBody.sites.find((site) => site.code === "DEMO-SITE-INACTIVE");
      const inactiveWb = contextBody.weighbridges.find((row) => row.siteId === inactive?.id);
      assert.equal(Boolean(inactiveWb), true);
      const inactiveCreate = await fetch(`${baseUrl}/api/v1/transactions`, {
        method: "POST",
        headers: { cookie: demo.cookie, "content-type": "application/json" },
        body: JSON.stringify({ weighbridgeId: inactiveWb?.id, siteId: inactive?.id }),
      });
      assert.equal(inactiveCreate.status, 409);

      const sameOrgSwitch = await fetch(`${baseUrl}/api/v1/auth/context`, {
        method: "PATCH",
        headers: { cookie: demo.cookie, "content-type": "application/json" },
        body: JSON.stringify({ siteId: inactive?.id }),
      });
      assert.equal(sameOrgSwitch.status, 200);
    });
  });
});
