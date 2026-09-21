import type { WeightQuality } from "../../../domain/weightQuality.js";
import type { WeightUnit } from "../../../domain/weightUnits.js";

export type ParseSuccess = {
  ok: true;
  milliKg: bigint;
  unit: WeightUnit;
  stableHint?: boolean;
  raw: string;
};

export type ParseFailure = {
  ok: false;
  quality: WeightQuality;
  reason: string;
  raw: string;
};

export type ParseResult = ParseSuccess | ParseFailure;

export interface ProtocolParser {
  readonly id: string;
  parse(raw: string | Buffer): ParseResult;
}
