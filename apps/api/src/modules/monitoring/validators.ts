import type { Pagination } from "../../domain/pagination.js";
import { parsePagination } from "../../domain/pagination.js";

export function parseIncidentQuery(query: Record<string, unknown>): {
  pagination: Pagination;
  status?: string;
} {
  const pagination = parsePagination(query, { pageSize: 20, maxPageSize: 50 });
  if (typeof query.status === "string" && query.status !== "") {
    return { pagination, status: query.status };
  }
  return { pagination };
}

export function wantsPrometheus(query: Record<string, unknown>): boolean {
  return query.format === "prometheus";
}
