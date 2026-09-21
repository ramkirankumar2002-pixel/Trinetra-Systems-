export const HARDWARE_PROTOCOL_READINESS = [
  "SIMULATOR",
  "PROTOCOL_DETAILS_REQUIRED",
  "PROTOCOL_TEST_ONLY",
  "DOCUMENTED",
] as const;
export type HardwareProtocolReadinessValue = (typeof HARDWARE_PROTOCOL_READINESS)[number];

export const HARDWARE_ADAPTER_KEYS = ["simulator", "protocol-test", "undeployed"] as const;
export type HardwareAdapterKey = (typeof HARDWARE_ADAPTER_KEYS)[number];

export function isHardwareProtocolReadiness(value: string): value is HardwareProtocolReadinessValue {
  return (HARDWARE_PROTOCOL_READINESS as readonly string[]).includes(value);
}

export function isHardwareAdapterKey(value: string): value is HardwareAdapterKey {
  return (HARDWARE_ADAPTER_KEYS as readonly string[]).includes(value);
}

export function resolveProtocolReadiness(input: {
  provider?: string | null | undefined;
  manufacturer?: string | null | undefined;
  model?: string | null | undefined;
  protocol?: string | null | undefined;
  requested?: string | null | undefined;
}): HardwareProtocolReadinessValue {
  if (input.requested && isHardwareProtocolReadiness(input.requested)) {
    if (input.requested === "DOCUMENTED") {
      return "PROTOCOL_DETAILS_REQUIRED";
    }
    return input.requested;
  }
  const provider = (input.provider ?? "SIMULATOR").toUpperCase();
  if (provider === "SIMULATOR" || provider === "") {
    return "SIMULATOR";
  }
  return "PROTOCOL_DETAILS_REQUIRED";
}

export function resolveAdapterKey(input: {
  adapterKey?: string | null | undefined;
  protocolReadiness: HardwareProtocolReadinessValue;
  provider?: string | null | undefined;
}): HardwareAdapterKey {
  if (input.adapterKey && isHardwareAdapterKey(input.adapterKey)) {
    return input.adapterKey;
  }
  if (input.protocolReadiness === "SIMULATOR" || (input.provider ?? "").toUpperCase() === "SIMULATOR") {
    return "simulator";
  }
  if (input.protocolReadiness === "PROTOCOL_TEST_ONLY") {
    return "protocol-test";
  }
  return "undeployed";
}

export function canSubmitHardwareSource(readiness: HardwareProtocolReadinessValue): string | null {
  switch (readiness) {
    case "DOCUMENTED":
      return null;
    case "SIMULATOR":
      return "This device is configured as a simulator and cannot submit HARDWARE weighments.";
    case "PROTOCOL_TEST_ONLY":
      return "Protocol-test readings are not real hardware measurements.";
    case "PROTOCOL_DETAILS_REQUIRED":
      return "Real hardware adapter cannot be finalized until the manufacturer/model/protocol documentation is provided.";
    default: {
      const _exhaustive: never = readiness;
      return _exhaustive;
    }
  }
}

export const REAL_ADAPTER_BLOCKED_MESSAGE =
  "Real hardware adapter cannot be finalized until the manufacturer/model/protocol documentation is provided.";
export const HARDWARE_INFORMATION_REQUIRED_MESSAGE = REAL_ADAPTER_BLOCKED_MESSAGE;
export const PROTOCOL_INFORMATION_REQUIRED_MESSAGE = "Protocol information required";
