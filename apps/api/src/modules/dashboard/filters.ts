import { DocumentStatus, Prisma, TransactionStatus, UnloadingStatus } from "@prisma/client";
import {
  CLOSED_TRANSACTION_STATUSES,
  EXCEPTION_LIST_STATUSES,
  LIVE_TRANSACTION_STATUSES,
  PENDING_UNLOADING_STATUSES,
} from "../../domain/dashboardScope.js";
import { normalizeRegistrationNumber } from "../../domain/vehicleNumber.js";
import { assertSiteAccess, assertWeighbridgeAccess } from "../../middleware/authorize.js";
import type { ActorContext } from "../shared/actor.js";
import { accessibleSiteWhere, accessibleWeighbridgeWhere } from "../shared/siteScope.js";
import type { DashboardFilterInput } from "./validators.js";

export function scopedTransactionWhere(
  actor: ActorContext,
  filters: DashboardFilterInput,
): Prisma.TransactionWhereInput {
  if (filters.siteId) {
    assertSiteAccess(actor.user, filters.siteId);
  }

  const where: Prisma.TransactionWhereInput = {
    organizationId: actor.user.organizationId,
    ...accessibleSiteWhere(actor),
    ...accessibleWeighbridgeWhere(actor),
  };

  if (filters.siteId) {
    where.siteId = filters.siteId;
  }
  if (filters.weighbridgeId) {
    assertWeighbridgeAccess(actor.user, filters.weighbridgeId);
    where.weighbridgeId = filters.weighbridgeId;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.materialId) {
    where.materialId = filters.materialId;
  }
  if (filters.supplierId) {
    where.supplierId = filters.supplierId;
  }
  if (filters.from || filters.to) {
    where.arrivedAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters.vehicle) {
    const registration = normalizeRegistrationNumber(filters.vehicle);
    where.OR = [
      { referenceNumber: { contains: filters.vehicle.toUpperCase() } },
      ...(registration === ""
        ? []
        : [{ vehicle: { registrationNumber: { contains: registration } } }]),
    ];
  }
  if (filters.workflowCode) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { workflowDefinition: { is: { code: filters.workflowCode } } },
          {
            workflowSnapshot: {
              path: ["workflow", "code"],
              equals: filters.workflowCode,
            },
          },
        ],
      },
    ];
  }

  return where;
}

export function liveWhere(base: Prisma.TransactionWhereInput): Prisma.TransactionWhereInput {
  return {
    AND: [base, { status: { in: LIVE_TRANSACTION_STATUSES } }],
  };
}

export function pendingUnloadingWhere(base: Prisma.TransactionWhereInput): Prisma.TransactionWhereInput {
  return {
    AND: [
      base,
      {
        OR: [
          { status: { in: PENDING_UNLOADING_STATUSES } },
          {
            AND: [
              {
                unloading: {
                  is: { status: { in: [UnloadingStatus.NOT_STARTED, UnloadingStatus.IN_PROGRESS] } },
                },
              },
              { status: { notIn: CLOSED_TRANSACTION_STATUSES } },
            ],
          },
        ],
      },
    ],
  };
}

export function exceptionWhere(base: Prisma.TransactionWhereInput): Prisma.TransactionWhereInput {
  return {
    AND: [
      base,
      {
        OR: [
          { status: { in: EXCEPTION_LIST_STATUSES } },
          {
            AND: [
              { documents: { some: { status: DocumentStatus.REJECTED } } },
              { status: { notIn: [TransactionStatus.COMPLETED, TransactionStatus.CANCELLED] } },
            ],
          },
        ],
      },
    ],
  };
}

export function exceptionFamilyWhere(
  base: Prisma.TransactionWhereInput,
  family?: DashboardFilterInput["exceptionFamily"],
): Prisma.TransactionWhereInput {
  const scoped = exceptionWhere(base);
  if (family === "WEIGHT_EXCEPTION") {
    return { AND: [scoped, { status: TransactionStatus.EXCEPTION }] };
  }
  if (family === "DOCUMENT_EXCEPTION") {
    return {
      AND: [
        base,
        {
          OR: [
            { documents: { some: { status: DocumentStatus.REJECTED } } },
            { status: TransactionStatus.DOCUMENT_PENDING },
          ],
        },
      ],
    };
  }
  if (family === "WORKFLOW_EXCEPTION") {
    return {
      AND: [
        scoped,
        { status: { in: [TransactionStatus.ON_HOLD, TransactionStatus.REJECTED] } },
      ],
    };
  }
  return scoped;
}

export function completedWhere(base: Prisma.TransactionWhereInput): Prisma.TransactionWhereInput {
  return {
    AND: [base, { status: TransactionStatus.COMPLETED }],
  };
}
