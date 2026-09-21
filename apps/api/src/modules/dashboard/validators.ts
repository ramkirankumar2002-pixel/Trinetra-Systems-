import { TransactionStatus, WeighmentKind, WeighmentSource } from "@prisma/client";
import {
  parseReportDatePreset,
  resolveReportDates,
  type ReportDatePreset,
  type ResolvedReportDates,
} from "../../domain/reporting/datePresets.js";
import { isExceptionFamily, type ExceptionFamily } from "../../domain/reporting/exceptionFamilies.js";
import { zonedDayBounds } from "../../domain/siteDay.js";
import { isWeightQuality, type WeightQuality } from "../../domain/weightQuality.js";
import { parsePagination } from "../../domain/pagination.js";
import { HttpError } from "../../lib/httpError.js";
import { parseOptionalDate, parseStatusFilter } from "../transactions/validators.js";

export type DashboardFilterInput = {
  from?: Date | undefined;
  to?: Date | undefined;
  siteId?: string | undefined;
  weighbridgeId?: string | undefined;
  status?: TransactionStatus | undefined;
  vehicle?: string | undefined;
  materialId?: string | undefined;
  workflowCode?: string | undefined;
  supplierId?: string | undefined;
  datePreset?: ReportDatePreset | undefined;
  source?: WeighmentSource | undefined;
  weighmentKind?: WeighmentKind | undefined;
  exceptionFamily?: ExceptionFamily | undefined;
  stability?: WeightQuality | undefined;
};

export function parseOptionalId(value: unknown, field: string): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `${field} is invalid`);
  }
  return value.trim();
}

export function parseOptionalText(value: unknown): string | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "Search text is invalid");
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function parseDateBound(
  value: unknown,
  field: "from" | "to",
  timeZone: string,
): Date | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be a date`);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const bounds = zonedDayBounds(timeZone, value);
    return field === "from" ? bounds.start : new Date(bounds.end.getTime() - 1);
  }

  return parseOptionalDate(value, field);
}

export function parseDashboardFilters(
  query: Record<string, unknown>,
  timeZone: string,
): DashboardFilterInput {
  return parseReportFilters(query, timeZone).filters;
}

export function parseReportFilters(
  query: Record<string, unknown>,
  timeZone: string,
  now?: Date,
): { filters: DashboardFilterInput; dates: ResolvedReportDates } {
  const preset = parseReportDatePreset(query.datePreset ?? query.preset);
  const parsedFrom = parseDateBound(query.from, "from", timeZone);
  const parsedTo = parseDateBound(query.to, "to", timeZone);
  const dates = resolveReportDates({
    ...(preset === undefined ? {} : { preset }),
    ...(parsedFrom === undefined ? {} : { from: parsedFrom }),
    ...(parsedTo === undefined ? {} : { to: parsedTo }),
    timeZone,
    ...(now === undefined ? {} : { now }),
  });

  if (dates.from && dates.to && dates.from.getTime() > dates.to.getTime()) {
    throw new HttpError(400, "from must be earlier than to");
  }

  const siteId = parseOptionalId(query.siteId, "site");
  const weighbridgeId = parseOptionalId(query.weighbridgeId, "weighbridge");
  const status = parseStatusFilter(query.status);
  const vehicle = parseOptionalText(query.vehicle ?? query.q);
  const materialId = parseOptionalId(query.materialId, "material");
  const workflowCode = parseOptionalText(query.workflowCode ?? query.workflowType);
  const supplierId = parseOptionalId(query.supplierId, "supplier");
  const source = parseWeighmentSource(query.source);
  const weighmentKind = parseWeighmentKind(query.kind ?? query.weighmentType);
  const exceptionFamily = parseExceptionFamily(query.exceptionFamily ?? query.exceptionStatus);
  const stability = parseStability(query.stability);

  const filters: DashboardFilterInput = {
    ...(dates.from === undefined ? {} : { from: dates.from }),
    ...(dates.to === undefined ? {} : { to: dates.to }),
    ...(siteId === undefined ? {} : { siteId }),
    ...(weighbridgeId === undefined ? {} : { weighbridgeId }),
    ...(status === undefined ? {} : { status }),
    ...(vehicle === undefined ? {} : { vehicle }),
    ...(materialId === undefined ? {} : { materialId }),
    ...(workflowCode === undefined ? {} : { workflowCode }),
    ...(supplierId === undefined ? {} : { supplierId }),
    ...(preset === undefined ? {} : { datePreset: preset }),
    ...(source === undefined ? {} : { source }),
    ...(weighmentKind === undefined ? {} : { weighmentKind }),
    ...(exceptionFamily === undefined ? {} : { exceptionFamily }),
    ...(stability === undefined ? {} : { stability }),
  };

  return { filters, dates };
}

export function parseDashboardPagination(query: Record<string, unknown>) {
  return parsePagination(query, { pageSize: 20, maxPageSize: 50 });
}

function parseWeighmentSource(value: unknown): WeighmentSource | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "source is invalid");
  }
  const allowed = Object.values(WeighmentSource);
  if (!allowed.includes(value as WeighmentSource)) {
    throw new HttpError(400, "source is invalid");
  }
  return value as WeighmentSource;
}

function parseWeighmentKind(value: unknown): WeighmentKind | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "weighment type is invalid");
  }
  const allowed = Object.values(WeighmentKind);
  if (!allowed.includes(value as WeighmentKind)) {
    throw new HttpError(400, "weighment type is invalid");
  }
  return value as WeighmentKind;
}

function parseExceptionFamily(value: unknown): ExceptionFamily | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !isExceptionFamily(value)) {
    throw new HttpError(400, "exception status is invalid");
  }
  return value;
}

function parseStability(value: unknown): WeightQuality | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value !== "string" || !isWeightQuality(value)) {
    throw new HttpError(400, "stability is invalid");
  }
  return value;
}
