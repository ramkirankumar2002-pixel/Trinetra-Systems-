import type { Request } from "express";
import type { ActorContext } from "../shared/actor.js";
import type { IntegrationScope } from "../../domain/integration/index.js";

export type IntegrationAuth = {
  organizationId: string;
  organizationStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  organizationName: string;
  organizationSlug: string;
  organizationKind: "DEMO" | "CUSTOMER";
  applicationId: string;
  applicationName: string;
  environment: "TEST" | "PRODUCTION";
  credentialId: string;
  clientId: string;
  scopes: IntegrationScope[];
  siteIds: string[];
  createdByUserId: string;
  requestsPerMinute: number;
  requestsPerHour: number;
  applicationStatus: "ACTIVE" | "SUSPENDED" | "REVOKED";
};

export type IntegrationRequest = Request & {
  integration?: IntegrationAuth;
  integrationRateLimited?: boolean;
};

export type IntegrationActor = ActorContext & {
  integration: IntegrationAuth;
};
