import { Prisma, type PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { writeLog } from "../lib/logger.js";
import { recordDbQuery } from "../lib/metrics.js";

type ObservablePrisma = PrismaClient & {
  $on(eventType: "query", callback: (event: Prisma.QueryEvent) => void): void;
  $on(eventType: "error", callback: (event: Prisma.LogEvent) => void): void;
};

export function attachDatabaseObservability(client: PrismaClient): void {
  const observable = client as ObservablePrisma;
  observable.$on("query", (event) => {
    recordDbQuery({ durationMs: event.duration, failed: false });
    if (event.duration >= env.slowQueryMs) {
      writeLog("warn", "database_query_slow", {
        durationMs: event.duration,
        operation: queryOperation(event.query),
        errorCategory: "DATABASE_ERROR",
      });
    }
  });

  observable.$on("error", () => {
    recordDbQuery({ durationMs: 0, failed: true });
    writeLog("error", "database_client_error", { errorCategory: "DATABASE_ERROR" });
  });
}

function queryOperation(sql: string): string {
  const match = sql.trim().match(/^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK)/i);
  return match?.[1]?.toUpperCase() ?? "OTHER";
}
