import { randomUUID } from "node:crypto";
import { SimulatorCameraAdapter } from "../adapters/camera/simulator.js";
import { SimulatorScannerAdapter } from "../adapters/scanner/simulator.js";
import { ProtocolTestWeightAdapter } from "../adapters/weight/protocolTest.js";
import { SimulatorWeightAdapter } from "../adapters/weight/simulator.js";
import { edgeEnv } from "../config/env.js";
import type { EdgeLogger } from "../core/logger.js";
import type { DeviceRegistry } from "../devices/registry.js";
import { createEnvelope } from "../events/envelope.js";
import { anprEventFromAdapter, scanEventFromAdapter, weightEventFromAdapter } from "../events/factory.js";
import type { FileEventQueue } from "../queue/fileQueue.js";
import type { LocalTransaction } from "../store/types.js";
import { LocalAnomalyDetector } from "./anomaly.js";
import { storeLocalFile } from "./files.js";
import { calculateNetWeight, kgNumberToDecimal } from "./netWeight.js";
import { evaluateLocalAction, isConfigStale, lookupCachedVehicle } from "./policy.js";

export class OfflineOperator {
  readonly anomalies = new LocalAnomalyDetector();
  lastLocalAlert: string | null = null;

  constructor(
    private readonly gatewayId: string,
    private readonly devices: DeviceRegistry,
    private readonly queue: FileEventQueue,
    private readonly logger: EdgeLogger,
  ) {}

  async status() {
    const [state, stats, config, transactions, conflicts] = await Promise.all([
      this.queue.store.getState(),
      this.queue.stats(),
      this.queue.store.getConfig(),
      this.queue.store.listTransactions(),
      this.queue.store.listConflicts(),
    ]);
    const stale = isConfigStale(config, Date.now());
    return {
      gateway: config?.gateway ?? { id: this.gatewayId, code: edgeEnv.gatewayCode, name: edgeEnv.gatewayCode },
      connectivity: state,
      queue: stats,
      configStale: stale,
      configMessage: stale ? "Configuration refresh required." : null,
      offlineBanner:
        state.connectivityState === "OFFLINE" || state.backendStatus === "UNREACHABLE"
          ? "Internet connection unavailable. Weighbridge operations are being stored locally."
          : null,
      lastLocalAlert: this.lastLocalAlert,
      transactions,
      conflicts,
      operatorMessages: transactions.map((row) => ({
        localTransactionId: row.localTransactionId,
        message: row.operatorMessage,
      })),
    };
  }

  async createTransaction(input: {
    vehicleNumber?: string;
    weighbridgeId?: string;
    approvalRequired?: boolean;
  }): Promise<LocalTransaction> {
    const config = await this.queue.store.getConfig();
    const decision = evaluateLocalAction(config, "BASIC_TRANSACTION", { nowMs: Date.now() });
    if (!decision.allowed) {
      throw new Error(decision.reason);
    }
    const cached = input.vehicleNumber ? lookupCachedVehicle(config, input.vehicleNumber) : null;
    const localTransactionId = await this.queue.store.nextLocalTransactionId(
      config?.gateway.code ?? edgeEnv.gatewayCode,
      Date.now(),
    );
    const now = new Date().toISOString();
    const row: LocalTransaction = {
      localTransactionId,
      vehicleNumber: cached?.displayRegistrationNumber ?? input.vehicleNumber ?? null,
      vehicleId: cached?.id ?? null,
      weighbridgeId: input.weighbridgeId ?? config?.weighbridges[0]?.id ?? null,
      siteId: config?.gateway.site.id ?? null,
      materialId: null,
      workflowRef: null,
      localState: "IDENTIFIED",
      completionState: "NONE",
      grossWeightKg: null,
      tareWeightKg: null,
      netWeightKg: null,
      tareExceedsGross: false,
      approvalRequired: input.approvalRequired === true,
      eventIds: [],
      operatorMessage: "Saved locally — awaiting synchronization.",
      createdAt: now,
      updatedAt: now,
    };
    const eventId = `EVT-${randomUUID()}`;
    const device = this.weightDevice();
    const envelope = createEnvelope({
      eventId,
      gatewayId: this.gatewayId,
      deviceId: device?.id ?? this.gatewayId,
      deviceType: "WEIGHBRIDGE_INDICATOR",
      eventType: "LOCAL_TRANSACTION_CREATED",
      deviceEventTime: now,
      gatewayReceiveTime: now,
      softwareVersion: edgeEnv.softwareVersion,
      payload: {
        localTransactionId,
        vehicleNumber: row.vehicleNumber,
        vehicleId: row.vehicleId,
        weighbridgeId: row.weighbridgeId,
        localState: row.localState,
        approvalRequired: row.approvalRequired,
      },
    });
    const queued = await this.queue.enqueue(envelope, { localTransactionId, priority: "CRITICAL" });
    row.eventIds.push(queued.eventId);
    await this.queue.store.upsertTransaction(row);
    await this.queue.store.audit("LOCAL_TRANSACTION_CREATED", "LocalTransaction", localTransactionId, {
      vehicleNumber: row.vehicleNumber,
    });
    await this.logger.info("local_transaction_created", { localTransactionId });
    return row;
  }

  async captureGross(localTransactionId: string): Promise<LocalTransaction> {
    return this.captureWeighment(localTransactionId, "GROSS");
  }

  async captureTare(localTransactionId: string): Promise<LocalTransaction> {
    return this.captureWeighment(localTransactionId, "TARE");
  }

  async complete(localTransactionId: string): Promise<LocalTransaction> {
    const tx = await this.requireTransaction(localTransactionId);
    const decision = evaluateLocalAction(await this.queue.store.getConfig(), "TRANSACTION_COMPLETION", {
      nowMs: Date.now(),
      approvalRequired: tx.approvalRequired,
    });
    if (!decision.allowed) {
      tx.localState = "PAUSED_APPROVAL";
      tx.operatorMessage = decision.reason;
      tx.updatedAt = new Date().toISOString();
      await this.queue.store.upsertTransaction(tx);
      throw new Error(decision.reason);
    }
    if (!tx.grossWeightKg || !tx.tareWeightKg || !tx.netWeightKg || tx.tareExceedsGross) {
      throw new Error("Gross and tare must be valid before local completion.");
    }
    tx.localState = "LOCAL_COMPLETED";
    tx.completionState = "LOCAL_COMPLETED";
    tx.operatorMessage = "Saved locally — awaiting synchronization. Central completion is not confirmed.";
    tx.updatedAt = new Date().toISOString();
    const now = new Date().toISOString();
    const created = tx.eventIds[0];
    const envelope = createEnvelope({
      eventId: `EVT-${randomUUID()}`,
      gatewayId: this.gatewayId,
      deviceId: this.weightDevice()?.id ?? this.gatewayId,
      deviceType: "WEIGHBRIDGE_INDICATOR",
      eventType: "LOCAL_TRANSACTION_STATE",
      deviceEventTime: now,
      gatewayReceiveTime: now,
      softwareVersion: edgeEnv.softwareVersion,
      payload: {
        localTransactionId,
        localState: tx.localState,
        completionState: tx.completionState,
        grossWeightKg: tx.grossWeightKg,
        tareWeightKg: tx.tareWeightKg,
        netWeightKg: tx.netWeightKg,
      },
    });
    const queued = await this.queue.enqueue(envelope, {
      localTransactionId,
      priority: "CRITICAL",
      dependsOn: created ? [created] : [],
    });
    tx.eventIds.push(queued.eventId);
    await this.queue.store.upsertTransaction(tx);
    return tx;
  }

  async captureAnpr(localTransactionId?: string) {
    const decision = evaluateLocalAction(await this.queue.store.getConfig(), "ANPR", { nowMs: Date.now() });
    if (!decision.allowed) {
      throw new Error(decision.reason);
    }
    const device = this.devices.findByCode("CAM-01") ?? this.devices.list().find((item) => item.deviceType === "CAMERA");
    if (!device || !(device.adapter instanceof SimulatorCameraAdapter)) {
      throw new Error("Camera simulator is not bound");
    }
    const envelope = await anprEventFromAdapter(this.gatewayId, device, device.adapter);
    if (localTransactionId) {
      envelope.payload.localTransactionId = localTransactionId;
    }
    const config = await this.queue.store.getConfig();
    const plate = typeof envelope.payload.normalizedPlateNumber === "string" ? envelope.payload.normalizedPlateNumber : "";
    const cached = lookupCachedVehicle(config, plate);
    envelope.payload.cachedVehicleId = cached?.id ?? null;
    envelope.payload.manualConfirmationRequired = cached === null;
    const queued = await this.queue.enqueue(envelope, {
      localTransactionId: localTransactionId ?? null,
      priority: "HIGH",
    });
    if (localTransactionId) {
      const tx = await this.requireTransaction(localTransactionId);
      tx.vehicleNumber = cached?.displayRegistrationNumber ?? plate;
      tx.vehicleId = cached?.id ?? null;
      tx.eventIds.push(queued.eventId);
      tx.operatorMessage = cached
        ? "ANPR saved locally — awaiting synchronization."
        : "ANPR saved locally. Vehicle is not in the site cache — manual confirmation required after sync.";
      await this.queue.store.upsertTransaction(tx);
    }
    return { event: queued, cachedVehicle: cached, manualConfirmationRequired: cached === null };
  }

  async captureScan(localTransactionId?: string) {
    const decision = evaluateLocalAction(await this.queue.store.getConfig(), "DOCUMENT_CAPTURE", { nowMs: Date.now() });
    if (!decision.allowed) {
      throw new Error(decision.reason);
    }
    const device = this.devices.findByCode("SCAN-01") ?? this.devices.list().find((item) => item.deviceType === "SCANNER");
    if (!device || !(device.adapter instanceof SimulatorScannerAdapter)) {
      throw new Error("Scanner simulator is not bound");
    }
    const extras: Record<string, unknown> = { ocrCompletedCentrally: false };
    if (localTransactionId) {
      extras.localTransactionId = localTransactionId;
    }
    const envelope = await scanEventFromAdapter(this.gatewayId, device, device.adapter, extras);
    const bytes = Buffer.from(String(envelope.payload.contentBase64 ?? ""), "base64");
    const stored = await storeLocalFile(this.queue.store, {
      bytes,
      mimeType: String(envelope.payload.mimeType ?? "application/pdf"),
      eventId: envelope.eventId,
    });
    envelope.payload.fileId = stored.fileId;
    envelope.payload.contentHash = stored.contentHash;
    delete envelope.payload.contentBase64;
    const queued = await this.queue.enqueue(envelope, {
      localTransactionId: localTransactionId ?? null,
      priority: "HIGH",
      payloadHash: stored.contentHash,
    });
    return { event: queued, file: stored, ocr: "Not completed centrally. Document stored locally." };
  }

  async detectLocalAnomaly(input: {
    weightKg: number;
    quality?: string;
    platformState?: "EMPTY" | "VEHICLE_PRESENT" | "UNKNOWN";
    localTransactionId?: string;
  }) {
    const config = await this.queue.store.getConfig();
    const decision = evaluateLocalAction(config, "WEIGHT_ANOMALY", { nowMs: Date.now() });
    if (!decision.allowed) {
      throw new Error(decision.reason);
    }
    const weighbridgeId = config?.weighbridges[0]?.id;
    const anomalyConfig = config?.anomalyConfigs.find((item) => item.weighbridgeId === weighbridgeId) ?? {
      emptyPlatformThresholdKg: 50,
      maxChangePerSecondKg: 2000,
      weightJumpThresholdKg: 3000,
      maxInstabilityDurationMs: 8000,
      consecutiveAnomalyCount: 2,
    };
    const hit = this.anomalies.evaluate(
      {
        timestampMs: Date.now(),
        weightKg: input.weightKg,
        quality: input.quality ?? "STABLE",
      },
      anomalyConfig,
      input.platformState ?? "EMPTY",
    );
    if (!hit) {
      return { detected: false };
    }
    this.lastLocalAlert = `Weight anomaly detected. ${hit.explanation}`;
    const now = new Date().toISOString();
    const envelope = createEnvelope({
      eventId: `EVT-${randomUUID()}`,
      gatewayId: this.gatewayId,
      deviceId: this.weightDevice()?.id ?? this.gatewayId,
      deviceType: "WEIGHBRIDGE_INDICATOR",
      eventType: "LOCAL_WEIGHT_ANOMALY",
      deviceEventTime: now,
      gatewayReceiveTime: now,
      softwareVersion: edgeEnv.softwareVersion,
      payload: {
        ...hit,
        weighbridgeId,
        localTransactionId: input.localTransactionId ?? null,
        platformState: input.platformState ?? "EMPTY",
        ruleId: `local.${hit.type}`,
        ruleVersion: "1.0.0",
      },
    });
    const queued = await this.queue.enqueue(envelope, {
      localTransactionId: input.localTransactionId ?? null,
      priority: "HIGH",
    });
    await this.queue.store.audit("LOCAL_ANOMALY_DETECTED", "LocalWeightAnomaly", queued.eventId, {
      type: hit.type,
    });
    return { detected: true, event: queued, alert: this.lastLocalAlert };
  }

  private async captureWeighment(localTransactionId: string, kind: "GROSS" | "TARE"): Promise<LocalTransaction> {
    const decision = evaluateLocalAction(await this.queue.store.getConfig(), "READ_WEIGHT", { nowMs: Date.now() });
    if (!decision.allowed) {
      throw new Error(decision.reason);
    }
    const tx = await this.requireTransaction(localTransactionId);
    const device = this.weightDevice();
    if (
      !device ||
      (!(device.adapter instanceof SimulatorWeightAdapter) && !(device.adapter instanceof ProtocolTestWeightAdapter))
    ) {
      throw new Error("Weight simulator is not bound");
    }
    const envelope = await weightEventFromAdapter(this.gatewayId, device, device.adapter, {
      transactionId: undefined,
      localTransactionId,
      captureOfficial: true,
      kind,
      localAnomalyEvaluated: true,
    });
    const quality = envelope.payload.quality;
    const weightKg = envelope.payload.weightKg;
    if (quality !== "STABLE" || typeof weightKg !== "number") {
      throw new Error("A stable weight is required before an official local weighment can be stored.");
    }
    const decimal = kgNumberToDecimal(weightKg);
    if (kind === "GROSS") {
      tx.grossWeightKg = decimal;
      tx.localState = "GROSS_CAPTURED";
      tx.operatorMessage = "Gross weight saved locally. Waiting for synchronization.";
    } else {
      if (!tx.grossWeightKg) {
        throw new Error("Gross weight must be captured before tare.");
      }
      const net = calculateNetWeight(tx.grossWeightKg, decimal);
      if (net.tareExceedsGross) {
        throw new Error("Tare exceeds gross. Net weight was not stored as a completed visit.");
      }
      tx.tareWeightKg = decimal;
      tx.netWeightKg = net.netAsDecimal;
      tx.tareExceedsGross = net.tareExceedsGross;
      tx.localState = "TARE_CAPTURED";
      tx.operatorMessage = "Tare weight saved locally. Waiting for synchronization.";
    }
    const created = tx.eventIds[0];
    const queued = await this.queue.enqueue(envelope, {
      localTransactionId,
      priority: "CRITICAL",
      dependsOn: created ? [created] : [],
    });
    tx.eventIds.push(queued.eventId);
    tx.updatedAt = new Date().toISOString();
    await this.queue.store.upsertTransaction(tx);
    await this.queue.store.audit("LOCAL_WEIGHMENT_CAPTURED", "LocalTransaction", localTransactionId, {
      kind,
      weightKg: decimal,
    });
    return tx;
  }

  private async requireTransaction(localTransactionId: string): Promise<LocalTransaction> {
    const tx = await this.queue.store.getTransaction(localTransactionId);
    if (!tx) {
      throw new Error("Local transaction was not found");
    }
    return tx;
  }

  private weightDevice() {
    return this.devices.findByCode("WB-01") ?? this.devices.list().find((item) => item.deviceType === "WEIGHBRIDGE_INDICATOR");
  }
}
