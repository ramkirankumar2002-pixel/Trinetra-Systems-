import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import { sanitizeMetadata } from "./mapper.js";
import type { IntegrationAuth } from "./types.js";

export function readIdempotencyKey(header: string | undefined): string | undefined {
  if (!header || header.trim() === "") {
    return undefined;
  }
  const key = header.trim();
  if (key.length > 128) {
    throw new HttpError(400, "Idempotency-Key is too long");
  }
  return key;
}

export function requestFingerprint(method: string, path: string, body: unknown): string {
  return createHash("sha256")
    .update(`${method.toUpperCase()}:${path}:${JSON.stringify(sanitizeMetadata(body) ?? {})}`)
    .digest("hex");
}

export async function replayOrBegin(
  auth: IntegrationAuth,
  endpoint: string,
  idempotencyKey: string,
  fingerprint: string,
  response: Response,
): Promise<"replayed" | "continue"> {
  const existing = await prisma.integrationIdempotencyKey.findFirst({
    where: {
      organizationId: auth.organizationId,
      applicationId: auth.applicationId,
      endpoint,
      idempotencyKey,
    },
  });
  if (!existing) {
    return "continue";
  }
  if (existing.requestFingerprint !== fingerprint) {
    throw new HttpError(409, "Idempotency key was reused with a different request");
  }
  response.status(existing.responseStatus).json(existing.responseBody);
  return "replayed";
}

export async function storeIdempotentResult(
  auth: IntegrationAuth,
  endpoint: string,
  idempotencyKey: string,
  fingerprint: string,
  status: number,
  body: Prisma.InputJsonValue | Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.integrationIdempotencyKey.create({
      data: {
        organizationId: auth.organizationId,
        applicationId: auth.applicationId,
        endpoint,
        idempotencyKey,
        requestFingerprint: fingerprint,
        responseStatus: status,
        responseBody: JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return;
    }
    throw error;
  }
}
