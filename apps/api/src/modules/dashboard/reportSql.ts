import { Prisma } from "@prisma/client";
import { prisma } from "../../db/client.js";
import { normalizeRegistrationNumber } from "../../domain/vehicleNumber.js";
import { accessibleSiteIds } from "../shared/siteScope.js";
import type { ActorContext } from "../shared/actor.js";
import type { DashboardFilterInput } from "./validators.js";

type DailyAggregateRow = {
  day: string;
  transaction_count: bigint;
  net_kg: Prisma.Decimal | null;
};

type MaterialWeightRow = {
  materialId: string | null;
  kind: string;
  totalKg: Prisma.Decimal | null;
};

type DurationRow = {
  weighbridgeId: string | null;
  sample_count: bigint;
  avg_ms: Prisma.Decimal | null;
};

export async function sqlDailyTransactionAggregates(
  actor: ActorContext,
  filters: DashboardFilterInput,
  timeZone: string,
): Promise<Array<{ day: string; transactionCount: number; netWeightKg: string }>> {
  const parts = transactionFilterSql(actor, filters);
  const rows = await prisma.$queryRaw<DailyAggregateRow[]>`
    SELECT
      to_char((t."arrivedAt" AT TIME ZONE ${timeZone})::date, 'YYYY-MM-DD') AS day,
      COUNT(*)::bigint AS transaction_count,
      SUM(CASE WHEN t.status = 'COMPLETED' THEN t."netWeightKg" ELSE 0 END) AS net_kg
    FROM "Transaction" t
    WHERE ${parts}
    GROUP BY 1
    ORDER BY 1
  `;
  return rows.map((row) => ({
    day: row.day,
    transactionCount: Number(row.transaction_count),
    netWeightKg: row.net_kg?.toString() ?? "0",
  }));
}

export async function sqlWeighmentTotalsByMaterial(
  actor: ActorContext,
  filters: DashboardFilterInput,
): Promise<Map<string, { gross: string; tare: string }>> {
  const parts = transactionFilterSql(actor, filters, "t");
  const rows = await prisma.$queryRaw<MaterialWeightRow[]>`
    SELECT t."materialId" AS "materialId", w.kind AS kind, SUM(w."weightKg") AS "totalKg"
    FROM "Weighment" w
    INNER JOIN "Transaction" t ON t.id = w."transactionId"
    WHERE w.kind IN ('GROSS', 'TARE')
      AND ${parts}
    GROUP BY t."materialId", w.kind
  `;
  const totals = new Map<string, { gross: string; tare: string }>();
  for (const row of rows) {
    const key = row.materialId ?? "none";
    const current = totals.get(key) ?? { gross: "0", tare: "0" };
    if (row.kind === "GROSS") {
      current.gross = row.totalKg?.toString() ?? "0";
    } else {
      current.tare = row.totalKg?.toString() ?? "0";
    }
    totals.set(key, current);
  }
  return totals;
}

export async function sqlAverageTransactionDurationByWeighbridge(
  actor: ActorContext,
  filters: DashboardFilterInput,
): Promise<Map<string, { sampleCount: number; avgMs: number }>> {
  const parts = transactionFilterSql(actor, filters);
  const rows = await prisma.$queryRaw<DurationRow[]>`
    SELECT
      t."weighbridgeId" AS "weighbridgeId",
      COUNT(*)::bigint AS sample_count,
      AVG(EXTRACT(EPOCH FROM (t."completedAt" - t."arrivedAt")) * 1000) AS avg_ms
    FROM "Transaction" t
    WHERE t."completedAt" IS NOT NULL
      AND t."arrivedAt" IS NOT NULL
      AND t."completedAt" >= t."arrivedAt"
      AND ${parts}
    GROUP BY t."weighbridgeId"
  `;
  return durationMap(rows);
}

export async function sqlAverageWeighmentDurationByWeighbridge(
  actor: ActorContext,
  filters: DashboardFilterInput,
): Promise<Map<string, { sampleCount: number; avgMs: number }>> {
  const parts = transactionFilterSql(actor, filters, "t");
  const rows = await prisma.$queryRaw<DurationRow[]>`
    SELECT
      w."weighbridgeId" AS "weighbridgeId",
      COUNT(*)::bigint AS sample_count,
      AVG(EXTRACT(EPOCH FROM (w.max_at - w.min_at)) * 1000) AS avg_ms
    FROM (
      SELECT
        COALESCE(wm."weighbridgeId", t."weighbridgeId") AS "weighbridgeId",
        MIN(wm."recordedAt") AS min_at,
        MAX(wm."recordedAt") AS max_at
      FROM "Weighment" wm
      INNER JOIN "Transaction" t ON t.id = wm."transactionId"
      WHERE ${parts}
      GROUP BY wm."transactionId", COALESCE(wm."weighbridgeId", t."weighbridgeId")
      HAVING COUNT(*) >= 2 AND MAX(wm."recordedAt") > MIN(wm."recordedAt")
    ) w
    GROUP BY w."weighbridgeId"
  `;
  return durationMap(rows);
}

function durationMap(rows: DurationRow[]): Map<string, { sampleCount: number; avgMs: number }> {
  const map = new Map<string, { sampleCount: number; avgMs: number }>();
  for (const row of rows) {
    if (row.weighbridgeId === null || row.avg_ms === null) {
      continue;
    }
    map.set(row.weighbridgeId, {
      sampleCount: Number(row.sample_count),
      avgMs: Number(row.avg_ms),
    });
  }
  return map;
}

type StageAverageRow = { sample_count: bigint; avg_ms: Prisma.Decimal | null };

export async function sqlStageAverageMs(
  actor: ActorContext,
  filters: DashboardFilterInput,
  stage: "identification" | "document" | "approval" | "unloading" | "final_weighment" | "total",
): Promise<{ sampleCount: number; avgMs: number | null }> {
  const parts = transactionFilterSql(actor, filters, "t");
  const rows =
    stage === "identification"
      ? await prisma.$queryRaw<StageAverageRow[]>`
          SELECT COUNT(*)::bigint AS sample_count,
            AVG(EXTRACT(EPOCH FROM (ident.min_at - t."arrivedAt")) * 1000) AS avg_ms
          FROM "Transaction" t
          INNER JOIN (
            SELECT "transactionId", MIN("createdAt") AS min_at
            FROM "VehicleIdentificationEvent"
            WHERE outcome IN ('CONFIRMED', 'MANUAL') AND "transactionId" IS NOT NULL
            GROUP BY "transactionId"
          ) ident ON ident."transactionId" = t.id
          WHERE ident.min_at >= t."arrivedAt" AND ${parts}
        `
      : stage === "document"
        ? await prisma.$queryRaw<StageAverageRow[]>`
            SELECT COUNT(*)::bigint AS sample_count,
              AVG(EXTRACT(EPOCH FROM (d."updatedAt" - d."createdAt")) * 1000) AS avg_ms
            FROM "Document" d
            INNER JOIN "Transaction" t ON t.id = d."transactionId"
            WHERE d.status IN ('VERIFIED', 'REJECTED')
              AND d."updatedAt" > d."createdAt"
              AND ${parts}
          `
        : stage === "approval"
          ? await prisma.$queryRaw<StageAverageRow[]>`
              SELECT COUNT(*)::bigint AS sample_count,
                AVG(EXTRACT(EPOCH FROM (a."decidedAt" - a."requestedAt")) * 1000) AS avg_ms
              FROM "Approval" a
              INNER JOIN "Transaction" t ON t.id = a."transactionId"
              WHERE a."decidedAt" IS NOT NULL
                AND a."decidedAt" >= a."requestedAt"
                AND ${parts}
            `
          : stage === "unloading"
            ? await prisma.$queryRaw<StageAverageRow[]>`
                SELECT COUNT(*)::bigint AS sample_count,
                  AVG(EXTRACT(EPOCH FROM (u."completedAt" - u."startedAt")) * 1000) AS avg_ms
                FROM "Unloading" u
                INNER JOIN "Transaction" t ON t.id = u."transactionId"
                WHERE u."startedAt" IS NOT NULL
                  AND u."completedAt" IS NOT NULL
                  AND u."completedAt" >= u."startedAt"
                  AND ${parts}
              `
            : stage === "final_weighment"
              ? await prisma.$queryRaw<StageAverageRow[]>`
                  SELECT COUNT(*)::bigint AS sample_count,
                    AVG(EXTRACT(EPOCH FROM (tare."recordedAt" - gross."recordedAt")) * 1000) AS avg_ms
                  FROM "Weighment" gross
                  INNER JOIN "Weighment" tare ON tare."transactionId" = gross."transactionId"
                  INNER JOIN "Transaction" t ON t.id = gross."transactionId"
                  WHERE gross.kind = 'GROSS'
                    AND tare.kind = 'TARE'
                    AND tare."recordedAt" >= gross."recordedAt"
                    AND ${parts}
                `
              : await prisma.$queryRaw<StageAverageRow[]>`
                  SELECT COUNT(*)::bigint AS sample_count,
                    AVG(EXTRACT(EPOCH FROM (t."completedAt" - t."arrivedAt")) * 1000) AS avg_ms
                  FROM "Transaction" t
                  WHERE t."completedAt" IS NOT NULL
                    AND t."completedAt" >= t."arrivedAt"
                    AND ${parts}
                `;
  const row = rows[0];
  const sampleCount = Number(row?.sample_count ?? 0);
  if (sampleCount === 0 || row?.avg_ms === null || row?.avg_ms === undefined) {
    return { sampleCount: 0, avgMs: null };
  }
  return { sampleCount, avgMs: Number(row.avg_ms) };
}

function transactionFilterSql(
  actor: ActorContext,
  filters: DashboardFilterInput,
  alias = "t",
): Prisma.Sql {
  const siteIds = accessibleSiteIds(actor);
  const fragments: Prisma.Sql[] = [
    Prisma.sql`${Prisma.raw(`${alias}."organizationId"`)} = ${actor.user.organizationId}`,
  ];

  if (filters.siteId) {
    fragments.push(Prisma.sql`${Prisma.raw(`${alias}."siteId"`)} = ${filters.siteId}`);
  } else if (siteIds !== null) {
    if (siteIds.length === 0) {
      fragments.push(Prisma.sql`${Prisma.raw(`${alias}."siteId"`)} = ${"__none__"}`);
    } else {
      fragments.push(Prisma.sql`${Prisma.raw(`${alias}."siteId"`)} IN (${Prisma.join(siteIds)})`);
    }
  }

  if (filters.weighbridgeId) {
    fragments.push(Prisma.sql`${Prisma.raw(`${alias}."weighbridgeId"`)} = ${filters.weighbridgeId}`);
  }
  if (filters.status) {
    fragments.push(Prisma.sql`${Prisma.raw(`${alias}.status`)} = CAST(${filters.status} AS "TransactionStatus")`);
  }
  if (filters.materialId) {
    fragments.push(Prisma.sql`${Prisma.raw(`${alias}."materialId"`)} = ${filters.materialId}`);
  }
  if (filters.supplierId) {
    fragments.push(Prisma.sql`${Prisma.raw(`${alias}."supplierId"`)} = ${filters.supplierId}`);
  }
  if (filters.from) {
    fragments.push(Prisma.sql`${Prisma.raw(`${alias}."arrivedAt"`)} >= ${filters.from}`);
  }
  if (filters.to) {
    fragments.push(Prisma.sql`${Prisma.raw(`${alias}."arrivedAt"`)} <= ${filters.to}`);
  }
  if (filters.workflowCode) {
    fragments.push(Prisma.sql`(
      EXISTS (
        SELECT 1 FROM "WorkflowDefinition" wd
        WHERE wd.id = ${Prisma.raw(`${alias}."workflowDefinitionId"`)}
          AND wd.code = ${filters.workflowCode}
      )
      OR (${Prisma.raw(`${alias}."workflowSnapshot"`)} -> 'workflow' ->> 'code') = ${filters.workflowCode}
    )`);
  }
  if (filters.vehicle) {
    const reference = `%${filters.vehicle.toUpperCase()}%`;
    const registration = normalizeRegistrationNumber(filters.vehicle);
    if (registration === "") {
      fragments.push(Prisma.sql`${Prisma.raw(`${alias}."referenceNumber"`)} LIKE ${reference}`);
    } else {
      fragments.push(Prisma.sql`(
        ${Prisma.raw(`${alias}."referenceNumber"`)} LIKE ${reference}
        OR EXISTS (
          SELECT 1 FROM "Vehicle" v
          WHERE v.id = ${Prisma.raw(`${alias}."vehicleId"`)}
            AND v."registrationNumber" LIKE ${`%${registration}%`}
        )
      )`);
    }
  }

  return Prisma.join(fragments, " AND ");
}
