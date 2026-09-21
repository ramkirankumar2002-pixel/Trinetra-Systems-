export type OcrSource = "SIMULATED";

export type OcrField = {
  name: string;
  value: string;
  confidence: number;
};

export type OcrExtractInput = {
  documentId: string;
  documentType: string;
  originalFileName: string;
  mimeType: string;
  registeredVehicleNumber?: string | null | undefined;
  anprVehicleNumber?: string | null | undefined;
  forceVehicleMismatch?: boolean | undefined;
};

export type OcrExtractResult = {
  fields: OcrField[];
  rawText: string;
  source: OcrSource;
  provider: string;
  extractedAt: string;
};

export interface OcrProvider {
  extract(input: OcrExtractInput): Promise<OcrExtractResult>;
}
