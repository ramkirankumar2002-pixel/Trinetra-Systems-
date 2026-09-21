export const OPERATION_MODES = ["SIMULATION", "PILOT", "PRODUCTION"] as const;
export type OperationModeValue = (typeof OPERATION_MODES)[number];

export function isOperationMode(value: string): value is OperationModeValue {
  return (OPERATION_MODES as readonly string[]).includes(value);
}

export function isPilotOrSimulation(mode: OperationModeValue): boolean {
  return mode === "PILOT" || mode === "SIMULATION";
}

export function operationModeLabel(mode: OperationModeValue): string {
  switch (mode) {
    case "SIMULATION":
      return "SIMULATED";
    case "PILOT":
      return "PILOT";
    case "PRODUCTION":
      return "PRODUCTION";
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
