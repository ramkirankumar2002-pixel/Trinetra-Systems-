import { apiRequest } from "../../shared/api/client.ts";

export type TenantSite = {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  timezone: string;
  operationMode: string;
};

export type OperationalContext = {
  organization: {
    id: string;
    name: string;
    slug: string;
    status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
    kind?: "DEMO" | "CUSTOMER";
  };
  activeSite: { id: string; code: string; name: string; status?: string } | null;
  sites: TenantSite[];
  departments: Array<{ id: string; code: string; name: string }>;
  weighbridges: Array<{ id: string; code: string; name: string; siteId: string; isActive: boolean }>;
  permissions: string[];
};

export type OrganizationDirectory = {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
    kind: "DEMO" | "CUSTOMER";
  };
  sites: Array<{
    id: string;
    code: string;
    name: string;
    status: "ACTIVE" | "INACTIVE";
    timezone: string;
    operationMode: string;
    weighbridges: Array<{ id: string; code: string; name: string; isActive: boolean }>;
    gateways: Array<{ id: string; code: string; name: string; enabled: boolean }>;
    cameras: Array<{ id: string; name: string; purpose: string; enabled: boolean }>;
  }>;
  departments: Array<{ id: string; code: string; name: string }>;
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    isActive: boolean;
    defaultSite: { id: string; code: string; name: string } | null;
    roles: Array<{
      code: string;
      name: string;
      site: { id: string; code: string; name: string } | null;
      weighbridge: { id: string; code: string; name: string } | null;
    }>;
  }>;
};

export function fetchOperationalContext() {
  return apiRequest<OperationalContext>("/api/v1/auth/context");
}

export function fetchOrganizationDirectory() {
  return apiRequest<{ directory: OrganizationDirectory }>("/api/v1/tenancy/directory");
}

export function updateOrganizationStatus(status: "ACTIVE" | "SUSPENDED") {
  return apiRequest<{ organization: { id: string; status: string } }>("/api/v1/tenancy/organization", {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateSiteStatus(siteId: string, status: "ACTIVE" | "INACTIVE") {
  return apiRequest<{ site: TenantSite }>(`/api/v1/tenancy/sites/${siteId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function organizationKindLabel(kind: string | undefined): string {
  if (kind === "DEMO") {
    return "Demo organization";
  }
  return "Customer organization";
}

export function siteStatusLabel(status: string | undefined): string {
  return status === "INACTIVE" ? "Inactive" : "Active";
}
