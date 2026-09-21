export type HardwareInformationGap = {
  category: "WEIGHBRIDGE_INDICATOR" | "ANPR_CAMERA" | "SCANNER";
  required: string[];
  available: Record<string, string | null>;
  missing: string[];
};

export const WEIGHBRIDGE_INFORMATION_REQUIRED = [
  "Manufacturer",
  "Model",
  "Interface",
  "Protocol",
  "Baud rate if serial",
  "Data bits",
  "Stop bits",
  "Parity",
  "Message format",
  "Stable-weight information",
  "Unit",
  "Scaling",
  "Command/request format if required",
] as const;

export const CAMERA_INFORMATION_REQUIRED = [
  "Manufacturer",
  "Model",
  "IP address",
  "RTSP/API support",
  "Authentication method",
  "Snapshot/API capability",
  "ANPR capability",
  "Event API/SDK",
  "Resolution",
  "Firmware if available",
] as const;

export const SCANNER_INFORMATION_REQUIRED = [
  "Manufacturer",
  "Model",
  "USB/network",
  "Driver/API",
  "Output format",
  "Resolution",
  "Supported operating system",
] as const;

export const HARDWARE_INFORMATION_REQUIRED_MESSAGE =
  "Real hardware adapter cannot be finalized until the manufacturer/model/protocol documentation is provided.";

export function hardwareInformationGap(input: {
  category: HardwareInformationGap["category"];
  available: Record<string, string | null>;
}): HardwareInformationGap {
  const required = requiredFieldsFor(input.category);
  const missing = required.filter((field) => {
    const value = input.available[field];
    return value === null || value === undefined || value.trim() === "";
  });
  return {
    category: input.category,
    required: [...required],
    available: input.available,
    missing,
  };
}

export function projectHardwareDiscoveryReport(): {
  realAdaptersFinalized: false;
  message: string;
  gaps: HardwareInformationGap[];
} {
  return {
    realAdaptersFinalized: false,
    message: HARDWARE_INFORMATION_REQUIRED_MESSAGE,
    gaps: [
      hardwareInformationGap({
        category: "WEIGHBRIDGE_INDICATOR",
        available: Object.fromEntries(WEIGHBRIDGE_INFORMATION_REQUIRED.map((field) => [field, null])),
      }),
      hardwareInformationGap({
        category: "ANPR_CAMERA",
        available: Object.fromEntries(CAMERA_INFORMATION_REQUIRED.map((field) => [field, null])),
      }),
      hardwareInformationGap({
        category: "SCANNER",
        available: Object.fromEntries(SCANNER_INFORMATION_REQUIRED.map((field) => [field, null])),
      }),
    ],
  };
}

function requiredFieldsFor(category: HardwareInformationGap["category"]): readonly string[] {
  switch (category) {
    case "WEIGHBRIDGE_INDICATOR":
      return WEIGHBRIDGE_INFORMATION_REQUIRED;
    case "ANPR_CAMERA":
      return CAMERA_INFORMATION_REQUIRED;
    case "SCANNER":
      return SCANNER_INFORMATION_REQUIRED;
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}
