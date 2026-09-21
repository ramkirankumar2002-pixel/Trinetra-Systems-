import { SimulatorCameraAdapter } from "../adapters/camera/simulator.js";
import { UndeployedCameraAdapter } from "../adapters/camera/undeployed.js";
import { NoopAdapter } from "../adapters/noop.js";
import { SimulatorScannerAdapter } from "../adapters/scanner/simulator.js";
import { UndeployedScannerAdapter } from "../adapters/scanner/undeployed.js";
import type { IDeviceAdapter } from "../adapters/types.js";
import { ProtocolTestWeightAdapter } from "../adapters/weight/protocolTest.js";
import { SimulatorWeightAdapter } from "../adapters/weight/simulator.js";
import { UndeployedWeightAdapter } from "../adapters/weight/undeployed.js";
import type { EdgeDeviceType } from "../events/envelope.js";
import type { BackendDevice } from "../gateway/client.js";

export type BoundDevice = {
  id: string;
  code: string;
  name: string;
  deviceType: string;
  enabled: boolean;
  adapter: IDeviceAdapter;
};

export class DeviceRegistry {
  private readonly devices = new Map<string, BoundDevice>();

  bind(devices: BackendDevice[]): BoundDevice[] {
    this.devices.clear();
    for (const device of devices) {
      const adapter = createAdapter(device);
      this.devices.set(device.id, {
        id: device.id,
        code: device.code,
        name: device.name,
        deviceType: device.deviceType,
        enabled: device.enabled,
        adapter,
      });
    }
    return [...this.devices.values()];
  }

  list(): BoundDevice[] {
    return [...this.devices.values()];
  }

  get(id: string): BoundDevice | undefined {
    return this.devices.get(id);
  }

  findByCode(code: string): BoundDevice | undefined {
    return [...this.devices.values()].find((device) => device.code === code);
  }

  healthSummary() {
    return this.list().map((device) => ({
      deviceId: device.id,
      code: device.code,
      name: device.name,
      deviceType: device.deviceType,
      ...device.adapter.health(),
      lastDiagnostic: device.adapter.diagnostic?.() ?? null,
    }));
  }
}

export function resolveEdgeAdapterKey(device: BackendDevice): "simulator" | "protocol-test" | "undeployed" {
  if (device.adapterKey === "simulator" || device.adapterKey === "protocol-test" || device.adapterKey === "undeployed") {
    return device.adapterKey;
  }
  if (device.protocolReadiness === "PROTOCOL_TEST_ONLY") {
    return "protocol-test";
  }
  if (device.protocolReadiness === "SIMULATOR" || (device.provider ?? "SIMULATOR").toUpperCase() === "SIMULATOR") {
    return "simulator";
  }
  return "undeployed";
}

function createAdapter(device: BackendDevice): IDeviceAdapter {
  const key = resolveEdgeAdapterKey(device);
  switch (device.deviceType) {
    case "WEIGHBRIDGE_INDICATOR":
      if (key === "protocol-test") {
        return new ProtocolTestWeightAdapter();
      }
      if (key === "undeployed") {
        return new UndeployedWeightAdapter(device);
      }
      return new SimulatorWeightAdapter();
    case "CAMERA":
      return key === "undeployed" ? new UndeployedCameraAdapter() : new SimulatorCameraAdapter();
    case "SCANNER":
    case "BARCODE_SCANNER":
      return key === "undeployed" ? new UndeployedScannerAdapter() : new SimulatorScannerAdapter();
    case "SENSOR":
    case "PLC":
    case "OTHER":
      return new NoopAdapter(device.deviceType as EdgeDeviceType);
    default:
      return new NoopAdapter("OTHER");
  }
}
