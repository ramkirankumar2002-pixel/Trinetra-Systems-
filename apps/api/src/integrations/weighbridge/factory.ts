import { ModbusWeightProvider } from "./adapters/modbusAdapter.js";
import { SerialWeightProvider } from "./adapters/serialAdapter.js";
import { SimulatorWeightProvider } from "./adapters/simulatorAdapter.js";
import { TcpWeightProvider } from "./adapters/tcpAdapter.js";
import type { IWeightProvider, ProviderFactoryInput } from "./provider.js";

export function createWeightProvider(input: ProviderFactoryInput): IWeightProvider {
  switch (input.providerType) {
    case "SIMULATOR":
      return new SimulatorWeightProvider(input);
    case "TCP":
      return new TcpWeightProvider(input);
    case "SERIAL":
      return new SerialWeightProvider(input);
    case "MODBUS_RTU":
    case "MODBUS_TCP":
      return new ModbusWeightProvider(input);
    default: {
      const _exhaustive: never = input.providerType;
      return _exhaustive;
    }
  }
}
