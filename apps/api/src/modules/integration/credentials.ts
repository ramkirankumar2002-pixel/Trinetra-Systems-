import { prisma } from "../../db/client.js";
import { HttpError } from "../../lib/httpError.js";
import {
  generateIntegrationClientId,
  generateIntegrationSecret,
  hashIntegrationSecret,
  secretPrefix,
} from "../../domain/integration/index.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import type { ActorContext } from "../shared/actor.js";
import { loadApplication } from "./applications.js";
import { toPublicCredential } from "./mapper.js";

const SECRET_WARNING = "Store this secret securely. It will not be shown again.";

export async function listCredentials(actor: ActorContext, applicationId: string) {
  const application = await loadApplication(actor, applicationId);
  const items = await prisma.integrationCredential.findMany({
    where: { applicationId: application.id, organizationId: actor.user.organizationId },
    orderBy: { createdAt: "desc" },
  });
  return { items: items.map(toPublicCredential) };
}

export async function createCredential(
  actor: ActorContext,
  applicationId: string,
  input: { expiresAt?: Date | undefined },
) {
  const application = await loadApplication(actor, applicationId);
  if (application.status === "REVOKED") {
    throw new HttpError(400, "Cannot create credentials for a revoked integration");
  }
  const secret = generateIntegrationSecret(application.environment);
  const created = await prisma.$transaction(async (tx) => {
    const credential = await tx.integrationCredential.create({
      data: {
        organizationId: actor.user.organizationId,
        applicationId: application.id,
        clientId: generateIntegrationClientId(),
        secretHash: hashIntegrationSecret(secret),
        secretPrefix: secretPrefix(secret),
        expiresAt: input.expiresAt ?? null,
      },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.INTEGRATION_CREDENTIAL_CREATED,
        entityType: "IntegrationCredential",
        entityId: credential.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { applicationId: application.id, clientId: credential.clientId, secretPrefix: credential.secretPrefix },
      },
      tx,
    );
    return credential;
  });
  return { credential: toPublicCredential(created), secret, warning: SECRET_WARNING };
}

export async function rotateCredential(actor: ActorContext, credentialId: string) {
  const existing = await loadCredential(actor, credentialId);
  const application = await loadApplication(actor, existing.applicationId);
  const secret = generateIntegrationSecret(application.environment);
  const rotated = await prisma.$transaction(async (tx) => {
    await tx.integrationCredential.update({
      where: { id: existing.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    const credential = await tx.integrationCredential.create({
      data: {
        organizationId: actor.user.organizationId,
        applicationId: existing.applicationId,
        clientId: generateIntegrationClientId(),
        secretHash: hashIntegrationSecret(secret),
        secretPrefix: secretPrefix(secret),
        expiresAt: existing.expiresAt,
      },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.INTEGRATION_CREDENTIAL_ROTATED,
        entityType: "IntegrationCredential",
        entityId: credential.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { previousCredentialId: existing.id, clientId: credential.clientId },
      },
      tx,
    );
    return credential;
  });
  return { credential: toPublicCredential(rotated), secret, warning: SECRET_WARNING };
}

export async function revokeCredential(actor: ActorContext, credentialId: string) {
  const existing = await loadCredential(actor, credentialId);
  const updated = await prisma.$transaction(async (tx) => {
    const credential = await tx.integrationCredential.update({
      where: { id: existing.id },
      data: { status: "REVOKED", revokedAt: existing.revokedAt ?? new Date() },
    });
    await writeAudit(
      {
        organizationId: actor.user.organizationId,
        actorUserId: actor.user.id,
        action: AUDIT_ACTIONS.INTEGRATION_CREDENTIAL_REVOKED,
        entityType: "IntegrationCredential",
        entityId: credential.id,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        metadata: { clientId: credential.clientId },
      },
      tx,
    );
    return credential;
  });
  return { credential: toPublicCredential(updated) };
}

async function loadCredential(actor: ActorContext, id: string) {
  const credential = await prisma.integrationCredential.findFirst({
    where: { id, organizationId: actor.user.organizationId },
  });
  if (!credential) {
    throw new HttpError(404, "Integration credential not found");
  }
  return credential;
}
