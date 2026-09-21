import { kgToMilligrams } from "../../../domain/netWeight.js";
import { isWeightUnit } from "../../../domain/weightUnits.js";
import type { ParseResult, ProtocolParser } from "./types.js";

export class SimulatorParser implements ProtocolParser {
  readonly id = "simulator-json";

  parse(raw: string | Buffer): ParseResult {
    const text = typeof raw === "string" ? raw : raw.toString("utf8");
    try {
      const value = JSON.parse(text) as Record<string, unknown>;
      if (typeof value.kg !== "string" && typeof value.kg !== "number") {
        return { ok: false, quality: "INVALID", reason: "Simulator payload is missing kg", raw: text };
      }
      const asDecimal = typeof value.kg === "number" ? value.kg.toFixed(3) : value.kg;
      const milliKg = kgToMilligrams(asDecimal);
      if (milliKg <= 0n) {
        return { ok: false, quality: "INVALID", reason: "Simulator weight must be greater than zero", raw: text };
      }
      const unit = typeof value.unit === "string" && isWeightUnit(value.unit) ? value.unit : "KG";
      return {
        ok: true,
        milliKg,
        unit,
        ...(typeof value.stable === "boolean" ? { stableHint: value.stable } : {}),
        raw: text,
      };
    } catch {
      return { ok: false, quality: "INVALID", reason: "Simulator payload is not JSON", raw: text };
    }
  }
}
