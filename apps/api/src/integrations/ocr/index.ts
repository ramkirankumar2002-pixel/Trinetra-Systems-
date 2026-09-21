import { SimulatedOCRProvider } from "./simulatedOcrProvider.js";
import type { OcrProvider } from "./types.js";

export type { OcrExtractInput, OcrExtractResult, OcrField, OcrProvider } from "./types.js";

let provider: OcrProvider = new SimulatedOCRProvider();

export function getOcrProvider(): OcrProvider {
  return provider;
}

export function setOcrProvider(next: OcrProvider): void {
  provider = next;
}
