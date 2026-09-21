import net from "node:net";
import { emptyReading, readingFromMilliKg, type NormalizedWeightReading } from "../../../domain/normalizedWeight.js";
import { DEFAULT_SIMULATOR_STABILITY, StabilityTracker, stabilityConfigFromKg } from "../../../domain/stability.js";
import { BaseWeightProvider } from "../baseProvider.js";
import { GenericTextWeightParser } from "../parsers/genericTextParser.js";
import type { ProviderFactoryInput } from "../provider.js";

export class TcpWeightProvider extends BaseWeightProvider {
  private socket: net.Socket | null = null;
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;
  private readonly deviceIdentifier: string;
  private readonly tracker: StabilityTracker;
  private readonly parser = new GenericTextWeightParser();
  private lastFrame: NormalizedWeightReading | null = null;

  constructor(input: ProviderFactoryInput) {
    super(input.profileId, input.weighbridgeId, "TCP", input.healthTimeoutMs);
    this.host = input.host ?? "";
    this.port = input.port ?? 0;
    this.timeoutMs = input.connectionTimeoutMs;
    this.deviceIdentifier = input.deviceIdentifier;
    const stability = stabilityConfigFromKg({
      toleranceKg: input.stabilityToleranceKg,
      consecutiveReadings: input.stabilityConsecutive,
      durationMs: input.stabilityDurationMs,
    });
    this.tracker = new StabilityTracker(typeof stability === "string" ? DEFAULT_SIMULATOR_STABILITY : stability);
  }

  async connect(): Promise<void> {
    if (this.host === "" || this.port === 0) {
      this.setStatus("ERROR", "TCP host and port are not configured");
      return;
    }
    if (this.socket) {
      return;
    }

    this.setStatus("CONNECTING");
    try {
      this.socket = await openSocket(this.host, this.port, this.timeoutMs);
      this.socket.setEncoding("utf8");
      this.socket.on("data", (chunk: string | Buffer) => {
        this.ingest(chunk);
      });
      this.socket.on("error", (error: Error) => {
        this.setStatus("ERROR", error.message);
      });
      this.socket.on("close", () => {
        this.socket = null;
        if (this.status !== "DISABLED") {
          this.setStatus("DISCONNECTED", "TCP connection closed");
        }
      });
      this.setStatus("CONNECTED");
    } catch (error) {
      this.socket = null;
      this.setStatus("ERROR", error instanceof Error ? error.message : "TCP connection failed");
    }
  }

  async disconnect(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.tracker.reset();
    this.lastFrame = null;
    if (socket) {
      socket.destroy();
    }
    this.setStatus("DISCONNECTED");
  }

  async readNormalized(): Promise<NormalizedWeightReading> {
    if (this.status !== "CONNECTED" || this.lastFrame === null) {
      const reading = emptyReading({
        weighbridgeId: this.weighbridgeId,
        deviceIdentifier: this.deviceIdentifier,
        providerType: "TCP",
        source: "HARDWARE",
        quality: this.status === "ERROR" ? "DEVICE_ERROR" : "NO_DATA",
        connectionStatus: this.status,
        statusDetail: this.lastError ?? "No TCP weight frame received",
      });
      this.emit(reading);
      return reading;
    }
    this.emit(this.lastFrame);
    return this.lastFrame;
  }

  private ingest(chunk: string | Buffer): void {
    const parsed = this.parser.parse(chunk);
    if (!parsed.ok) {
      this.lastFrame = emptyReading({
        weighbridgeId: this.weighbridgeId,
        deviceIdentifier: this.deviceIdentifier,
        providerType: "TCP",
        source: "HARDWARE",
        quality: parsed.quality,
        connectionStatus: this.status,
        statusDetail: parsed.reason,
      });
      return;
    }
    const quality = this.tracker.add(parsed.milliKg);
    this.lastFrame = readingFromMilliKg({
      milliKg: parsed.milliKg,
      unit: parsed.unit,
      quality,
      providerType: "TCP",
      source: "HARDWARE",
      deviceIdentifier: this.deviceIdentifier,
      weighbridgeId: this.weighbridgeId,
      connectionStatus: this.status,
      raw: parsed.raw,
    });
  }
}

function openSocket(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP connection timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
