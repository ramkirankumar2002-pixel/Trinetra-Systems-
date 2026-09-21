import { TransactionStatus } from "@prisma/client";
import { resolveDriverConfig, type DriverModeConfig } from "../../domain/driverConfig.js";
import { isOpenWeighbridgeStatus } from "../../domain/transactionState.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/client.js";
import { writeAudit } from "../audit/service.js";
import { accessibleSiteWhere } from "../shared/siteScope.js";
import type { ActorContext } from "../shared/actor.js";
import { toPublicTransaction, transactionInclude } from "../transactions/mapper.js";
import { listWeighbridges, type PublicWeighbridge } from "../weighbridges/service.js";
import type { DriverEventInput } from "./validators.js";

const OPEN_DRIVER_STATUSES = (Object.values(TransactionStatus) as TransactionStatus[]).filter(
  isOpenWeighbridgeStatus,
);

export type DriverOpenTransaction = {
  id: string;
  referenceNumber: string;
  status: string;
  nextAction: { code: string; label: string; blocking: boolean };
  vehicleNumber: string | null;
  materialName: string | null;
  weighbridgeId: string | null;
  updatedAt: string;
};

export type DriverContext = {
  config: DriverModeConfig;
  weighbridges: PublicWeighbridge[];
  openTransactions: DriverOpenTransaction[];
};

export function currentDriverConfig(): DriverModeConfig {
  return resolveDriverConfig({
    driverModeEnabled: env.driverModeEnabled,
    defaultLanguage: env.driverDefaultLanguage,
    languages: env.driverLanguages,
    voiceEnabled: env.driverVoiceEnabled,
    audioEnabled: env.driverAudioEnabled,
  });
}

export async function driverConfigForOrganization(organizationId: string): Promise<DriverModeConfig> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      defaultLanguage: true,
      enabledDriverLanguages: true,
      driverVoiceEnabled: true,
      driverAudioEnabled: true,
    },
  });
  if (!organization) {
    return currentDriverConfig();
  }
  return resolveDriverConfig({
    driverModeEnabled: env.driverModeEnabled,
    defaultLanguage: organization.defaultLanguage,
    languages:
      organization.enabledDriverLanguages.length > 0 ? organization.enabledDriverLanguages : env.driverLanguages,
    voiceEnabled: organization.driverVoiceEnabled,
    audioEnabled: organization.driverAudioEnabled,
  });
}

export async function getDriverContext(actor: ActorContext): Promise<DriverContext> {
  const weighbridges = await listWeighbridges(actor);
  const rows = await prisma.transaction.findMany({
    where: {
      organizationId: actor.user.organizationId,
      ...accessibleSiteWhere(actor),
      status: { in: OPEN_DRIVER_STATUSES },
    },
    include: transactionInclude,
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  return {
    config: await driverConfigForOrganization(actor.user.organizationId),
    weighbridges: weighbridges.items,
    openTransactions: rows.map((row) => {
      const transaction = toPublicTransaction(row);
      return {
        id: transaction.id,
        referenceNumber: transaction.referenceNumber,
        status: transaction.status,
        nextAction: {
          code: transaction.nextAction.code,
          label: transaction.nextAction.label,
          blocking: transaction.nextAction.blocking,
        },
        vehicleNumber: transaction.vehicle?.displayRegistrationNumber ?? null,
        materialName: transaction.material?.name ?? null,
        weighbridgeId: transaction.weighbridge?.id ?? null,
        updatedAt: transaction.updatedAt,
      };
    }),
  };
}

export async function recordDriverEvent(actor: ActorContext, input: DriverEventInput): Promise<void> {
  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
  });
}
