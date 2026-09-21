export type ProtocolTestParseResult =
  | { ok: true; raw: string; weightKg: number; stable: boolean | null; parserStatus: "PARSED" }
  | { ok: false; raw: string; weightKg: null; stable: null; parserStatus: "INVALID" | "EMPTY"; reason: string };

export function parseProtocolTestWeight(raw: string, stable?: boolean): ProtocolTestParseResult {
  if (raw.trim() === "") {
    return { ok: false, raw, weightKg: null, stable: null, parserStatus: "EMPTY", reason: "Recorded message is empty" };
  }
  const match = raw.match(/-?\d+(?:\.\d{1,3})?/);
  if (!match || match[0] === undefined) {
    return {
      ok: false,
      raw,
      weightKg: null,
      stable: null,
      parserStatus: "INVALID",
      reason: "No numeric weight found in recorded message",
    };
  }
  const weightKg = Number(match[0]);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return {
      ok: false,
      raw,
      weightKg: null,
      stable: null,
      parserStatus: "INVALID",
      reason: "Parsed weight must be a positive number",
    };
  }
  return {
    ok: true,
    raw,
    weightKg,
    stable: stable === undefined ? null : stable,
    parserStatus: "PARSED",
  };
}
