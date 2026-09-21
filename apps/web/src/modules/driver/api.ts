import { apiRequest } from "../../shared/api/client.ts";
import type { PublicWeighbridge } from "../weighbridge/api.ts";
import type { DriverLocale } from "./translations.ts";

export type DriverModeConfig = {
  driverModeEnabled: boolean;
  defaultLanguage: DriverLocale;
  languages: DriverLocale[];
  voiceEnabled: boolean;
  audioEnabled: boolean;
};

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

export type DriverAuditAction =
  | "DRIVER_MODE_OPENED"
  | "DRIVER_LANGUAGE_CHANGED"
  | "DRIVER_VOICE_ACCEPTED"
  | "DRIVER_VOICE_REJECTED"
  | "DRIVER_VEHICLE_CONFIRMED"
  | "DRIVER_DOCUMENT_SCAN_REQUESTED"
  | "DRIVER_WORKFLOW_ACTION"
  | "DRIVER_UNLOADING_STARTED"
  | "DRIVER_UNLOADING_COMPLETED"
  | "DRIVER_TRANSACTION_COMPLETED"
  | "DRIVER_EXCEPTION_ACKNOWLEDGED"
  | "DRIVER_AUDIO_TOGGLED";

export function getDriverContext(): Promise<DriverContext> {
  return apiRequest<DriverContext>("/api/v1/driver/context");
}

export async function recordDriverEvent(
  action: DriverAuditAction,
  entityId = "session",
  metadata?: Record<string, string | number | boolean | null>,
): Promise<void> {
  try {
    await apiRequest<void>("/api/v1/driver/events", {
      method: "POST",
      body: JSON.stringify({
        action,
        entityType: "DriverMode",
        entityId,
        ...(metadata === undefined ? {} : { metadata }),
      }),
    });
  } catch (error) {
    console.error("Driver audit event failed", action, error);
  }
}
