export const OFFLINE_CAPABILITIES = ["ALLOWED", "CONDITIONAL", "BLOCKED"] as const;
export type OfflineCapabilityValue = (typeof OFFLINE_CAPABILITIES)[number];

export type OfflinePolicyValues = {
  version: number;
  source: string;
  timestamp: string;
  validUntil: string;
  allowWeightRead: boolean;
  allowAnpr: boolean;
  allowDocumentCapture: boolean;
  allowBasicTransactionRecording: boolean;
  allowWeightAnomalyDetection: boolean;
  transactionCompletion: OfflineCapabilityValue;
  materialVerification: OfflineCapabilityValue;
  approvals: OfflineCapabilityValue;
  configChanges: OfflineCapabilityValue;
  userManagement: OfflineCapabilityValue;
  hardwareConfigChanges: OfflineCapabilityValue;
  maxConfigAgeHours: number;
};

export const DEFAULT_OFFLINE_POLICY: Omit<OfflinePolicyValues, "timestamp" | "validUntil"> = {
  version: 1,
  source: "CENTRAL",
  allowWeightRead: true,
  allowAnpr: true,
  allowDocumentCapture: true,
  allowBasicTransactionRecording: true,
  allowWeightAnomalyDetection: true,
  transactionCompletion: "CONDITIONAL",
  materialVerification: "CONDITIONAL",
  approvals: "BLOCKED",
  configChanges: "BLOCKED",
  userManagement: "BLOCKED",
  hardwareConfigChanges: "BLOCKED",
  maxConfigAgeHours: 24,
};

export type OfflineAction =
  | "READ_WEIGHT"
  | "ANPR"
  | "DOCUMENT_CAPTURE"
  | "BASIC_TRANSACTION"
  | "WEIGHT_ANOMALY"
  | "TRANSACTION_COMPLETION"
  | "MATERIAL_VERIFICATION"
  | "APPROVAL"
  | "CONFIG_CHANGE"
  | "USER_MANAGEMENT"
  | "HARDWARE_CONFIG";

export type OfflineDecision =
  | { allowed: true; reason: string }
  | { allowed: false; reason: string };

export function isConfigStale(policy: OfflinePolicyValues, nowMs: number): boolean {
  return nowMs > Date.parse(policy.validUntil);
}

export function evaluateOfflineAction(
  policy: OfflinePolicyValues,
  action: OfflineAction,
  context: {
    nowMs: number;
    requiresCentralAuthorization?: boolean;
    approvalRequired?: boolean;
    materialVerificationRequired?: boolean;
  },
): OfflineDecision {
  if (isConfigStale(policy, context.nowMs) && actionNeedsFreshConfig(action)) {
    return { allowed: false, reason: "Configuration refresh required." };
  }

  switch (action) {
    case "READ_WEIGHT":
      return flag(policy.allowWeightRead, "Weight reading is disabled by offline policy.");
    case "ANPR":
      return flag(policy.allowAnpr, "ANPR capture is disabled by offline policy.");
    case "DOCUMENT_CAPTURE":
      return flag(policy.allowDocumentCapture, "Document capture is disabled by offline policy.");
    case "BASIC_TRANSACTION":
      return flag(policy.allowBasicTransactionRecording, "Local transaction recording is disabled by offline policy.");
    case "WEIGHT_ANOMALY":
      return flag(policy.allowWeightAnomalyDetection, "Local weight anomaly detection is disabled by offline policy.");
    case "TRANSACTION_COMPLETION":
      return capability(
        policy.transactionCompletion,
        context.requiresCentralAuthorization === true || context.approvalRequired === true,
        "Transaction completion requires central authorization and cannot be finished offline.",
      );
    case "MATERIAL_VERIFICATION":
      return capability(
        policy.materialVerification,
        context.materialVerificationRequired === true || context.requiresCentralAuthorization === true,
        "Material verification requires central authorization.",
      );
    case "APPROVAL":
      return capability(policy.approvals, true, "Approvals cannot be granted offline.");
    case "CONFIG_CHANGE":
      return capability(policy.configChanges, true, "Configuration changes are blocked while offline.");
    case "USER_MANAGEMENT":
      return capability(policy.userManagement, true, "User management is blocked while offline.");
    case "HARDWARE_CONFIG":
      return capability(policy.hardwareConfigChanges, true, "Hardware configuration changes are blocked while offline.");
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function actionNeedsFreshConfig(action: OfflineAction): boolean {
  return (
    action === "TRANSACTION_COMPLETION" ||
    action === "MATERIAL_VERIFICATION" ||
    action === "WEIGHT_ANOMALY" ||
    action === "BASIC_TRANSACTION"
  );
}

function flag(allowed: boolean, blockedReason: string): OfflineDecision {
  return allowed
    ? { allowed: true, reason: "Allowed by offline policy." }
    : { allowed: false, reason: blockedReason };
}

function capability(
  value: OfflineCapabilityValue,
  requiresCentral: boolean,
  blockedReason: string,
): OfflineDecision {
  switch (value) {
    case "ALLOWED":
      return { allowed: true, reason: "Allowed by offline policy." };
    case "CONDITIONAL":
      return requiresCentral
        ? { allowed: false, reason: blockedReason }
        : { allowed: true, reason: "Conditional offline step is permitted without central authorization." };
    case "BLOCKED":
      return { allowed: false, reason: blockedReason };
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}
