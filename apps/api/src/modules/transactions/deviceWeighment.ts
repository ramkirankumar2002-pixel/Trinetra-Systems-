import { WeighmentKind, WeighmentSource } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../db/client.js";
import type { HardwareDeviceStatus } from "../../domain/hardwareStatus.js";
import { officialWeighmentRejection } from "../../domain/weighmentAcceptance.js";
import type { WeightQuality } from "../../domain/weightQuality.js";
import { isWeightUnit } from "../../domain/weightUnits.js";
import { HttpError } from "../../lib/httpError.js";
import { getLiveWeight } from "../hardware/service.js";
import type { ActorContext } from "../shared/actor.js";
import { recordWeighment } from "./lifecycle.js";
import type { PublicTransaction } from "./mapper.js";
import type { RecordWeighmentInput } from "./validators.js";

export async function recordWeighmentFromDevice(
  actor: ActorContext,
  transactionId: string,
  kind?: WeighmentKind,
): Promise<PublicTransaction> {
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId: actor.user.organizationId },
    select: { weighbridgeId: true, status: true },
  });
  if (!transaction) {
    throw new HttpError(404, "Transaction not found");
  }
  if (!transaction.weighbridgeId) {
    throw new HttpError(400, "A weighbridge is required");
  }

  const live = await getLiveWeight(actor, transaction.weighbridgeId);
  const expectedUnit = isWeightUnit(live.reading.unit) ? live.reading.unit : "KG";
  const rejected = officialWeighmentRejection({
    connectionStatus: live.reading.connectionStatus as HardwareDeviceStatus,
    quality: live.reading.quality as WeightQuality,
    weightKg: live.reading.weightKg,
    unit: live.reading.unit,
    expectedUnit,
    limits: { minKg: env.weighmentMinKg, maxKg: env.weighmentMaxKg },
  });
  if (rejected) {
    throw new HttpError(409, rejected);
  }
  if (live.reading.weightKg === null) {
    throw new HttpError(409, "Stable weight reading is not available.");
  }

  const source =
    live.reading.source === "HARDWARE" ? WeighmentSource.HARDWARE : WeighmentSource.SIMULATED;
  const input: RecordWeighmentInput = {
    weightKg: live.reading.weightKg,
    source,
    weighbridgeId: transaction.weighbridgeId,
    ...(kind === undefined ? {} : { kind }),
  };

  return recordWeighment(actor, transactionId, input);
}
