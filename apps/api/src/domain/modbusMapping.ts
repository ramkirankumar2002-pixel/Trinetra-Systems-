export const MODBUS_BYTE_ORDERS = ["ABCD", "DCBA", "BADC", "CDAB"] as const;
export type ModbusByteOrder = (typeof MODBUS_BYTE_ORDERS)[number];

export type ModbusRegisterMapping = {
  weightRegister: number;
  stabilityRegister?: number;
  unitId: number;
  functionCode: number;
  byteOrder: ModbusByteOrder;
  scaleNumerator: number;
  scaleDenominator: number;
};

export function parseModbusMapping(value: unknown): ModbusRegisterMapping | string {
  if (value === null || value === undefined) {
    return "Modbus register mapping is required from the indicator manufacturer documentation";
  }
  if (typeof value !== "object") {
    return "Modbus mapping must be an object";
  }

  const record = value as Record<string, unknown>;
  const weightRegister = asInteger(record.weightRegister, "weight register");
  if (typeof weightRegister === "string") {
    return weightRegister;
  }

  const unitId = record.unitId === undefined ? 1 : asInteger(record.unitId, "unit id");
  if (typeof unitId === "string") {
    return unitId;
  }

  const functionCode = record.functionCode === undefined ? 3 : asInteger(record.functionCode, "function code");
  if (typeof functionCode === "string") {
    return functionCode;
  }

  const byteOrder = record.byteOrder;
  if (byteOrder !== undefined && !isByteOrder(byteOrder)) {
    return "Byte order must be ABCD, DCBA, BADC, or CDAB as specified by the manufacturer";
  }

  const scaleNumerator =
    record.scaleNumerator === undefined ? 1 : asInteger(record.scaleNumerator, "scale numerator");
  if (typeof scaleNumerator === "string") {
    return scaleNumerator;
  }
  const scaleDenominator =
    record.scaleDenominator === undefined ? 1 : asInteger(record.scaleDenominator, "scale denominator");
  if (typeof scaleDenominator === "string") {
    return scaleDenominator;
  }
  if (scaleDenominator === 0) {
    return "Scale denominator cannot be zero";
  }

  let stabilityRegister: number | undefined;
  if (record.stabilityRegister !== undefined) {
    const parsed = asInteger(record.stabilityRegister, "stability register");
    if (typeof parsed === "string") {
      return parsed;
    }
    stabilityRegister = parsed;
  }

  return {
    weightRegister,
    unitId,
    functionCode,
    byteOrder: isByteOrder(byteOrder) ? byteOrder : "ABCD",
    scaleNumerator,
    scaleDenominator,
    ...(stabilityRegister === undefined ? {} : { stabilityRegister }),
  };
}

export function applyModbusScale(rawRegister: bigint, mapping: ModbusRegisterMapping): bigint {
  return (rawRegister * BigInt(mapping.scaleNumerator)) / BigInt(mapping.scaleDenominator);
}

function isByteOrder(value: unknown): value is ModbusByteOrder {
  return typeof value === "string" && (MODBUS_BYTE_ORDERS as readonly string[]).includes(value);
}

function asInteger(value: unknown, field: string): number | string {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 65535) {
    return `${field} must be an integer register value from the manufacturer map`;
  }
  return value;
}
