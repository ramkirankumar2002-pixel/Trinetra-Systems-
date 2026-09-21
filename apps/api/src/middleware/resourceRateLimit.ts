import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Request } from "express";
import type { AuthedRequest } from "../modules/auth/types.js";

function userOrIpKey(request: Request): string {
  const auth = (request as AuthedRequest).auth;
  const userId = auth?.id ?? "anonymous";
  const ip = request.ip ?? "0.0.0.0";
  return `${ipKeyGenerator(ip)}:${userId}`;
}

export const reportQueryRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  statusCode: 429,
  message: { error: "Too many report requests. Try again later." },
  keyGenerator: userOrIpKey,
});

export const documentUploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  statusCode: 429,
  message: { error: "Too many document uploads. Try again later." },
  keyGenerator: userOrIpKey,
});
