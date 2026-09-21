import { isApiError } from "./client.ts";

export function formatApiError(error: unknown, fallback: string): string {
  if (!isApiError(error)) {
    return fallback;
  }
  if (error.status >= 500 && error.referenceId) {
    return `${error.message} Reference ID: ${error.referenceId}`;
  }
  return error.message;
}
