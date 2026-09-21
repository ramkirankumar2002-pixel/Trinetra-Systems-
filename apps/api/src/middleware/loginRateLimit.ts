import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";

export const loginRateLimit = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  limit: env.authRateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  statusCode: 429,
  message: { error: "Too many login attempts. Try again later." },
  keyGenerator: (request) => {
    const body = request.body as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "unknown";
    const ip = request.ip ?? "0.0.0.0";
    return `${ipKeyGenerator(ip)}:${email}`;
  },
});
