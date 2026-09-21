import { HttpError } from "../../lib/httpError.js";

export const ORGANIZATION_STATUSES = ["ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export type OrganizationStatusValue = (typeof ORGANIZATION_STATUSES)[number];

export const ORGANIZATION_KINDS = ["DEMO", "CUSTOMER"] as const;
export type OrganizationKindValue = (typeof ORGANIZATION_KINDS)[number];

export const SITE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type SiteStatusValue = (typeof SITE_STATUSES)[number];

export function isOrganizationStatus(value: string): value is OrganizationStatusValue {
  return (ORGANIZATION_STATUSES as readonly string[]).includes(value);
}

export function isOrganizationKind(value: string): value is OrganizationKindValue {
  return (ORGANIZATION_KINDS as readonly string[]).includes(value);
}

export function isSiteStatus(value: string): value is SiteStatusValue {
  return (SITE_STATUSES as readonly string[]).includes(value);
}

export function organizationStatusOf(value: string | null | undefined): OrganizationStatusValue {
  return value && isOrganizationStatus(value) ? value : "ACTIVE";
}

export function organizationKindOf(value: string | null | undefined): OrganizationKindValue {
  return value && isOrganizationKind(value) ? value : "CUSTOMER";
}

export function canLoginToOrganization(status: OrganizationStatusValue): boolean {
  return status !== "ARCHIVED";
}

export function canPerformOperationalWrites(status: OrganizationStatusValue): boolean {
  return status === "ACTIVE";
}

export function siteAcceptsNewTransactions(status: SiteStatusValue): boolean {
  return status === "ACTIVE";
}

export function assertOrganizationAllowsLogin(status: OrganizationStatusValue): void {
  if (!canLoginToOrganization(status)) {
    throw new HttpError(401, "Invalid email or password");
  }
}

export function assertOrganizationOperational(status: OrganizationStatusValue): void {
  if (!canPerformOperationalWrites(status)) {
    throw new HttpError(403, "This organization is suspended. Operational transactions are not available.");
  }
}

export function assertSiteAcceptsNewWork(status: SiteStatusValue): void {
  if (!siteAcceptsNewTransactions(status)) {
    throw new HttpError(409, "This site is inactive and does not accept new transactions.");
  }
}
