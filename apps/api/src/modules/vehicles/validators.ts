import { env } from "../../config/env.js";
import {
  displayRegistrationNumber,
  normalizeRegistrationNumber,
  validateRegistrationNumber,
} from "../../domain/vehicleNumber.js";
import { HttpError } from "../../lib/httpError.js";

export type VehicleWriteInput = {
  registrationNumber: string;
  displayRegistrationNumber: string;
  vehicleType?: string | undefined;
  transporterName?: string | undefined;
  supplierId?: string | undefined;
  notes?: string | undefined;
};

export function parseVehicleCreateInput(body: unknown): VehicleWriteInput {
  return parseVehicleWriteInput(body, true);
}

export function parseVehicleUpdateInput(body: unknown): Partial<VehicleWriteInput> {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Invalid request");
  }

  const record = body as Record<string, unknown>;
  const result: Partial<VehicleWriteInput> = {};

  if ("registrationNumber" in record) {
    const parsed = parseVehicleWriteInput(record, true);
    result.registrationNumber = parsed.registrationNumber;
    result.displayRegistrationNumber = parsed.displayRegistrationNumber;
  }

  if ("vehicleType" in record) {
    result.vehicleType = optionalText(record.vehicleType, "vehicleType");
  }

  if ("transporterName" in record) {
    result.transporterName = optionalText(record.transporterName, "transporterName");
  }

  if ("supplierId" in record) {
    result.supplierId = optionalId(record.supplierId, "supplierId");
  }

  if ("notes" in record) {
    result.notes = optionalText(record.notes, "notes", 500);
  }

  return result;
}

function parseVehicleWriteInput(body: unknown, registrationRequired: boolean): VehicleWriteInput {
  if (typeof body !== "object" || body === null) {
    throw new HttpError(400, "Invalid request");
  }

  const record = body as Record<string, unknown>;
  const rawRegistration = typeof record.registrationNumber === "string" ? record.registrationNumber : "";
  const normalized = normalizeRegistrationNumber(rawRegistration);
  const registrationError = validateRegistrationNumber(normalized, {
    minLength: env.vehicleRegMinLength,
    maxLength: env.vehicleRegMaxLength,
  });

  if (registrationRequired && registrationError) {
    throw new HttpError(400, registrationError);
  }

  const displayRaw =
    typeof record.displayRegistrationNumber === "string" && record.displayRegistrationNumber.trim() !== ""
      ? record.displayRegistrationNumber
      : rawRegistration;

  return {
    registrationNumber: normalized,
    displayRegistrationNumber: displayRegistrationNumber(displayRaw),
    vehicleType: optionalText(record.vehicleType, "vehicleType"),
    transporterName: optionalText(record.transporterName, "transporterName"),
    supplierId: optionalId(record.supplierId, "supplierId"),
    notes: optionalText(record.notes, "notes", 500),
  };
}

function optionalText(value: unknown, field: string, max = 80): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${field} must be text`);
  }

  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new HttpError(400, `${field} is too long`);
  }

  return trimmed;
}

function optionalId(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpError(400, `${field} is invalid`);
  }

  return value;
}
