import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { AuthedRequest } from "../modules/auth/types.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_MUTATIONS = 40;

export const sensitiveMutationRateLimit = rateLimit({
  windowMs: WINDOW_MS,
  limit: MAX_MUTATIONS,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  statusCode: 429,
  message: { error: "Too many configuration changes. Try again later." },
  keyGenerator: (request) => {
    const auth = (request as AuthedRequest).auth;
    const userId = auth?.id ?? "anonymous";
    const ip = request.ip ?? "0.0.0.0";
    return `${ipKeyGenerator(ip)}:${userId}`;
  },
});
