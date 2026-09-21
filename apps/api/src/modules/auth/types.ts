import type { Request } from "express";

export type PublicDepartment = {
  id: string;
  code: string;
  name: string;
};

export type PublicSite = {
  id: string;
  code: string;
  name: string;
  status?: "ACTIVE" | "INACTIVE";
  timezone?: string;
};

export type PublicWeighbridgeRef = {
  id: string;
  code: string;
  name: string;
};

export type PublicRole = {
  id: string;
  code: string;
  name: string;
  site: PublicSite | null;
  weighbridge?: PublicWeighbridgeRef | null;
};

export type PublicUser = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
    status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
    kind?: "DEMO" | "CUSTOMER";
  };
  defaultDepartment: PublicDepartment | null;
  defaultSite: PublicSite | null;
  roles: PublicRole[];
  permissions: string[];
};

export type AuthenticatedUser = PublicUser & {
  organizationId: string;
  sessionId: string;
};

export type AuthedRequest = Request & {
  auth: AuthenticatedUser;
};
