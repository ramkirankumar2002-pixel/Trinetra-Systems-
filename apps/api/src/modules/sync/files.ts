import { createHash } from "node:crypto";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import type { AuthenticatedGateway } from "../edge/types.js";
import type { parseFileUploadInput } from "./validators.js";

export async function storeSyncedFile(
  gateway: AuthenticatedGateway,
  input: ReturnType<typeof parseFileUploadInput>,
): Promise<{ fileId: string; alreadyProcessed: boolean }> {
  const bytes = Buffer.from(input.contentBase64, "base64");
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== input.contentHash) {
    throw new HttpError(400, "File hash does not match the uploaded content");
  }

  const existing = await prisma.edgeSyncedFile.findFirst({
    where: {
      gatewayId: gateway.id,
      OR: [{ fileId: input.fileId }, { contentHash: hash }],
    },
  });
  if (existing) {
    return { fileId: existing.fileId, alreadyProcessed: true };
  }

  await prisma.edgeSyncedFile.create({
    data: {
      organizationId: gateway.organizationId,
      siteId: gateway.siteId,
      gatewayId: gateway.id,
      fileId: input.fileId,
      contentHash: hash,
      mimeType: input.mimeType,
      sizeBytes: bytes.length,
      eventId: input.eventId,
      contentBase64: input.contentBase64,
    },
  });
  return { fileId: input.fileId, alreadyProcessed: false };
}

export async function loadSyncedFile(
  gatewayId: string,
  fileId: string | null,
  contentHash: string | null,
): Promise<{ bytes: Buffer; mimeType: string; fileName: string } | null> {
  const existing = await prisma.edgeSyncedFile.findFirst({
    where: {
      gatewayId,
      OR: [...(fileId ? [{ fileId }] : []), ...(contentHash ? [{ contentHash }] : [])],
    },
  });
  if (!existing?.contentBase64) {
    return null;
  }
  return {
    bytes: Buffer.from(existing.contentBase64, "base64"),
    mimeType: existing.mimeType,
    fileName: `${existing.fileId}`,
  };
}
