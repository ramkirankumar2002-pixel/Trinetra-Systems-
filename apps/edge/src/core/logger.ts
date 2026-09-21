import { appendFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { edgeEnv } from "../config/env.js";
import { redactSecrets } from "../security/redact.js";

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;
type LogLevel = keyof typeof LEVELS;

const MAX_LOG_BYTES = 2 * 1024 * 1024;

export class EdgeLogger {
  constructor(private readonly directory: string) {}

  async info(event: string, details?: Record<string, unknown>): Promise<void> {
    await this.write("info", event, details);
  }

  async warn(event: string, details?: Record<string, unknown>): Promise<void> {
    await this.write("warn", event, details);
  }

  async error(event: string, details?: Record<string, unknown>): Promise<void> {
    await this.write("error", event, details);
  }

  private async write(level: LogLevel, event: string, details?: Record<string, unknown>): Promise<void> {
    const configured = (Object.keys(LEVELS) as LogLevel[]).includes(edgeEnv.logLevel as LogLevel)
      ? (edgeEnv.logLevel as LogLevel)
      : "info";
    if (LEVELS[level] > LEVELS[configured]) {
      return;
    }
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event,
      ...(details === undefined ? {} : { details: redactSecrets(details) }),
    });
    console.log(line);
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, "edge.log");
    await appendFile(file, `${line}\n`, "utf8");
    await rotateIfNeeded(file);
  }
}

async function rotateIfNeeded(file: string): Promise<void> {
  try {
    const info = await stat(file);
    if (info.size <= MAX_LOG_BYTES) {
      return;
    }
    const rotated = `${file}.1`;
    try {
      await unlink(rotated);
    } catch {
      // no previous rotation
    }
    await rename(file, rotated);
  } catch {
    // first write
  }
}
