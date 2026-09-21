import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LocalStore } from "../store/localStore.js";
import type { LocalFileRecord } from "../store/types.js";

export async function storeLocalFile(
  store: LocalStore,
  input: { bytes: Buffer; mimeType: string; eventId?: string },
): Promise<LocalFileRecord> {
  const fileId = randomUUID();
  const contentHash = createHash("sha256").update(input.bytes).digest("hex");
  const directory = store.filesDirectory();
  await mkdir(directory, { recursive: true });
  const localPath = path.join(directory, fileId);
  await writeFile(localPath, input.bytes);
  return store.addFile({
    fileId,
    eventId: input.eventId ?? null,
    localPath,
    contentHash,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.length,
    createdAt: new Date().toISOString(),
    syncStatus: "PENDING",
  });
}
