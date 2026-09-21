import { PrismaClient } from "@prisma/client";
import { attachDatabaseObservability } from "./observability.js";

// Auth and later modules use this client. GET /health does not query it,
// so the HTTP server still starts when PostgreSQL is down.
export const prisma = new PrismaClient({
  log: [
    { emit: "event", level: "query" },
    { emit: "event", level: "error" },
    { emit: "event", level: "warn" },
  ],
});

attachDatabaseObservability(prisma);
