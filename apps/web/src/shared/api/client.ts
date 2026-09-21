export type ApiError = {
  status: number;
  message: string;
  requestId?: string;
  correlationId?: string;
  referenceId?: string;
};

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body !== undefined && !headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Request failed";
    const error: ApiError = { status: response.status, message };
    if (typeof payload === "object" && payload !== null) {
      if ("requestId" in payload && typeof payload.requestId === "string") {
        error.requestId = payload.requestId;
      }
      if ("correlationId" in payload && typeof payload.correlationId === "string") {
        error.correlationId = payload.correlationId;
      }
      if ("referenceId" in payload && typeof payload.referenceId === "string") {
        error.referenceId = payload.referenceId;
      }
    }
    throw error;
  }

  return payload as T;
}

export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error &&
    typeof error.status === "number" &&
    typeof error.message === "string"
  );
}
