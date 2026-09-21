import { HttpError } from "../lib/httpError.js";

export type Pagination = {
  page: number;
  pageSize: number;
  skip: number;
};

export function parsePagination(
  query: { page?: unknown; pageSize?: unknown },
  defaults: { pageSize: number; maxPageSize: number } = { pageSize: 20, maxPageSize: 50 },
): Pagination {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = parsePositiveInt(query.pageSize, defaults.pageSize);

  if (pageSize > defaults.maxPageSize) {
    throw new HttpError(400, `pageSize cannot exceed ${defaults.maxPageSize}`);
  }

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }

  const raw = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isInteger(raw) || raw <= 0) {
    throw new HttpError(400, "page and pageSize must be positive integers");
  }

  return raw;
}
