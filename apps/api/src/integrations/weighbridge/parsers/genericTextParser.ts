import { kgToMilligrams } from "../../../domain/netWeight.js";
import type { ParseResult, ProtocolParser } from "./types.js";

/**
 * Development helper only.
 * Extracts the first decimal number from a text frame.
 * This is not compatible with arbitrary industrial indicators.
 * Manufacturer message formats, checksums, and stability flags must come from the indicator documentation.
 */
export class GenericTextWeightParser implements ProtocolParser {
  readonly id = "generic-text-weight";

  parse(raw: string | Buffer): ParseResult {
    const text = typeof raw === "string" ? raw : raw.toString("utf8");
    const match = text.match(/-?\d+(?:\.\d{1,3})?/);
    if (!match || match[0] === undefined) {
      return { ok: false, quality: "INVALID", reason: "No numeric weight found in text frame", raw: text };
    }
    try {
      const milliKg = kgToMilligrams(match[0]);
      if (milliKg <= 0n) {
        return { ok: false, quality: "INVALID", reason: "Parsed weight must be greater than zero", raw: text };
      }
      return { ok: true, milliKg, unit: "KG", raw: text };
    } catch {
      return { ok: false, quality: "INVALID", reason: "Numeric token is not a valid kilogram decimal", raw: text };
    }
  }
}
