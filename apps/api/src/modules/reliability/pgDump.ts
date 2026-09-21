import { spawn } from "node:child_process";
import { env } from "../../config/env.js";

export type PgDumpResult = { ok: true } | { ok: false; errorCode: string };

export async function runPgDump(destinationFile: string): Promise<PgDumpResult> {
  if (!env.databaseUrl) {
    return { ok: false, errorCode: "DATABASE_URL_MISSING" };
  }

  let target: { host: string; port: string; user: string; password: string; database: string };
  try {
    target = parseDatabaseTarget(env.databaseUrl);
  } catch {
    return { ok: false, errorCode: "DATABASE_URL_INVALID" };
  }

  return new Promise((resolve) => {
    const child = spawn(
      "pg_dump",
      ["-h", target.host, "-p", target.port, "-U", target.user, "-d", target.database, "-F", "c", "-f", destinationFile],
      {
        env: {
          ...process.env,
          PGPASSWORD: target.password,
        },
        windowsHide: true,
      },
    );

    child.on("error", (error) => {
      if ("code" in error && error.code === "ENOENT") {
        resolve({ ok: false, errorCode: "PG_DUMP_NOT_FOUND" });
        return;
      }
      resolve({ ok: false, errorCode: "BACKUP_PROCESS_FAILED" });
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      resolve({ ok: false, errorCode: "BACKUP_PROCESS_FAILED" });
    });
  });
}

export function parseDatabaseTarget(databaseUrl: string): {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
} {
  const parsed = new URL(databaseUrl);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!parsed.hostname || database === "") {
    throw new Error("invalid");
  }
  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  };
}

export function publicDatabaseName(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) {
    return null;
  }
  try {
    return parseDatabaseTarget(databaseUrl).database;
  } catch {
    return null;
  }
}
