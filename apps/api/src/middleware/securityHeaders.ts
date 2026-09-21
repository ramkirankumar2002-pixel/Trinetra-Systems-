import type { NextFunction, Request, Response } from "express";
import { isProduction } from "../config/env.js";

export function securityHeaders(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-DNS-Prefetch-Control", "off");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Cross-Origin-Resource-Policy", "same-site");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  response.setHeader("Cache-Control", "no-store");
  if (isProduction()) {
    response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}
