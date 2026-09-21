import { categoryFromHttpStatus, type ErrorCategory } from "../domain/observability/errorCategory.js";

export class HttpError extends Error {
  readonly status: number;
  readonly category: ErrorCategory;

  constructor(status: number, message: string, category: ErrorCategory = categoryFromHttpStatus(status)) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.category = category;
  }
}
