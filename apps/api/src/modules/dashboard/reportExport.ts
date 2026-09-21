import { isReportId, type ReportId } from "../../domain/reporting/catalog.js";
import { EMPTY_REPORT_MESSAGE } from "../../domain/reporting/datePresets.js";
import { HttpError } from "../../lib/httpError.js";
import { AUDIT_ACTIONS, writeAudit } from "../audit/service.js";
import { toCsv } from "../reliability/export.js";
import type { ActorContext } from "../shared/actor.js";
import {
  reportAnomalies,
  reportApprovals,
  reportDaily,
  reportExceptionsAnalytics,
  reportMaterialsAnalytics,
  reportSuppliers,
  reportSync,
  reportVehiclesAnalytics,
  reportWeighbridges,
  reportWeighments,
  reportWorkflow,
} from "./reportAnalytics.js";
import { reportTransactions } from "./service.js";
import { parseReportFilters } from "./validators.js";
import { resolveReportTimezone } from "./timezone.js";

const EXPORT_LIMIT = 2000;

export async function exportReport(
  actor: ActorContext,
  reportId: string,
  query: Record<string, unknown>,
): Promise<{ filename: string; csv: string }> {
  if (!isReportId(reportId)) {
    throw new HttpError(400, "Unknown report");
  }
  const timeZone = await resolveReportTimezone(actor, query);
  const parsed = parseReportFilters(query, timeZone);
  const csv = await csvForReport(actor, reportId, query);
  const rowCount = Math.max(0, csv.split("\n").length - 1);

  await writeAudit({
    organizationId: actor.user.organizationId,
    actorUserId: actor.user.id,
    action: AUDIT_ACTIONS.REPORT_EXPORTED,
    entityType: "Report",
    entityId: reportId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: {
      reportId,
      format: "csv",
      rowCount,
      from: parsed.dates.fromYmd ?? null,
      to: parsed.dates.toYmd ?? null,
      siteId: parsed.filters.siteId ?? null,
    },
  });

  return {
    filename: `trinetra-${reportId}-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
  };
}

async function csvForReport(actor: ActorContext, reportId: ReportId, query: Record<string, unknown>): Promise<string> {
  const exportQuery = { ...query, page: "1", pageSize: "50" };
  switch (reportId) {
    case "transactions": {
      const result = await reportTransactions(actor, exportQuery, { take: EXPORT_LIMIT });
      const rows = result.items.slice(0, EXPORT_LIMIT);
      if (rows.length === 0) {
        return EMPTY_REPORT_MESSAGE;
      }
      return toCsv(
        [
          "transaction",
          "vehicle",
          "material",
          "supplier",
          "grossKg",
          "tareKg",
          "netKg",
          "status",
          "createdAt",
          "completedAt",
          "duration",
        ],
        rows.map((row) => [
          row.referenceNumber,
          row.vehicleNumber ?? "",
          row.material?.name ?? "",
          row.supplier?.name ?? "",
          row.grossWeightKg ?? "",
          row.tareWeightKg ?? "",
          row.netWeightKg ?? "",
          row.status,
          row.createdAt,
          row.completedAt ?? "",
          row.durationLabel,
        ]),
      );
    }
    case "weighments": {
      const result = await reportWeighments(actor, exportQuery, { take: EXPORT_LIMIT });
      if (result.items.length === 0) {
        return EMPTY_REPORT_MESSAGE;
      }
      return toCsv(
        ["transaction", "vehicle", "weighbridge", "kind", "weightKg", "unit", "stability", "source", "recordedAt"],
        result.items.map((row) => [
          row.transaction,
          row.vehicleNumber ?? "",
          row.weighbridge?.code ?? "",
          row.kind,
          row.weightKg,
          row.unit,
          row.stability,
          row.source,
          row.recordedAt,
        ]),
      );
    }
    case "materials": {
      const result = await reportMaterialsAnalytics(actor, exportQuery);
      if (result.items.length === 0) {
        return EMPTY_REPORT_MESSAGE;
      }
      return toCsv(
        [
          "material",
          "transactions",
          "grossKg",
          "tareKg",
          "netKg",
          "workflowClassification",
          "configuredWorkflow",
          "site",
        ],
        result.items.map((row) => [
          row.material,
          String(row.transactionCount),
          row.totalGrossWeightKg,
          row.totalTareWeightKg,
          row.totalNetWeightKg,
          row.workflowClassification,
          row.configuredWorkflow,
          row.site,
        ]),
      );
    }
    case "vehicles": {
      const result = await reportVehiclesAnalytics(actor, exportQuery);
      if (result.items.length === 0) {
        return EMPTY_REPORT_MESSAGE;
      }
      return toCsv(
        ["vehicle", "transactions", "netKg", "firstTransaction", "lastTransaction"],
        result.items.map((row) => [
          row.vehicleNumber,
          String(row.transactionCount),
          row.totalNetWeightKg,
          row.firstTransactionAt ?? "",
          row.lastTransactionAt ?? "",
        ]),
      );
    }
    case "suppliers": {
      const result = await reportSuppliers(actor, exportQuery);
      if (result.items.length === 0) {
        return EMPTY_REPORT_MESSAGE;
      }
      return toCsv(
        ["supplier", "transactions", "netKg", "materials", "from", "to"],
        result.items.map((row) => [
          row.supplier,
          String(row.transactionCount),
          row.totalNetWeightKg,
          row.materials.join("; "),
          row.from ?? "",
          row.to ?? "",
        ]),
      );
    }
    case "weighbridges": {
      const result = await reportWeighbridges(actor, exportQuery);
      if (result.items.length === 0) {
        return EMPTY_REPORT_MESSAGE;
      }
      return toCsv(
        [
          "weighbridge",
          "processed",
          "completed",
          "exceptions",
          "weightAnomalies",
          "avgTransactionDuration",
          "avgWeighmentDuration",
          "offlineSnapshots",
          "deviceFailures",
        ],
        result.items.map((row) => [
          row.weighbridge,
          String(row.transactionsProcessed),
          String(row.completedTransactions),
          String(row.exceptions),
          String(row.weightAnomalies),
          row.averageTransactionDuration.label,
          row.averageWeighmentDuration.label,
          String(row.offlineGatewaySnapshots),
          String(row.deviceCommunicationFailures),
        ]),
      );
    }
    case "workflow": {
      const result = await reportWorkflow(actor, exportQuery);
      return toCsv(
        ["stage", "sampleCount", "averageDuration", "data"],
        result.items.map((row) => [row.stage, String(row.sampleCount), row.averageDuration, row.data]),
      );
    }
    case "approvals": {
      const result = await reportApprovals(actor, exportQuery);
      if (result.meta.empty) {
        return EMPTY_REPORT_MESSAGE;
      }
      return toCsv(
        ["metric", "value"],
        [
          ["pending", String(result.pending)],
          ["approved", String(result.approved)],
          ["rejected", String(result.rejected)],
          ["averageApprovalTime", result.averageApprovalTime.label],
          ...result.byDepartment.map((row) => [`department:${row.department}`, String(row.count)]),
          ...result.byWorkflowStep.map((row) => [`workflow:${row.workflowStep}`, String(row.count)]),
        ],
      );
    }
    case "exceptions": {
      const result = await reportExceptionsAnalytics(actor, exportQuery, { take: EXPORT_LIMIT });
      if (result.items.length === 0) {
        return EMPTY_REPORT_MESSAGE;
      }
      return toCsv(
        ["exceptionType", "transaction", "site", "weighbridge", "createdAt", "status", "resolutionTime", "resolutionStatus"],
        result.items.map((row) => [
          row.exceptionType,
          row.transaction ?? "",
          row.site,
          row.weighbridge ?? "",
          row.createdAt,
          row.status,
          row.resolutionTime,
          row.resolutionStatus,
        ]),
      );
    }
    case "anomalies": {
      const result = await reportAnomalies(actor, { ...exportQuery, pageSize: "100" });
      if (result.items.length === 0) {
        return EMPTY_REPORT_MESSAGE;
      }
      return toCsv(
        ["label", "type", "transaction", "device", "observedKg", "timestamp", "severity", "status", "resolution"],
        result.items.map((row) => [
          row.label,
          row.type,
          row.transaction ?? "",
          row.deviceId ?? "",
          row.observedWeightKg ?? "",
          row.timestamp,
          row.severity,
          row.status,
          String(row.resolution),
        ]),
      );
    }
    case "sync": {
      const result = await reportSync(actor, exportQuery);
      if (result.items.length === 0) {
        return EMPTY_REPORT_MESSAGE;
      }
      return toCsv(
        [
          "gateway",
          "connectivity",
          "queued",
          "generated",
          "synced",
          "failed",
          "deadLetter",
          "offlineDuration",
          "lastSuccessfulSyncAt",
        ],
        result.items.map((row) => [
          row.gateway,
          row.connectivityState,
          String(row.queued),
          String(row.eventsGenerated),
          String(row.eventsSynchronized),
          String(row.failedEvents),
          String(row.deadLetterEvents),
          row.offlineDuration.label,
          row.lastSuccessfulSyncAt ?? "",
        ]),
      );
    }
    case "daily": {
      const result = await reportDaily(actor, exportQuery);
      if (result.meta.empty) {
        return EMPTY_REPORT_MESSAGE;
      }
      return toCsv(
        ["metric", "value"],
        [
          ["date", result.date ?? ""],
          ["vehiclesProcessed", String(result.vehiclesProcessed ?? "")],
          ["totalTransactions", String(result.totalTransactions ?? "")],
          ["completed", String(result.completed ?? "")],
          ["pending", String(result.pending ?? "")],
          ["exceptions", String(result.exceptions ?? "")],
          ["totalNetWeightKg", result.totalNetWeightKg ?? ""],
          ["approvals", String(result.approvals ?? "")],
          ["weightAnomalies", String(result.weightAnomalies ?? "")],
          ["offlineEvents", String(result.offlineEvents ?? "")],
        ],
      );
    }
    default: {
      const _exhaustive: never = reportId;
      return _exhaustive;
    }
  }
}
