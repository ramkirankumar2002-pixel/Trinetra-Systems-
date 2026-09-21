import type { EdgeLogger } from "../core/logger.js";
import type { LocalStore } from "../store/localStore.js";
import type { ConnectivityState, GatewayRuntimeState } from "../store/types.js";

export type ConnectivityObservation = {
  internetOnline: boolean;
  backendReachable: boolean;
  hardwareOnline: boolean;
  authFailed: boolean;
  syncing: boolean;
  pendingCritical: number;
  openConflicts: number;
};

export class ConnectivityManager {
  private simulatedDisconnect = false;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private state: ConnectivityState = "ONLINE";

  constructor(
    private readonly store: LocalStore,
    private readonly logger: EdgeLogger,
    private readonly failThreshold = 3,
    private readonly recoverThreshold = 2,
  ) {}

  simulateDisconnect(offline: boolean): void {
    this.simulatedDisconnect = offline;
    if (offline) {
      this.consecutiveFailures = this.failThreshold;
      this.state = "OFFLINE";
      void this.store.setState({
        connectivityState: "OFFLINE",
        internetStatus: "OFFLINE",
        backendStatus: "UNREACHABLE",
        syncStatus: "IDLE",
      });
    }
  }

  isSimulatedOffline(): boolean {
    return this.simulatedDisconnect;
  }

  current(): ConnectivityState {
    return this.state;
  }

  isBackendOnline(): boolean {
    return !this.simulatedDisconnect && (this.state === "ONLINE" || this.state === "DEGRADED" || this.state === "SYNCING");
  }

  async observe(observation: ConnectivityObservation): Promise<GatewayRuntimeState> {
    const internetOnline = this.simulatedDisconnect ? false : observation.internetOnline;
    const backendReachable = this.simulatedDisconnect ? false : observation.backendReachable;
    const previous = this.state;

    if (observation.authFailed) {
      this.state = "ERROR";
      this.consecutiveFailures += 1;
      this.consecutiveSuccesses = 0;
    } else if (backendReachable) {
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses += 1;
      if (observation.syncing) {
        this.state = "SYNCING";
      } else if (previous === "OFFLINE" || previous === "RECOVERING" || previous === "SYNCING" || previous === "ERROR") {
        if (this.consecutiveSuccesses < this.recoverThreshold || observation.pendingCritical > 0 || observation.openConflicts > 0) {
          this.state = "RECOVERING";
        } else if (!observation.hardwareOnline || !internetOnline) {
          this.state = "DEGRADED";
        } else {
          this.state = "ONLINE";
        }
      } else if (!observation.hardwareOnline || !internetOnline) {
        this.state = "DEGRADED";
      } else {
        this.state = "ONLINE";
      }
    } else {
      this.consecutiveSuccesses = 0;
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= this.failThreshold || previous === "OFFLINE") {
        this.state = "OFFLINE";
      } else if (previous === "ONLINE") {
        this.state = "DEGRADED";
      }
    }

    const next = await this.store.setState({
      connectivityState: this.state,
      internetStatus: internetOnline ? "ONLINE" : "OFFLINE",
      backendStatus: backendReachable ? "REACHABLE" : "UNREACHABLE",
      hardwareStatus: observation.hardwareOnline ? "ONLINE" : "OFFLINE",
      syncStatus: observation.authFailed ? "ERROR" : observation.syncing ? "SYNCING" : "IDLE",
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
    });

    if (previous !== "OFFLINE" && this.state === "OFFLINE") {
      await this.store.audit("EDGE_OFFLINE_ENTERED", "EdgeGateway", "local", { previous });
      await this.logger.warn("entered_offline", { previous });
    }
    if (previous !== "ONLINE" && this.state === "ONLINE") {
      await this.store.audit("EDGE_ONLINE_RESTORED", "EdgeGateway", "local", { previous });
      await this.logger.info("returned_online", { previous });
    }
    return next;
  }
}
