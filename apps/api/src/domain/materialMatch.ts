import { normalizeMaterialCode, normalizeMaterialName } from "./materialCode.js";

export type MaterialMatchCandidate = {
  id: string;
  code: string;
  name: string;
};

export type MaterialMatchResult = {
  status: "MATCHED" | "NEEDS_REVIEW";
  material: MaterialMatchCandidate | null;
  reason: string;
};

export function matchMaterialFromOcr(
  candidates: MaterialMatchCandidate[],
  ocrName: string | null,
  confidence: number | null,
  minConfidence: number,
): MaterialMatchResult {
  const needle = ocrName ? normalizeMaterialName(ocrName) : "";
  if (needle === "") {
    return { status: "NEEDS_REVIEW", material: null, reason: "OCR did not provide a material name" };
  }

  if (confidence === null || confidence < minConfidence) {
    return {
      status: "NEEDS_REVIEW",
      material: findUniqueMatch(candidates, needle),
      reason: "OCR material confidence is too low for automatic selection",
    };
  }

  const matched = findUniqueMatch(candidates, needle);
  if (!matched) {
    return { status: "NEEDS_REVIEW", material: null, reason: "OCR material was not found in the material master" };
  }

  return { status: "MATCHED", material: matched, reason: "OCR material matched the material master" };
}

function findUniqueMatch(candidates: MaterialMatchCandidate[], needle: string): MaterialMatchCandidate | null {
  const normalizedNeedle = needle.toUpperCase();
  const codeNeedle = normalizeMaterialCode(needle);
  const exact = candidates.filter(
    (item) =>
      normalizeMaterialName(item.name).toUpperCase() === normalizedNeedle ||
      item.code === codeNeedle,
  );
  if (exact.length === 1) {
    return exact[0] ?? null;
  }

  const partial = candidates.filter((item) => {
    const name = normalizeMaterialName(item.name).toUpperCase();
    return name.includes(normalizedNeedle) || normalizedNeedle.includes(name);
  });
  if (partial.length === 1) {
    return partial[0] ?? null;
  }

  return null;
}
