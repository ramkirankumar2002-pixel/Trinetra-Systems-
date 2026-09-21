import { apiRequest } from "../../shared/api/client.ts";

export type IntegrationCatalog = {
  apiVersion: string;
  currentVersion: string;
  statuses: string[];
  environments: string[];
  scopes: string[];
  defaultScopes: string[];
  webhookEventTypes: string[];
  mappingFields: string[];
  rateLimits: { defaultRequestsPerMinute: number; defaultRequestsPerHour: number };
};

export type PublicApplication = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  environment: string;
  scopes: string[];
  siteIds: string[];
  requestsPerMinute: number;
  requestsPerHour: number;
  credentialCount: number;
  webhookCount: number;
  createdAt: string;
  updatedAt: string;
};

export type PublicCredential = {
  id: string;
  applicationId: string;
  clientId: string;
  secretPrefix: string;
  status: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type PublicWebhook = {
  id: string;
  applicationId: string;
  url: string;
  status: string;
  eventTypes: string[];
  secretPrefix: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicDelivery = {
  id: string;
  webhookId: string;
  eventId: string;
  eventType: string;
  isTest: boolean;
  destination: string;
  status: string;
  attemptCount: number;
  responseStatus: number | null;
  lastAttemptAt: string | null;
  failureReason: string | null;
  createdAt: string;
};

export type SecretOnce = { secret: string; warning: string };

export type IntegrationOverview = {
  kpis: {
    activeIntegrations: number;
    suspendedIntegrations: number;
    requestCount24h: number;
    failedDeliveries: number;
  };
  expiringCredentials: Array<{
    id: string;
    applicationId: string;
    clientId: string;
    secretPrefix: string;
    expiresAt: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    applicationId: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    requestId: string;
    rateLimited: boolean;
    createdAt: string;
  }>;
  recentDeliveries: PublicDelivery[];
};

export function emptyOverview(): IntegrationOverview {
  return {
    kpis: { activeIntegrations: 0, suspendedIntegrations: 0, requestCount24h: 0, failedDeliveries: 0 },
    expiringCredentials: [],
    recentActivity: [],
    recentDeliveries: [],
  };
}

export function getCatalog() {
  return apiRequest<IntegrationCatalog>("/api/v1/integrations/catalog");
}

export function getOverview() {
  return apiRequest<IntegrationOverview>("/api/v1/integrations/overview");
}

export function listApplications() {
  return apiRequest<{ items: PublicApplication[]; total: number }>("/api/v1/integrations/applications");
}

export function getApplication(id: string) {
  return apiRequest<{ application: PublicApplication }>(`/api/v1/integrations/applications/${id}`);
}

export function createApplication(body: Record<string, unknown>) {
  return apiRequest<{ application: PublicApplication }>("/api/v1/integrations/applications", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateApplication(id: string, body: Record<string, unknown>) {
  return apiRequest<{ application: PublicApplication }>(`/api/v1/integrations/applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function listCredentials(applicationId: string) {
  return apiRequest<{ items: PublicCredential[] }>(`/api/v1/integrations/applications/${applicationId}/credentials`);
}

export function createCredential(applicationId: string) {
  return apiRequest<{ credential: PublicCredential } & SecretOnce>(
    `/api/v1/integrations/applications/${applicationId}/credentials`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function rotateCredential(id: string) {
  return apiRequest<{ credential: PublicCredential } & SecretOnce>(`/api/v1/integrations/credentials/${id}/rotate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function revokeCredential(id: string) {
  return apiRequest<{ credential: PublicCredential }>(`/api/v1/integrations/credentials/${id}/revoke`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function listWebhooks(applicationId: string) {
  return apiRequest<{ items: PublicWebhook[] }>(`/api/v1/integrations/applications/${applicationId}/webhooks`);
}

export function createWebhook(applicationId: string, body: Record<string, unknown>) {
  return apiRequest<{ webhook: PublicWebhook } & SecretOnce>(
    `/api/v1/integrations/applications/${applicationId}/webhooks`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function updateWebhook(id: string, body: Record<string, unknown>) {
  return apiRequest<{ webhook: PublicWebhook }>(`/api/v1/integrations/webhooks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function rotateWebhookSecret(id: string) {
  return apiRequest<{ webhook: PublicWebhook } & SecretOnce>(`/api/v1/integrations/webhooks/${id}/rotate-secret`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function testWebhook(id: string) {
  return apiRequest<{ eventId: string; test: true; delivery: PublicDelivery | null }>(
    `/api/v1/integrations/webhooks/${id}/test`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function listDeliveries(search = "") {
  return apiRequest<{ items: PublicDelivery[]; total: number }>(`/api/v1/integrations/deliveries${search}`);
}

export function listUsage(search = "") {
  return apiRequest<{
    items: Array<{
      id: string;
      applicationId: string;
      method: string;
      path: string;
      statusCode: number;
      durationMs: number;
      requestId: string;
      rateLimited: boolean;
      createdAt: string;
    }>;
    total: number;
  }>(`/api/v1/integrations/usage${search}`);
}

export function secretWarning(value: string | null): string {
  return value ? "Store this secret securely. It will not be shown again." : "";
}
