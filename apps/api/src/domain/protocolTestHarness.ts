/**
 * PROTOCOL TEST harness only.
 * Uses recorded or synthetic text frames. This is not a manufacturer protocol
 * and must never be labeled as a real hardware integration.
 */
export type ProtocolTestKind = "PROTOCOL_TEST";

export type ProtocolTestWeightFixture = {
  raw: string;
  stable?: boolean;
  unit?: "KG";
};

export type ProtocolTestParseResult =
  | {
      ok: true;
      testKind: ProtocolTestKind;
      raw: string;
      weightKg: number;
      unit: "KG";
      stable: boolean | null;
      parserStatus: "PARSED";
    }
  | {
      ok: false;
      testKind: ProtocolTestKind;
      raw: string;
      weightKg: null;
      unit: null;
      stable: null;
      parserStatus: "INVALID" | "EMPTY";
      reason: string;
    };

export function parseProtocolTestWeight(input: ProtocolTestWeightFixture): ProtocolTestParseResult {
  const raw = input.raw;
  if (raw.trim() === "") {
    return {
      ok: false,
      testKind: "PROTOCOL_TEST",
      raw,
      weightKg: null,
      unit: null,
      stable: null,
      parserStatus: "EMPTY",
      reason: "Recorded message is empty",
    };
  }

  const match = raw.match(/-?\d+(?:\.\d{1,3})?/);
  if (!match || match[0] === undefined) {
    return {
      ok: false,
      testKind: "PROTOCOL_TEST",
      raw,
      weightKg: null,
      unit: null,
      stable: null,
      parserStatus: "INVALID",
      reason: "No numeric weight found in recorded message",
    };
  }

  const weightKg = Number(match[0]);
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return {
      ok: false,
      testKind: "PROTOCOL_TEST",
      raw,
      weightKg: null,
      unit: null,
      stable: null,
      parserStatus: "INVALID",
      reason: "Parsed weight must be a positive number",
    };
  }

  return {
    ok: true,
    testKind: "PROTOCOL_TEST",
    raw,
    weightKg,
    unit: input.unit ?? "KG",
    stable: input.stable === undefined ? null : input.stable,
    parserStatus: "PARSED",
  };
}

export function protocolTestDiagnostic(result: ProtocolTestParseResult, capturedAt: string) {
  return {
    testKind: "PROTOCOL_TEST" as const,
    raw: result.raw,
    parsedWeightKg: result.ok ? result.weightKg : null,
    stable: result.ok ? result.stable : null,
    timestamp: capturedAt,
    parserStatus: result.parserStatus,
    lastError: result.ok ? null : result.reason,
  };
}
