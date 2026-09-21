export const CONNECTIVITY_STATES = [
  "ONLINE",
  "DEGRADED",
  "OFFLINE",
  "SYNCING",
  "RECOVERING",
  "ERROR",
] as const;
export type ConnectivityState = (typeof CONNECTIVITY_STATES)[number];

export const INTERNET_STATUSES = ["ONLINE", "OFFLINE"] as const;
export type InternetStatus = (typeof INTERNET_STATUSES)[number];

export const BACKEND_STATUSES = ["REACHABLE", "UNREACHABLE"] as const;
export type BackendStatus = (typeof BACKEND_STATUSES)[number];

export const HARDWARE_STATUSES = ["ONLINE", "OFFLINE"] as const;
export type HardwareReachability = (typeof HARDWARE_STATUSES)[number];

export const SYNC_RUNTIME_STATUSES = ["IDLE", "SYNCING", "ERROR"] as const;
export type SyncRuntimeStatus = (typeof SYNC_RUNTIME_STATUSES)[number];

export type ConnectivityHysteresisConfig = {
  failThreshold: number;
  recoverThreshold: number;
};

export const DEFAULT_CONNECTIVITY_HYSTERESIS: ConnectivityHysteresisConfig = {
  failThreshold: 3,
  recoverThreshold: 2,
};

export type ConnectivityObservation = {
  internetOnline: boolean;
  backendReachable: boolean;
  hardwareOnline: boolean;
  authenticating: boolean;
  authFailed: boolean;
  syncing: boolean;
  pendingCritical: number;
  openConflicts: number;
};

export type ConnectivityMachineState = {
  state: ConnectivityState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
};

export function createConnectivityMachine(
  state: ConnectivityState = "ONLINE",
): ConnectivityMachineState {
  return { state, consecutiveFailures: 0, consecutiveSuccesses: 0 };
}

export function observeConnectivity(
  current: ConnectivityMachineState,
  observation: ConnectivityObservation,
  config: ConnectivityHysteresisConfig = DEFAULT_CONNECTIVITY_HYSTERESIS,
): ConnectivityMachineState {
  if (observation.authFailed) {
    return { state: "ERROR", consecutiveFailures: current.consecutiveFailures + 1, consecutiveSuccesses: 0 };
  }

  if (observation.backendReachable) {
    const successes = current.consecutiveSuccesses + 1;
    const next = { consecutiveFailures: 0, consecutiveSuccesses: successes };
    if (observation.syncing) {
      return { ...next, state: "SYNCING" };
    }
    if (
      current.state === "OFFLINE" ||
      current.state === "RECOVERING" ||
      current.state === "SYNCING" ||
      current.state === "ERROR"
    ) {
      if (successes < config.recoverThreshold) {
        return { ...next, state: "RECOVERING" };
      }
      if (observation.pendingCritical > 0 || observation.openConflicts > 0) {
        return { ...next, state: "RECOVERING" };
      }
      if (!observation.hardwareOnline || !observation.internetOnline) {
        return { ...next, state: "DEGRADED" };
      }
      return { ...next, state: "ONLINE" };
    }
    if (!observation.hardwareOnline || !observation.internetOnline) {
      return { ...next, state: "DEGRADED" };
    }
    return { ...next, state: "ONLINE" };
  }

  const failures = current.consecutiveFailures + 1;
  if (failures < config.failThreshold && current.state !== "OFFLINE") {
    return {
      state: current.state === "ONLINE" ? "DEGRADED" : current.state,
      consecutiveFailures: failures,
      consecutiveSuccesses: 0,
    };
  }
  return { state: "OFFLINE", consecutiveFailures: failures, consecutiveSuccesses: 0 };
}

export function deriveComponentStatuses(observation: ConnectivityObservation): {
  internet: InternetStatus;
  backend: BackendStatus;
  hardware: HardwareReachability;
  sync: SyncRuntimeStatus;
} {
  return {
    internet: observation.internetOnline ? "ONLINE" : "OFFLINE",
    backend: observation.backendReachable ? "REACHABLE" : "UNREACHABLE",
    hardware: observation.hardwareOnline ? "ONLINE" : "OFFLINE",
    sync: observation.authFailed ? "ERROR" : observation.syncing ? "SYNCING" : "IDLE",
  };
}

export function isConnectivityState(value: string): value is ConnectivityState {
  return (CONNECTIVITY_STATES as readonly string[]).includes(value);
}
