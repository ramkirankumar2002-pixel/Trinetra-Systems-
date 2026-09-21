export const LOCAL_TRANSACTION_STATES = [
  "IDENTIFIED",
  "GROSS_CAPTURED",
  "TARE_CAPTURED",
  "PAUSED_APPROVAL",
  "LOCAL_COMPLETED",
] as const;
export type LocalTransactionState = (typeof LOCAL_TRANSACTION_STATES)[number];

export function isLocalTransactionState(value: string): value is LocalTransactionState {
  return (LOCAL_TRANSACTION_STATES as readonly string[]).includes(value);
}

export type DependencyEvent = {
  eventId: string;
  eventType: string;
  localTransactionId: string | null;
  dependsOn: string[];
};

export type DependencyResolution = {
  ready: boolean;
  missing: string[];
};

export function requiredDependencies(event: {
  eventType: string;
  localTransactionId?: string | null;
  dependsOn?: string[];
  payload?: Record<string, unknown>;
}): string[] {
  const explicit = event.dependsOn ?? [];
  if (explicit.length > 0) {
    return [...new Set(explicit)];
  }
  const fromPayload = event.payload?.dependsOn;
  if (Array.isArray(fromPayload)) {
    return fromPayload.filter((item): item is string => typeof item === "string" && item !== "");
  }
  return [];
}

export function resolveDependencies(
  event: DependencyEvent,
  syncedEventIds: ReadonlySet<string>,
): DependencyResolution {
  const missing = event.dependsOn.filter((id) => !syncedEventIds.has(id));
  return { ready: missing.length === 0, missing };
}

export function defaultDependsOn(input: {
  eventType: string;
  localTransactionId: string | null;
  priorByTransaction: Partial<Record<string, string>>;
}): string[] {
  if (!input.localTransactionId) {
    return [];
  }
  const created = input.priorByTransaction.LOCAL_TRANSACTION_CREATED;
  switch (input.eventType) {
    case "DEVICE_ANPR_DETECTION":
    case "DEVICE_SCAN_COMPLETED":
    case "DEVICE_WEIGHT_READING":
    case "LOCAL_WEIGHT_ANOMALY":
    case "LOCAL_FILE_CAPTURED":
      return created ? [created] : [];
    case "LOCAL_TRANSACTION_STATE":
      return compact([
        created,
        input.priorByTransaction.GROSS,
        input.priorByTransaction.TARE,
      ]);
    default:
      return [];
  }
}

function compact(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => typeof value === "string" && value !== "");
}
