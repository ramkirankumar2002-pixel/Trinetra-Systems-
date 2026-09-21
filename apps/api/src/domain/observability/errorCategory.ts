export const ERROR_CATEGORIES = [
  "AUTHENTICATION_ERROR",
  "AUTHORIZATION_ERROR",
  "VALIDATION_ERROR",
  "DATABASE_ERROR",
  "NETWORK_ERROR",
  "DEVICE_ERROR",
  "PROVIDER_ERROR",
  "SYNC_ERROR",
  "WORKFLOW_ERROR",
  "WEIGHT_ERROR",
  "CONFIGURATION_ERROR",
  "SYSTEM_ERROR",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

export function isErrorCategory(value: string): value is ErrorCategory {
  return (ERROR_CATEGORIES as readonly string[]).includes(value);
}

export function categoryFromHttpStatus(status: number): ErrorCategory {
  if (status === 401) {
    return "AUTHENTICATION_ERROR";
  }
  if (status === 403) {
    return "AUTHORIZATION_ERROR";
  }
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return "VALIDATION_ERROR";
  }
  if (status === 503) {
    return "NETWORK_ERROR";
  }
  if (status >= 500) {
    return "SYSTEM_ERROR";
  }
  return "SYSTEM_ERROR";
}

export function categoryFromPrismaCode(code: string): ErrorCategory {
  if (code === "P1000" || code === "P1001" || code === "P1002" || code === "P1017") {
    return "DATABASE_ERROR";
  }
  if (code === "P2002" || code === "P2025") {
    return "VALIDATION_ERROR";
  }
  return "DATABASE_ERROR";
}
