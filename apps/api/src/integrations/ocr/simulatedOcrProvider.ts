import { normalizeRegistrationNumber } from "../../domain/vehicleNumber.js";
import type { OcrExtractInput, OcrExtractResult, OcrField, OcrProvider } from "./types.js";

const DEFAULT_VEHICLE = "AP39XX1234";
const MISMATCH_VEHICLE = "TS09EA9999";

export class SimulatedOCRProvider implements OcrProvider {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async extract(input: OcrExtractInput): Promise<OcrExtractResult> {
    const extractedAt = this.now().toISOString();
    const registered = normalizeOptional(input.registeredVehicleNumber);
    const anpr = normalizeOptional(input.anprVehicleNumber);
    const vehicleNumber = resolveSimulatedVehicle(input, registered, anpr);
    const invoiceNumber = simulateInvoiceNumber(input.documentId);
    const documentDate = extractedAt.slice(0, 10);

    const fields: OcrField[] = [
      { name: "invoiceNumber", value: invoiceNumber, confidence: 0.94 },
      { name: "vehicleNumber", value: vehicleNumber, confidence: 0.96 },
      { name: "supplierName", value: "ABC Materials", confidence: 0.91 },
      { name: "materialName", value: "Cement", confidence: 0.89 },
      { name: "quantity", value: "30 MT", confidence: 0.87 },
      { name: "documentDate", value: documentDate, confidence: 0.83 },
    ];

    return {
      fields,
      rawText: buildSimulatedRawText(fields, input.documentType),
      source: "SIMULATED",
      provider: "simulated-ocr",
      extractedAt,
    };
  }
}

function resolveSimulatedVehicle(
  input: OcrExtractInput,
  registered: string | null,
  anpr: string | null,
): string {
  if (input.forceVehicleMismatch || /mismatch/i.test(input.originalFileName)) {
    return MISMATCH_VEHICLE;
  }

  return registered ?? anpr ?? DEFAULT_VEHICLE;
}

function simulateInvoiceNumber(documentId: string): string {
  const digits = documentId.replace(/[^0-9]/g, "").slice(-4);
  return `INV${digits === "" ? "1025" : digits.padStart(4, "0")}`;
}

function buildSimulatedRawText(fields: OcrField[], documentType: string): string {
  const lines = [
    "SIMULATED OCR OUTPUT — not a real optical character recognition result.",
    `Document type: ${documentType}`,
    ...fields.map((field) => `${field.name}=${field.value}`),
  ];
  return lines.join("\n");
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = normalizeRegistrationNumber(value);
  return normalized === "" ? null : normalized;
}
