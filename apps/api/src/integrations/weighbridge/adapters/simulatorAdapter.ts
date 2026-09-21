import { kgToMilligrams } from "../../../domain/netWeight.js";
import { emptyReading, readingFromMilliKg } from "../../../domain/normalizedWeight.js";
import { DEFAULT_SIMULATOR_STABILITY, StabilityTracker, stabilityConfigFromKg } from "../../../domain/stability.js";
import type { SimulatorMode } from "../../../domain/hardwareConfig.js";
import type { NormalizedWeightReading } from "../../../domain/normalizedWeight.js";
import type { WeightQuality } from "../../../domain/weightQuality.js";
import type { WeightUnit } from "../../../domain/weightUnits.js";
import { BaseWeightProvider } from "../baseProvider.js";
import { SimulatorParser } from "../parsers/simulatorParser.js";
import type { ProviderFactoryInput } from "../provider.js";

export type SimulatorAnomalyScriptSample = {
  weightKg: number | null;
  quality?: WeightQuality;
};

export class SimulatorWeightProvider extends BaseWeightProvider {
  private readonly parser = new SimulatorParser();
  private readonly tracker: StabilityTracker;
  private readonly mode: SimulatorMode;
  private readonly baseMilliKg: bigint;
  private readonly unit: WeightUnit;
  private readonly deviceIdentifier: string;
  private lockedMilliKg: bigint | null = null;
  private startedAt = 0;
  private tick = 0;
  private anomalyScript: SimulatorAnomalyScriptSample[] | null = null;
  private anomalyScriptIndex = 0;

  constructor(input: ProviderFactoryInput, clock: () => number = Date.now) {
    super(input.profileId, input.weighbridgeId, "SIMULATOR", input.healthTimeoutMs);
    const stability = stabilityConfigFromKg({
      toleranceKg: input.stabilityToleranceKg,
      consecutiveReadings: input.stabilityConsecutive,
      durationMs: input.stabilityDurationMs,
    });
    this.tracker = new StabilityTracker(typeof stability === "string" ? DEFAULT_SIMULATOR_STABILITY : stability);
    this.mode = input.simulatorMode;
    this.unit = input.unit;
    this.deviceIdentifier = input.deviceIdentifier;
    this.baseMilliKg = parseBase(input.simulatorBaseKg);
    this.now = clock;
  }

  private readonly now: () => number;

  async connect(): Promise<void> {
    if (this.mode === "DISCONNECTED") {
      this.setStatus("DISCONNECTED", "Simulator is in DISCONNECTED mode");
      return;
    }
    this.setStatus("CONNECTING");
    this.startedAt = this.now();
    this.lockedMilliKg = null;
    this.tick = 0;
    this.tracker.reset();
    this.setStatus("CONNECTED");
  }

  async disconnect(): Promise<void> {
    this.setStatus("DISCONNECTED");
    this.tracker.reset();
  }

  setAnomalyScript(script: SimulatorAnomalyScriptSample[] | null): void {
    this.anomalyScript = script;
    this.anomalyScriptIndex = 0;
    this.tracker.reset();
  }

  async readNormalized(): Promise<NormalizedWeightReading> {
    if (this.anomalyScript && this.anomalyScript.length > 0) {
      const item = this.anomalyScript[Math.min(this.anomalyScriptIndex, this.anomalyScript.length - 1)];
      this.anomalyScriptIndex += 1;
      if (!item || item.weightKg === null || item.quality === "INVALID" || item.quality === "DEVICE_ERROR") {
        const invalid = emptyReading({
          weighbridgeId: this.weighbridgeId,
          deviceIdentifier: this.deviceIdentifier,
          providerType: "SIMULATOR",
          source: "SIMULATOR",
          quality: item?.quality ?? "INVALID",
          connectionStatus: this.status,
          unit: this.unit,
          statusDetail: "Simulated invalid or missing reading",
        });
        this.emit(invalid);
        return invalid;
      }
      const milliKg = kgToMilligrams(item.weightKg.toFixed(3));
      const quality = item.quality ?? this.tracker.add(milliKg, new Date(this.now()));
      const scripted = readingFromMilliKg({
        milliKg,
        unit: this.unit,
        quality,
        timestamp: new Date(this.now()),
        providerType: "SIMULATOR",
        source: "SIMULATOR",
        deviceIdentifier: this.deviceIdentifier,
        weighbridgeId: this.weighbridgeId,
        connectionStatus: this.status,
      });
      this.emit(scripted);
      return scripted;
    }

    if (this.status !== "CONNECTED") {
      const reading = emptyReading({
        weighbridgeId: this.weighbridgeId,
        deviceIdentifier: this.deviceIdentifier,
        providerType: "SIMULATOR",
        source: "SIMULATOR",
        quality: this.status === "ERROR" ? "DEVICE_ERROR" : "NO_DATA",
        connectionStatus: this.status,
        unit: this.unit,
        statusDetail: this.lastError ?? "Simulator is not connected",
      });
      this.emit(reading);
      return reading;
    }

    const milliKg = this.nextMilliKg();
    const parsed = this.parser.parse(JSON.stringify({ kg: fromMilli(milliKg), unit: this.unit }));
    if (!parsed.ok) {
      const invalid = emptyReading({
        weighbridgeId: this.weighbridgeId,
        deviceIdentifier: this.deviceIdentifier,
        providerType: "SIMULATOR",
        source: "SIMULATOR",
        quality: parsed.quality,
        connectionStatus: this.status,
        unit: this.unit,
        statusDetail: parsed.reason,
      });
      this.emit(invalid);
      return invalid;
    }

    const quality = this.tracker.add(parsed.milliKg, new Date(this.now()));
    const reading = readingFromMilliKg({
      milliKg: parsed.milliKg,
      unit: parsed.unit,
      quality,
      timestamp: new Date(this.now()),
      providerType: "SIMULATOR",
      source: "SIMULATOR",
      deviceIdentifier: this.deviceIdentifier,
      weighbridgeId: this.weighbridgeId,
      connectionStatus: this.status,
      raw: parsed.raw,
    });
    this.emit(reading);
    return reading;
  }

  private nextMilliKg(): bigint {
    this.tick += 1;
    if (this.mode === "STABLE") {
      return this.baseMilliKg;
    }
    if (this.mode === "UNSTABLE") {
      return this.baseMilliKg + BigInt(((this.tick * 7919) % 16000) - 8000);
    }
    if (this.now() - this.startedAt < 2000) {
      return this.baseMilliKg + BigInt(((this.tick * 3343) % 8000) - 4000);
    }
    if (this.lockedMilliKg === null) {
      this.lockedMilliKg = this.baseMilliKg;
      this.tracker.reset();
    }
    return this.lockedMilliKg;
  }
}

function parseBase(value: string | null | undefined): bigint {
  if (!value) {
    return 35_000_000n;
  }
  try {
    const milli = kgToMilligrams(value);
    return milli > 0n ? milli : 35_000_000n;
  } catch {
    return 35_000_000n;
  }
}

function fromMilli(milliKg: bigint): string {
  const whole = milliKg / 1000n;
  const fraction = (milliKg % 1000n).toString().padStart(3, "0");
  return `${whole.toString()}.${fraction}`;
}
