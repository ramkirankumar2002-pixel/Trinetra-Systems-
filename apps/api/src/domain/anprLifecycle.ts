import type { AnprDetectionLifecycle } from "@prisma/client";

export const IDENTIFICATION_OUTCOMES = [
  "MATCHED",
  "NO_MATCH",
  "CONFIRMED",
  "CORRECTED",
  "MANUAL",
  "REJECTED",
] as const;

export type IdentificationOutcome = (typeof IDENTIFICATION_OUTCOMES)[number];

const ALLOWED: Record<AnprDetectionLifecycle, AnprDetectionLifecycle[]> = {
  DETECTED: ["MATCHED", "NO_MATCH", "CONFIRMATION_REQUIRED", "CORRECTED", "REJECTED", "CONFIRMED"],
  MATCHED: ["CONFIRMATION_REQUIRED", "CONFIRMED", "CORRECTED", "REJECTED"],
  NO_MATCH: ["CORRECTED", "REJECTED", "CONFIRMATION_REQUIRED"],
  CONFIRMATION_REQUIRED: ["CONFIRMED", "CORRECTED", "REJECTED"],
  CORRECTED: ["MATCHED", "NO_MATCH", "CONFIRMATION_REQUIRED", "CONFIRMED", "REJECTED"],
  CONFIRMED: [],
  REJECTED: [],
};

export function canAdvanceAnprLifecycle(
  from: AnprDetectionLifecycle,
  to: AnprDetectionLifecycle,
): boolean {
  return ALLOWED[from].includes(to);
}

export function assertAnprLifecycle(
  from: AnprDetectionLifecycle,
  to: AnprDetectionLifecycle,
): string | null {
  if (canAdvanceAnprLifecycle(from, to)) {
    return null;
  }
  return `ANPR result cannot move from ${from} to ${to}`;
}
