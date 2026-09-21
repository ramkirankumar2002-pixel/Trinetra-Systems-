import type { Request } from "express";

export function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    const first = forwarded.split(",")[0]?.trim();
    return first === "" ? undefined : first;
  }

  return request.socket.remoteAddress ?? undefined;
}

export function getUserAgent(request: Request): string | undefined {
  const userAgent = request.headers["user-agent"];
  return typeof userAgent === "string" && userAgent.length > 0 ? userAgent : undefined;
}
