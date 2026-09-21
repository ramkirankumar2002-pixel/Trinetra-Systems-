import { randomBytes } from "node:crypto";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const backup = `${filePath}.bak`;
  await writeFile(tmp, `${JSON.stringify(value)}\n`, "utf8");
  try {
    await rename(tmp, filePath);
    return;
  } catch {
    // Windows cannot replace an existing file with rename.
  }
  try {
    await unlink(backup);
  } catch {
    // no previous backup
  }
  try {
    await rename(filePath, backup);
  } catch {
    // dest may not exist
  }
  await rename(tmp, filePath);
  await unlink(backup).catch(() => undefined);
}

export async function recoverTempFile(filePath: string): Promise<void> {
  try {
    await stat(filePath);
    return;
  } catch {
    // dest missing — restore backup if a write was interrupted
  }
  const backup = `${filePath}.bak`;
  try {
    await rename(backup, filePath);
  } catch {
    // no backup to recover
  }
}
